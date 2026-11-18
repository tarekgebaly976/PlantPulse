"""Generic daily production report (report profile "generic"): any continuous, batch or discrete line.

Output lines (product, batch / lot / order reference, produced, reject and downgrade quantities, optional run time,
target and input quantity) and stops classified by loss category give, per shift and per day:

* produced, good (= produced − reject − downgrade), reject, downgrade, net (= good + downgrade + reject);
* run hours: the output lines' run hours when given, else planned hours − stop time that reduces availability;
* ideal quantity: run hours × the product's ideal rate (or 3600 ÷ ideal cycle time) copied on the output line;
* OEE (availability × performance × quality) when the data are there — never invented when they are not;
* yield (good ÷ input), target achievement (produced ÷ planned), batches and completed batches, average cycle time.
"""

import uuid
from collections import defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import OpLossKind
from app.models.operations import OpDailyReport, OpMachine, OpQualityLoss
from app.models.production import OpOutput, OpProduct
from app.models.tenancy import Plant
from app.services.production.periods import day_window, f, hours, overlap_h, planned_hours, r3, r4, shift_windows
from app.services.production.stops import TOL_H, discipline_hours, loss_tables, parts_of, stops_of

TOL_Q = 0.001


def _empty() -> dict:
    return {"lines": 0, "produced": 0.0, "reject": 0.0, "downgrade": 0.0, "run_hours": None, "planned_qty": None, "input_qty": None,
            "ideal": None, "batches": 0, "batches_completed": 0}  # fmt: skip


def _opt_add(t: dict, k: str, v: float | None) -> None:
    if v is not None:
        t[k] = (t[k] or 0.0) + v


def _add(t: dict, o: OpOutput) -> None:
    t["lines"] += 1
    t["produced"] += f(o.produced_qty)
    t["reject"] += f(o.reject_qty)
    t["downgrade"] += f(o.downgrade_qty)
    rh = output_hours(o)
    _opt_add(t, "run_hours", rh)
    _opt_add(t, "planned_qty", f(o.planned_qty) if o.planned_qty is not None else None)
    _opt_add(t, "input_qty", f(o.input_qty) if o.input_qty is not None else None)
    if rh is not None and o.ideal_rate_per_h is not None:
        _opt_add(t, "ideal", rh * f(o.ideal_rate_per_h))
    if o.order_ref:
        t["batches"] += 1
        t["batches_completed"] += 1 if o.completed else 0


def output_hours(o: OpOutput) -> float | None:
    if o.run_hours is not None:
        return f(o.run_hours)
    if o.started_at and o.ended_at:
        return hours(o.started_at, o.ended_at)
    return None


def _finish(t: dict) -> dict:
    good = t["produced"] - t["reject"] - t["downgrade"]
    net = good + t["downgrade"] + t["reject"]
    out = {k: (r3(v) if isinstance(v, float) else v) for k, v in t.items()}
    out["good"] = r3(good)
    out["net"] = r3(net)
    out["reject_pct"] = r4(t["reject"] / net) if net else None
    out["downgrade_pct"] = r4(t["downgrade"] / net) if net else None
    out["yield_pct"] = r4(good / t["input_qty"]) if t["input_qty"] else None
    out["target_pct"] = r4(t["produced"] / t["planned_qty"]) if t["planned_qty"] else None
    return out


def oee(run_h: float | None, planned_h: float, produced: float, ideal: float | None, good: float, net: float) -> dict:
    av = run_h / planned_h if planned_h and run_h is not None else None
    pe = produced / ideal if ideal else None
    qu = good / net if net else None
    o = av * pe * qu if None not in (av, pe, qu) else None  # type: ignore[operator]
    return {"availability": r4(av), "performance": r4(pe), "quality": r4(qu), "oee": r4(o), "planned_hours": round(planned_h, 3)}


def outputs_of(db: Session, report_ids: list[uuid.UUID]) -> list[OpOutput]:
    if not report_ids:
        return []
    return list(
        db.execute(select(OpOutput).where(OpOutput.report_id.in_(report_ids)).order_by(OpOutput.started_at, OpOutput.order_ref)).scalars()
    )


