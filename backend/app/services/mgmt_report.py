"""Management presentation: a PowerPoint deck for a period, built from the same KPI engine as the KPI page.

`collect` gathers the figures (testable on its own); `build_pptx` lays them out in the chosen language (en, ar, bn).
Charts are native PowerPoint charts, so managers can restyle or annotate them before a meeting."""

import io
import uuid
from collections import defaultdict
from dataclasses import replace
from datetime import date, datetime, timedelta
from typing import Any

from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.assets import Asset
from app.models.enums import OPEN_WO_STATUSES, OccurrenceStatus, ShutdownStatus, WOStatus, WOType
from app.models.pm import PMOccurrence, PMPlan
from app.models.shutdowns import Shutdown
from app.models.system import KPIScorecard, KPIScorecardValue
from app.models.tenancy import Department
from app.models.workorders import WorkOrder
from app.services import kpi as k
from app.services.common import plant_today
from app.services.mgmt_report_i18n import KPI_NAMES, LANGS, RTL, WO_STATUS, WO_TYPES, name, tr

HIGHER_IS_BETTER = {
    "pm_compliance",
    "schedule_compliance",
    "planned_maintenance_pct",
    "mtbf",
    "availability",
    "oee",
    "lubrication_compliance",
    "labor_utilization",
    "shutdown_progress",
}
SNAPSHOT = {"backlog", "overdue_work_orders"}  # "as of now": the previous period cannot be recalculated
SUMMARY_CARDS = ["availability", "mtbf", "mttr", "pm_compliance", "emergency_pct", "cost_by_department", "backlog", "overdue_work_orders"]
TREND_CODES = ["availability", "pm_compliance", "mtbf", "mttr", "cost_by_department"]
TOP_N = 5
LIST_N = 8


# ---------------------------------------------------------------- data ----
def _month_end(d: date) -> date:
    return (d.replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)


def _add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    return date(d.year + y, m + 1, 1)


def _whole_months(start: date, end: date) -> int:
    """Number of calendar months when the period is exactly whole months (1st to month end), else 0."""
    if start.day != 1 or end != _month_end(end):
        return 0
    return (end.year - start.year) * 12 + end.month - start.month + 1


def previous_period(start: date, end: date) -> tuple[date, date]:
    """The period just before, of the same length; whole months stay whole months (October → September)."""
    n = _whole_months(start, end)
    if n:
        ps = _add_months(start, -n)
        return ps, start - timedelta(days=1)
    pend = start - timedelta(days=1)
    return pend - (end - start), pend


def next_period(start: date, end: date) -> tuple[date, date]:
    n = _whole_months(start, end)
    n0 = end + timedelta(days=1)
    if n:
        return n0, _month_end(_add_months(n0, n - 1))
    return n0, n0 + (end - start)


def _months(start: date, end: date) -> list[date]:
    out, d = [], start.replace(day=1)
    while d <= end:
        out.append(d)
        d = (d + timedelta(days=32)).replace(day=1)
    return out


def _targets(db: Session, s: k.Scope) -> dict[str, float]:
    """Average monthly target of company KPIs linked to a calculated KPI (same department, or plant-wide)."""
    q = select(KPIScorecard).where(KPIScorecard.plant_id == s.plant.id, KPIScorecard.kpi_code.is_not(None))
    q = q.where(KPIScorecard.department_id == s.department_id) if s.department_id else q.where(KPIScorecard.department_id.is_(None))
    cards: dict[uuid.UUID, str] = {c.id: c.kpi_code for c in db.execute(q).scalars() if c.kpi_code}
    if not cards:
        return {}
    vals: dict[str, list[float]] = defaultdict(list)
    for v in db.execute(
        select(KPIScorecardValue).where(
            KPIScorecardValue.scorecard_id.in_(list(cards)),
            KPIScorecardValue.period_start.in_(_months(s.start, s.end)),
            KPIScorecardValue.target.is_not(None),
        )
    ).scalars():
        if v.target is not None:
            vals[cards[v.scorecard_id]].append(float(v.target))
    return {code: sum(x) / len(x) for code, x in vals.items()}


def _trend(db: Session, s: k.Scope, today: date) -> dict[str, Any]:
    last = s.end.replace(day=1)
    months = []
    for i in range(11, -1, -1):
        y, m = divmod(last.month - 1 - i, 12)
        months.append(date(last.year + y, m + 1, 1))
    series: dict[str, list[float | None]] = {c: [] for c in TREND_CODES}
    for ms in months:
        me = min((ms + timedelta(days=32)).replace(day=1) - timedelta(days=1), today)
        if me < ms:
            for c in TREND_CODES:
                series[c].append(None)
            continue
        ms_scope = replace(s, start=ms, end=me)
        for c in TREND_CODES:
            r = k.KPI_FUNCS[c](db, ms_scope)
            series[c].append(None if r.value is None else round(r.value, 2))
    return {"months": [m.isoformat()[:7] for m in months], "series": series}


