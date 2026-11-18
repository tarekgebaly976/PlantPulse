"""Paper mill configuration (report profile "paper_machine"): calculations of the paper machine's daily production
report, as on a typical paper-mill daily form. Used only by lines whose report profile is paper_machine; the
industry-independent engine (measures, KPIs, alerts, insights) never imports paper terms and reads this profile
through `measures()` like any other.

Everything the mill's Excel sheet calculates is calculated here from what was entered, never typed:

* reels → per shift and per day: gross, saleable (A + B + S), net (saleable + reject), A-grade, B, S, reject and
  machine trim loss (gross − net);
* run segments → run hours and ideal tonnes (minutes × ideal MT/min of the grade, so a GSM change is exact);
* OEE as the mill calculates it: availability = run hours ÷ 24 h, performance = gross ÷ ideal tonnes,
  quality = A-grade ÷ net;
* stops (downtime events written by operations) → hours by responsible discipline, planned shutdown hours, sheet
  breaks (count and hours by discipline);
* day, month-to-date and year-to-date totals of the same machine.
"""

import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assets import DowntimeEvent
from app.models.enums import OpEventType, OpLossKind
from app.models.operations import (
    OpDailyReport,
    OpMachine,
    OpQualityLoss,
    OpReel,
    OpRunSegment,
    OpStopPart,
)
from app.models.tenancy import Plant
from app.services.production.periods import DAY_HOURS, day_window, f, planned_hours, r3, r4, shift_windows
from app.services.production.periods import hours as _hours
from app.services.production.periods import overlap_h as _overlap_h
from app.services.production.stops import loss_tables, parts_of, stops_of

TOL_MT = 0.01  # tonnes: differences below this are rounding
TOL_H = 0.02  # hours


# ---------------------------------------------------------------- production figures
def _empty() -> dict:
    return {"reels": 0, "gross": 0.0, "saleable": 0.0, "net": 0.0, "a": 0.0, "b": 0.0, "s": 0.0, "reject": 0.0, "trim": 0.0}


def _add_reel(t: dict, r: OpReel) -> None:
    t["reels"] += 1
    t["gross"] += f(r.gross_mt)
    t["saleable"] += f(r.net_mt)
    t["reject"] += f(r.reject_mt)
    t["b"] += f(r.b_grade_mt)
    t["s"] += f(r.s_grade_mt)


def _finish(t: dict) -> dict:
    t["net"] = t["saleable"] + t["reject"]
    t["a"] = t["saleable"] - t["b"] - t["s"]
    t["trim"] = t["gross"] - t["net"]
    out = {k: (r3(v) if isinstance(v, float) else v) for k, v in t.items()}
    out["b_pct"] = r4(t["b"] / t["net"]) if t["net"] else None
    out["reject_pct"] = r4(t["reject"] / t["net"]) if t["net"] else None
    out["trim_pct"] = r4(t["trim"] / t["gross"]) if t["gross"] else None
    return out


def oee(run_h: float, planned_h: float, gross: float, ideal: float, a: float, net: float) -> dict:
    av = run_h / planned_h if planned_h else None
    pe = gross / ideal if ideal else None
    qu = a / net if net else None
    o = av * pe * qu if None not in (av, pe, qu) else None  # type: ignore[operator]
    return {"availability": r4(av), "performance": r4(pe), "quality": r4(qu), "oee": r4(o), "planned_hours": round(planned_h, 3)}


# ---------------------------------------------------------------- stops
def stop_tables(events: list[DowntimeEvent], parts: dict[uuid.UUID, list[OpStopPart]]) -> dict:
    """Machine shutdown hours by discipline (+ planned) and sheet breaks (count, hours) by discipline."""
    down: dict[str, float] = defaultdict(float)
    planned = 0.0
    other = 0.0
    breaks_n: dict[str, int] = defaultdict(int)
    breaks_h: dict[str, float] = defaultdict(float)
    for e in events:
        h = _hours(e.started_at, e.ended_at)
        ps = parts.get(e.id, [])
        if e.event_type == OpEventType.SHEET_BREAK:
            if ps:
                main = max(ps, key=lambda p: f(p.hours))
                breaks_n[str(main.discipline_id)] += 1
                for p in ps:
                    breaks_h[str(p.discipline_id)] += f(p.hours)
            else:
                breaks_n["none"] += 1
                breaks_h["none"] += h
        elif e.event_type == OpEventType.PLANNED:
            planned += h
        elif e.event_type == OpEventType.OTHER and not ps:
            other += h
        else:
            if ps:
                for p in ps:
                    down[str(p.discipline_id)] += f(p.hours)
            else:
                down["none"] += h
    total_down = sum(down.values()) + planned + other
    return {
        "downtime_by_discipline": {k: round(v, 3) for k, v in down.items()},
        "planned_hours": round(planned, 3),
        "other_hours": round(other, 3),
        "downtime_hours": round(total_down, 3),
        "breaks_count_by_discipline": dict(breaks_n),
        "breaks_hours_by_discipline": {k: round(v, 3) for k, v in breaks_h.items()},
        "breaks_count": sum(breaks_n.values()),
        "breaks_hours": round(sum(breaks_h.values()), 3),
    }


