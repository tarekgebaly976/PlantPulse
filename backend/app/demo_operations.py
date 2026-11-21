"""Production module trial on the public demo: a second sample plant "DPM – Demo Paper Mill (operations, sample)" in
the DEMO organization, set up from the "paper_mill" template: paper machine PM1 (report profile paper_machine) with its
grades and ideal rates, disciplines, sections, defects and about 30 days of daily production reports (runs, reels,
stops, sheet breaks, quality losses); and sheeting & packing line SH1 (generic profile, discrete, counted in packs)
with products and output lines — the same engine (KPIs, loss categories, alerts, insights, actions) runs both.
All names and figures are invented.

cli: python -m app.cli demo-operations   (after seed-demo; scripts/demo.sh runs it, so the nightly reset rebuilds it)"""

import random
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.assets import Asset, DowntimeEvent
from app.models.enums import AssetLevel, Criticality, DepartmentType, OpEventType, OpLossKind, OpReportStatus
from app.models.identity import Membership, Role, User
from app.models.operations import (
    OpDailyReport,
    OpDefect,
    OpDiscipline,
    OpGrade,
    OpMachine,
    OpQualityLoss,
    OpReel,
    OpRunSegment,
    OpSection,
    OpStopPart,
)
from app.models.production import OpAction, OpIncident, OpOutput, OpPlantConfig, OpProduct, OpWorkHours
from app.models.tenancy import Department, Organization, Plant
from app.services.assets import compute_path, new_qr_token
from app.services.common import utcnow
from app.services.production import alerts as alert_svc
from app.services.production import reports as svc
from app.services.production import templates
from app.services.production.stops import categories, classify
from app.services.workflow import ensure_default_transitions

PLANT_CODE = "DPM"
DAYS = 30

# GSM, target speed (m/min): invented sample rate table (ideal MT/min = GSM × speed × width), 3.20 m trim width
GRADES = [(200, 480), (250, 470), (280, 460), (300, 450), (330, 430), (350, 420), (380, 395), (400, 370), (450, 330)]
WIDTH_M = 3.2
DISCIPLINES = [  # code, name, maintenance (breakdown = equipment failure); invented sample list
    ("SUPPLY", "Supply / planning (no orders, raw material)", False),
    ("PROC", "Process (paper machine operation)", False),
    ("INST", "Instrumentation & automation", True),
    ("MECH", "Mechanical maintenance", True),
    ("ELEC", "Electrical maintenance", True),
    ("STEAM", "Steam & power supply", False),
    ("PREP", "Stock preparation", False),
    ("UTIL", "Utilities", False),
    ("OTHER", "Other", False),
]
SECTIONS = [  # name, asset code
    ("Headbox & wire section", "PM1-WIRE"),
    ("Press section", "PM1-PRESS"),
    ("Dryer section", "PM1-DRY"),
    ("Pre coater", "PM1-PC"),
    ("Curtain coater", "PM1-CC"),
    ("Top coater", "PM1-TC"),
    ("Back coater", "PM1-BC"),
    ("Calender section", "PM1-CAL"),
    ("Reel", "PM1-REEL"),
]
DEFECTS = [
    ("Rough surface", "R/P"),
    ("Machine start-up", "R/P"),
    ("Coating streaks", "F/H"),
    ("Holes / spots", "R/P"),
    ("Moisture out of range", "F/H"),
    ("Curl", "F/H"),
    ("Wrinkles", "R/P"),
    ("Edge crack", "R/P"),
]
BREAKDOWNS = [  # section, disciplines, text
    ("Calender section", ["MECH"], "Calender hydraulic unit: pressure low, pump coupling replaced"),
    ("Calender section", ["MECH", "INST"], "Calender nip not closing: valve block, then position sensor reset"),
    ("Dryer section", ["MECH"], "Dryer felt guide roll bearing hot, replaced"),
    ("Press section", ["ELEC"], "Press drive trip (overcurrent)"),
    ("Top coater", ["MECH"], "Top coater blade holder leak"),
    ("Curtain coater", ["INST"], "Curtain coater flow meter fault"),
    ("Reel", ["ELEC", "INST"], "Reel drive fault, then speed control retuned"),
    ("Headbox & wire section", ["PROC"], "Headbox consistency unstable (process)"),
    ("Dryer section", ["STEAM"], "Low steam pressure from boiler"),
    ("Headbox & wire section", ["PREP"], "No stock from stock preparation (pulper screen blocked)"),
]
BREAKS = [  # section, discipline
    ("Press section", "PROC"),
    ("Dryer section", "PROC"),
    ("Top coater", "PROC"),
    ("Reel", "PROC"),
    ("Calender section", "PROC"),
    ("Headbox & wire section", "PREP"),
    ("Dryer section", "INST"),
]
SUPERVISORS = {"D": ["A. Rahman", "J. Santos"], "N": ["M. Karim", "R. Dela Cruz"]}
MEMBERS = {  # existing demo account (local part) -> role in the operations plant
    "manager": "maintenance_manager",
    "planner": "planner",
    "mech.sup": "mech_supervisor",
    "elec.sup": "elec_supervisor",
    "reliability": "reliability_engineer",
    "engineer": "engineer",
    "tech1": "technician",
    "tech2": "technician",
    "tech3": "technician",
    "production": "production_user",
    "viewer": "management_viewer",
}
NEW_USERS = [  # email, name, role
    ("prod.sup@demo.example.com", "PM1 Shift Supervisor (sample)", "production_supervisor"),
    ("prod.mgr@demo.example.com", "Production Manager (sample)", "production_manager"),
]