def _wo_stats(db: Session, s: k.Scope) -> dict[str, Any]:
    ids = k._asset_ids(db, s)
    created = dict(
        db.execute(
            k._wo_scope(select(WorkOrder.type, func.count()).select_from(WorkOrder), s, ids)
            .where(WorkOrder.created_at >= s.t0, WorkOrder.created_at < s.t1, WorkOrder.status != WOStatus.CANCELLED)
            .group_by(WorkOrder.type)
        ).all()
    )
    completed = dict(
        db.execute(
            k._wo_scope(select(WorkOrder.type, func.count()).select_from(WorkOrder), s, ids)
            .where(WorkOrder.completed_at >= s.t0, WorkOrder.completed_at < s.t1)
            .group_by(WorkOrder.type)
        ).all()
    )
    open_now = db.execute(
        k._wo_scope(select(func.count()).select_from(WorkOrder), s, ids).where(WorkOrder.status.in_(OPEN_WO_STATUSES))
    ).scalar_one()
    types = [t.value for t in WOType if created.get(t, 0) or completed.get(t, 0)]
    return {
        "types": types,
        "created": {t: int(created.get(WOType(t), 0)) for t in types},
        "completed": {t: int(completed.get(WOType(t), 0)) for t in types},
        "created_total": int(sum(created.values())),
        "completed_total": int(sum(completed.values())),
        "open_now": int(open_now),
    }


def _bad_actors(db: Session, s: k.Scope, cost: dict[str, Any]) -> list[dict[str, Any]]:
    events = k._downtime(db, s, failures_only=True, include_planned=False)
    now = k._now_clip(s)
    hours: dict[uuid.UUID, float] = defaultdict(float)
    fails: dict[uuid.UUID, int] = defaultdict(int)
    for e in events:
        a, b = max(e.started_at, s.t0), min(e.ended_at or now, s.t1)
        if b > a:
            hours[e.asset_id] += (b - a).total_seconds() / 3600
        if e.started_at >= s.t0:
            fails[e.asset_id] += 1
    cost_by = {uuid.UUID(t["asset_id"]): t["cost"] for t in cost.get("top_assets", [])}
    ranked = sorted(set(hours) | set(fails), key=lambda a: (-hours.get(a, 0), -fails.get(a, 0)))[:TOP_N]
    if not ranked:  # no downtime logged: fall back to the most expensive assets
        ranked = [a for a, _ in sorted(cost_by.items(), key=lambda kv: -kv[1])][:TOP_N]
    assets = {a.id: a for a in db.execute(select(Asset).where(Asset.id.in_(ranked))).scalars()} if ranked else {}
    return [
        {
            "code": assets[a].code if a in assets else "?",
            "name": assets[a].name if a in assets else "",
            "downtime_h": round(hours.get(a, 0), 1),
            "failures": fails.get(a, 0),
            "cost": round(cost_by.get(a, 0), 2),
        }
        for a in ranked
    ]


def _emergencies(db: Session, s: k.Scope) -> dict[str, Any]:
    ids = k._asset_ids(db, s)
    q = k._wo_scope(select(WorkOrder, Asset).join(Asset, Asset.id == WorkOrder.asset_id), s, ids).where(
        WorkOrder.type == WOType.EMERGENCY,
        WorkOrder.created_at >= s.t0,
        WorkOrder.created_at < s.t1,
        WorkOrder.status != WOStatus.CANCELLED,
    )
    total = db.execute(select(func.count()).select_from(q.subquery())).scalar_one()
    rows = db.execute(q.order_by(WorkOrder.created_at.desc()).limit(LIST_N)).all()
    return {
        "total": int(total),
        "items": [
            {
                "number": w.number,
                "date": w.created_at.astimezone(s.tz).date().isoformat(),
                "asset": a.code,
                "title": w.title,
                "status": w.status.value,
                "root_cause": w.root_cause or "",
            }
            for w, a in rows
        ],
    }