def compute(db: Session, report: OpDailyReport, plant: Plant, to_date: bool = True) -> dict:
    machine = db.get(OpMachine, report.machine_id)
    assert machine is not None
    t0, t1 = day_window(machine, plant, report.report_date)
    windows = shift_windows(machine, plant, report.report_date)
    outs = outputs_of(db, [report.id])
    events = stops_of(db, [report.id])
    parts = parts_of(db, [e.id for e in events])
    losses = list(db.execute(select(OpQualityLoss).where(OpQualityLoss.report_id == report.id)).scalars())
    lt = loss_tables(db, events)
    plan_h = planned_hours(machine, plant, report.report_date)

    per_shift: dict[str, dict] = {w[0]: _empty() for w in windows}
    day = _empty()
    for o in outs:
        _add(per_shift.setdefault(o.shift or "-", _empty()), o)
        _add(day, o)
    stop_h = sum(hours(e.started_at, e.ended_at) for e in events)
    avail_loss_h = lt["hours_by_factor"].get("availability", 0.0)
    planned_stop_h = sum(hours(e.started_at, e.ended_at) for e in events if e.is_planned)
    # run hours: entered on the output lines, else what is left of the day after stops that cost availability
    run_h = day["run_hours"] if day["run_hours"] is not None else (max(0.0, plan_h - avail_loss_h) if (outs or events) else None)
    ideal = day["ideal"]
    if ideal is None and run_h is not None:  # rates entered without run hours: spread the run time over the output lines
        rates = [f(o.ideal_rate_per_h) for o in outs if o.ideal_rate_per_h is not None]
        if rates and len(rates) == len(outs) and day["produced"]:
            ideal = sum(run_h * f(o.produced_qty) / day["produced"] * f(o.ideal_rate_per_h) for o in outs)
    tot = _finish(day)
    shifts = []
    for code, name, w0, w1 in windows:
        st_h = sum(overlap_h(e.started_at, e.ended_at or t1, w0, w1) for e in events)
        shifts.append({"code": code, "name": name, "start": w0.isoformat(), "end": w1.isoformat(), "supervisor": (report.supervisors or {}).get(code),
                       "stop_hours": round(st_h, 3), **_finish(per_shift[code])})  # fmt: skip
    for code in per_shift:
        if code not in {w[0] for w in windows}:
            shifts.append({"code": code, "name": code, "stop_hours": None, **_finish(per_shift[code])})

    by_product: dict[str, float] = defaultdict(float)
    names = {p.id: p.code for p in db.execute(select(OpProduct).where(OpProduct.plant_id == report.plant_id)).scalars()}
    for o in outs:
        by_product[names.get(o.product_id, "?") if o.product_id else "?"] += f(o.produced_qty)

    warnings: list[dict] = []
    for e in events:
        if e.ended_at is None:
            warnings.append({"code": "stop_open", "item": str(e.id)})
            continue
        ps = parts.get(e.id, [])
        if ps and abs(sum(f(p.hours) for p in ps) - hours(e.started_at, e.ended_at)) > TOL_H:
            warnings.append({"code": "stop_parts_mismatch", "item": str(e.id)})
        if e.loss_category_id is None:
            warnings.append({"code": "stop_no_category", "item": str(e.id)})
    for o in outs:
        if f(o.reject_qty) + f(o.downgrade_qty) > f(o.produced_qty) + TOL_Q:
            warnings.append({"code": "output_inconsistent", "item": o.order_ref or str(o.id)})
    if day["run_hours"] is not None and day["run_hours"] + avail_loss_h > plan_h + 0.1 and plan_h >= 24:
        warnings.append({"code": "time_over", "hours": round(day["run_hours"] + avail_loss_h - plan_h, 2)})
    rej_l = sum(f(x.qty_mt) for x in losses if x.kind == OpLossKind.REJECT)
    dg_l = sum(f(x.qty_mt) for x in losses if x.kind == OpLossKind.DOWNGRADE)
    if losses and abs(rej_l - tot["reject"]) > TOL_Q:
        warnings.append({"code": "reject_not_explained", "reels": tot["reject"], "losses": r3(rej_l)})
    if losses and abs(dg_l - tot["downgrade"]) > TOL_Q:
        warnings.append({"code": "downgrade_not_explained", "reels": tot["downgrade"], "losses": r3(dg_l)})

    out = {
        "profile": "generic",
        "unit": machine.output_unit,
        "window": {"start": t0.isoformat(), "end": t1.isoformat()},
        "shifts": shifts,
        "day": tot,
        "run_hours": round(run_h, 3) if run_h is not None else None,
        "ideal": r3(ideal) if ideal is not None else None,
        "cycle_time_s": round(run_h * 3600 / tot["produced"], 2) if run_h and tot["produced"] else None,
        "oee": oee(run_h, plan_h, tot["produced"], ideal, tot["good"], tot["net"]),
        "in_progress": plan_h < 24,
        "by_product": {k: r3(v) for k, v in sorted(by_product.items())},
        "stops": {
            "downtime_hours": round(stop_h, 3),
            "planned_hours": round(planned_stop_h, 3),
            "downtime_by_discipline": discipline_hours(events, parts),
        },  # fmt: skip
        "loss_categories": lt,
        "losses": {"reject": r3(rej_l), "downgrade": r3(dg_l)},
        "warnings": warnings,
        "mtd": period_totals(db, machine, plant, report.report_date.replace(day=1), report.report_date) if to_date else None,
        "ytd": period_totals(db, machine, plant, report.report_date.replace(month=1, day=1), report.report_date) if to_date else None,
    }
    out["measures"] = measures(out, plan_h)
    return out