def _ideal(gsm: int, speed: int) -> float:
    return round(gsm * speed * WIDTH_M / 1_000_000, 5)


def _setup(db: Session, org: Organization, password: str) -> tuple[Plant, OpMachine, dict]:
    plant = Plant(
        organization_id=org.id,
        code=PLANT_CODE,
        name="Demo Paper Mill – Operations (sample data)",
        timezone="Asia/Riyadh",
        currency="SAR",
        settings={"demo": True, "profile": "operations"},
    )
    db.add(plant)
    db.flush()
    ensure_default_transitions(db, plant.id)
    depts = {}
    for code, name, ar, t in (
        ("PM", "Paper Machine", "آلة الورق", DepartmentType.PM),
        ("SP", "Stock Preparation", "تحضير العجينة", DepartmentType.SP),
        ("FH", "Finishing House", "التشطيب", DepartmentType.FH),
        ("UTIL", "Utilities", "المرافق", DepartmentType.UTIL),
    ):
        d = Department(plant_id=plant.id, code=code, name=name, name_ar=ar, type=t)
        db.add(d)
        depts[code] = d
    db.flush()
    assets: dict[str, Asset] = {}
    for code, name, parent in [
        ("PM1", "Paper Machine 1 (board machine)", None),
        ("PM1-WIRE", "Headbox & wire section", "PM1"),
        ("PM1-PRESS", "Press section", "PM1"),
        ("PM1-DRY", "Dryer section", "PM1"),
        ("PM1-PC", "Pre coater", "PM1"),
        ("PM1-CC", "Curtain coater", "PM1"),
        ("PM1-TC", "Top coater", "PM1"),
        ("PM1-BC", "Back coater", "PM1"),
        ("PM1-CAL", "Calender", "PM1"),
        ("PM1-REEL", "Reel (pope reeler)", "PM1"),
    ]:
        p = assets.get(parent) if parent else None
        a = Asset(
            plant_id=plant.id,
            department_id=depts["PM"].id,
            parent_id=p.id if p else None,
            level=AssetLevel.PRODUCTION_LINE if p is None else AssetLevel.UNIT,
            code=code,
            name=name,
            criticality=Criticality.A,
            qr_token=new_qr_token(),
            install_date=date(2016, 3, 1),
            location="PM hall",
        )
        db.add(a)
        db.flush()
        a.path = compute_path(p, a.id)
        assets[code] = a
    m = OpMachine(
        plant_id=plant.id,
        code="PM1",
        name="Paper Machine 1",
        department_id=depts["PM"].id,
        asset_id=assets["PM1"].id,
        report_profile="paper_machine",
        production_model="continuous",
        output_unit="t",
        trim_width_m=Decimal(str(WIDTH_M)),
        day_start=time(7, 0),
        shifts=[{"code": "D", "name": "Day shift", "start": "07:00"}, {"code": "N", "name": "Night shift", "start": "19:00"}],
    )
    db.add(m)
    db.flush()
    ref: dict = {"grades": {}, "disc": {}, "sec": {}, "defects": {}, "assets": assets, "depts": depts, "machine_id": m.id}
    for gsm, speed in GRADES:
        g = OpGrade(
            plant_id=plant.id, machine_id=m.id, code=str(gsm), name=f"Coated board {gsm} gsm", gsm=gsm,
            target_speed_mpm=Decimal(speed), ideal_mt_min=Decimal(str(_ideal(gsm, speed))),
        )  # fmt: skip
        db.add(g)
        ref["grades"][gsm] = g
    for i, (code, name, maint) in enumerate(DISCIPLINES):
        disc = OpDiscipline(plant_id=plant.id, code=code, name=name, maintenance=maint, sort=i)
        db.add(disc)
        ref["disc"][code] = disc
    for i, (name, acode) in enumerate(SECTIONS):
        s = OpSection(plant_id=plant.id, machine_id=m.id, name=name, asset_id=assets[acode].id, sort=i)
        db.add(s)
        ref["sec"][name] = s
    for name, disp in DEFECTS:
        x = OpDefect(plant_id=plant.id, name=name, disposition=disp)
        db.add(x)
        ref["defects"][name] = x
    db.flush()
    roles = {r.code: r for r in db.execute(select(Role)).scalars()}
    users = {u.email.split("@")[0]: u for u in db.execute(select(User).where(User.organization_id == org.id)).scalars()}
    for local, role in MEMBERS.items():
        u = users.get(local)
        if u is not None and role in roles:
            db.add(Membership(user_id=u.id, plant_id=plant.id, role_id=roles[role].id))
    pw = hash_password(password)
    for email, name, role in NEW_USERS:
        u = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if u is None:
            u = User(organization_id=org.id, email=email, full_name=name, password_hash=pw, password_changed_at=utcnow())
            db.add(u)
            db.flush()
        users[email.split("@")[0]] = u
        db.add(Membership(user_id=u.id, plant_id=plant.id, role_id=roles[role].id))
    db.flush()
    ref["users"] = users
    templates.apply(db, plant.id, "paper_mill")
    cfg = db.get(OpPlantConfig, plant.id)
    assert cfg is not None
    cfg.industry, cfg.setup_done = "Pulp & paper (sample)", True
    ref["cats"] = {c.code: c for c in categories(db, plant.id).values()}
    return plant, m, ref


