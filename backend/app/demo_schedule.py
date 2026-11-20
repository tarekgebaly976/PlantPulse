"""Demo data for the skill matrix and the weekly maintenance schedule: the plant's skills and the technicians' levels and
certificates, a roster for this week and the next (Friday and Saturday included: the plant runs every day), a line stop
window, and approved work for next week ready for the planner to press "Propose schedule". The week itself is left
unproposed so visitors see the whole flow (propose → engineer → manager)."""

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assets import Asset
from app.models.enums import AssetLevel, Priority, RosterKind, WOStatus, WOType
from app.models.identity import User
from app.models.shifts import RosterEntry, ShiftDefinition
from app.models.skills import SkillDefinition, TechnicianSkill, WORequiredSkill
from app.models.tenancy import Plant
from app.models.weekly import StopWindow
from app.services.common import plant_today
from app.services.weekly import week_of
from app.services.workorders import create_work_order

SKILLS = [  # code, name, Arabic name, trade, category, needs a certificate
    ("HYD", "Hydraulics", "الهيدروليك", "mechanical", "technique", False),
    ("ALN", "Laser shaft alignment", "محاذاة الأعمدة بالليزر", "mechanical", "technique", False),
    ("WLD", "Welding", "اللحام", "mechanical", "technique", False),
    ("PLC", "PLC & drives", "الـ PLC والمحركات", "electrical", "equipment", False),
    ("HV", "Medium-voltage switching", "فصل الجهد المتوسط", "electrical", "safety", True),
    ("CS", "Confined space entry", "دخول الأماكن المغلقة", None, "safety", True),
]
# user key → [(skill, level, certificate valid for N days from today; negative = expired, None = no certificate)]
LEVELS: dict[str, list[tuple[str, int, int | None]]] = {
    "tech1": [("HYD", 3, None), ("ALN", 2, None), ("CS", 2, 200)],
    "tech2": [("HYD", 1, None), ("ALN", 3, None), ("WLD", 2, None), ("CS", 2, 12)],
    "tech3": [("PLC", 3, None), ("HV", 2, -5)],
    "tech.sp": [("WLD", 3, None), ("HYD", 2, None)],
    "mech.sup": [("HYD", 3, None), ("ALN", 3, None)],
    "elec.sup": [("PLC", 2, None), ("HV", 3, 300)],
}
# user key → (days of the week at work 0 = Sunday … 6 = Saturday, overtime days, leave days)
ROSTER: dict[str, tuple[set[int], set[int], set[int]]] = {
    "tech1": ({0, 1, 2, 3, 4}, {6}, set()),
    "tech2": ({0, 1, 2, 3, 5, 6}, set(), {4}),
    "tech3": ({0, 1, 2, 3, 4, 5}, set(), set()),
    "tech.sp": ({0, 1, 2, 3, 4}, set(), set()),
    "mech.sup": ({0, 1, 2, 3, 4}, set(), set()),
    "elec.sup": ({0, 1, 2, 3, 4}, set(), set()),
    "engineer": ({0, 1, 2, 3, 4, 6}, set(), set()),
}
# title, priority, labour hours (None = not estimated), due (day of next week), required skills, LOTO, permit, line stop
JOBS = [
    ("Hydraulic unit hose change", Priority.P2_HIGH, 6, 2, [("HYD", 2)], True, False, True),
    ("Gearbox oil leak repair", Priority.P2_HIGH, 4, 1, [("HYD", 2)], False, False, False),
    ("Conveyor drive shaft alignment", Priority.P3_MEDIUM, 5, 3, [("ALN", 2)], False, False, False),
    ("Drive fault log review", Priority.P3_MEDIUM, 2, 4, [("PLC", 2)], False, False, False),
    ("Medium-voltage breaker test", Priority.P2_HIGH, 4, 2, [("HV", 2)], True, True, False),
    ("Motor coupling check", Priority.P4_LOW, 2, None, [], False, False, False),
    ("Tank inspection (confined space)", Priority.P3_MEDIUM, 3, 5, [("CS", 2)], True, True, False),
    ("Bearing noise check", Priority.P3_MEDIUM, 2, 3, [], False, False, False),
    ("Main line roll change", Priority.P2_HIGH, 8, 2, [("HYD", 2)], True, False, True),
    ("Pump overhaul", Priority.P4_LOW, 30, None, [], False, False, False),
    ("Safety guard inspection", Priority.P4_LOW, None, None, [], False, False, False),
]


