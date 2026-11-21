"""Weekly maintenance schedule: propose who does which open work order on which day of a Sunday–Saturday week, with
OR-Tools CP-SAT, then check hand edits and apply the approved week to the work orders.

Rules (hard): a person works only on days the roster has them at work (all seven days can be work days; leave and
absence are off); their hours that day stay within the roster hours plus the overtime allowed; the trade, the required
skills at the required level and a valid certificate on that day must match; a person restricted to departments only
gets work of those departments; LOTO / permit work only on a shift where someone who may sign it off (a supervisor or
the engineer) is at work; the whole crew works on the same day; placements pinned by hand are kept.

Goal (weighted): few deferred jobs, weighted by priority and the equipment's criticality; no PM beyond its compliance
tolerance; little lateness against the due date; urgent work early in the week; little overtime; an even load."""

import math
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from ortools.sat.python import cp_model
from sqlalchemy import or_, select, true
from sqlalchemy.orm import Session

from app.api.deps import Ctx
from app.core.errors import DomainError
from app.models.assets import Asset
from app.models.enums import Priority, RosterKind, WOStatus
from app.models.identity import Membership, MembershipDepartment, User
from app.models.pm import JobPlan, PMOccurrence, PMPlan
from app.models.shifts import RosterEntry, ShiftDefinition
from app.models.skills import SkillDefinition, TechnicianSkill, WORequiredSkill
from app.models.weekly import ScheduleItem, StopWindow, WeeklySchedule
from app.models.workorders import WorkOrder
from app.services import skills as skills_svc
from app.services import workorders as wo_svc
from app.services.common import audit, plant_today, utcnow
from app.services.notifications import notify, users_with_permission

Q = 4  # the solver counts quarter hours
SCHEDULABLE = (WOStatus.APPROVED, WOStatus.PLANNED, WOStatus.SCHEDULED)
PRIORITY_WEIGHT = {Priority.P1_EMERGENCY: 100, Priority.P2_HIGH: 40, Priority.P3_MEDIUM: 15, Priority.P4_LOW: 5}
CRIT_WEIGHT = {"A": 3, "B": 2, "C": 1}
PM_OUT_OF_TOLERANCE = 2000  # a PM done (or deferred) beyond its tolerance drops PM compliance
OVERTIME_PER_QUARTER = 3  # one overtime hour costs 12: less than deferring the lightest job (5 × 1 × 50)
DEFAULT_SHIFT_START = time(7, 0)
SOLVE_SECONDS = 20.0
MAX_DAYS = 31  # longest plan: a week by default, or 10, 14, 20 … days


# --------------------------------------------------------------------------------------------------------------------
# Messages: reasons and warnings go out as a code with parameters (the page translates them) and an English text (for the
# audit log, notifications and the work order history).

TEXT = {
    # one person on one job on one day
    "not_at_work": "{name} is not at work on {date}",
    "trade_mismatch": "{trade} work, {name} is {person_trade}",
    "other_departments": "{name} works in other departments",
    "no_skill": "{name}: no skill {skill}",
    "skill_level": "{name}: level {level} < {min_level} for {skill}",
    "cert_expired": "{name}: certificate {skill} expired {date}",
    "no_cert_date": "{name}: no certificate date for {skill}",
    "no_signer_shift": "no supervisor or engineer on that shift to sign off LOTO / permit",
    "line_running": "the line is not stopped during {name}'s shift on {date}",
    "window_short": "the stop window in the shift is {have} h, the job needs {need} h",
    "not_open": "work order is no longer open for scheduling",
    "not_on_roster": "not on the roster in this period",
    # why a job is deferred
    "no_hours": "no estimated hours",
    "week_over": "the plan period is over",
    "no_roster": "nobody on the roster in this period",
    "too_long": "longer than one shift ({hours} h per person)",
    "no_window": "needs the line stopped: no stop window of its line in this period",
    "windows_too_short": "needs the line stopped: every stop window is shorter than the job ({hours} h per person)",
    "no_trade": "no {trade} technician for this department on the roster",
    "no_technician": "no technician for this department on the roster",
    "certs_expired": "the {skills} certificate of everyone qualified has expired or has no date",
    "no_skills": "nobody at work has the required skills ({skills})",
    "no_signer": "no supervisor or engineer on shift to sign off LOTO / permit",
    "stop_no_qualified": "needs the line stopped: nobody qualified is at work during a long enough stop window",
    "no_crew": "a crew of {crew} is not available on one day",
    "windows_full": "needs the line stopped: the stop windows of its line are already full",
    "no_capacity": "not enough technician hours in this period",
    "no_solution": "no schedule found in time",
    "hand_deferred": "deferred by hand",
    # applying the approved week to the work orders
    "skipped_closed": "no longer open, skipped",
    "no_stop_fit": "does not fit in a stop window of its line on {date}",
    "taken_off": "deferred, taken off the schedule",
    "assign_overlap": "{name} already assigned to overlapping {numbers}",
    "assign_skills": "{name} does not meet the required skills: {skills}",
}


def _param(v: object) -> object:
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, date):
        return v.isoformat()
    return v


def msg(code: str, **params: object) -> dict:
    """{"code", "params", "text"}; a "number" parameter (the work order) leads the English text."""
    ps = {k: _param(v) for k, v in params.items()}
    text = TEXT[code].format(**{k: (f"{v:g}" if isinstance(v, float) else v) for k, v in ps.items()})
    if "number" in ps:
        text = f"{ps['number']}: {text}"
    return {"code": code, "params": ps, "text": text}


def week_of(d: date) -> date:
    """The Sunday that starts d's week."""
    return d - timedelta(days=(d.weekday() + 1) % 7)