def _category(ref: dict, kind: str, parts: list[str], text: str):
    c = ref["cats"]
    if kind == OpEventType.SHEET_BREAK:
        return c["SHEETBREAK"]
    if kind == OpEventType.PLANNED:
        return c["WASHUP"] if "wash" in text.lower() else c["PLANNED"]
    if parts and parts[0] in ("MECH", "ELEC", "INST"):
        return c["EQUIP"]
    if parts and parts[0] in ("SUPPLY", "PREP"):
        return c["MATERIAL"]
    if parts and parts[0] in ("STEAM", "UTIL"):
        return c["UTILITY"]
    return c["PROCESS"]


def _day(
    db: Session, rnd: random.Random, plant: Plant, m: OpMachine, ref: dict, d: date, state: dict, until: datetime | None
) -> OpDailyReport:
    """One production day: stops placed first, the machine runs in the gaps, reels are made from the run time."""
    tz = ZoneInfo(plant.timezone)
    t0 = datetime.combine(d, time(7, 0), tzinfo=tz)
    t1 = t0 + timedelta(days=1)
    end = min(t1, until) if until else t1
    users = ref["users"]
    r = OpDailyReport(
        plant_id=plant.id, machine_id=m.id, report_date=d, created_by_id=users["prod.sup"].id,
        supervisors={"D": rnd.choice(SUPERVISORS["D"]), "N": rnd.choice(SUPERVISORS["N"])},
    )  # fmt: skip
    db.add(r)
    db.flush()
    # ---- stops
    stops: list[tuple[datetime, datetime, str, str, list[tuple[str, float]], str]] = []

    def free(a: datetime, b: datetime) -> bool:
        return a >= t0 and b <= end and all(b <= s0 or a >= s1 for s0, s1, *_ in stops)

    def place(minutes: int, kind: str, section: str, parts: list[str], text: str) -> None:
        for _ in range(20):
            a = t0 + timedelta(minutes=rnd.randrange(30, 24 * 60 - minutes - 30, 2))
            b = a + timedelta(minutes=minutes)
            if free(a - timedelta(minutes=20), b + timedelta(minutes=20)):
                h = minutes / 60
                if len(parts) == 2:
                    first = round(h * rnd.uniform(0.35, 0.65), 2)
                    shares = [(parts[0], first), (parts[1], round(h - first, 4))]
                else:
                    shares = [(p, round(h, 4)) for p in parts]
                stops.append((a, b, kind, section, shares, text))
                return

    if state["wash_in"] <= 0:
        place(
            rnd.choice([180, 240, 300, 360]), OpEventType.PLANNED, "Headbox & wire section", [], "Planned wash-up, wire and felt cleaning"
        )
        state["wash_in"] = rnd.randint(9, 13)
    state["wash_in"] -= 1
    if rnd.random() < 0.25:
        place(rnd.choice([60, 90, 100]), OpEventType.PLANNED, "Back coater", [], "Back coater cleaning (planned)")
    for _ in range(rnd.choices([0, 1, 2, 3], [30, 40, 22, 8])[0]):
        sec, parts, text = rnd.choice(BREAKDOWNS)
        place(rnd.choice([25, 40, 60, 90, 105, 150, 210]), OpEventType.BREAKDOWN, sec, parts, text)
    for _ in range(rnd.choices([0, 1, 2, 3, 4], [25, 30, 25, 12, 8])[0]):
        sec, disc = rnd.choice(BREAKS)
        place(rnd.choice([12, 15, 20, 25, 35, 45]), OpEventType.SHEET_BREAK, sec, [disc], f"Sheet break at {sec.lower()}")
    if rnd.random() < 0.04:
        place(
            rnd.choice([120, 240]), OpEventType.BREAKDOWN, "Headbox & wire section", ["SUPPLY"], "No orders for the grade: machine stopped"
        )
    stops.sort()
    for a, b, kind, section, shares, text in stops:
        discs = [ref["disc"][c] for c, _ in shares]
        cat = _category(ref, kind, [c for c, _ in shares], text)
        failure, planned = classify(kind, discs, cat)
        sec = ref["sec"][section]
        e = DowntimeEvent(
            plant_id=plant.id, asset_id=sec.asset_id or m.asset_id, started_at=a, ended_at=b, is_failure=failure, is_planned=planned,
            loss_category_id=cat.id,
            reason=text, source="operations", event_type=kind, section_id=sec.id, op_report_id=r.id, created_by_id=users["prod.sup"].id,
        )  # fmt: skip
        db.add(e)
        db.flush()
        for c, h in shares:
            db.add(OpStopPart(downtime_event_id=e.id, discipline_id=ref["disc"][c].id, hours=Decimal(str(round(h, 3)))))
    # ---- runs in the gaps; the grade changes every 1–4 days, at the first gap after 10:00
    gaps, cur = [], t0
    for a, b, *_ in stops:
        if a > cur:
            gaps.append((cur, a))
        cur = max(cur, b)
    if cur < end:
        gaps.append((cur, end))
    change_at = None
    state["grade_days"] -= 1
    if state["grade_days"] <= 0:
        change_at = t0 + timedelta(hours=rnd.randint(3, 15))
        state["grade_days"] = rnd.randint(1, 4)
    segs: list[tuple[datetime, datetime, OpGrade, float]] = []
    for a, b in gaps:
        pieces = [(a, b)]
        if change_at and a < change_at < b - timedelta(minutes=30):
            pieces = [(a, change_at), (change_at, b)]
        for i, (pa, pb) in enumerate(pieces):
            if change_at and pa >= change_at and state.get("changed") != d:
                state["changed"] = d
                state["gsm"] = rnd.choice([g for g, _ in GRADES if g >= 250 and g != state["gsm"]])
                reason = "Grade change as per production plan"
                gc_h, gc_rej = round(rnd.uniform(0.25, 0.6), 2), round(rnd.uniform(0.5, 3.0), 1)
            else:
                reason, gc_h, gc_rej = None, None, None
            g = ref["grades"][state["gsm"]]
            speed = float(g.target_speed_mpm) - rnd.choice([0, 10, 20, 30, 40])
            if (pb - pa).total_seconds() < 300:
                continue
            db.add(OpRunSegment(
                report_id=r.id, started_at=pa, ended_at=pb, grade_id=g.id, gsm=g.gsm, speed_mpm=Decimal(str(speed)),
                ideal_mt_min=g.ideal_mt_min, reason=reason if i or not segs else reason,
                grade_change_hours=Decimal(str(gc_h)) if gc_h else None, grade_change_reject_mt=Decimal(str(gc_rej)) if gc_rej else None,
            ))  # fmt: skip
            segs.append((pa, pb, g, speed / float(g.target_speed_mpm or speed)))
    # ---- reels: about 15 t each, made over the run time; shift = when the reel was finished
    noon = t0 + timedelta(hours=12)
    carry = state.get("carry", 0.0)
    rejects: list[tuple[str, float]] = []
    downgrades: list[tuple[str, float]] = []
    for pa, pb, g, speed_ratio in segs:
        made = (pb - pa).total_seconds() / 60 * float(g.ideal_mt_min) * speed_ratio * rnd.uniform(0.86, 0.97)
        pos = pa
        rate = made / max((pb - pa).total_seconds(), 1)
        total = carry + made
        while total >= 15.0:
            need = 15.0 - carry
            pos = pos + timedelta(seconds=need / rate) if rate else pos
            carry = 0.0
            total -= 15.0
            gross = round(rnd.uniform(14.6, 15.6), 3)
            trim = gross * rnd.uniform(0.012, 0.022)
            rej = 0.0
            if rnd.random() < 0.08:
                rej = round(rnd.choice([1.0, 1.5, 2.0, 5.0]), 1)
            net = round(gross - trim - rej, 3)
            bg = net if rnd.random() < 0.03 else 0.0
            shift = "D" if pos < noon else "N"
            state["reel"] += 1
            db.add(OpReel(
                report_id=r.id, shift=shift, reel_no=str(state["reel"]), gsm=g.gsm, gross_mt=Decimal(str(gross)),
                net_mt=Decimal(str(net)), reject_mt=Decimal(str(rej)), b_grade_mt=Decimal(str(bg)),
            ))  # fmt: skip
            if rej:
                rejects.append((shift, rej))
            if bg:
                downgrades.append((shift, bg))
        carry = total
    state["carry"] = carry
    rej_defects = ["Rough surface", "Machine start-up", "Holes / spots", "Wrinkles", "Edge crack"]
    for shift, q in rejects:
        x = ref["defects"][rnd.choice(rej_defects)]
        db.add(
            OpQualityLoss(
                report_id=r.id, kind=OpLossKind.REJECT, shift=shift, defect_id=x.id, qty_mt=Decimal(str(q)), disposition=x.disposition
            )
        )
    for shift, q in downgrades:
        x = ref["defects"][rnd.choice(["Coating streaks", "Moisture out of range", "Curl"])]
        db.add(
            OpQualityLoss(
                report_id=r.id, kind=OpLossKind.DOWNGRADE, shift=shift, defect_id=x.id, qty_mt=Decimal(str(round(q, 3))), disposition="F/H"
            )
        )
    db.flush()
    if until is None:
        r.broke_tower_pct = Decimal(rnd.randint(20, 80))
    return r