# ---------------------------------------------------------------- the report
def _period_totals(db: Session, machine: OpMachine, d0: date, d1: date) -> dict:
    """Totals of a machine's reports from d0 to d1 (inclusive): production, run, ideal, OEE, stops, breaks."""
    reports = list(
        db.execute(
            select(OpDailyReport).where(
                OpDailyReport.machine_id == machine.id, OpDailyReport.report_date >= d0, OpDailyReport.report_date <= d1
            )
        ).scalars()
    )
    ids = [r.id for r in reports]
    t = _empty()
    run_h = ideal = 0.0
    if ids:
        for reel in db.execute(select(OpReel).where(OpReel.report_id.in_(ids))).scalars():
            _add_reel(t, reel)
        for s in db.execute(select(OpRunSegment).where(OpRunSegment.report_id.in_(ids))).scalars():
            m = (s.ended_at - s.started_at).total_seconds() / 60
            run_h += m / 60
            ideal += m * f(s.ideal_mt_min)
    tot = _finish(t)
    ev = stops_of(db, ids)
    st = stop_tables(ev, parts_of(db, [e.id for e in ev]))
    plant = db.get(Plant, machine.plant_id)
    assert plant is not None
    planned_h = sum(planned_hours(machine, plant, r.report_date) for r in reports)
    return {
        "days": len(reports),
        "production": tot,
        "run_hours": round(run_h, 3),
        "ideal_mt": r3(ideal),
        "oee": oee(run_h, planned_h, tot["gross"], ideal, tot["a"], tot["net"]),
        "stops": st,
    }


def compute(db: Session, report: OpDailyReport, plant: Plant, to_date: bool = True) -> dict:
    machine = db.get(OpMachine, report.machine_id)
    assert machine is not None
    t0, t1 = day_window(machine, plant, report.report_date)
    windows = shift_windows(machine, plant, report.report_date)
    segs = list(db.execute(select(OpRunSegment).where(OpRunSegment.report_id == report.id).order_by(OpRunSegment.started_at)).scalars())
    reels = list(db.execute(select(OpReel).where(OpReel.report_id == report.id)).scalars())
    losses = list(db.execute(select(OpQualityLoss).where(OpQualityLoss.report_id == report.id)).scalars())
    events = stops_of(db, [report.id])
    parts = parts_of(db, [e.id for e in events])

    # run segments
    seg_rows, run_h, ideal = [], 0.0, 0.0
    for s in segs:
        h = (s.ended_at - s.started_at).total_seconds() / 3600
        im = h * 60 * f(s.ideal_mt_min)
        run_h += h
        ideal += im
        seg_rows.append({"id": str(s.id), "hours": round(h, 3), "ideal_mt": r3(im)})

    # shifts
    shift_codes = [w[0] for w in windows]
    per_shift: dict[str, dict] = {c: _empty() for c in shift_codes}
    for reel in reels:
        per_shift.setdefault(reel.shift, _empty())
        _add_reel(per_shift[reel.shift], reel)
    shifts = []
    for code, name, w0, w1 in windows:
        rh = sum(_overlap_h(s.started_at, s.ended_at, w0, w1) for s in segs)
        gsms = sorted({s.gsm for s in segs if _overlap_h(s.started_at, s.ended_at, w0, w1) > 0})
        speeds = sorted({f(s.speed_mpm) for s in segs if s.speed_mpm and _overlap_h(s.started_at, s.ended_at, w0, w1) > 0})
        shifts.append(
            {
                "code": code,
                "name": name,
                "start": w0.isoformat(),
                "end": w1.isoformat(),
                "supervisor": (report.supervisors or {}).get(code),
                "gsm": gsms,
                "speed": speeds,
                "run_hours": round(rh, 3),
                **_finish(per_shift[code]),
            }
        )
    for code in per_shift:
        if code not in shift_codes:  # reels of a shift code the machine does not list
            shifts.append({"code": code, "name": code, "run_hours": None, **_finish(per_shift[code])})
    day = _empty()
    for reel in reels:
        _add_reel(day, reel)
    day_tot = _finish(day)

    # gross by GSM (reel GSM, else the grade running when … unknown: "?")
    by_gsm: dict[str, float] = defaultdict(float)
    for reel in reels:
        by_gsm[str(reel.gsm) if reel.gsm else "?"] += f(reel.gross_mt)

    # stops
    st = stop_tables(events, parts)

    # checks (warnings, never blocking)
    warnings: list[dict] = []
    for i, s in enumerate(segs):
        if s.started_at < t0 - timedelta(minutes=1) or s.ended_at > t1 + timedelta(minutes=1):
            warnings.append({"code": "segment_outside_day", "item": str(s.id)})
        if i and s.started_at < segs[i - 1].ended_at - timedelta(minutes=1):
            warnings.append({"code": "segments_overlap", "item": str(s.id)})
    stop_in_day = sum(
        _overlap_h(e.started_at, e.ended_at, t0, t1) for e in events if e.ended_at and e.event_type != OpEventType.SHEET_BREAK
    )
    breaks_in_day = sum(
        _overlap_h(e.started_at, e.ended_at, t0, t1) for e in events if e.ended_at and e.event_type == OpEventType.SHEET_BREAK
    )
    gap = DAY_HOURS - run_h - stop_in_day - breaks_in_day
    if segs and abs(gap) > 0.1:
        warnings.append({"code": "time_not_accounted", "hours": round(gap, 2)})
    for e in events:
        if e.ended_at is None:
            warnings.append({"code": "stop_open", "item": str(e.id)})
            continue
        ps = parts.get(e.id, [])
        if ps and abs(sum(f(p.hours) for p in ps) - _hours(e.started_at, e.ended_at)) > TOL_H:
            warnings.append({"code": "stop_parts_mismatch", "item": str(e.id)})
        if not ps and e.event_type in (OpEventType.BREAKDOWN, OpEventType.SHEET_BREAK):
            warnings.append({"code": "stop_no_discipline", "item": str(e.id)})
    rej_l = sum(f(x.qty_mt) for x in losses if x.kind == OpLossKind.REJECT)
    dg_l = sum(f(x.qty_mt) for x in losses if x.kind == OpLossKind.DOWNGRADE)
    if abs(rej_l - day_tot["reject"]) > TOL_MT:
        warnings.append({"code": "reject_not_explained", "reels": day_tot["reject"], "losses": r3(rej_l)})
    if abs(dg_l - (day_tot["b"] + day_tot["s"])) > TOL_MT:
        warnings.append({"code": "downgrade_not_explained", "reels": r3(day_tot["b"] + day_tot["s"]), "losses": r3(dg_l)})
    for reel in reels:
        if (
            f(reel.net_mt) + f(reel.reject_mt) > f(reel.gross_mt) + TOL_MT
            or f(reel.b_grade_mt) + f(reel.s_grade_mt) > f(reel.net_mt) + TOL_MT
        ):
            warnings.append({"code": "reel_inconsistent", "item": reel.reel_no})

    # to date
    d = report.report_date
    mtd = _period_totals(db, machine, d.replace(day=1), d) if to_date else None
    ytd = _period_totals(db, machine, d.replace(month=1, day=1), d) if to_date else None
    steam_per_t = f(report.steam_mt) / day_tot["net"] if report.steam_mt is not None and day_tot["net"] else None
    plan_h = planned_hours(machine, plant, report.report_date)
    out = {
        "profile": "paper_machine",
        "window": {"start": t0.isoformat(), "end": t1.isoformat()},
        "shifts": shifts,
        "day": day_tot,
        "segments": seg_rows,
        "run_hours": round(run_h, 3),
        "ideal_mt": r3(ideal),
        "oee": oee(run_h, plan_h, day_tot["gross"], ideal, day_tot["a"], day_tot["net"]),
        "in_progress": datetime.now(t1.tzinfo) < t1,
        "gross_by_gsm": {k: r3(v) for k, v in sorted(by_gsm.items())},
        "stops": st,
        "losses": {"reject": r3(rej_l), "downgrade": r3(dg_l)},
        "steam_per_t": r4(steam_per_t),
        "mtd": mtd,
        "ytd": ytd,
        "warnings": warnings,
        "loss_categories": loss_tables(db, events),
    }
    out["measures"] = measures(out, report, plan_h)
    return out