def check_days(n: int) -> None:
    if not 1 <= n <= MAX_DAYS:
        raise DomainError(f"A plan is 1 to {MAX_DAYS} days long", "plan_days", 422)


def overlapping(
    db: Session,
    plant_id: uuid.UUID,
    start: date,
    n: int,
    exclude: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
    clashing: bool = True,
) -> list[WeeklySchedule]:
    """Other plans with a day in [start, start + n). clashing: only those that would plan the same work (the same
    department, or either is the whole plant's); else only the others (another department's: they share people)."""
    near = db.execute(
        select(WeeklySchedule).where(
            WeeklySchedule.plant_id == plant_id,
            WeeklySchedule.week_start < start + timedelta(days=n),
            WeeklySchedule.week_start > start - timedelta(days=MAX_DAYS),
        )
    ).scalars()
    out = [s for s in near if s.id != exclude and s.week_start + timedelta(days=s.days) > start]
    out = [s for s in out if (department_id is None or s.department_id is None or s.department_id == department_id) == clashing]
    return sorted(out, key=lambda s: s.week_start)


def busy_elsewhere(
    db: Session, plant_id: uuid.UUID, start: date, n: int, exclude: uuid.UUID | None, department_id: uuid.UUID | None
) -> dict[tuple[uuid.UUID, date], Decimal]:
    """Hours each person already has, day by day, in other departments' plans of the same days (shared people)."""
    out: dict[tuple[uuid.UUID, date], Decimal] = defaultdict(Decimal)
    end = start + timedelta(days=n - 1)
    for o in overlapping(db, plant_id, start, n, exclude, department_id, clashing=False):
        for it in o.items:
            if not it.deferred and it.user_id and it.work_date and start <= it.work_date <= end:
                out[(it.user_id, it.work_date)] += it.hours
    return out


# --------------------------------------------------------------------------------------------------------------------
# What the solver needs to know


@dataclass
class Job:
    wo: WorkOrder
    hours: Decimal | None  # total labour hours
    crew: int
    trade: str | None
    crit: str
    due: date | None
    pm_deadline: date | None  # due + tolerance, for preventive work
    need: list[tuple[WORequiredSkill, SkillDefinition]] = field(default_factory=list)
    windows: list[tuple[datetime, datetime]] = field(default_factory=list)  # stop windows of its line (if it needs one)

    @property
    def per_person(self) -> Decimal:
        assert self.hours is not None
        return Decimal(math.ceil(self.hours / self.crew * Q)) / Q

    @property
    def weight(self) -> int:
        return PRIORITY_WEIGHT.get(self.wo.priority, 15) * CRIT_WEIGHT.get(self.crit, 1)


@dataclass
class Day:
    regular: Decimal
    overtime: Decimal  # most overtime allowed
    shift_id: uuid.UUID | None
    start: datetime  # the shift, in plant time
    end: datetime


@dataclass
class Person:
    user: User
    departments: set[uuid.UUID]  # empty = whole plant
    days: dict[date, Day] = field(default_factory=dict)
    skills: dict[uuid.UUID, TechnicianSkill] = field(default_factory=dict)


@dataclass
class Week:
    start: date
    days: list[date]
    open_days: list[date]  # today or later
    jobs: dict[uuid.UUID, Job]
    people: dict[uuid.UUID, Person]
    signers: set[tuple[date, uuid.UUID | None]]  # (day, shift) with someone who may sign LOTO / permits at work
    shifts: dict[uuid.UUID, ShiftDefinition]
    windows: list[StopWindow] = field(default_factory=list)


def _holders(db: Session, plant_id: uuid.UUID, perm: str) -> set[uuid.UUID]:
    return set(users_with_permission(db, plant_id, perm))