def build(db: Session, password: str, now: datetime | None = None) -> str:
    org = db.execute(select(Organization).where(Organization.code == "DEMO")).scalar_one_or_none()
    if org is None:
        return "No DEMO organization: run seed-demo first."
    if db.execute(select(Plant).where(Plant.organization_id == org.id, Plant.code == PLANT_CODE)).scalar_one_or_none():
        return "Operations sample plant already there; nothing to do."
    plant, m, ref = _setup(db, org, password)
    tz = ZoneInfo(plant.timezone)
    now = (now or utcnow()).astimezone(tz)
    current = (now - timedelta(hours=7)).date()  # production day in progress (starts 07:00)
    rnd = random.Random(20261105)
    state = {"gsm": 350, "grade_days": 2, "wash_in": 4, "reel": 100, "carry": 0.0}
    users = ref["users"]
    n = 0
    for i in range(DAYS, -1, -1):
        d = current - timedelta(days=i)
        if d.day == 1:
            state["reel"] = 100  # reel numbers start again each month
        until = now if i == 0 else None
        r = _day(db, rnd, plant, m, ref, d, state, until)
        n += 1
        if i == 0:
            continue  # today: still being written (draft)
        r.status = OpReportStatus.SUBMITTED
        r.submitted_by_id, r.submitted_at = users["prod.sup"].id, datetime.combine(d + timedelta(days=1), time(7, 30), tzinfo=tz)
        if i >= 2:  # yesterday waits for the manager's confirmation
            r.status = OpReportStatus.CONFIRMED
            r.confirmed_by_id, r.confirmed_at = users["prod.mgr"].id, datetime.combine(d + timedelta(days=1), time(10, 0), tzinfo=tz)
            db.flush()
            svc.write_production_record(db, r, plant, svc.compute(db, r, plant))
    db.flush()
    from app.demo_oplogs import build_logs

    logs = build_logs(db, plant, ref, current, now)
    k = _converting_line(db, plant, ref, current, now)
    _incidents(db, plant, ref, current)
    _work_hours(db, plant, ref, current)
    _actions(db, plant, ref, current)
    _cutting(db, plant, m, ref, current)
    db.flush()
    alert_svc.evaluate(db, plant)
    return (f"{PLANT_CODE}: operations sample plant with paper machine PM1, {n} daily reports, {logs} utility / stock preparation logs "
            f"and sheeting line SH1 ({k} reports)")  # fmt: skip