def add_demo_schedule(db: Session, plant: Plant, users: dict[str, User]) -> dict[str, int]:
    today = plant_today(plant)
    tz = ZoneInfo(plant.timezone)
    skills: dict[str, SkillDefinition] = {}
    for code, name, ar, trade, cat, cert in SKILLS:
        s = SkillDefinition(plant_id=plant.id, code=code, name=name, name_ar=ar, trade=trade, category=cat, needs_certificate=cert)
        db.add(s)
        skills[code] = s
    db.flush()
    for key, levels in LEVELS.items():
        if key not in users:
            continue
        for code, level, days in levels:
            until: date | None = today + timedelta(days=days) if days is not None else None
            db.add(TechnicianSkill(plant_id=plant.id, user_id=users[key].id, skill_id=skills[code].id, level=level, certified_until=until))
    shift = db.execute(
        select(ShiftDefinition).where(ShiftDefinition.plant_id == plant.id, ShiftDefinition.code == "G")
    ).scalar_one_or_none()
    this_week = week_of(today)
    entries = 0
    for key, (work, overtime, leave) in ROSTER.items():
        if key not in users:
            continue
        for d in (this_week + timedelta(days=i) for i in range(14)):
            dow = (d - this_week).days % 7
            kind = (
                RosterKind.WORK if dow in work else RosterKind.OVERTIME if dow in overtime else RosterKind.LEAVE if dow in leave else None
            )
            if kind is None:
                continue
            db.add(RosterEntry(plant_id=plant.id, user_id=users[key].id, work_date=d, kind=kind, hours=Decimal(0 if kind == RosterKind.LEAVE else 8),
                               shift_id=None if kind == RosterKind.LEAVE or shift is None else shift.id, note="demo"))  # fmt: skip
            entries += 1
    db.flush()
    lines = list(
        db.execute(
            select(Asset)
            .where(Asset.plant_id == plant.id, Asset.level == AssetLevel.PRODUCTION_LINE, Asset.is_active.is_(True))
            .order_by(Asset.code)
        ).scalars()
    )
    if not lines:
        return {"skills": len(skills), "roster": entries, "work_orders": 0}
    main = lines[0]
    units = list(
        db.execute(select(Asset).where(Asset.plant_id == plant.id, Asset.parent_id == main.id).order_by(Asset.code)).scalars()
    ) or [main]
    next_week = this_week + timedelta(days=7)
    # The main line stops on Tuesday next week for 6 hours (e.g. a wash-up): its line-stop work goes there.
    start = datetime.combine(next_week + timedelta(days=2), time(8), tzinfo=tz)
    db.add(
        StopWindow(plant_id=plant.id, asset_id=main.id, starts_at=start, ends_at=start + timedelta(hours=6), note="Planned stop / wash-up")
    )
    by = users.get("planner") or next(iter(users.values()))
    n = 0
    for i, (title, prio, hours, due, need, loto, permit, stop) in enumerate(JOBS):
        asset = units[i % len(units)] if stop else lines[i % len(lines)]
        wo = create_work_order(
            db, plant, asset=asset, type=WOType.CORRECTIVE, title=title, user_id=by.id, priority=prio,
            due_date=next_week + timedelta(days=due) if due is not None else None, status=WOStatus.APPROVED,
            estimated_hours=Decimal(hours) if hours else None, requires_loto=loto, requires_permit=permit, requires_stop=stop,
        )  # fmt: skip
        for code, level in need:
            db.add(WORequiredSkill(work_order_id=wo.id, skill_id=skills[code].id, min_level=level))
        n += 1
    db.flush()
    return {"skills": len(skills), "roster": entries, "work_orders": n}