def _next_period(db: Session, s: k.Scope) -> dict[str, Any]:
    n0, n1 = next_period(s.start, s.end)
    ids = k._asset_ids(db, s)
    q = (
        select(PMOccurrence, PMPlan, Asset)
        .join(PMPlan, PMPlan.id == PMOccurrence.pm_plan_id)
        .join(Asset, Asset.id == PMPlan.asset_id)
        .where(
            PMOccurrence.plant_id == s.plant.id,
            PMOccurrence.due_date >= n0,
            PMOccurrence.due_date <= n1,
            PMOccurrence.status.not_in([OccurrenceStatus.CANCELLED, OccurrenceStatus.COMPLETED]),
        )
    )
    if ids is not None:
        q = q.where(PMPlan.asset_id.in_(ids))
    total = db.execute(select(func.count()).select_from(q.subquery())).scalar_one()
    pms = [
        {"plan": p.code, "asset": a.code, "due": o.due_date.isoformat()}
        for o, p, a in db.execute(q.order_by(PMOccurrence.due_date).limit(LIST_N)).all()
    ]
    t0 = datetime.combine(n0, datetime.min.time(), s.tz)
    sq = select(Shutdown).where(
        Shutdown.plant_id == s.plant.id,
        Shutdown.planned_end >= t0,
        Shutdown.planned_start < t0 + timedelta(days=90),
        Shutdown.status.not_in([ShutdownStatus.COMPLETED, ShutdownStatus.CANCELLED]),
    )
    if s.scoped:
        sq = sq.where(s.dept(Shutdown.department_id) | Shutdown.department_id.is_(None))
    shutdowns = [
        {
            "code": x.code,
            "name": x.name,
            "start": x.planned_start.astimezone(s.tz).date().isoformat(),
            "end": x.planned_end.astimezone(s.tz).date().isoformat(),
            "status": x.status.value,
        }
        for x in db.execute(sq.order_by(Shutdown.planned_start).limit(LIST_N)).scalars()
    ]
    return {"start": n0.isoformat(), "end": n1.isoformat(), "pm_total": int(total), "pms": pms, "shutdowns": shutdowns}


def collect(db: Session, s: k.Scope) -> dict[str, Any]:
    today = plant_today(s.plant)
    ps, pe = previous_period(s.start, s.end)
    prev_scope = replace(s, start=ps, end=pe)
    cur = {c: f(db, s).out() for c, f in k.KPI_FUNCS.items()}
    prev = {c: f(db, prev_scope).out() for c, f in k.KPI_FUNCS.items() if c not in SNAPSHOT}
    dept = db.get(Department, s.department_id) if s.department_id else None
    cost = cur["cost_by_department"]["details"]
    return {
        "plant": s.plant.name,
        "currency": s.plant.currency,
        "department": {"code": dept.code, "name": dept.name, "name_ar": dept.name_ar} if dept else None,
        "start": s.start.isoformat(),
        "end": s.end.isoformat(),
        "prev_start": ps.isoformat(),
        "prev_end": pe.isoformat(),
        "generated": today.isoformat(),
        "kpis": cur,
        "prev": prev,
        "targets": _targets(db, s),
        "trend": _trend(db, s, today),
        "wo": _wo_stats(db, s),
        "bad_actors": _bad_actors(db, s, cost),
        "cost": {
            "total": cur["cost_by_department"]["value"] or 0,
            "by_department": cost.get("by_department", {}),
            "breakdown": cost.get("breakdown", {}),
            "budget": cur["budget_vs_actual"]["details"].get("budget"),
            "budget_pct": cur["budget_vs_actual"]["value"],
        },
        "emergencies": _emergencies(db, s),
        "next": _next_period(db, s),
    }


# ------------------------------------------------------------ judgement ----
def verdict(code: str, cur: float | None, ref: float | None) -> int:
    """+1 better, -1 worse, 0 same/unknown, comparing `cur` with `ref` in the KPI's good direction."""
    if cur is None or ref is None or abs(cur - ref) < 1e-9:
        return 0
    up = cur > ref
    return 1 if up == (code in HIGHER_IS_BETTER) else -1


def fmt_num(v: float | None, digits: int = 1) -> str:
    if v is None:
        return "—"
    if abs(v) >= 1000:
        return f"{v:,.0f}"
    return f"{v:,.{digits}f}".rstrip("0").rstrip(".") if digits else f"{v:,.0f}"


def fmt_kpi(r: dict[str, Any], lang: str, currency: str) -> str:
    v = r.get("value")
    if v is None:
        return "—"
    unit = r.get("unit") or ""
    if r["code"] == "backlog" and (r.get("details") or {}).get("weeks") is not None:
        return f"{fmt_num(r['details']['weeks'])} {tr(lang, 'weeks')}"
    if unit == "%":
        return f"{fmt_num(v)}%"
    if unit == "h":
        return f"{fmt_num(v)} {tr(lang, 'u_h')}"
    if unit == "count":
        return fmt_num(v, 0)
    if unit == currency:
        return f"{fmt_num(v, 0)} {currency}"
    return f"{fmt_num(v)} {unit}"


