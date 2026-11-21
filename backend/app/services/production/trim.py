"""Paper waste (trim loss), phase A: what the waste is today, from the production reports already entered. No model,
no new data: a baseline before any cutting-plan optimisation.

Paper machine (report profile paper_machine), per jumbo reel: gross, saleable (net), reject; trim = gross − saleable −
reject (all of the rest: edge trim, winder trim, breaks on the reel — the reports do not split it); waste = trim + reject.
Grouped by grade (the run segment of that GSM in the report, else the machine's grade of that GSM), week (Sunday to
Saturday), shift and shift supervisor; the worst days with the report notes; the causes from the quality losses.

Converting lines (sheeters and other discrete lines with outputs): produced, reject, downgrade per product (the sheet
size), week and shift; waste = reject; size changes (a new product in the day's sequence); causes from quality losses.

Each block says what is missing for a sharper analysis (`gaps`): e.g. no reel or set widths, no tonnes into a sheeter."""

import uuid
from collections import defaultdict
from collections.abc import Callable
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.operations import OpDailyReport, OpDefect, OpGrade, OpMachine, OpQualityLoss, OpReel, OpRunSegment
from app.models.production import OpOutput, OpProduct
from app.models.tenancy import Plant
from app.services.production.measures import lines_in_scope
from app.services.production.periods import f, r3, r4

TOP_CAUSES = 8
WORST_DAYS = 5


def week_of(d: date) -> date:
    return d - timedelta(days=(d.weekday() + 1) % 7)


def _paper_row(t: dict) -> dict:
    g, trim, rej = t["gross"], t["gross"] - t["saleable"] - t["reject"], t["reject"]
    return {
        "reels": t["reels"],
        "gross": r3(g),
        "saleable": r3(t["saleable"]),
        "trim": r3(trim),
        "reject": r3(rej),
        "downgrade": r3(t["downgrade"]),
        "waste": r3(trim + rej),
        "trim_pct": r4(trim / g) if g else None,
        "reject_pct": r4(rej / g) if g else None,
        "waste_pct": r4((trim + rej) / g) if g else None,
    }


def _rows(groups: dict, finish: Callable[[dict], dict], label: Callable[[object], dict]) -> list[dict]:
    return [label(k) | finish(t) for k, t in groups.items()]


def _causes(db: Session, report_ids: list[uuid.UUID], base: float, first: list[dict]) -> list[dict]:
    """The quality losses by defect (reject and downgrade apart), biggest first; `first` (e.g. the trim) leads."""
    acc: dict[tuple[str, str], float] = defaultdict(float)
    names = {d.id: d.name for d in db.execute(select(OpDefect)).scalars()} if report_ids else {}
    for q in db.execute(select(OpQualityLoss).where(OpQualityLoss.report_id.in_(report_ids))).scalars() if report_ids else []:
        name = names.get(q.defect_id) if q.defect_id else None
        acc[(q.kind.value, name or q.defect_text or "—")] += f(q.qty_mt)
    rows = [{"kind": k, "cause": c, "qty": r3(v), "pct": r4(v / base) if base else None} for (k, c), v in acc.items() if v > 0]
    rows.sort(key=lambda r: -r["qty"])
    return (first + rows)[:TOP_CAUSES]