# ---------------------------------------------------------------- the winder's cutting plan (invented orders)
CUT_ORDERS = [  # customer, order ref, width mm, reels, tolerance %, due in days
    ("Al Noor Printing (sample)", "SO-1041", 700, 40, 5, 9),
    ("Gulf Packaging (sample)", "SO-1043", 850, 25, 5, 11),
    ("Delta Boxes (sample)", "SO-1047", 1000, 30, 10, None),
    ("Red Sea Cartons (sample)", "SO-1050", 620, 18, 5, None),
    ("Nile Print (sample)", "SO-1052", 1250, 12, 0, 8),
    ("Al Noor Printing (sample)", "SO-1055", 780, 22, 5, None),
]
CUT_SHEETS = [  # customer, order ref, sheet width × length mm, sheets, tolerance %, due in days
    ("Cairo Print House (sample)", "SO-1060", 700, 1000, 120000, 5, 10),
    ("Gulf Packaging (sample)", "SO-1062", 650, 900, 80000, 5, 12),
]
CUT_UNITS = [  # code, name, kind, widths, sheet lengths, speed m/min
    ("SH1", "Sheeter 1 (sample)", "sheeter", (500, 1700), (400, 1600), 250),
    ("SH2", "Sheeter 2 (sample)", "sheeter", (500, 1700), (400, 1600), 250),
    ("SH3", "Sheeter 3 (sample)", "sheeter", (450, 1400), (350, 1200), 200),
    ("SH4", "Sheeter 4 (sample)", "sheeter", (600, 1900), (500, 1600), 300),
    ("RW1", "Rewinder 1 (sample)", "rewinder", (600, 2600), (None, None), 800),
]