def load_week(
    db: Session,
    plant_id: uuid.UUID,
    tz: ZoneInfo,
    week_start: date,
    today: date,
    max_overtime: Decimal,
    n_days: int = 7,
    department_id: uuid.UUID | None = None,
) -> Week:
    """The plan period: week_start and the n_days - 1 days after it (a week by default). With a department: only its work
    orders, and only the people who may work there (theirs, or the whole plant)."""
    days = [week_start + timedelta(days=i) for i in range(n_days)]
    end = days[-1]
    after_week = datetime.combine(end + timedelta(days=1), time(0), tzinfo=tz)
    wos = list(
        db.execute(
            select(WorkOrder).where(
                WorkOrder.plant_id == plant_id,
                WorkOrder.status.in_(SCHEDULABLE),
                WorkOrder.shutdown_package_id.is_(None),  # shutdown work is planned with its shutdown
                WorkOrder.department_id == department_id if department_id else true(),
                or_(
                    WorkOrder.due_date.is_(None),
                    WorkOrder.due_date <= end,
                    WorkOrder.priority.in_([Priority.P1_EMERGENCY, Priority.P2_HIGH]),
                ),
                or_(WorkOrder.planned_start.is_(None), WorkOrder.planned_start < after_week),  # not planned for a later week
            )
        ).scalars()
    )
    ids = [w.id for w in wos]
    pm = {
        wid: (occ, plan, jp)
        for wid, occ, plan, jp in db.execute(
            select(WorkOrder.id, PMOccurrence, PMPlan, JobPlan)
            .join(PMOccurrence, PMOccurrence.id == WorkOrder.pm_occurrence_id)
            .join(PMPlan, PMPlan.id == PMOccurrence.pm_plan_id)
            .join(JobPlan, JobPlan.id == PMPlan.job_plan_id)
            .where(WorkOrder.id.in_(ids))
        ).all()
    }
    assets = {a.id: a for a in db.execute(select(Asset).where(Asset.id.in_([w.asset_id for w in wos]))).scalars()}
    crit = {a.id: (a.criticality.value if a.criticality else "C") for a in assets.values()}
    windows = list(
        db.execute(
            select(StopWindow)
            .where(
                StopWindow.plant_id == plant_id,
                StopWindow.starts_at < after_week,
                StopWindow.ends_at > datetime.combine(days[0], time(0), tzinfo=tz),
            )
            .order_by(StopWindow.starts_at)
        ).scalars()
    )
    need: dict[uuid.UUID, list] = defaultdict(list)
    for rs, sk in db.execute(
        select(WORequiredSkill, SkillDefinition)
        .join(SkillDefinition, SkillDefinition.id == WORequiredSkill.skill_id)
        .where(WORequiredSkill.work_order_id.in_(ids))
        .order_by(SkillDefinition.code)
    ).all():
        need[rs.work_order_id].append((rs, sk))
    jobs: dict[uuid.UUID, Job] = {}
    for w in wos:
        occ, plan, jp = pm.get(w.id, (None, None, None))
        hours = w.estimated_hours if w.estimated_hours else (jp.estimated_hours * (jp.crew_size or 1) if jp else None)
        jobs[w.id] = Job(
            wo=w,
            hours=hours if hours and hours > 0 else None,
            crew=max(1, jp.crew_size if jp else 1),
            trade=jp.trade if jp else None,
            crit=crit.get(w.asset_id, "C"),
            due=w.due_date or (occ.due_date if occ else None),
            pm_deadline=(occ.due_date + timedelta(days=plan.tolerance_days or 0)) if occ and plan else None,
            need=need.get(w.id, []),
            # a window on the line, or on any asset above (or at) the one the work is on
            windows=[(x.starts_at.astimezone(tz), x.ends_at.astimezone(tz)) for x in windows if w.requires_stop and w.asset_id in assets
                     and f"/{x.asset_id}/" in assets[w.asset_id].path],
        )  # fmt: skip

    # People who do the work: they may execute work orders but not sign off LOTO / permits (that is the supervisor's,
    # the engineer's). Those who may sign off decide which shifts can take LOTO / permit work.
    doers = _holders(db, plant_id, "wo.execute") - _holders(db, plant_id, "wo.safety_signoff")
    signers_ids = _holders(db, plant_id, "wo.safety_signoff")
    roster = list(
        db.execute(
            select(RosterEntry).where(
                RosterEntry.plant_id == plant_id,
                RosterEntry.work_date >= week_start,
                RosterEntry.work_date <= end,
                RosterEntry.user_id.in_(doers | signers_ids),
            )
        ).scalars()
    )
    members = {
        m.user_id: m
        for m in db.execute(select(Membership).where(Membership.plant_id == plant_id, Membership.is_active.is_(True))).scalars()
    }
    extra: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
    for mid, did in db.execute(
        select(MembershipDepartment.membership_id, MembershipDepartment.department_id).where(
            MembershipDepartment.membership_id.in_([m.id for m in members.values()])
        )
    ).all():
        extra[mid].add(did)
    users = {u.id: u for u in db.execute(select(User).where(User.id.in_(doers), User.is_active.is_(True))).scalars()}
    shifts = {s.id: s for s in db.execute(select(ShiftDefinition).where(ShiftDefinition.plant_id == plant_id)).scalars()}

    def span(d: date, shift_id: uuid.UUID | None, hours: Decimal) -> tuple[datetime, datetime]:
        sh = shifts.get(shift_id) if shift_id else None
        start = datetime.combine(d, sh.start_time if sh else DEFAULT_SHIFT_START, tzinfo=tz)
        end = datetime.combine(d, sh.end_time, tzinfo=tz) if sh else start + timedelta(hours=float(hours))
        return start, end if end > start else end + timedelta(days=1)  # overnight shift

    people: dict[uuid.UUID, Person] = {}
    signers: set[tuple[date, uuid.UUID | None]] = set()
    for r in roster:
        at_work = r.kind in (RosterKind.WORK, RosterKind.OVERTIME, RosterKind.CALLOUT)
        if r.user_id in signers_ids and at_work:
            signers.add((r.work_date, r.shift_id))
            signers.add((r.work_date, None))
        u = users.get(r.user_id)
        if u is None or not at_work or r.user_id not in members:
            continue
        m = members[r.user_id]
        p = people.get(u.id)
        if p is None:
            depts = ({m.department_id} if m.department_id else set()) | extra[m.id]
            if department_id and depts and department_id not in depts:
                continue  # works in other departments only: not in this department's plan
            p = people[u.id] = Person(user=u, departments=depts)
        hours, ot = Decimal(r.hours or 0), Decimal(r.overtime_hours or 0)
        if r.kind == RosterKind.WORK:
            regular, extra_h = hours, max(max_overtime, ot)
        else:  # an overtime / call-out day: every hour is overtime
            regular, extra_h = Decimal(0), hours + ot
        st, en = span(r.work_date, r.shift_id, regular + extra_h)
        p.days[r.work_date] = Day(
            regular=regular, overtime=extra_h, shift_id=r.shift_id, start=st, end=en + timedelta(hours=float(extra_h))
        )
    for t in db.execute(select(TechnicianSkill).where(TechnicianSkill.user_id.in_(list(people)))).scalars():
        people[t.user_id].skills[t.skill_id] = t
    return Week(week_start, days, [d for d in days if d >= today], jobs, people, signers, shifts, windows)


# --------------------------------------------------------------------------------------------------------------------
# Who may do what, when