def _paper(db: Session, m: OpMachine, reports: list[OpDailyReport]) -> dict:
    ids = [r.id for r in reports]
    by_id = {r.id: r for r in reports}
    reels = list(db.execute(select(OpReel).where(OpReel.report_id.in_(ids))).scalars()) if ids else []
    grades = {g.id: g for g in db.execute(select(OpGrade).where(OpGrade.machine_id == m.id)).scalars()}
    by_gsm: dict[int, OpGrade] = {}
    for g in sorted(grades.values(), key=lambda g: (not g.is_active, g.code)):
        by_gsm.setdefault(g.gsm, g)
    # the grade of a reel: the run segment of the same GSM in its report
    seg_grade: dict[tuple[uuid.UUID, int], uuid.UUID] = {}
    changes: dict[uuid.UUID | int, int] = defaultdict(int)
    for s in (
        db.execute(select(OpRunSegment).where(OpRunSegment.report_id.in_(ids)).order_by(OpRunSegment.started_at)).scalars() if ids else []
    ):
        if s.grade_id:
            seg_grade.setdefault((s.report_id, s.gsm), s.grade_id)
        if s.grade_change_hours or s.grade_change_reject_mt:
            changes[s.grade_id or s.gsm] += 1

    def empty() -> dict:
        return {"reels": 0, "gross": 0.0, "saleable": 0.0, "reject": 0.0, "downgrade": 0.0}

    tot = empty()
    g_grade: dict[uuid.UUID | int, dict] = defaultdict(empty)
    g_week: dict[date, dict] = defaultdict(empty)
    g_shift: dict[str, dict] = defaultdict(empty)
    g_sup: dict[str, dict] = defaultdict(empty)
    g_day: dict[uuid.UUID, dict] = defaultdict(empty)
    for reel in reels:
        rep = by_id[reel.report_id]
        gsm = reel.gsm or 0
        gid = seg_grade.get((rep.id, gsm)) or (by_gsm[gsm].id if gsm in by_gsm else None)
        sup = (rep.supervisors or {}).get(reel.shift) or "—"
        for t in (tot, g_grade[gid or gsm], g_week[week_of(rep.report_date)], g_shift[reel.shift], g_sup[sup], g_day[rep.id]):
            t["reels"] += 1
            t["gross"] += f(reel.gross_mt)
            t["saleable"] += f(reel.net_mt)
            t["reject"] += f(reel.reject_mt)
            t["downgrade"] += f(reel.b_grade_mt) + f(reel.s_grade_mt)

    def grade_label(k: object) -> dict:
        g = grades.get(k) if isinstance(k, uuid.UUID) else None
        return {
            "grade": g.code if g else None,
            "name": g.name if g else None,
            "gsm": g.gsm if g else k,
            "changes": changes.get(k if g is None else g.id, 0),
        }

    total = _paper_row(tot)
    days = [
        {"date": by_id[rid].report_date, "report_id": rid, "notes": by_id[rid].notes} | _paper_row(t)
        for rid, t in g_day.items()
        if t["gross"]
    ]
    days.sort(key=lambda d: -(d["waste_pct"] or 0))
    trim_first = [{"kind": "trim", "cause": None, "qty": total["trim"], "pct": total["trim_pct"]}] if total["trim"] > 0 else []
    gaps = ["reel_width", "trim_split"]
    if not m.trim_width_m:
        gaps.insert(0, "deckle")
    return {
        "kind": "paper",
        "unit": "t",
        "deckle_m": f(m.trim_width_m) if m.trim_width_m else None,
        "days": len(g_day),
        "totals": total,
        "by_grade": sorted(_rows(g_grade, _paper_row, grade_label), key=lambda r: -r["gross"]),
        "by_week": sorted(_rows(g_week, _paper_row, lambda k: {"week": k}), key=lambda r: r["week"]),
        "by_shift": sorted(_rows(g_shift, _paper_row, lambda k: {"shift": k}), key=lambda r: str(r["shift"])),
        "by_supervisor": sorted(_rows(g_sup, _paper_row, lambda k: {"supervisor": k}), key=lambda r: -(r["waste_pct"] or 0)),
        "worst_days": days[:WORST_DAYS],
        "causes": _causes(db, ids, tot["gross"], trim_first),
        "gaps": gaps,
    }


def _conv_row(t: dict) -> dict:
    p, rej = t["produced"], t["reject"]
    return {
        "lines": t["lines"],
        "produced": r3(p),
        "reject": r3(rej),
        "downgrade": r3(t["downgrade"]),
        "input": r3(t["input"]) if t["input"] else None,
        "waste": r3(rej),
        "waste_pct": r4(rej / p) if p else None,
        "downgrade_pct": r4(t["downgrade"] / p) if p else None,
    }


