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
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import Ctx
from app.core.errors import DomainError
from app.models.assets import Asset
from app.models.enums import Priority, RosterKind, WOStatus
from app.models.identity import Membership, MembershipDepartment, User
from app.models.pm import JobPlan, PMOccurrence, PMPlan
from app.models.shifts import RosterEntry, ShiftDefinition
from app.models.skills import SkillDefinition, TechnicianSkill, WORequiredSkill
from app.models.weekly import ScheduleItem, WeeklySchedule
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


def week_of(d: date) -> date:
    """The Sunday that starts d's week."""
    return d - timedelta(days=(d.weekday() + 1) % 7)


def check_sunday(week_start: date) -> None:
    if week_start.weekday() != 6:
        raise DomainError("The week starts on Sunday", "not_sunday", 422)


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


def _holders(db: Session, plant_id: uuid.UUID, perm: str) -> set[uuid.UUID]:
    return set(users_with_permission(db, plant_id, perm))


def load_week(db: Session, plant_id: uuid.UUID, tz: ZoneInfo, week_start: date, today: date, max_overtime: Decimal) -> Week:
    days = [week_start + timedelta(days=i) for i in range(7)]
    end = days[-1]
    after_week = datetime.combine(end + timedelta(days=1), time(0), tzinfo=tz)
    wos = list(
        db.execute(
            select(WorkOrder).where(
                WorkOrder.plant_id == plant_id,
                WorkOrder.status.in_(SCHEDULABLE),
                WorkOrder.shutdown_package_id.is_(None),  # shutdown work is planned with its shutdown
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
    crit = {
        a.id: (a.criticality.value if a.criticality else "C")
        for a in db.execute(select(Asset).where(Asset.id.in_([w.asset_id for w in wos]))).scalars()
    }
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
        )

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
            p = people[u.id] = Person(user=u, departments=({m.department_id} if m.department_id else set()) | extra[m.id])
        hours, ot = Decimal(r.hours or 0), Decimal(r.overtime_hours or 0)
        if r.kind == RosterKind.WORK:
            p.days[r.work_date] = Day(regular=hours, overtime=max(max_overtime, ot), shift_id=r.shift_id)
        else:  # an overtime / call-out day: every hour is overtime
            p.days[r.work_date] = Day(regular=Decimal(0), overtime=hours + ot, shift_id=r.shift_id)
    for t in db.execute(select(TechnicianSkill).where(TechnicianSkill.user_id.in_(list(people)))).scalars():
        people[t.user_id].skills[t.skill_id] = t
    shifts = {s.id: s for s in db.execute(select(ShiftDefinition).where(ShiftDefinition.plant_id == plant_id)).scalars()}
    return Week(week_start, days, [d for d in days if d >= today], jobs, people, signers, shifts)


# --------------------------------------------------------------------------------------------------------------------
# Who may do what, when


def skill_gaps(job: Job, p: Person, d: date) -> list[str]:
    out = []
    for r, sk in job.need:
        t = p.skills.get(sk.id)
        if t is None:
            out.append(f"no skill {sk.code}")
            continue
        if t.level < r.min_level:
            out.append(f"level {t.level} < {r.min_level} for {sk.code}")
        st = skills_svc.cert_status(sk, t, d)
        if st == "expired":
            out.append(f"certificate {sk.code} expired {t.certified_until}")
        elif st == "no_certificate":
            out.append(f"no certificate date for {sk.code}")
    return out


def _trade_ok(job: Job, p: Person) -> bool:
    return not job.trade or not p.user.trade or job.trade.lower() == p.user.trade.lower()


def _dept_ok(job: Job, p: Person) -> bool:
    return not p.departments or job.wo.department_id in p.departments


def _signer_ok(week: Week, job: Job, day: Day, d: date) -> bool:
    return not (job.wo.requires_loto or job.wo.requires_permit) or (d, day.shift_id) in week.signers


def problems(week: Week, job: Job, p: Person, d: date) -> list[str]:
    """Why this person cannot take this job on this day (empty = they can)."""
    day = p.days.get(d)
    if day is None:
        return [f"{p.user.full_name} is not at work on {d}"]
    out = []
    if not _trade_ok(job, p):
        out.append(f"{job.trade} work, {p.user.full_name} is {p.user.trade}")
    if not _dept_ok(job, p):
        out.append(f"{p.user.full_name} works in other departments")
    out += [f"{p.user.full_name}: {g}" for g in skill_gaps(job, p, d)]
    if not _signer_ok(week, job, day, d):
        out.append("no supervisor or engineer on that shift to sign off LOTO / permit")
    return out


def _why_not(week: Week, job: Job) -> str:
    """Why a job could not be placed at all (not just for lack of hours)."""
    if job.hours is None:
        return "no estimated hours"
    people = list(week.people.values())
    if not week.open_days:
        return "the week is over"
    if not people:
        return "nobody on the roster this week"
    pp = job.per_person
    if all(pp > d.regular + d.overtime for p in people for d in p.days.values()):
        return f"longer than one shift ({pp} h per person)"
    traded = [p for p in people if _trade_ok(job, p) and _dept_ok(job, p)]
    if not traded:
        return f"no {job.trade or ''} technician for this department on the roster".replace("  ", " ")
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
            return f"the {', '.join(expired)} certificate of everyone qualified has expired or has no date"
        codes = ", ".join(lacking) or ", ".join(f"{sk.code} ≥ {r.min_level}" for r, sk in job.need)
        return f"nobody at work has the required skills ({codes})"
    if not any(_signer_ok(week, job, p.days[d], d) for p, d in skilled):
        return "no supervisor or engineer on shift to sign off LOTO / permit"
    per_day: dict[date, int] = defaultdict(int)
    for p, d in skilled:
        if pp <= p.days[d].regular + p.days[d].overtime and _signer_ok(week, job, p.days[d], d):
            per_day[d] += 1
    if max(per_day.values(), default=0) < job.crew:
        return f"a crew of {job.crew} is not available on one day"
    return "not enough technician hours this week"


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
    week: Week, fixed: list[Placement], fixed_deferred: set[uuid.UUID], seconds: float = SOLVE_SECONDS
) -> tuple[list[Placement], dict[uuid.UUID, str], dict]:
    """fixed: placements kept as they are (pinned by hand, or already scheduled with assignees); they use up hours.
    Returns the placements (fixed ones included), the deferred jobs with the reason, and solver stats."""
    m = cp_model.CpModel()
    used: dict[tuple[uuid.UUID, date], int] = defaultdict(int)
    fixed_jobs = {f.wo_id for f in fixed}
    for f in fixed:
        used[(f.user_id, f.day)] += int(f.hours * Q)
    free = [j for wid, j in week.jobs.items() if wid not in fixed_jobs and wid not in fixed_deferred]
    x: dict[tuple[uuid.UUID, uuid.UUID, date], cp_model.IntVar] = {}
    y: dict[tuple[uuid.UUID, date], cp_model.IntVar] = {}
    deferred: dict[uuid.UUID, str] = {wid: "deferred by hand" for wid in fixed_deferred}
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
        if week_load:
            lv = m.new_int_var(0, 7 * 24 * Q, "")
            m.add(lv == sum(week_load) + sum(used[(uid, d)] for d in p.days))
            loads.append(lv)
    if loads:
        peak = m.new_int_var(0, 7 * 24 * Q, "")
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
            deferred[wid] = _why_not(week, job) if ok else "no schedule found in time"
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


def get_or_create(db: Session, plant_id: uuid.UUID, week_start: date) -> WeeklySchedule:
    s = db.execute(
        select(WeeklySchedule).where(WeeklySchedule.plant_id == plant_id, WeeklySchedule.week_start == week_start)
    ).scalar_one_or_none()
    if s is None:
        s = WeeklySchedule(plant_id=plant_id, week_start=week_start, status="draft", stats={})
        db.add(s)
        db.flush()
    return s


def propose(db: Session, ctx: Ctx, week_start: date, max_overtime: Decimal, seconds: float = SOLVE_SECONDS) -> WeeklySchedule:
    check_sunday(week_start)
    s = get_or_create(db, ctx.plant_id, week_start)
    if s.status == "approved":
        raise DomainError("This week is approved; reopen it to propose again", "schedule_approved", 409)
    tz = ZoneInfo(ctx.plant.timezone)
    week = load_week(db, ctx.plant_id, tz, week_start, plant_today(ctx.plant), max_overtime)
    # Keep what was pinned by hand, and work already scheduled this week with its people.
    fixed: list[Placement] = []
    fixed_deferred: set[uuid.UUID] = set()
    kept: list[ScheduleItem] = []
    for it in s.items:
        if not it.pinned or it.work_order_id not in week.jobs:
            continue
        kept.append(it)
        if it.deferred:
            fixed_deferred.add(it.work_order_id)
        elif it.user_id and it.work_date:
            fixed.append(Placement(it.work_order_id, it.user_id, it.work_date, it.hours, it.is_lead))
    pinned_jobs = {f.wo_id for f in fixed} | fixed_deferred
    for wid, job in week.jobs.items():
        w = job.wo
        if wid in pinned_jobs or w.status != WOStatus.SCHEDULED or not w.planned_start or not w.assignments or job.hours is None:
            continue
        d = w.planned_start.astimezone(tz).date()
        if week.days[0] <= d <= week.days[-1]:
            for a in w.assignments:
                fixed.append(Placement(wid, a.user_id, d, job.per_person, a.is_lead))
    placements, deferred, stats = solve(week, fixed, fixed_deferred, seconds)
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
        s.items.append(ScheduleItem(work_order_id=wid, deferred=True, reason=reason[:300]))
    s.status, s.max_overtime_hours, s.created_by_id, s.proposed_at = "draft", max_overtime, ctx.user.id, utcnow()
    s.engineer_by_id = s.engineer_at = None
    s.returned_comment = None
    s.stats = stats | totals(s)
    db.flush()
    audit(db, "schedule.propose", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="weekly_schedule", entity_id=s.id,
          data={"week": str(week_start), **{k: v for k, v in s.stats.items() if k != "objective"}})  # fmt: skip
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
    week = load_week(db, ctx.plant_id, ZoneInfo(ctx.plant.timezone), s.week_start, date.min, s.max_overtime_hours)
    warn: dict[str, list[str]] = {}
    load: dict[tuple[uuid.UUID, date], Decimal] = defaultdict(Decimal)
    for it in s.items:
        if it.deferred or it.user_id is None or it.work_date is None:
            continue
        load[(it.user_id, it.work_date)] += it.hours
        job, p = week.jobs.get(it.work_order_id), week.people.get(it.user_id)
        w: list[str] = []
        if job is None:
            w.append("work order is no longer open for scheduling")
        elif p is None:
            w.append("not on the roster this week")
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
    return {"warnings": warn, "over_capacity": over, "week": week}


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
    notify(db, ctx.plant_id, [u for u in users_with_permission(db, ctx.plant_id, "schedule.approve") if u != ctx.user.id],
           kind="approval", title=f"Weekly schedule {s.week_start} awaits your approval", body=f"Approved by {ctx.user.full_name}",
           link=f"/schedule?week={s.week_start}", dedupe_key=f"schedule:{s.id}:review")  # fmt: skip


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
               body=comment, link=f"/schedule?week={s.week_start}", dedupe_key=f"schedule:{s.id}:return")  # fmt: skip


