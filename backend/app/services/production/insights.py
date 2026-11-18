"""Production Insights: an industry-independent reading of whatever a plant records. It compares the last 7
production days with the 21 days before (the baseline) for every line and for the plant's log lines, and reports:
KPI deviations, negative trends, abnormal consumption per unit, abnormal operating parameters, repeated losses,
the main loss / bottleneck, low target achievement, high reject, maintenance-related losses and unresolved actions
or alerts. Each insight carries the figures it is based on and a recommendation code; nothing is assumed about the
product, the process or the units — an insight that needs data a plant does not record is simply not made."""

import statistics
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.operations import OpLogTemplate
from app.models.production import OpAction, OpAlert, OpLossCategory
from app.models.tenancy import Plant
from app.services import oplogs
from app.services.production import kpis as kp
from app.services.production import measures as ms

RECENT, BASE = 7, 21
SEV = {"critical": 0, "warning": 1, "info": 2}


def _ratio(a: float | None, b: float | None) -> float | None:
    return a / b if a is not None and b else None


def _chg(new: float | None, old: float | None) -> float | None:
    return round((new - old) / abs(old) * 100, 1) if new is not None and old else None


def generate(db: Session, plant: Plant, today: date, dept_ok=lambda _d: True) -> dict:
    last = today - timedelta(days=1)
    recent = ms.days_between(last - timedelta(days=RECENT - 1), last)
    base = ms.days_between(recent[0] - timedelta(days=BASE), recent[0] - timedelta(days=1))
    out: list[dict] = []
    lines = [m for m in ms.lines_in_scope(db, plant.id) if m.is_active and dept_ok(m.department_id)]
    cats = {c.code: c for c in db.execute(select(OpLossCategory).where(OpLossCategory.plant_id == plant.id)).scalars()}
    line_oee: list[tuple[str, float, dict]] = []

    for m in lines:
        daily, agg = ms.collect(db, plant, [m], base[0], last)
        r = ms.aggregate(daily, agg, recent)
        b = ms.aggregate(daily, agg, base)
        if not r.get("produced") and not r.get("stops"):
            continue
        u = m.output_unit
        av, pe, qu = (
            _ratio(r.get("run_hours"), r.get("planned_hours")),
            _ratio(r.get("produced"), r.get("ideal")),
            _ratio(r.get("good"), r.get("net")),
        )
        if None not in (av, pe, qu):
            factors = {"availability": 1 - av, "performance": 1 - pe, "quality": 1 - qu}  # type: ignore[operator]
            line_oee.append((m.code, av * pe * qu, factors))  # type: ignore[operator]
        # high reject / downgrade
        for code, kind in (("reject", "high_reject"), ("downgrade", "high_downgrade")):
            rn, bn = _ratio(r.get(code), r.get("net")), _ratio(b.get(code), b.get("net"))
            if rn is not None and rn > 0.01 and (bn is None or rn > bn * 1.2):
                out.append({"kind": kind, "severity": "warning", "line": m.code, "params": {"pct": round(rn * 100, 2), "base_pct": None if bn is None else round(bn * 100, 2)},
                            "recommendation": "rec_quality"})  # fmt: skip
        # target achievement
        ta = _ratio(r.get("produced"), r.get("planned_qty"))
        if ta is not None and ta < 0.95:
            out.append({"kind": "low_target", "severity": "warning" if ta >= 0.85 else "critical", "line": m.code,
                        "params": {"pct": round(ta * 100, 1), "produced": round(r["produced"] or 0, 2), "planned": round(r["planned_qty"] or 0, 2), "unit": u},
                        "recommendation": "rec_target"})  # fmt: skip
        # maintenance-related losses
        fh, ph = r.get("failure_hours"), r.get("planned_hours")
        if fh and ph and fh / ph > 0.02:
            out.append({"kind": "maintenance_loss", "severity": "warning" if fh / ph < 0.05 else "critical", "line": m.code,
                        "params": {"hours": round(fh, 2), "pct": round(fh / ph * 100, 1), "failures": int(r.get("failures") or 0),
                                   "base_hours": None if b.get("failure_hours") is None else round(b["failure_hours"] * RECENT / BASE, 2)},
                        "recommendation": "rec_maintenance"})  # fmt: skip
        # repeated / increasing losses by category
        rep = []
        for c, cat in cats.items():
            hr, hb = r.get(f"loss_{c}"), b.get(f"loss_{c}")
            if not hr:
                continue
            n_days = sum(1 for d in recent if (daily.get(d, {}).get(f"loss_{c}") or 0) > 0)
            weekly_base = (hb or 0) * RECENT / BASE
            if n_days >= 3 or (hr > 1 and hr > weekly_base * 1.25):
                rep.append(
                    {
                        "code": c,
                        "name": cat.name,
                        "hours": round(hr, 2),
                        "days": n_days,
                        "base_hours": round(weekly_base, 2),
                        "affects": cat.affects,
                    }
                )
        rep.sort(key=lambda x: -x["hours"])
        for x in rep[:3]:
            out.append({"kind": "repeated_loss", "severity": "warning", "line": m.code, "params": x, "recommendation": "rec_loss"})

    # bottleneck: the line with the lowest OEE (several lines) and the factor costing most
    if line_oee:
        worst = min(line_oee, key=lambda x: x[1])
        factor = max(worst[2], key=lambda k: worst[2][k])
        out.append({"kind": "bottleneck" if len(line_oee) > 1 else "main_loss", "severity": "info", "line": worst[0],
                    "params": {"oee": round(worst[1] * 100, 1), "factor": factor, "loss_pct": round(worst[2][factor] * 100, 1)},
                    "recommendation": f"rec_{factor}"})  # fmt: skip

    # KPIs: deviations and negative trends
    for res in kp.evaluate(db, plant, kp.plant_kpis(db, plant.id), today, days=RECENT + BASE):
        wk = res["values"]["week"]
        if wk["status"] in ("warning", "critical"):
            out.append({"kind": "kpi_deviation", "severity": wk["status"], "line": ",".join(res["lines"]) or None,
                        "params": {"kpi": res["name"], "code": res["code"], "value": wk.get("per_period", wk["value"]), "target": res["target"],
                                   "unit": f"{res['unit']} / {res['period']}".strip() if "per_period" in wk else res["unit"]},
                        "recommendation": "rec_kpi"})  # fmt: skip
        tr = res["trend_pct"]
        if tr is not None and ((res["direction"] == "higher" and tr <= -10) or (res["direction"] == "lower" and tr >= 10)):
            out.append({"kind": "negative_trend", "severity": "warning", "line": ",".join(res["lines"]) or None,
                        "params": {"kpi": res["name"], "code": res["code"], "change_pct": tr, "unit": res["unit"]}, "recommendation": "rec_trend"})  # fmt: skip

    # log lines: consumption per unit and operating parameters
    net_cache: dict[tuple, dict] = {}
    for t in db.execute(select(OpLogTemplate).where(OpLogTemplate.plant_id == plant.id, OpLogTemplate.is_active.is_(True))).scalars():
        if not dept_ok(t.department_id):
            continue
        fields = [fl for fl in oplogs.fields_of(db, t.id, active_only=True) if fl.kind in oplogs.NUMERIC_KINDS]
        series = oplogs.daily_series(db, t, base[0], last)
        basis = tuple(m.id for m in lines if t.machine_id in (None, m.id))  # "per unit": the output of the form's line (or all lines)
        if basis not in net_cache:
            ld = ms.line_daily(db, plant, [m for m in lines if m.id in basis], base[0], last)
            net_cache[basis] = {d: v.get("net") for d, v in ld.items()}
        net = net_cache[basis]
        for fl in fields:
            s = {date.fromisoformat(k): v for k, v in series.get(str(fl.id), {}).items()}
            rv = [s[d] for d in recent if d in s]
            bv = [s[d] for d in base if d in s]
            if fl.per_ton and net:
                rpu = [s[d] / net[d] for d in recent if d in s and net.get(d)]
                bpu = [s[d] / net[d] for d in base if d in s and net.get(d)]
                if len(rpu) >= 3 and len(bpu) >= 5:
                    a, b_ = statistics.mean(rpu), statistics.mean(bpu)
                    ch = _chg(a, b_)
                    if ch is not None and ch >= 15:
                        out.append({"kind": "abnormal_consumption", "severity": "warning" if ch < 30 else "critical", "line": None,
                                    "params": {"item": fl.label, "form": t.name, "per_unit": round(a, 4), "base_per_unit": round(b_, 4), "change_pct": ch, "unit": fl.unit},
                                    "recommendation": "rec_consumption"})  # fmt: skip
                        continue
            out_days = sum(1 for v in rv if (fl.low is not None and v < float(fl.low)) or (fl.high is not None and v > float(fl.high)))
            if out_days >= 2:
                out.append({"kind": "out_of_limits", "severity": "warning", "line": None,
                            "params": {"item": fl.label, "form": t.name, "days": out_days, "low": _f(fl.low), "high": _f(fl.high), "unit": fl.unit},
                            "recommendation": "rec_parameter"})  # fmt: skip
            elif fl.chart and len(rv) >= 3 and len(bv) >= 7:
                sd = statistics.pstdev(bv)
                mu = statistics.mean(bv)
                if sd > 0 and abs(statistics.mean(rv) - mu) > 2 * sd:
                    out.append({"kind": "abnormal_parameter", "severity": "info", "line": None,
                                "params": {"item": fl.label, "form": t.name, "value": round(statistics.mean(rv), 3), "base": round(mu, 3), "unit": fl.unit},
                                "recommendation": "rec_parameter"})  # fmt: skip

    # unresolved actions and alerts
    overdue = db.execute(
        select(func.count())
        .select_from(OpAction)
        .where(OpAction.plant_id == plant.id, OpAction.status.in_(("open", "in_progress")), OpAction.due_date < today)
    ).scalar_one()
    if overdue:
        out.append(
            {"kind": "overdue_actions", "severity": "warning", "line": None, "params": {"n": overdue}, "recommendation": "rec_actions"}
        )
    open_alerts = db.execute(
        select(func.count()).select_from(OpAlert).where(OpAlert.plant_id == plant.id, OpAlert.status == "open")
    ).scalar_one()
    if open_alerts:
        out.append({"kind": "open_alerts", "severity": "info", "line": None, "params": {"n": open_alerts}, "recommendation": "rec_alerts"})

    out.sort(key=lambda x: (SEV.get(x["severity"], 3), x["kind"]))
    for i, x in enumerate(out):
        x["id"] = f"{x['kind']}:{x.get('line') or ''}:{x['params'].get('code') or x['params'].get('item') or i}"
    return {
        "recent": [recent[0].isoformat(), recent[-1].isoformat()],
        "baseline": [base[0].isoformat(), base[-1].isoformat()],
        "items": out,
    }


def _f(v) -> float | None:
    return float(v) if v is not None else None