def _converting(db: Session, m: OpMachine, reports: list[OpDailyReport]) -> dict:
    ids = [r.id for r in reports]
    by_id = {r.id: r for r in reports}
    outs = (
        list(db.execute(select(OpOutput).where(OpOutput.report_id.in_(ids)).order_by(OpOutput.report_id, OpOutput.started_at)).scalars())
        if ids
        else []
    )
    products = {
        p.id: p for p in db.execute(select(OpProduct).where(OpProduct.id.in_({o.product_id for o in outs if o.product_id}))).scalars()
    }

    def empty() -> dict:
        return {"lines": 0, "produced": 0.0, "reject": 0.0, "downgrade": 0.0, "input": 0.0, "changes": 0}

    tot = empty()
    g_prod: dict[uuid.UUID | None, dict] = defaultdict(empty)
    g_week: dict[date, dict] = defaultdict(empty)
    g_shift: dict[str, dict] = defaultdict(empty)
    g_day: dict[uuid.UUID, dict] = defaultdict(empty)
    last: dict[uuid.UUID, uuid.UUID | None] = {}
    with_input = 0
    for o in sorted(outs, key=lambda o: (by_id[o.report_id].report_date, o.started_at is None, o.started_at or 0, o.shift or "")):
        rep = by_id[o.report_id]
        changed = o.report_id in last and last[o.report_id] != o.product_id
        last[o.report_id] = o.product_id
        with_input += o.input_qty is not None
        for t in (tot, g_prod[o.product_id], g_week[week_of(rep.report_date)], g_shift[o.shift or "—"], g_day[rep.id]):
            t["lines"] += 1
            t["produced"] += f(o.produced_qty)
            t["reject"] += f(o.reject_qty)
            t["downgrade"] += f(o.downgrade_qty)
            t["input"] += f(o.input_qty)
        if changed:
            for t in (tot, g_prod[o.product_id], g_week[week_of(rep.report_date)], g_day[rep.id]):
                t["changes"] += 1

    def with_changes(t: dict) -> dict:
        return _conv_row(t) | {"changes": t["changes"]}

    def prod_label(k: object) -> dict:
        p = products.get(k) if isinstance(k, uuid.UUID) else None
        size = (p.attributes or {}).get("size") if p else None
        return {"product": p.code if p else None, "name": p.name if p else None, "size": size}

    days = [
        {"date": by_id[rid].report_date, "report_id": rid, "notes": by_id[rid].notes} | with_changes(t)
        for rid, t in g_day.items()
        if t["produced"]
    ]
    days.sort(key=lambda d: -(d["waste_pct"] or 0))
    gaps = ["reel_width"]
    if outs and with_input < len(outs):
        gaps.append("sheeter_input")
    return {
        "kind": "converting",
        "unit": m.output_unit,
        "days": len(g_day),
        "totals": with_changes(tot),
        "by_product": sorted(_rows(g_prod, with_changes, prod_label), key=lambda r: -r["produced"]),
        "by_week": sorted(_rows(g_week, with_changes, lambda k: {"week": k}), key=lambda r: r["week"]),
        "by_shift": sorted(_rows(g_shift, with_changes, lambda k: {"shift": k}), key=lambda r: str(r["shift"])),
        "worst_days": days[:WORST_DAYS],
        "causes": _causes(db, ids, tot["produced"], []),
        "gaps": gaps,
    }


def analyse(
    db: Session,
    plant: Plant,
    d0: date,
    d1: date,
    machine_id: uuid.UUID | None = None,
    dept_ok: Callable[[uuid.UUID], bool] = lambda _d: True,
) -> dict:
    """The waste of each paper machine and converting line in scope from d0 to d1 (inclusive)."""
    out = []
    for m in lines_in_scope(db, plant.id, machine_id):
        if not (m.is_active or machine_id) or not dept_ok(m.department_id):
            continue
        paper = m.report_profile == "paper_machine"
        if not paper and m.production_model != "discrete":
            continue  # continuous non-paper lines: no trim
        reports = list(
            db.execute(
                select(OpDailyReport).where(
                    OpDailyReport.machine_id == m.id, OpDailyReport.report_date >= d0, OpDailyReport.report_date <= d1
                )
            ).scalars()
        )
        block = _paper(db, m, reports) if paper else _converting(db, m, reports)
        if not paper and not block["totals"]["lines"] and machine_id is None:
            continue  # a discrete line with no output in the period is left out of the plant view
        out.append({"id": m.id, "code": m.code, "name": m.name} | block)
    return {"from": d0, "to": d1, "machines": out}