def measures(calc: dict, plan_h: float) -> dict[str, float | None]:
    d, lt = calc["day"], calc["loss_categories"]
    return {
        "planned_hours": plan_h,
        "run_hours": calc["run_hours"],
        "produced": d["produced"],
        "good": d["good"],
        "reject": d["reject"],
        "downgrade": d["downgrade"],
        "net": d["net"],
        "ideal": calc["ideal"],
        "planned_qty": d["planned_qty"],
        "input_qty": d["input_qty"],
        "batches": d["batches"],
        "batches_completed": d["batches_completed"],
        "downtime_hours": calc["stops"]["downtime_hours"],
        "planned_downtime_hours": calc["stops"]["planned_hours"],
        "unplanned_downtime_hours": r3(calc["stops"]["downtime_hours"] - calc["stops"]["planned_hours"]),
        "failure_hours": lt["failure_hours"],
        "stops": lt["stops"],
        "failures": lt["failures"],
        "quality_loss": r3(calc["losses"]["reject"] + calc["losses"]["downgrade"]),
        **{f"loss_{k}": v for k, v in lt["hours_by_code"].items()},
    }


def period_totals(db: Session, machine: OpMachine, plant: Plant, d0: date, d1: date) -> dict:
    reports = list(
        db.execute(
            select(OpDailyReport).where(
                OpDailyReport.machine_id == machine.id, OpDailyReport.report_date >= d0, OpDailyReport.report_date <= d1
            )
        ).scalars()
    )
    acc: dict[str, float] = defaultdict(float)
    have: set[str] = set()
    for r in reports:
        for k, v in compute(db, r, plant, to_date=False)["measures"].items():
            if v is not None:
                acc[k] += v
                have.add(k)
    m = {k: (round(acc[k], 3) if k in have else None) for k in ("planned_hours", "run_hours", "produced", "good", "reject", "downgrade", "net",
                                                               "ideal", "downtime_hours", "stops")}  # fmt: skip
    return {"days": len(reports), "measures": m,
            "oee": oee(m["run_hours"], m["planned_hours"] or 0.0, m["produced"] or 0.0, m["ideal"], m["good"] or 0.0, m["net"] or 0.0)}  # fmt: skip


EXTRA_MEASURES: dict[str, str] = {}
