"""Operations module: calculations of the paper machine's daily production report (a typical paper-mill daily form).

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
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assets import DowntimeEvent
from app.models.enums import OpEventType, OpLossKind, OpReportStatus
from app.models.operations import (
    OpDailyReport,
    OpDiscipline,
    OpMachine,
    OpQualityLoss,
    OpReel,
    OpRunSegment,
    OpStopPart,
)
from app.models.system import ProductionRecord
from app.models.tenancy import Plant

DAY_HOURS = 24.0
TOL_MT = 0.01  # tonnes: differences below this are rounding
TOL_H = 0.02  # hours


def f(v: Decimal | float | int | None) -> float:
    return float(v) if v is not None else 0.0


def r3(v: float) -> float:
    return round(v, 3)


def r4(v: float | None) -> float | None:
    return None if v is None else round(v, 4)


def day_window(machine: OpMachine, plant: Plant, d: date) -> tuple[datetime, datetime]:
    """Production day `d` runs from the machine's day start on d to the same time on d + 1 (plant time zone)."""
    tz = ZoneInfo(plant.timezone)
    start = datetime.combine(d, machine.day_start or time(7, 0), tzinfo=tz)
    return start, start + timedelta(days=1)


def shift_windows(machine: OpMachine, plant: Plant, d: date) -> list[tuple[str, str, datetime, datetime]]:
    """[(code, name, start, end)] of the machine's shifts in production day d (each ends where the next starts)."""
    t0, t1 = day_window(machine, plant, d)
    shifts = machine.shifts or [
        {"code": "D", "name": "Day shift", "start": "07:00"},
        {"code": "N", "name": "Night shift", "start": "19:00"},
    ]
    starts = []
    for s in shifts:
        hh, mm = (int(x) for x in str(s.get("start", "07:00")).split(":")[:2])
        st = datetime.combine(d, time(hh, mm), tzinfo=t0.tzinfo)
        if st < t0:
            st += timedelta(days=1)
        starts.append((st, str(s["code"]), str(s.get("name") or s["code"])))
    starts.sort()
    out = []
    for i, (st, code, name) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else t1
        out.append((code, name, st, end))
    return out


def _overlap_h(a0: datetime, a1: datetime, b0: datetime, b1: datetime) -> float:
    return max(0.0, (min(a1, b1) - max(a0, b0)).total_seconds() / 3600)


def planned_hours(machine: OpMachine, plant: Plant, d: date, now: datetime | None = None) -> float:
    """Hours of production day d that have passed: 24 for a finished day, the elapsed part for the day in progress
    (so the OEE of today and of the month to date are fair while the day runs)."""
    t0, t1 = day_window(machine, plant, d)
    now = now or datetime.now(t0.tzinfo)
    if now >= t1:
        return DAY_HOURS
    return max(0.0, min(DAY_HOURS, (now - t0).total_seconds() / 3600))


def _hours(a: datetime, b: datetime | None) -> float:
    return (b - a).total_seconds() / 3600 if b else 0.0


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
def stops_of(db: Session, report_ids: list[uuid.UUID]) -> list[DowntimeEvent]:
    if not report_ids:
        return []
    return list(
        db.execute(select(DowntimeEvent).where(DowntimeEvent.op_report_id.in_(report_ids)).order_by(DowntimeEvent.started_at)).scalars()
    )


def parts_of(db: Session, event_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[OpStopPart]]:
    out: dict[uuid.UUID, list[OpStopPart]] = defaultdict(list)
    if event_ids:
        for p in db.execute(select(OpStopPart).where(OpStopPart.downtime_event_id.in_(event_ids))).scalars():
            out[p.downtime_event_id].append(p)
    return out


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


def classify(event_type: str, disciplines: list[OpDiscipline]) -> tuple[bool, bool]:
    """(is_failure, is_planned) of a stop for the maintenance KPIs: a breakdown is an equipment failure when a
    maintenance discipline (mechanical, electrical, instrumentation …) is responsible; sheet breaks and process
    stops are not failures (they would wreck MTBF)."""
    planned = event_type == OpEventType.PLANNED
    failure = event_type == OpEventType.BREAKDOWN and any(d.maintenance for d in disciplines)
    return failure, planned


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


def compute(db: Session, report: OpDailyReport, plant: Plant) -> dict:
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
    mtd = _period_totals(db, machine, d.replace(day=1), d)
    ytd = _period_totals(db, machine, d.replace(month=1, day=1), d)
    steam_per_t = f(report.steam_mt) / day_tot["net"] if report.steam_mt is not None and day_tot["net"] else None
    return {
        "window": {"start": t0.isoformat(), "end": t1.isoformat()},
        "shifts": shifts,
        "day": day_tot,
        "segments": seg_rows,
        "run_hours": round(run_h, 3),
        "ideal_mt": r3(ideal),
        "oee": oee(run_h, planned_hours(machine, plant, report.report_date), day_tot["gross"], ideal, day_tot["a"], day_tot["net"]),
        "in_progress": datetime.now(t1.tzinfo) < t1,
        "gross_by_gsm": {k: r3(v) for k, v in sorted(by_gsm.items())},
        "stops": st,
        "losses": {"reject": r3(rej_l), "downgrade": r3(dg_l)},
        "steam_per_t": r4(steam_per_t),
        "mtd": mtd,
        "ytd": ytd,
        "warnings": warnings,
    }


def write_production_record(db: Session, report: OpDailyReport, plant: Plant, calc: dict) -> None:
    """Confirmed report → the day's production record of the machine, so OEE and cost per ton on the KPI pages use the
    same figures as the report (planned 24 h, run hours, gross, A-grade, ideal and net tonnes)."""
    machine = db.get(OpMachine, report.machine_id)
    assert machine is not None
    rec = db.execute(
        select(ProductionRecord).where(
            ProductionRecord.plant_id == plant.id,
            ProductionRecord.department_id == machine.department_id,
            ProductionRecord.asset_id == machine.asset_id,
            ProductionRecord.record_date == report.report_date,
        )
    ).scalar_one_or_none()
    if rec is None:
        rec = ProductionRecord(
            plant_id=plant.id, department_id=machine.department_id, asset_id=machine.asset_id, record_date=report.report_date
        )
        db.add(rec)
    run_h = calc["run_hours"]
    rec.tons_produced = Decimal(str(calc["day"]["gross"]))
    rec.good_tons = Decimal(str(calc["day"]["a"]))
    rec.net_tons = Decimal(str(calc["day"]["net"]))
    rec.ideal_tons = Decimal(str(calc["ideal_mt"]))
    rec.planned_production_hours = Decimal(str(round(calc["oee"]["planned_hours"], 2)))
    rec.run_hours = Decimal(str(round(run_h, 2)))
    rec.ideal_rate_tph = Decimal(str(round(calc["ideal_mt"] / run_h, 3))) if run_h else None
    rec.created_by_id = report.confirmed_by_id
    db.flush()


def is_locked(report: OpDailyReport) -> bool:
    return report.status == OpReportStatus.CONFIRMED