def _cutting(db: Session, plant: Plant, m: OpMachine, ref: dict, current: date) -> None:
    """The winder of PM1, four sheeters and a rewinder after it, and next week's cutting plan for grade 350 (reels and
    sheets), calculated (not released)."""
    from app.models.cutting import CutConverter, CutOrder, CutPlan, CutWinder
    from app.services import cutting as cut_svc

    deckle = int(round(WIDTH_M * 1000))
    w = CutWinder(plant_id=plant.id, machine_id=m.id, deckle_mm=deckle, max_reels=6, min_trim_mm=20, max_trim_mm=250, min_width_mm=300,
                  change_cost_sets=Decimal("0.5"), set_length_m=6000)  # fmt: skip
    db.add(w)
    sh1 = db.execute(select(OpMachine).where(OpMachine.plant_id == plant.id, OpMachine.code == "SH1")).scalar_one_or_none()
    units = []
    for i, (code, name, kind, (w0, w1), (l0, l1), speed) in enumerate(CUT_UNITS):
        u = CutConverter(plant_id=plant.id, machine_id=m.id, line_id=sh1.id if sh1 and code == "SH1" else None, code=code, name=name, kind=kind,
                         min_width_mm=w0, max_width_mm=w1, min_length_mm=l0, max_length_mm=l1, side_trim_mm=10, speed_mpm=Decimal(speed),
                         change_minutes=Decimal(30 if kind == "sheeter" else 20), stands=1, is_active=True, sort=i)  # fmt: skip
        db.add(u)
        units.append(u)
    g = ref["grades"].get(350)
    p = CutPlan(plant_id=plant.id, machine_id=m.id, grade_id=g.id if g else None, title="Next week – grade 350 (sample)", status="draft", result={},
                created_by_id=ref["users"]["prod.mgr"].id)  # fmt: skip
    for i, (cust, so, width, reels, tol, due) in enumerate(CUT_ORDERS):
        p.orders.append(CutOrder(customer=cust, ref=so, width_mm=width, reels=reels, tolerance_pct=Decimal(tol), sort=i,
                                 due_date=current + timedelta(days=due) if due else None))  # fmt: skip
    n = len(CUT_ORDERS)
    for i, (cust, so, width, length, sheets, tol, due) in enumerate(CUT_SHEETS):
        p.orders.append(CutOrder(customer=cust, ref=so, kind="sheet", width_mm=width, sheet_length_mm=length, reels=sheets, tolerance_pct=Decimal(tol),
                                 sort=n + i, due_date=current + timedelta(days=due)))  # fmt: skip
    p.orders.append(
        CutOrder(customer="Nile Print (sample)", ref="SO-1066", width_mm=250, reels=24, tolerance_pct=Decimal(10), sort=n + len(CUT_SHEETS))
    )
    db.add(p)
    db.flush()
    lim = cut_svc.Limits(deckle=deckle, max_reels=6, min_trim=20, max_trim=250, min_width=300, change_cost_sets=0.5, set_length_m=6000)
    conv = [cut_svc.Converter(str(u.id), u.code, u.kind, u.min_width_mm, u.max_width_mm, u.min_length_mm, u.max_length_mm, u.side_trim_mm,
                              float(u.speed_mpm or 0) or None, float(u.change_minutes), u.stands) for u in units]  # fmt: skip
    p.result = cut_svc.solve([cut_svc.Line(str(o.id), o.width_mm, o.reels, float(o.tolerance_pct), o.due_date, o.kind, o.sheet_length_mm)
                              for o in p.orders], lim, units=conv)  # fmt: skip
    p.status = "calculated" if p.result.get("status") in ("optimal", "feasible") else "draft"
    p.calculated_at = utcnow()


# ---------------------------------------------------------------- a generic discrete line (invented)
SH_PRODUCTS = [  # code, name, ideal packs per hour
    ("PK-70100", "Board sheets 70 × 100 cm, pack of 100 (sample)", 120),
    ("PK-65090", "Board sheets 65 × 90 cm, pack of 100 (sample)", 140),
    ("PK-50070", "Board sheets 50 × 70 cm, pack of 200 (sample)", 180),
]
SH_STOPS = [  # category, minutes, disciplines, text
    ("CHANGEOVER", [30, 45, 60], [], "Size change"),
    ("MATERIAL", [40, 60, 90], ["SUPPLY"], "Waiting for reels from PM1"),
    ("EQUIP", [25, 40, 75], ["MECH"], "Sheeter knife drum vibration"),
    ("EQUIP", [20, 35], ["ELEC"], "Stacker drive fault"),
    ("OPERATOR", [15, 20, 30], [], "Crew change-over / break overrun"),
    ("PLANNED", [60, 90], [], "Planned cleaning and knife change"),
]