def skill_gaps(job: Job, p: Person, d: date) -> list[dict]:
    out = []
    name = p.user.full_name
    for r, sk in job.need:
        t = p.skills.get(sk.id)
        if t is None:
            out.append(msg("no_skill", name=name, skill=sk.code))
            continue
        if t.level < r.min_level:
            out.append(msg("skill_level", name=name, level=t.level, min_level=r.min_level, skill=sk.code))
        st = skills_svc.cert_status(sk, t, d)
        if st == "expired":
            out.append(msg("cert_expired", name=name, skill=sk.code, date=t.certified_until))
        elif st == "no_certificate":
            out.append(msg("no_cert_date", name=name, skill=sk.code))
    return out


def _trade_ok(job: Job, p: Person) -> bool:
    return not job.trade or not p.user.trade or job.trade.lower() == p.user.trade.lower()


def _dept_ok(job: Job, p: Person) -> bool:
    return not p.departments or job.wo.department_id in p.departments


def _signer_ok(week: Week, job: Job, day: Day, d: date) -> bool:
    return not (job.wo.requires_loto or job.wo.requires_permit) or (d, day.shift_id) in week.signers


def stop_hours(job: Job, day: Day) -> Decimal:
    """Longest stretch of one stop window of the job's line inside the person's working day."""
    best = 0.0
    for ws, we in job.windows:
        best = max(best, (min(we, day.end) - max(ws, day.start)).total_seconds() / 3600)
    return Decimal(str(round(best, 2)))


def _covered(spans: list[tuple[datetime, datetime]], start: datetime, end: datetime) -> float:
    """Hours of [start, end) covered by the union of the spans (sorted by start)."""
    total, cur = 0.0, start
    for ws, we in spans:
        lo, hi = max(ws, cur), min(we, end)
        if hi > lo:
            total += (hi - lo).total_seconds() / 3600
            cur = hi
    return total


def problems(week: Week, job: Job, p: Person, d: date) -> list[dict]:
    """Why this person cannot take this job on this day (empty = they can)."""
    name = p.user.full_name
    day = p.days.get(d)
    if day is None:
        return [msg("not_at_work", name=name, date=d)]
    out = []
    if not _trade_ok(job, p):
        out.append(msg("trade_mismatch", trade=job.trade, name=name, person_trade=p.user.trade))
    if not _dept_ok(job, p):
        out.append(msg("other_departments", name=name))
    out += skill_gaps(job, p, d)
    if not _signer_ok(week, job, day, d):
        out.append(msg("no_signer_shift"))
    if job.wo.requires_stop and job.hours is not None:
        h = stop_hours(job, day)
        if h <= 0:
            out.append(msg("line_running", name=name, date=d))
        elif h < job.per_person:
            out.append(msg("window_short", have=h, need=job.per_person))
    return out


def _why_not(week: Week, job: Job) -> dict:
    """Why a job could not be placed at all (not just for lack of hours)."""
    if job.hours is None:
        return msg("no_hours")
    people = list(week.people.values())
    if not week.open_days:
        return msg("week_over")
    if not people:
        return msg("no_roster")
    pp = job.per_person
    if all(pp > d.regular + d.overtime for p in people for d in p.days.values()):
        return msg("too_long", hours=pp)
    if job.wo.requires_stop:
        open_windows = [(ws, we) for ws, we in job.windows if we.date() >= week.open_days[0]]
        if not open_windows:
            return msg("no_window")
        if all(Decimal(str((we - ws).total_seconds() / 3600)) < pp for ws, we in open_windows):
            return msg("windows_too_short", hours=pp)
    traded = [p for p in people if _trade_ok(job, p) and _dept_ok(job, p)]
    if not traded:
        return msg("no_trade", trade=job.trade) if job.trade else msg("no_technician")
    skilled = [(p, d) for p in traded for d in week.open_days if d in p.days and not skill_gaps(job, p, d)]
    if not skilled:
        at_work = [(p, d) for p in traded for d in week.open_days if d in p.days]
        lacking, expired = [], []
        for r, sk in job.need:
            levelled = [(p, d) for p, d in at_work if (t := p.skills.get(sk.id)) is not None and t.level >= r.min_level]
            if not levelled:
                lacking.append(f"{sk.code} ≥ {r.min_level}")
            elif all(skills_svc.cert_status(sk, p.skills[sk.id], d) in ("expired", "no_certificate") for p, d in levelled):
                expired.append(sk.code)
        if expired and not lacking:
            return msg("certs_expired", skills=", ".join(expired))
        codes = ", ".join(lacking) or ", ".join(f"{sk.code} ≥ {r.min_level}" for r, sk in job.need)
        return msg("no_skills", skills=codes)
    if not any(_signer_ok(week, job, p.days[d], d) for p, d in skilled):
        return msg("no_signer")
    if job.wo.requires_stop and not any(stop_hours(job, p.days[d]) >= pp for p, d in skilled):
        return msg("stop_no_qualified")
    per_day: dict[date, int] = defaultdict(int)
    for p, d in skilled:
        if pp <= p.days[d].regular + p.days[d].overtime and _signer_ok(week, job, p.days[d], d):
            if not job.wo.requires_stop or stop_hours(job, p.days[d]) >= pp:
                per_day[d] += 1
    if max(per_day.values(), default=0) < job.crew:
        return msg("no_crew", crew=job.crew)
    if job.wo.requires_stop:
        return msg("windows_full")
    return msg("no_capacity")


# --------------------------------------------------------------------------------------------------------------------
# The model


@dataclass
class Placement:
    wo_id: uuid.UUID
    user_id: uuid.UUID
    day: date
    hours: Decimal
    lead: bool = False
    overtime: bool = False