def approve(db: Session, ctx: Ctx, s: WeeklySchedule) -> list[str]:
    """The manager's approval: each placed work order gets its people (lead first) and planned start / end, and becomes
    scheduled. Jobs of one person on one day follow each other from the start of their shift, most urgent first."""
    if s.status != "engineer_approved":
        raise DomainError("The engineer approves the week first", "schedule_state", 409)
    tz = ZoneInfo(ctx.plant.timezone)
    shifts = {sh.id: sh for sh in db.execute(select(ShiftDefinition).where(ShiftDefinition.plant_id == ctx.plant_id)).scalars()}
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
            rank.get(w.priority, 9) if w else 9,
            w.due_date or date.max if w else date.max,
            w.number if w else "",
        )

    free_at: dict[tuple[uuid.UUID, date], datetime] = {}
    warnings: list[str] = []
    for wid in sorted(by_wo, key=order):
        w = wos.get(wid)
        if w is None or w.status not in SCHEDULABLE:
            warnings.append(f"{w.number if w else wid}: no longer open, skipped")
            continue
        team = sorted(by_wo[wid], key=lambda i: not i.is_lead)
        d = team[0].work_date
        assert d is not None
        start = max(
            free_at.get((i.user_id, d))  # type: ignore[arg-type]
            or datetime.combine(d, shifts[i.shift_id].start_time if i.shift_id in shifts else DEFAULT_SHIFT_START, tzinfo=tz)
            for i in team
        )
        hours = max(i.hours for i in team)
        end = start + timedelta(hours=float(hours))
        for i in team:
            free_at[(i.user_id, d)] = end  # type: ignore[index]
        w.planned_start, w.planned_end = start, end
        uids = [i.user_id for i in team if i.user_id]
        warnings += [f"{w.number}: {x}" for x in wo_svc.assign(db, ctx, w, uids, uids[0] if uids else None, force=True)]
        if w.status in (WOStatus.APPROVED, WOStatus.PLANNED):
            wo_svc.change_status(db, ctx, w, WOStatus.SCHEDULED, "Weekly schedule approved")
    s.status, s.manager_by_id, s.manager_at = "approved", ctx.user.id, utcnow()
    audit(db, "schedule.approve", user_id=ctx.user.id, plant_id=ctx.plant_id, entity_type="weekly_schedule", entity_id=s.id,
          data={"week": str(s.week_start), "work_orders": len(by_wo), "warnings": warnings})  # fmt: skip
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