def _converting_line(db: Session, plant: Plant, ref: dict, current: date, now: datetime) -> int:
    tz = ZoneInfo(plant.timezone)
    rnd = random.Random(20261118)
    dept = ref["depts"]["FH"]
    a = Asset(plant_id=plant.id, department_id=dept.id, level=AssetLevel.PRODUCTION_LINE, code="SH1", name="Sheeter & packing line 1",
              criticality=Criticality.B, qr_token=new_qr_token(), install_date=date(2018, 6, 1), location="Finishing house")  # fmt: skip
    db.add(a)
    db.flush()
    a.path = compute_path(None, a.id)
    m = OpMachine(plant_id=plant.id, code="SH1", name="Sheeter & packing line 1", department_id=dept.id, asset_id=a.id, report_profile="generic",
                  production_model="discrete", output_unit="packs", day_start=time(7, 0),
                  shifts=[{"code": "D", "name": "Day shift", "start": "07:00"}, {"code": "N", "name": "Night shift", "start": "19:00"}])  # fmt: skip
    db.add(m)
    db.flush()
    prods = []
    for code, name, rate in SH_PRODUCTS:
        p = OpProduct(plant_id=plant.id, code=code, name=name, category="Sheets", machine_id=m.id, unit="packs", ideal_rate_per_h=Decimal(rate),
                      attributes={"size": name.split(",")[0].replace("Board sheets ", "")})  # fmt: skip
        db.add(p)
        prods.append(p)
    db.flush()
    users, cats, disc = ref["users"], ref["cats"], ref["disc"]
    order = 260400
    n = 0
    for i in range(DAYS, -1, -1):
        d = current - timedelta(days=i)
        t0 = datetime.combine(d, time(7, 0), tzinfo=tz)
        until = now if i == 0 else t0 + timedelta(days=1)
        r = OpDailyReport(plant_id=plant.id, machine_id=m.id, report_date=d, created_by_id=users["prod.sup"].id, supervisors={})
        db.add(r)
        db.flush()
        worse = 1.0 + (0.6 if i <= 6 else 0.0)  # the last week loses more time (so the insights have something to say)
        stops: list[tuple[datetime, datetime]] = []
        for _ in range(rnd.choices([0, 1, 2, 3], [20, 40, 28, 12])[0] + (1 if i <= 6 and rnd.random() < 0.6 else 0)):
            code, mins, parts, text = rnd.choice(SH_STOPS)
            dur = int(rnd.choice(mins) * (worse if code == "EQUIP" else 1.0))
            st = t0 + timedelta(minutes=rnd.randrange(30, 24 * 60 - dur - 30, 5))
            en = st + timedelta(minutes=dur)
            if en > until or any(not (en <= x0 or st >= x1) for x0, x1 in stops):
                continue
            stops.append((st, en))
            cat = cats[code]
            ds = [disc[c] for c in parts]
            failure, planned = classify(cat.event_type, ds, cat)
            e = DowntimeEvent(plant_id=plant.id, asset_id=a.id, started_at=st, ended_at=en, is_failure=failure, is_planned=planned, reason=text,
                              source="operations", event_type=cat.event_type, loss_category_id=cat.id, op_report_id=r.id, created_by_id=users["prod.sup"].id)  # fmt: skip
            db.add(e)
            db.flush()
            for dd in ds:
                db.add(OpStopPart(downtime_event_id=e.id, discipline_id=dd.id, hours=Decimal(str(round(dur / 60, 3)))))
        for sh, s0 in (("D", t0), ("N", t0 + timedelta(hours=12))):
            s1 = min(s0 + timedelta(hours=12), until)
            if s1 <= s0:
                continue
            lost = sum(max(0.0, (min(b, s1) - max(x, s0)).total_seconds() / 3600) for x, b in stops)
            run_h = round(max(0.0, (s1 - s0).total_seconds() / 3600 - lost), 2)
            p = rnd.choice(prods)
            rate = float(p.ideal_rate_per_h or 0)
            produced = round(run_h * rate * rnd.uniform(0.8, 0.93))
            reject = round(produced * rnd.uniform(0.004, 0.02) * (1.8 if i <= 6 else 1.0))
            order += 1
            db.add(OpOutput(report_id=r.id, shift=sh, product_id=p.id, order_ref=f"SO-{order}", run_hours=Decimal(str(run_h)),
                            planned_qty=Decimal(round(12 * rate * 0.9)), produced_qty=Decimal(produced), reject_qty=Decimal(reject),
                            downgrade_qty=Decimal(0), ideal_rate_per_h=p.ideal_rate_per_h, completed=s1 - s0 >= timedelta(hours=12)))  # fmt: skip
        db.flush()
        n += 1
        if i == 0:
            continue
        r.status = OpReportStatus.SUBMITTED
        r.submitted_by_id, r.submitted_at = users["prod.sup"].id, datetime.combine(d + timedelta(days=1), time(7, 40), tzinfo=tz)
        if i >= 2:
            r.status = OpReportStatus.CONFIRMED
            r.confirmed_by_id, r.confirmed_at = users["prod.mgr"].id, datetime.combine(d + timedelta(days=1), time(10, 15), tzinfo=tz)
            db.flush()
            svc.write_production_record(db, r, plant, svc.compute(db, r, plant, to_date=False))
    return n