def solve(
    week: Week,
    fixed: list[Placement],
    fixed_deferred: set[uuid.UUID],
    seconds: float = SOLVE_SECONDS,
    busy: dict[tuple[uuid.UUID, date], Decimal] | None = None,
) -> tuple[list[Placement], dict[uuid.UUID, dict], dict]:
    """fixed: placements kept as they are (pinned by hand, or already scheduled with assignees); they use up hours.
    busy: hours people already have in other departments' plans. Returns the placements (fixed ones included), the
    deferred jobs with the reason, and solver stats."""
    m = cp_model.CpModel()
    used: dict[tuple[uuid.UUID, date], int] = defaultdict(int)
    for k, h in (busy or {}).items():
        used[k] += int(math.ceil(h * Q))
    fixed_jobs = {f.wo_id for f in fixed}
    for f in fixed:
        used[(f.user_id, f.day)] += int(f.hours * Q)
    free = [j for wid, j in week.jobs.items() if wid not in fixed_jobs and wid not in fixed_deferred]
    x: dict[tuple[uuid.UUID, uuid.UUID, date], cp_model.IntVar] = {}
    y: dict[tuple[uuid.UUID, date], cp_model.IntVar] = {}
    deferred: dict[uuid.UUID, dict] = {wid: msg("hand_deferred") for wid in fixed_deferred}
    zs: dict[uuid.UUID, cp_model.IntVar] = {}
    cost = []
    idx = {d: i for i, d in enumerate(week.days)}
    for job in free:
        wid = job.wo.id
        if job.hours is None:
            deferred[wid] = _why_not(week, job)
            continue
        h = int(job.per_person * Q)
        z = m.new_bool_var(f"z{wid}")
        day_vars = []
        for d in week.open_days:
            xs = []
            for uid, p in week.people.items():
                day = p.days.get(d)
                if day is None or h > int((day.regular + day.overtime) * Q) - used[(uid, d)] or problems(week, job, p, d):
                    continue
                v = x[(wid, uid, d)] = m.new_bool_var("")
                xs.append(v)
            if len(xs) < job.crew:
                continue
            yv = y[(wid, d)] = m.new_bool_var("")
            m.add(sum(xs) == job.crew * yv)
            day_vars.append(yv)
            # lateness, PM tolerance, urgent work first
            late = max(0, (d - job.due).days) if job.due else 0
            c = job.weight * (late * 10 + idx[d])
            if job.pm_deadline and d > job.pm_deadline:
                c += PM_OUT_OF_TOLERANCE
            if c:
                cost.append(c * yv)
        if not day_vars:
            deferred[wid] = _why_not(week, job)
            continue
        m.add(sum(day_vars) + z == 1)
        c = job.weight * 50 * (10 if job.wo.priority == Priority.P1_EMERGENCY else 1)
        if job.pm_deadline and job.pm_deadline <= week.days[-1]:
            c += PM_OUT_OF_TOLERANCE
        cost.append(c * z)
        zs[wid] = z
    # hours per person and day, overtime
    loads = []
    ot_vars: dict[tuple[uuid.UUID, date], cp_model.IntVar] = {}
    for uid, p in week.people.items():
        week_load = []
        for d, day in p.days.items():
            terms = [int(week.jobs[wid].per_person * Q) * v for (wid, u, dd), v in x.items() if u == uid and dd == d]
            if not terms:
                continue
            reg = max(0, int(day.regular * Q) - used[(uid, d)])
            ot = ot_vars[(uid, d)] = m.new_int_var(0, int((day.regular + day.overtime) * Q), "")
            m.add(sum(terms) <= reg + ot)
            m.add(ot <= max(0, int((day.regular + day.overtime) * Q) - used[(uid, d)] - reg))
            cost.append(OVERTIME_PER_QUARTER * ot)
            week_load += terms
            # work that needs the line stopped fits in the stopped time of that day's shift
            stop_terms = [int(week.jobs[wid].per_person * Q) * v for (wid, u, dd), v in x.items()
                          if u == uid and dd == d and week.jobs[wid].wo.requires_stop]  # fmt: skip
            if stop_terms:
                spans = sorted({w for wid, u, dd in x if u == uid and dd == d for w in week.jobs[wid].windows})
                m.add(sum(stop_terms) <= int(_covered(spans, day.start, day.end) * Q))
        if week_load:
            lv = m.new_int_var(0, len(week.days) * 24 * Q, "")
            m.add(lv == sum(week_load) + sum(used[(uid, d)] for d in p.days))
            loads.append(lv)
    if loads:
        peak = m.new_int_var(0, len(week.days) * 24 * Q, "")
        for lv in loads:
            m.add(lv <= peak)
        cost.append(peak)
    m.minimize(sum(cost) if cost else 0)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = seconds
    solver.parameters.num_workers = 8
    status = solver.solve(m)
    ok = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
    out = list(fixed)
    for job in free:
        wid = job.wo.id
        if wid in deferred:
            continue
        if not ok or solver.value(zs[wid]):
            deferred[wid] = _why_not(week, job) if ok else msg("no_solution")
            continue
        team = [(uid, d) for (w, uid, d), v in x.items() if w == wid and solver.value(v)]
        for i, (uid, d) in enumerate(sorted(team, key=lambda t: week.people[t[0]].user.full_name)):
            out.append(Placement(wid, uid, d, job.per_person, lead=i == 0))
    # which placements fall in overtime: walk each person-day in priority order
    by_pd: dict[tuple[uuid.UUID, date], list[Placement]] = defaultdict(list)
    for pl in out:
        by_pd[(pl.user_id, pl.day)].append(pl)
    for (uid, d), pls in by_pd.items():
        who = week.people.get(uid)
        regular = who.days[d].regular if who and d in who.days else Decimal(0)
        acc = Decimal(0)
        for pl in sorted(pls, key=lambda pl: _order_key(week, pl.wo_id)):
            acc += pl.hours
            pl.overtime = acc > regular
    stats = {
        "solver": solver.status_name(status),
        "objective": solver.objective_value if ok else None,
        "seconds": round(solver.wall_time, 2),
        "jobs": len(week.jobs),
        "people": len(week.people),
    }
    return out, deferred, stats