def measures(calc: dict, report: OpDailyReport, plan_h: float) -> dict[str, float | None]:
    """The paper report in the standard production measures of the generic engine (app.services.production.measures):
    produced = gross, good = A-grade, downgrade = B + S, reject, net, ideal tonnes; stop time includes sheet breaks.
    Paper-only extras (breaks, trim, steam) keep their own names and are used only by the paper mill's KPIs."""
    d, st, lc = calc["day"], calc["stops"], calc["loss_categories"]
    return {
        "planned_hours": plan_h,
        "run_hours": calc["run_hours"],
        "produced": d["gross"],
        "good": d["a"],
        "reject": d["reject"],
        "downgrade": r3(d["b"] + d["s"]),
        "net": d["net"],
        "ideal": calc["ideal_mt"] if calc["ideal_mt"] else None,
        "downtime_hours": r3(st["downtime_hours"] + st["breaks_hours"]),
        "planned_downtime_hours": st["planned_hours"],
        "unplanned_downtime_hours": r3(st["downtime_hours"] - st["planned_hours"] + st["breaks_hours"]),
        "failure_hours": lc["failure_hours"],
        "stops": lc["stops"],
        "failures": lc["failures"],
        "quality_loss": r3(calc["losses"]["reject"] + calc["losses"]["downgrade"]),
        **{f"loss_{k}": v for k, v in lc["hours_by_code"].items()},
        "breaks": st["breaks_count"],
        "breaks_hours": st["breaks_hours"],
        "trim": d["trim"],
        "steam": f(report.steam_mt) if report.steam_mt is not None else None,
    }


# measures only this profile provides (besides the standard ones), for the KPI editor's list of codes
EXTRA_MEASURES = {"breaks": "count", "breaks_hours": "h", "trim": "qty", "steam": "qty"}