def _actions(db: Session, plant: Plant, ref: dict, current: date) -> None:
    users = ref["users"]
    sh1 = db.execute(select(OpMachine).where(OpMachine.plant_id == plant.id, OpMachine.code == "SH1")).scalar_one()
    for title, status, due, owner, line in (
        ("Check sheeter knife drum balance and bearings (sample)", "open", current - timedelta(days=2), "mech.sup", sh1.id),
        ("Agree reel buffer between PM1 and SH1 with planning (sample)", "in_progress", current + timedelta(days=5), "prod.mgr", sh1.id),
        ("Review calender section break causes with process team (sample)", "done", current - timedelta(days=6), "prod.mgr", None),
    ):
        u = users.get(owner)
        db.add(OpAction(plant_id=plant.id, title=title, status=status, due_date=due, owner_id=u.id if u else None, source="manual", machine_id=line,
                        created_by_id=users["prod.mgr"].id))  # fmt: skip


def run_for_demo(password: str) -> str:
    from app.core.db import SessionLocal

    with SessionLocal() as db, db.begin():
        return build(db, password)


# ---------------------------------------------------------------- safety incident register (invented)
SAMPLE_INCIDENTS = [  # days ago, hour, dept, line, kind, severity, title, status, injured, lost days
    (26, 10, "PM", "PM1", "near_miss", "low", "Steam hose came loose near the dryer section walkway (sample)", "closed", 0, None),
    (19, 22, "SP", None, "first_aid", "medium", "Hand cut while cutting bale wire at the pulper (sample)", "closed", 1, None),
    (12, 15, "FH", "SH1", "property", "medium", "Forklift touched a pallet rack in the finishing house (sample)", "closed", 0, None),
    (8, 3, "PM", "PM1", "lost_time", "high", "Slip on a wet floor during a felt change, ankle sprain (sample)", "investigating", 1, 3),
    (4, 14, "UTIL", None, "environment", "medium", "Small oil spill at the compressor house, contained (sample)", "closed", 0, None),
    (1, 20, "SP", None, "near_miss", "low", "Guard missing on a conveyor after maintenance (sample)", "open", 0, None),
]


def _incidents(db: Session, plant: Plant, ref: dict, current: date) -> None:
    from app.services.common import next_number

    tz = ZoneInfo(plant.timezone)
    users = ref["users"]
    lines = {m.code: m for m in db.execute(select(OpMachine).where(OpMachine.plant_id == plant.id)).scalars()}
    for ago, hour, dept, line, kind, sev, title, status, injured, lost in SAMPLE_INCIDENTS:
        d = current - timedelta(days=ago)
        at = datetime.combine(d if hour >= 7 else d + timedelta(days=1), time(hour, 15), tzinfo=tz)
        i = OpIncident(plant_id=plant.id, number=next_number(db, plant, "INC"), occurred_at=at, department_id=ref["depts"][dept].id,
                       machine_id=lines[line].id if line else None, shift="D" if 7 <= hour < 19 else "N", kind=kind, severity=sev, title=title,
                       description="Invented sample incident for the demo.", injured=injured, lost_days=lost, status=status,
                       immediate_action="Area made safe, supervisor informed.", reported_by_id=users["prod.sup"].id,
                       closed_by_id=users["prod.mgr"].id if status == "closed" else None,
                       closed_at=at + timedelta(days=2) if status == "closed" else None)  # fmt: skip
        db.add(i)
        db.flush()
        if kind == "lost_time":
            db.add(OpAction(plant_id=plant.id, title="Anti-slip mats and drainage check at the felt-change area (sample)", status="open",
                            due_date=current + timedelta(days=4), owner_id=users["prod.mgr"].id, source="incident", incident_id=i.id,
                            machine_id=i.machine_id, created_by_id=users["prod.mgr"].id))  # fmt: skip


SAMPLE_HOURS = {
    "PM": (13800, 1900),
    "SP": (6200, 600),
    "FH": (5100, 900),
    "UTIL": (3000, 400),
}  # employees, contractors per month (invented)


def _work_hours(db: Session, plant: Plant, ref: dict, current: date) -> None:
    """Hours worked of the last three months per area (the month in progress up to today), for the safety rates."""
    rnd = random.Random(20261119)
    m = current.replace(day=1)
    for i in range(3):
        nxt = date(m.year + (m.month == 12), m.month % 12 + 1, 1)
        share = 1.0 if i else current.day / (nxt - m).days
        for dept, (emp, con) in SAMPLE_HOURS.items():
            db.add(OpWorkHours(plant_id=plant.id, month=m, department_id=ref["depts"][dept].id,
                               employee_hours=Decimal(round(emp * share * rnd.uniform(0.95, 1.05))),
                               contractor_hours=Decimal(round(con * share * rnd.uniform(0.8, 1.2)))))  # fmt: skip
        m = (m - timedelta(days=1)).replace(day=1)