def _order_key(week: Week, wo_id: uuid.UUID) -> tuple:
    j = week.jobs.get(wo_id)
    if j is None:
        return (9, date.max, "")
    return (list(PRIORITY_WEIGHT).index(j.wo.priority) if j.wo.priority in PRIORITY_WEIGHT else 9, j.due or date.max, j.wo.number)


# --------------------------------------------------------------------------------------------------------------------
# Propose, check, approve


def page_link(s: WeeklySchedule) -> str:
    return f"/schedule?week={s.week_start}&days={s.days}" + (f"&dept={s.department_id}" if s.department_id else "")


def plan_at(db: Session, plant_id: uuid.UUID, start: date, department_id: uuid.UUID | None = None) -> WeeklySchedule | None:
    return db.execute(
        select(WeeklySchedule).where(
            WeeklySchedule.plant_id == plant_id,
            WeeklySchedule.week_start == start,
            WeeklySchedule.department_id == department_id if department_id else WeeklySchedule.department_id.is_(None),
        )
    ).scalar_one_or_none()


def get_or_create(
    db: Session, plant_id: uuid.UUID, week_start: date, n_days: int = 7, department_id: uuid.UUID | None = None
) -> WeeklySchedule:
    s = plan_at(db, plant_id, week_start, department_id)
    if s is None:
        s = WeeklySchedule(plant_id=plant_id, week_start=week_start, days=n_days, department_id=department_id, status="draft", stats={})
        db.add(s)
        db.flush()
    return s


def propose(
    db: Session,
    ctx: Ctx,
    week_start: date,
    max_overtime: Decimal,
    seconds: float = SOLVE_SECONDS,
    n_days: int | None = None,
    department_id: uuid.UUID | None = None,
) -> WeeklySchedule:
    """Propose the plan that starts on week_start, n_days long (default: the plan's length, or a week), for the whole
    plant or one department. Someone limited to departments plans only their own departments."""
    if department_id is None and ctx.department_ids:
        raise DomainError("Choose one of your departments to plan", "schedule_department", 403)
    if department_id is not None and not ctx.dept_ok(department_id):
        raise DomainError("Not your department", "schedule_department", 403)
    existing = plan_at(db, ctx.plant_id, week_start, department_id)
    n = n_days or (existing.days if existing else 7)
    check_days(n)
    if existing and existing.status == "approved":
        raise DomainError("This plan is approved; reopen it to propose again", "schedule_approved", 409)
    clash = overlapping(db, ctx.plant_id, week_start, n, existing.id if existing else None, department_id)
    if clash:
        o = clash[0]
        raise DomainError(f"Overlaps the plan of {o.week_start} – {o.week_start + timedelta(days=o.days - 1)}", "schedule_overlap", 409)
    s = get_or_create(db, ctx.plant_id, week_start, n, department_id)
    s.days = n
    tz = ZoneInfo(ctx.plant.timezone)
    week = load_week(db, ctx.plant_id, tz, week_start, plant_today(ctx.plant), max_overtime, n, department_id)
    busy = busy_elsewhere(db, ctx.plant_id, week_start, n, s.id, department_id)
    # Keep what was pinned by hand, and work already scheduled this week with its people.
    fixed: list[Placement] = []
    fixed_deferred: set[uuid.UUID] = set()
    kept: list[ScheduleItem] = []
    for it in s.items:
        if not it.pinned or it.work_order_id not in week.jobs or (not it.deferred and it.work_date not in week.days):
            continue  # pinned on a day the (shorter) plan no longer has: planned again
        kept.append(it)
        if it.deferred:
            fixed_deferred.add(it.work_order_id)
        elif it.user_id and it.work_date:
            fixed.append(Placement(it.work_order_id, it.user_id, it.work_date, it.hours, it.is_lead))
    pinned_jobs = {f.wo_id for f in fixed} | fixed_deferred
    # Work scheduled by hand outside this plan keeps its day and people; work this plan scheduled before (a reopened
    # week) is planned again.
    planned_here = {it.work_order_id for it in s.items}
    for wid, job in week.jobs.items():
        w = job.wo
        if (
            wid in pinned_jobs
            or wid in planned_here
            or w.status != WOStatus.SCHEDULED
            or not w.planned_start
            or not w.assignments
            or job.hours is None
        ):
            continue
        d = w.planned_start.astimezone(tz).date()
        if week.days[0] <= d <= week.days[-1]:
            for a in w.assignments:
                fixed.append(Placement(wid, a.user_id, d, job.per_person, a.is_lead))
    placements, deferred, stats = solve(week, fixed, fixed_deferred, seconds, busy)
    # Start again from the pinned deferrals; pinned placements come back from the solver (with their overtime flag).
    pinned_pl = {(it.work_order_id, it.user_id, it.work_date) for it in kept if not it.deferred}
    for it in list(s.items):
        if not (it.pinned and it.deferred and it.work_order_id in fixed_deferred):
            s.items.remove(it)
    db.flush()
    for pl in placements:
        p = week.people.get(pl.user_id)
        day = p.days.get(pl.day) if p else None
        s.items.append(
            ScheduleItem(work_order_id=pl.wo_id, user_id=pl.user_id, work_date=pl.day, shift_id=day.shift_id if day else None,
                         hours=pl.hours, overtime=pl.overtime, is_lead=pl.lead, pinned=(pl.wo_id, pl.user_id, pl.day) in pinned_pl)
        )  # fmt: skip
    for wid, reason in deferred.items():
        if wid in fixed_deferred:
            continue
        s.items.append(ScheduleItem(work_order_id=wid, deferred=True, reason=reason["text"][:300], reason_code=reason["code"],
                                    reason_params=reason["params"]))  # fmt: skip
    s.status, s.max_overtime_hours, s.created_by_id, s.proposed_at = "draft", max_overtime, ctx.user.id, utcnow()
    s.engineer_by_id = s.engineer_at = None
    s.returned_comment = None
    s.stats = stats | totals(s)
    db.flush()
    audit(db, "schedule.propose", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="weekly_schedule", entity_id=s.id,
          data={"week": str(week_start), "days": n, "department": str(department_id) if department_id else None, **{k: v for k, v in s.stats.items() if k != "objective"}})  # fmt: skip
    return s


