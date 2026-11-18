"""Operating periods of a production line (industry-independent): the production day (from the line's day start to
the same time next day, plant time zone), its shifts, and how many of its hours have passed."""

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.models.operations import OpMachine
from app.models.tenancy import Plant

DAY_HOURS = 24.0
DEFAULT_SHIFTS = [{"code": "D", "name": "Day shift", "start": "07:00"}, {"code": "N", "name": "Night shift", "start": "19:00"}]


def f(v: Decimal | float | int | None) -> float:
    return float(v) if v is not None else 0.0


def r3(v: float) -> float:
    return round(v, 3)


def r4(v: float | None) -> float | None:
    return None if v is None else round(v, 4)


def day_window(machine: OpMachine, plant: Plant, d: date) -> tuple[datetime, datetime]:
    """Production day `d` runs from the line's day start on d to the same time on d + 1 (plant time zone)."""
    tz = ZoneInfo(plant.timezone)
    start = datetime.combine(d, machine.day_start or time(7, 0), tzinfo=tz)
    return start, start + timedelta(days=1)


def shift_windows(machine: OpMachine, plant: Plant, d: date) -> list[tuple[str, str, datetime, datetime]]:
    """[(code, name, start, end)] of the line's shifts in production day d (each ends where the next starts)."""
    t0, t1 = day_window(machine, plant, d)
    starts = []
    for s in machine.shifts or DEFAULT_SHIFTS:
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


def overlap_h(a0: datetime, a1: datetime, b0: datetime, b1: datetime) -> float:
    return max(0.0, (min(a1, b1) - max(a0, b0)).total_seconds() / 3600)


def hours(a: datetime, b: datetime | None) -> float:
    return (b - a).total_seconds() / 3600 if b else 0.0


def planned_hours(machine: OpMachine, plant: Plant, d: date, now: datetime | None = None) -> float:
    """Hours of production day d that have passed: 24 for a finished day, the elapsed part for the day in progress
    (so the KPIs of today and of the month to date are fair while the day runs)."""
    t0, t1 = day_window(machine, plant, d)
    now = now or datetime.now(t0.tzinfo)
    if now >= t1:
        return DAY_HOURS
    return max(0.0, min(DAY_HOURS, (now - t0).total_seconds() / 3600))