def highlights(d: dict[str, Any], lang: str) -> list[str]:
    cur, prev = d["kpis"], d["prev"]
    better = worse = 0
    for c, r in cur.items():
        if c in prev:
            v = verdict(c, r["value"], prev[c]["value"])
            better += v > 0
            worse += v < 0
    out = [tr(lang, "h_hl_kpis", better=better, worse=worse)]
    a = cur["availability"]
    if a["value"] is not None:
        out.append(tr(lang, "h_hl_avail", v=fmt_kpi(a, lang, d["currency"]), p=fmt_kpi(prev["availability"], lang, d["currency"])))
    if cur["pm_compliance"]["value"] is not None:
        out.append(tr(lang, "h_hl_pm", v=fmt_kpi(cur["pm_compliance"], lang, d["currency"])))
    out.append(tr(lang, "h_hl_em", n=d["emergencies"]["total"]))
    top = d["bad_actors"][0] if d["bad_actors"] else None
    if top and top["downtime_h"]:
        out.append(tr(lang, "h_hl_bad", asset=f"{top['code']} {top['name']}".strip(), h=fmt_num(top["downtime_h"])))
    out.append(tr(lang, "h_hl_cost", v=fmt_kpi(cur["cost_by_department"], lang, d["currency"])))
    if d["cost"]["budget_pct"] is not None:
        out.append(tr(lang, "h_hl_budget", pct=f"{fmt_num(d['cost']['budget_pct'])}%"))
    out.append(tr(lang, "h_hl_backlog", v=fmt_kpi(cur["backlog"], lang, d["currency"])))
    return out


# --------------------------------------------------------------- layout ----
INK = RGBColor(0x1F, 0x29, 0x37)
MUTED = RGBColor(0x6B, 0x72, 0x80)
ACCENT = RGBColor(0x1D, 0x4E, 0xD8)
GOOD = RGBColor(0x15, 0x80, 0x3D)
BAD = RGBColor(0xB9, 0x1C, 0x1C)
LINE = RGBColor(0xE5, 0xE7, 0xEB)
CARD = RGBColor(0xF8, 0xFA, 0xFC)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
W, H = Inches(13.333), Inches(7.5)
M = Inches(0.5)


class Deck:
    def __init__(self, lang: str) -> None:
        self.lang = lang if lang in LANGS else "en"
        self.rtl = self.lang in RTL
        self.prs = Presentation()
        self.prs.slide_width, self.prs.slide_height = W, H
        self.blank = self.prs.slide_layouts[6]

    def t(self, key: str, **kw: object) -> str:
        return tr(self.lang, key, **kw)

    def _para(self, p: Any, text: str, size: float, bold: bool, color: RGBColor, align: PP_ALIGN | None) -> None:
        p.text = text
        if self.rtl:
            p._p.get_or_add_pPr().set("rtl", "1")
        p.alignment = align if align is not None else (PP_ALIGN.RIGHT if self.rtl else PP_ALIGN.LEFT)
        for r in p.runs:
            r.font.size = Pt(size)
            r.font.bold = bold
            r.font.color.rgb = color

    def text(
        self,
        slide: Any,
        x: int,
        y: int,
        w: int,
        h: int,
        lines: str | list[str],
        size: float = 14,
        bold: bool = False,
        color: RGBColor = INK,
        align: PP_ALIGN | None = None,
        bullets: bool = False,
    ) -> Any:
        tb = slide.shapes.add_textbox(x, y, w, h)
        tf = tb.text_frame
        tf.word_wrap = True
        items = [lines] if isinstance(lines, str) else lines
        for i, line in enumerate(items):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            self._para(p, ("•  " + line) if bullets else line, size, bold, color, align)
            if bullets:
                p.space_after = Pt(8)
        return tb

    def slide(self, title: str, subtitle: str | None = None) -> Any:
        s = self.prs.slides.add_slide(self.blank)
        bar = s.shapes.add_shape(
            1,
            0,
            0,
            W,
            Inches(0.12),
        )
        bar.fill.solid()
        bar.fill.fore_color.rgb = ACCENT
        bar.line.fill.background()
        self.text(s, M, Inches(0.3), W - 2 * M, Inches(0.7), title, 28, True)
        if subtitle:
            self.text(s, M, Inches(0.95), W - 2 * M, Inches(0.4), subtitle, 13, color=MUTED)
        return s

    def table(self, slide: Any, x: int, y: int, w: int, rows: list[list[str]], widths: list[float], colors: dict | None = None) -> Any:
        """`colors`: {(row, col): RGBColor} for status cells. Column order is mirrored for right-to-left languages."""
        if self.rtl:
            rows = [list(reversed(r)) for r in rows]
            widths = list(reversed(widths))
            n = len(widths)
            colors = {(r, n - 1 - c): v for (r, c), v in (colors or {}).items()}
        rh = Inches(0.36)
        shape = slide.shapes.add_table(len(rows), len(rows[0]), x, y, w, rh * len(rows))
        tbl = shape.table
        total = sum(widths)
        for i, wd in enumerate(widths):
            tbl.columns[i].width = Emu(int(w * wd / total))
        for r, row in enumerate(rows):
            tbl.rows[r].height = rh
            for c, val in enumerate(row):
                cell = tbl.cell(r, c)
                cell.margin_left = cell.margin_right = Inches(0.08)
                cell.vertical_anchor = MSO_ANCHOR.MIDDLE
                cell.fill.solid()
                cell.fill.fore_color.rgb = ACCENT if r == 0 else (CARD if r % 2 else WHITE)
                color = WHITE if r == 0 else (colors or {}).get((r, c), INK)
                self._para(cell.text_frame.paragraphs[0], str(val), 11 if r else 11.5, r == 0 or (r, c) in (colors or {}), color, None)
        return tbl

    def chart(
        self,
        slide: Any,
        kind: Any,
        x: int,
        y: int,
        w: int,
        h: int,
        categories: list[str],
        series: dict[str, list[float | None]],
        title: str | None = None,
        legend: bool = True,
    ) -> Any:
        cd = CategoryChartData()
        cd.categories = categories
        for nm, vals in series.items():
            cd.add_series(nm, vals)
        ch = slide.shapes.add_chart(kind, x, y, w, h, cd).chart
        ch.font.size = Pt(10)
        ch.font.color.rgb = INK
        ch.has_legend = legend and len(series) > 1
        if ch.has_legend:
            ch.legend.position = XL_LEGEND_POSITION.BOTTOM
            ch.legend.include_in_layout = False
        if title:
            ch.has_title = True
            ch.chart_title.text_frame.text = title
            for p in ch.chart_title.text_frame.paragraphs:
                for r in p.runs:
                    r.font.size = Pt(13)
                    r.font.bold = True
        else:
            ch.has_title = False
        return ch

    def save(self) -> bytes:
        b = io.BytesIO()
        self.prs.save(b)
        return b.getvalue()