def totals(s: WeeklySchedule) -> dict:
    placed = [i for i in s.items if not i.deferred]
    return {
        "scheduled": len({i.work_order_id for i in placed}),
        "deferred": len([i for i in s.items if i.deferred]),
        "hours": float(sum((i.hours for i in placed), Decimal(0))),
        "overtime_items": len([i for i in placed if i.overtime]),
    }


def check(db: Session, ctx: Ctx, s: WeeklySchedule) -> dict:
    """Per item, what breaks a rule (after hand edits); per person and day, the load against the roster."""
    week = load_week(db, ctx.plant_id, ZoneInfo(ctx.plant.timezone), s.week_start, date.min, s.max_overtime_hours, s.days, s.department_id)
    busy = busy_elsewhere(db, ctx.plant_id, s.week_start, s.days, s.id, s.department_id)
    warn: dict[str, list[dict]] = {}
    load: dict[tuple[uuid.UUID, date], Decimal] = defaultdict(Decimal, busy)
    for it in s.items:
        if it.deferred or it.user_id is None or it.work_date is None:
            continue
        load[(it.user_id, it.work_date)] += it.hours
        job, p = week.jobs.get(it.work_order_id), week.people.get(it.user_id)
        w: list[dict] = []
        if job is None:
            w.append(msg("not_open"))
        elif p is None:
            w.append(msg("not_on_roster"))
        else:
            w += problems(week, job, p, it.work_date)
        if w:
            warn[str(it.id)] = w
    over = []
    for (uid, d), h in load.items():
        p = week.people.get(uid)
        cap = (p.days[d].regular + p.days[d].overtime) if p and d in p.days else Decimal(0)
        if h > cap:
            over.append({"user_id": uid, "date": d, "hours": h, "capacity": cap})
    return {"warnings": warn, "over_capacity": over, "week": week, "busy": busy}


def _back_to_draft(s: WeeklySchedule) -> None:
    if s.status == "approved":
        raise DomainError("This week is approved; reopen it to change it", "schedule_approved", 409)
    s.status, s.engineer_by_id, s.engineer_at = "draft", None, None


def edited(s: WeeklySchedule) -> None:
    """Any hand edit after the engineer's approval sends the week back to the engineer."""
    _back_to_draft(s)
    s.stats = (s.stats or {}) | totals(s)


def review(db: Session, ctx: Ctx, s: WeeklySchedule) -> None:
    if s.status != "draft" or s.proposed_at is None:
        raise DomainError("Only a proposed draft can be approved by the engineer", "schedule_state", 409)
    s.status, s.engineer_by_id, s.engineer_at = "engineer_approved", ctx.user.id, utcnow()
    audit(
        db,
        "schedule.review",
        user_id=ctx.user.id,
        plant_id=ctx.plant_id,
        entity_type="weekly_schedule",
        entity_id=s.id,
        data={"week": str(s.week_start)},
    )
    notify(db, ctx.plant_id, [u for u in users_with_permission(db, ctx.plant_id, "schedule.approve", s.department_id) if u != ctx.user.id],
           kind="approval", title=f"Weekly schedule {s.week_start} awaits your approval", body=f"Approved by {ctx.user.full_name}",
           link=page_link(s), dedupe_key=f"schedule:{s.id}:review")  # fmt: skip


def send_back(db: Session, ctx: Ctx, s: WeeklySchedule, comment: str) -> None:
    if s.status == "draft":
        raise DomainError("The week is already a draft", "schedule_state", 409)
    # The engineer may withdraw their own approval; the manager sends back either step.
    if not ("schedule.approve" in ctx.permissions or (s.status == "engineer_approved" and "schedule.review" in ctx.permissions)):
        raise DomainError("Not allowed to send this week back", "forbidden", 403)
    s.status, s.engineer_by_id, s.engineer_at, s.manager_by_id, s.manager_at = "draft", None, None, None, None
    s.returned_comment = comment
    audit(
        db,
        "schedule.return",
        user_id=ctx.user.id,
        plant_id=ctx.plant_id,
        entity_type="weekly_schedule",
        entity_id=s.id,
        data={"comment": comment},
    )
    if s.created_by_id and s.created_by_id != ctx.user.id:
        notify(db, ctx.plant_id, [s.created_by_id], kind="approval", title=f"Weekly schedule {s.week_start} sent back",
               body=comment, link=page_link(s), dedupe_key=f"schedule:{s.id}:return")  # fmt: skip


def _first_free(busy: list[tuple[datetime, datetime]], earliest: datetime, hours: float, latest_end: datetime | None) -> datetime | None:
    """Earliest start ≥ earliest where `hours` fit between the busy spans (and end by latest_end, if given)."""
    need = timedelta(hours=hours)
    for t in sorted({earliest} | {e for _, e in busy if e > earliest}):
        if latest_end is not None and t + need > latest_end:
            return None
        if all(t + need <= bs or t >= be for bs, be in busy):
            return t
    return None


def approve(db: Session, ctx: Ctx, s: WeeklySchedule) -> list[dict]:
    """The manager's approval: each placed work order gets its people (lead first) and planned start / end, and becomes
    scheduled. Work that needs the line stopped is timed first, inside a stop window; the rest of a person's day follows
    from the start of their shift, most urgent first, in the free time around it."""
    if s.status != "engineer_approved":
        raise DomainError("The engineer approves the week first", "schedule_state", 409)
    tz = ZoneInfo(ctx.plant.timezone)
    week = load_week(db, ctx.plant_id, tz, s.week_start, date.min, s.max_overtime_hours, s.days, s.department_id)
    by_wo: dict[uuid.UUID, list[ScheduleItem]] = defaultdict(list)
    for it in s.items:
        if not it.deferred and it.user_id and it.work_date:
            by_wo[it.work_order_id].append(it)
    wos = {w.id: w for w in db.execute(select(WorkOrder).where(WorkOrder.id.in_(list(by_wo)))).scalars()}
    rank = {Priority.P1_EMERGENCY: 0, Priority.P2_HIGH: 1, Priority.P3_MEDIUM: 2, Priority.P4_LOW: 3}

    def order(wid: uuid.UUID) -> tuple:
        w = wos.get(wid)
        return (
            min(i.work_date or date.max for i in by_wo[wid]),
            not (w and w.requires_stop),  # the stop windows are fixed: their work first
            rank.get(w.priority, 9) if w else 9,
            w.due_date or date.max if w else date.max,
            w.number if w else "",
        )

    def shift_start(uid: uuid.UUID, d: date) -> datetime:
        p = week.people.get(uid)
        return p.days[d].start if p and d in p.days else datetime.combine(d, DEFAULT_SHIFT_START, tzinfo=tz)

    busy: dict[tuple[uuid.UUID, date], list[tuple[datetime, datetime]]] = defaultdict(list)
    warnings: list[dict] = []
    for wid in sorted(by_wo, key=order):
        w = wos.get(wid)
        if w is None or w.status not in SCHEDULABLE:
            warnings.append(msg("skipped_closed", number=w.number if w else str(wid)))
            continue
        team = sorted(by_wo[wid], key=lambda i: not i.is_lead)
        d = team[0].work_date
        assert d is not None
        uids = [i.user_id for i in team if i.user_id]
        spans = [b for u in uids for b in busy[(u, d)]]
        hours = float(max(i.hours for i in team))
        from_shift = max(shift_start(u, d) for u in uids)
        day_end = min(
            (week.people[u].days[d].end for u in uids if u in week.people and d in week.people[u].days),
            default=from_shift + timedelta(hours=24),
        )
        start = None
        job = week.jobs.get(wid)
        if w.requires_stop and job:
            for ws, we in job.windows:
                if ws < day_end and we > from_shift:  # the window falls in the team's working day
                    start = _first_free(spans, max(ws, from_shift), hours, we)
                    if start:
                        break
            if start is None:
                warnings.append(msg("no_stop_fit", number=w.number, date=d))
        if start is None:
            start = _first_free(spans, from_shift, hours, None) or from_shift
        end = start + timedelta(hours=hours)
        for u in uids:
            busy[(u, d)].append((start, end))
        w.planned_start, w.planned_end = start, end
        assign_msgs: list[tuple[str, dict]] = []
        wo_svc.assign(db, ctx, w, uids, uids[0] if uids else None, force=True, msgs=assign_msgs)
        warnings += [msg(code, number=w.number, **ps) for code, ps in assign_msgs]
        if w.status in (WOStatus.APPROVED, WOStatus.PLANNED):
            wo_svc.change_status(db, ctx, w, WOStatus.SCHEDULED, "Weekly schedule approved")
    # Deferred now but still scheduled in this week (e.g. by an earlier approval of a reopened week): off the schedule.
    lo, hi = datetime.combine(week.days[0], time(0), tzinfo=tz), datetime.combine(week.days[-1] + timedelta(days=1), time(0), tzinfo=tz)
    for it in s.items:
        w = db.get(WorkOrder, it.work_order_id) if it.deferred else None
        if w and w.status == WOStatus.SCHEDULED and w.planned_start and lo <= w.planned_start < hi:
            wo_svc.change_status(db, ctx, w, WOStatus.PLANNED, f"Deferred in the weekly schedule: {it.reason}")
            w.planned_start = w.planned_end = None
            warnings.append(msg("taken_off", number=w.number))
    s.status, s.manager_by_id, s.manager_at = "approved", ctx.user.id, utcnow()
    audit(db, "schedule.approve", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="weekly_schedule", entity_id=s.id,
          data={"week": str(s.week_start), "work_orders": len(by_wo), "warnings": [x["text"] for x in warnings]})  # fmt: skip
    return warnings


def reopen(db: Session, ctx: Ctx, s: WeeklySchedule) -> None:
    """Approved weeks can be reopened by the manager (e.g. the week changed a lot); the work orders keep what was written."""
    if s.status != "approved":
        raise DomainError("Only an approved week can be reopened", "schedule_state", 409)
    s.status, s.engineer_by_id, s.engineer_at, s.manager_by_id, s.manager_at = "draft", None, None, None, None
    audit(
        db,
        "schedule.reopen",
        user_id=ctx.user.id,
        plant_id=ctx.plant_id,
        entity_type="weekly_schedule",
        entity_id=s.id,
        data={"week": str(s.week_start)},
    )