def _status(code: str, r: dict, prev: dict | None, target: float | None, lang: str) -> tuple[str, RGBColor]:
    if r["value"] is None:
        return tr(lang, "no_data"), MUTED
    if target is not None:
        ok = verdict(code, r["value"], target) >= 0
        return (tr(lang, "on_target"), GOOD) if ok else (tr(lang, "off_target"), BAD)
    if code in SNAPSHOT or prev is None:
        return tr(lang, "snapshot"), MUTED
    v = verdict(code, r["value"], prev["value"])
    return {1: (tr(lang, "improved"), GOOD), -1: (tr(lang, "worse"), BAD)}.get(v, (tr(lang, "same"), MUTED))


def build_pptx(d: dict[str, Any], lang: str) -> bytes:
    dk = Deck(lang)
    L, cur, prev, cur_cy = dk.lang, d["kpis"], d["prev"], d["currency"]
    period = dk.t("range", a=d["start"], b=d["end"])
    dept = d["department"]
    dept_name = (dept["name_ar"] or dept["name"]) if dept and L == "ar" else (dept["name"] if dept else dk.t("all_departments"))
    sub = f"{d['plant']} · {dept_name} · {dk.t('period')}: {period}"

    # 1. cover
    s = dk.prs.slides.add_slide(dk.blank)
    band = s.shapes.add_shape(1, 0, 0, W, H)
    band.fill.solid()
    band.fill.fore_color.rgb = ACCENT
    band.line.fill.background()
    dk.text(s, M, Inches(2.2), W - 2 * M, Inches(1.2), dk.t("title"), 40, True, WHITE)
    dk.text(s, M, Inches(3.4), W - 2 * M, Inches(0.6), d["plant"], 24, False, WHITE)
    dk.text(
        s,
        M,
        Inches(4.2),
        W - 2 * M,
        Inches(1.2),
        [f"{dk.t('department')}: {dept_name}", f"{dk.t('period')}: {period}", f"{dk.t('generated')}: {d['generated']}"],
        16,
        False,
        WHITE,
    )

    # 2. executive summary: KPI cards + highlights
    s = dk.slide(dk.t("summary"), f"{sub} · {dk.t('prev_period')} {dk.t('range', a=d['prev_start'], b=d['prev_end'])}")
    cw, chh, gap = Inches(2.9), Inches(1.35), Inches(0.2)
    order = list(reversed(SUMMARY_CARDS[:4])) + list(reversed(SUMMARY_CARDS[4:])) if dk.rtl else SUMMARY_CARDS
    for i, code in enumerate(order):
        row, col = divmod(i, 4)
        x, y = M + col * (cw + gap), Inches(1.5) + row * (chh + gap)
        card = s.shapes.add_shape(1, x, y, cw, chh)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD
        card.line.color.rgb = LINE
        r = cur[code]
        p = prev.get(code)
        dk.text(s, x + Inches(0.12), y + Inches(0.08), cw - Inches(0.24), Inches(0.35), name(KPI_NAMES, code, L), 12, color=MUTED)
        dk.text(s, x + Inches(0.12), y + Inches(0.4), cw - Inches(0.24), Inches(0.55), fmt_kpi(r, L, cur_cy), 24, True)
        st, colr = _status(code, r, p, d["targets"].get(code), L)
        ref = "" if p is None else f" · {dk.t('previous')}: {fmt_kpi(p, L, cur_cy)}"
        dk.text(s, x + Inches(0.12), y + Inches(0.95), cw - Inches(0.24), Inches(0.35), st + ref, 10.5, True, colr)
    dk.text(s, M, Inches(4.6), W - 2 * M, Inches(0.4), dk.t("highlights"), 16, True)
    dk.text(s, M, Inches(5.0), W - 2 * M, Inches(2.3), highlights(d, L)[:6], 13, bullets=True)

    # 3. scorecard
    s = dk.slide(dk.t("scorecard"), sub)
    rows = [[dk.t("kpi"), dk.t("current"), dk.t("previous"), dk.t("target"), dk.t("status")]]
    colors: dict[tuple[int, int], RGBColor] = {}
    for code, r in cur.items():
        p = prev.get(code)
        tgt = d["targets"].get(code)
        st, colr = _status(code, r, p, tgt, L)
        rows.append(
            [
                name(KPI_NAMES, code, L),
                fmt_kpi(r, L, cur_cy),
                "—" if p is None else fmt_kpi(p, L, cur_cy),
                "—" if tgt is None else fmt_kpi({**r, "value": tgt}, L, cur_cy),
                st,
            ]
        )
        colors[(len(rows) - 1, 4)] = colr
    half = (len(rows) + 1) // 2
    left, right = rows[:half], [rows[0]] + rows[half:]
    cmap_l = {kk: v for kk, v in colors.items() if kk[0] < half}
    cmap_r = {(r - half + 1, c): v for (r, c), v in colors.items() if r >= half}
    tw = (W - 2 * M - Inches(0.3)) / 2
    widths = [3.0, 1.5, 1.5, 1.2, 1.6]
    first, second = (right, left) if dk.rtl else (left, right)
    c1, c2 = (cmap_r, cmap_l) if dk.rtl else (cmap_l, cmap_r)
    dk.table(s, M, Inches(1.45), int(tw), first, widths, c1)
    dk.table(s, M + int(tw) + Inches(0.3), Inches(1.45), int(tw), second, widths, c2)
    dk.text(s, M, Inches(6.75), W - 2 * M, Inches(0.5), dk.t("notes"), 10, color=MUTED)

    # 4. trends
    s = dk.slide(dk.t("trends"), sub)
    tm, ser = d["trend"]["months"], d["trend"]["series"]
    cw2, ch2 = (W - 2 * M - Inches(0.3)) / 2, Inches(2.75)
    charts = [
        ("availability", {name(KPI_NAMES, "availability", L): ser["availability"]}),
        ("pm_compliance", {name(KPI_NAMES, "pm_compliance", L): ser["pm_compliance"]}),
        ("mtbf", {"MTBF": ser["mtbf"], "MTTR": ser["mttr"]}),
        ("cost_by_department", {name(KPI_NAMES, "cost_by_department", L): ser["cost_by_department"]}),
    ]
    for i, (code, data) in enumerate(charts):
        row, col = divmod(i, 2)
        if dk.rtl:
            col = 1 - col
        x, y = M + col * (int(cw2) + Inches(0.3)), Inches(1.45) + row * (ch2 + Inches(0.15))
        title = {
            "mtbf": "MTBF / MTTR" if dk.rtl else f"MTBF / MTTR ({dk.t('u_h')})",
            "cost_by_department": f"{name(KPI_NAMES, code, L)} ({cur_cy})",
        }.get(code, f"{name(KPI_NAMES, code, L)} (%)")
        kind = XL_CHART_TYPE.COLUMN_CLUSTERED if code == "cost_by_department" else XL_CHART_TYPE.LINE_MARKERS
        dk.chart(s, kind, x, y, int(cw2), ch2, tm, data, title)

    # 5. work orders
    w = d["wo"]
    s = dk.slide(dk.t("wo_title"), sub)
    stats = [
        (dk.t("created"), str(w["created_total"])),
        (dk.t("completed"), str(w["completed_total"])),
        (dk.t("open_now"), str(w["open_now"])),
        (dk.t("overdue"), fmt_kpi(cur["overdue_work_orders"], L, cur_cy)),
        (dk.t("backlog"), fmt_kpi(cur["backlog"], L, cur_cy)),
    ]
    if dk.rtl:
        stats.reverse()
    sw = (W - 2 * M - Inches(0.15) * 4) / 5
    for i, (lab, val) in enumerate(stats):
        x = M + i * (int(sw) + Inches(0.15))
        box = s.shapes.add_shape(1, x, Inches(1.45), int(sw), Inches(1.1))
        box.fill.solid()
        box.fill.fore_color.rgb = CARD
        box.line.color.rgb = LINE
        dk.text(s, x + Inches(0.1), Inches(1.5), int(sw) - Inches(0.2), Inches(0.35), lab, 12, color=MUTED)
        dk.text(s, x + Inches(0.1), Inches(1.85), int(sw) - Inches(0.2), Inches(0.55), val, 22, True)
    if w["types"]:
        cats = [name(WO_TYPES, t, L) for t in w["types"]]
        dk.chart(
            s,
            XL_CHART_TYPE.COLUMN_CLUSTERED,
            M,
            Inches(2.8),
            W - 2 * M,
            Inches(4.3),
            cats,
            {dk.t("created"): [w["created"][t] for t in w["types"]], dk.t("completed"): [w["completed"][t] for t in w["types"]]},
            dk.t("by_type"),
        )

    # 6. bad actors
    s = dk.slide(dk.t("bad_actors"), sub)
    ba = d["bad_actors"]
    if ba:
        rows = [[dk.t("asset"), dk.t("downtime_h"), dk.t("failures"), f"{dk.t('cost')} ({cur_cy})"]]
        rows += [[f"{b['code']} — {b['name']}", fmt_num(b["downtime_h"]), str(b["failures"]), fmt_num(b["cost"], 0)] for b in ba]
        tw_, cw_ = int((W - 2 * M) * 0.55), int((W - 2 * M) * 0.42)
        tx, cx = (M + int((W - 2 * M) * 0.45), M) if dk.rtl else (M, M + int((W - 2 * M) * 0.58))
        dk.table(s, tx, Inches(1.45), tw_, rows, [3.4, 1.6, 1.0, 1.4])
        use_dt = any(b["downtime_h"] for b in ba)
        dk.chart(
            s,
            XL_CHART_TYPE.BAR_CLUSTERED,
            cx,
            Inches(1.45),
            cw_,
            Inches(4.5),
            [b["code"] for b in reversed(ba)],
            {dk.t("downtime_h") if use_dt else dk.t("cost"): [b["downtime_h"] if use_dt else b["cost"] for b in reversed(ba)]},
            dk.t("downtime_h") if use_dt else f"{dk.t('cost')} ({cur_cy})",
        )
    else:
        dk.text(s, M, Inches(1.6), W - 2 * M, Inches(0.6), dk.t("no_bad_actors"), 16, color=MUTED)

    # 7. cost
    c = d["cost"]
    s = dk.slide(dk.t("cost_title"), sub)
    if c["total"]:
        lines = [f"{dk.t('total')}: {fmt_num(c['total'], 0)} {cur_cy}"]
        if c["budget"]:
            lines.append(f"{dk.t('budget')}: {fmt_num(c['budget'], 0)} {cur_cy} · {dk.t('actual')}: {fmt_num(c['budget_pct'])}%")
            lines.append(f"{dk.t('variance')}: {fmt_num((c['budget'] or 0) - c['total'], 0)} {cur_cy}")
        else:
            lines.append(dk.t("no_budget"))
        dk.text(s, M, Inches(1.45), W - 2 * M, Inches(1.0), lines, 15, bold=False)
        half_w = int((W - 2 * M - Inches(0.3)) / 2)
        xa, xb = (M + half_w + Inches(0.3), M) if dk.rtl else (M, M + half_w + Inches(0.3))
        if c["by_department"]:
            deps = list(c["by_department"].items())
            dk.chart(
                s,
                XL_CHART_TYPE.COLUMN_CLUSTERED,
                xa,
                Inches(2.6),
                half_w,
                Inches(4.5),
                [x for x, _ in deps],
                {dk.t("cost"): [v for _, v in deps]},
                f"{dk.t('by_department')} ({cur_cy})",
            )
        parts = [(kk, v) for kk, v in c["breakdown"].items() if v > 0]
        if parts:
            ch = dk.chart(
                s,
                XL_CHART_TYPE.PIE,
                xb,
                Inches(2.6),
                half_w,
                Inches(4.5),
                [dk.t(kk) for kk, _ in parts],
                {dk.t("cost"): [v for _, v in parts]},
                dk.t("split"),
                legend=False,
            )
            ch.has_legend = True
            ch.legend.position = XL_LEGEND_POSITION.BOTTOM
            ch.plots[0].has_data_labels = True
            ch.plots[0].data_labels.show_percentage = True
            ch.plots[0].data_labels.show_value = False
            ch.plots[0].data_labels.number_format = "0%"
    else:
        dk.text(s, M, Inches(1.6), W - 2 * M, Inches(0.6), dk.t("no_cost"), 16, color=MUTED)

    # 8. emergencies
    e = d["emergencies"]
    s = dk.slide(dk.t("emergencies"), sub)
    if e["items"]:
        rows = [[dk.t("number"), dk.t("date"), dk.t("asset"), dk.t("description"), dk.t("wo_status"), dk.t("root_cause")]]
        rows += [
            [i["number"], i["date"], i["asset"], i["title"][:60], name(WO_STATUS, i["status"], L), (i["root_cause"] or "—")[:70]]
            for i in e["items"]
        ]
        dk.table(s, M, Inches(1.45), W - 2 * M, rows, [1.1, 1.1, 1.3, 3.2, 1.3, 3.0])
        if e["total"] > len(e["items"]):
            dk.text(s, M, Inches(6.8), W - 2 * M, Inches(0.4), dk.t("of_total", n=e["total"]), 11, color=MUTED)
    else:
        dk.text(s, M, Inches(1.6), W - 2 * M, Inches(0.6), dk.t("no_emergencies"), 16, color=MUTED)

    # 9. lubrication and condition monitoring
    s = dk.slide(dk.t("condition"), sub)
    pd_ = cur["pdm_alerts"]
    pdet = pd_.get("details") or {}
    opn = pdet.get("open_by_severity") or {}
    lines = [
        f"{dk.t('lube_compliance')}: {fmt_kpi(cur['lubrication_compliance'], L, cur_cy)}"
        + (
            ""
            if prev.get("lubrication_compliance") is None
            else f"  ({dk.t('previous')}: {fmt_kpi(prev['lubrication_compliance'], L, cur_cy)})"
        ),
        f"{dk.t('pdm_raised')}: {fmt_kpi(pd_, L, cur_cy)}",
        f"{dk.t('pdm_open')}: {dk.t('critical')} {opn.get('critical', 0)} · {dk.t('warning')} {opn.get('warning', 0)}",
        f"{dk.t('stockouts')}: {fmt_kpi(cur['stockout_rate'], L, cur_cy)}",
    ]
    dk.text(s, M, Inches(1.5), W - 2 * M, Inches(2.4), lines, 18, bullets=True)
    lt = [v for v in d["trend"]["series"]["pm_compliance"]]
    if any(v is not None for v in lt):
        dk.chart(
            s,
            XL_CHART_TYPE.LINE_MARKERS,
            M,
            Inches(3.9),
            W - 2 * M,
            Inches(3.2),
            d["trend"]["months"],
            {name(KPI_NAMES, "pm_compliance", L): lt},
            f"{name(KPI_NAMES, 'pm_compliance', L)} (%)",
        )

    # 10. next period
    n = d["next"]
    s = dk.slide(dk.t("next_title"), f"{d['plant']} · {dk.t('period')}: {dk.t('range', a=n['start'], b=n['end'])}")
    half_w = int((W - 2 * M - Inches(0.3)) / 2)
    xa, xb = (M + half_w + Inches(0.3), M) if dk.rtl else (M, M + half_w + Inches(0.3))
    dk.text(s, xa, Inches(1.4), half_w, Inches(0.4), f"{dk.t('pm_due')}: {n['pm_total']}", 16, True)
    if n["pms"]:
        dk.table(
            s,
            xa,
            Inches(1.9),
            half_w,
            [[dk.t("plan"), dk.t("asset"), dk.t("due")]] + [[p["plan"], p["asset"], p["due"]] for p in n["pms"]],
            [2.0, 2.0, 1.3],
        )
    else:
        dk.text(s, xa, Inches(1.9), half_w, Inches(0.5), dk.t("no_pm_due"), 13, color=MUTED)
    dk.text(s, xb, Inches(1.4), half_w, Inches(0.4), dk.t("shutdowns"), 16, True)
    if n["shutdowns"]:
        dk.table(
            s,
            xb,
            Inches(1.9),
            half_w,
            [[dk.t("plan"), dk.t("period"), dk.t("status")]]
            + [
                [f"{x['code']} — {x['name']}"[:40], dk.t("range", a=x["start"], b=x["end"]), name(WO_STATUS, x["status"], L)]
                for x in n["shutdowns"]
            ],
            [2.4, 2.2, 1.2],
        )
    else:
        dk.text(s, xb, Inches(1.9), half_w, Inches(0.5), dk.t("no_shutdowns"), 13, color=MUTED)

    # 11. closing
    s = dk.prs.slides.add_slide(dk.blank)
    band = s.shapes.add_shape(1, 0, 0, W, H)
    band.fill.solid()
    band.fill.fore_color.rgb = ACCENT
    band.line.fill.background()
    dk.text(s, M, Inches(3.0), W - 2 * M, Inches(1.0), dk.t("end"), 40, True, WHITE, PP_ALIGN.CENTER)
    dk.text(s, M, Inches(4.0), W - 2 * M, Inches(0.6), f"{d['plant']} · {period}", 16, False, WHITE, PP_ALIGN.CENTER)
    return dk.save()
