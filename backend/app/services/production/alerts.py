"""Rule-based proactive monitoring (industry-independent). Each active alert rule is checked on the last complete
production days of its scope; a rule that holds opens one alert (later checks update it), notifies the responsible
role and escalates when nobody acknowledged it in time; an alert whose condition no longer holds is resolved.

Conditions: below / above / outside a threshold for `periods` consecutive days, kpi_limits (the KPI's own warning /
critical limits), total_above (sum over the look-back days: repeated interruptions, increasing downtime),
trend_down / trend_up (change in % between the halves of the look-back), action_overdue (open actions past due)."""

import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.identity import Membership, Role, User
from app.models.production import OpAction, OpAlert, OpAlertRule, OpKpi
from app.models.tenancy import Plant
from app.services.common import plant_today, utcnow
from app.services.notifications import notify, users_with_permission
from app.services.production import kpis as kp
from app.services.production import measures as ms

CONDITIONS = ("below", "above", "outside", "kpi_limits", "total_above", "trend_down", "trend_up", "action_overdue")
OPEN = ("open", "acknowledged")
SEV_RANK = {"info": 0, "warning": 1, "critical": 2}


def role_users(db: Session, plant_id: uuid.UUID, role_code: str | None) -> list[uuid.UUID]:
    """Members of the plant with the role; nobody named → whoever confirms production reports."""
    if not role_code:
        return users_with_permission(db, plant_id, "op.confirm")
    q = (
        select(Membership.user_id)
        .join(Role, Role.id == Membership.role_id)
        .join(User, User.id == Membership.user_id)
        .where(Membership.plant_id == plant_id, Membership.is_active.is_(True), User.is_active.is_(True), Role.code == role_code)
    )
    return list(db.execute(q).scalars().unique())


def _series(
    db: Session, plant: Plant, rule: OpAlertRule, kpi: OpKpi | None, days: list[date]
) -> tuple[list[tuple[date, float | None]], list]:
    lines = ms.lines_in_scope(
        db, plant.id, rule.machine_id or (kpi.machine_id if kpi else None), rule.department_id or (kpi.department_id if kpi else None)
    )
    daily, agg = ms.collect(db, plant, lines, days[0], days[-1])
    out: list[tuple[date, float | None]] = []
    for d in days:
        env = ms.aggregate(daily, agg, [d])
        if kpi is not None:
            v, _ = kp.value(kpi.formula, env)
        else:
            v = env.get(rule.source_code or "")
        out.append((d, v))
    return out, lines


def check_rule(db: Session, plant: Plant, rule: OpAlertRule, today: date) -> dict | None:
    """The alert the rule raises now ({value, severity, detail}) or None."""
    if rule.condition == "action_overdue":
        lim = today - timedelta(days=int(rule.threshold or 0))
        q = select(OpAction).where(OpAction.plant_id == plant.id, OpAction.status.in_(("open", "in_progress")), OpAction.due_date < lim)
        if rule.machine_id:
            q = q.where(OpAction.machine_id == rule.machine_id)
        n = len(list(db.execute(q).scalars()))
        return {"value": n, "severity": rule.severity, "detail": {"overdue": n}} if n else None
    kpi = None
    if rule.source_kind == "kpi":
        kpi = db.execute(select(OpKpi).where(OpKpi.plant_id == plant.id, OpKpi.code == rule.source_code)).scalar_one_or_none()
        if kpi is None:
            return None
    last = today - timedelta(days=1)
    n = max(rule.periods or 1, 1)
    span = max(n, rule.lookback_days or 7) if rule.condition in ("total_above", "trend_down", "trend_up") else n
    days = ms.days_between(last - timedelta(days=span - 1), last)
    series, _ = _series(db, plant, rule, kpi, days)
    th = float(rule.threshold) if rule.threshold is not None else None
    hi = float(rule.threshold_high) if rule.threshold_high is not None else None
    vals = [v for _, v in series]
    latest = vals[-1] if vals else None
    if rule.condition in ("below", "above", "outside", "kpi_limits"):
        recent = vals[-n:]
        if len(recent) < n or any(v is None for v in recent):
            return None

        def bad(v: float) -> str | None:
            if rule.condition == "below":
                return rule.severity if th is not None and v < th else None
            if rule.condition == "above":
                return rule.severity if th is not None and v > th else None
            if rule.condition == "outside":
                return rule.severity if (th is not None and v < th) or (hi is not None and v > hi) else None
            st = kp.status(kpi, v) if kpi else "missing"  # kpi_limits
            return {"critical": "critical", "warning": "warning"}.get(st)

        sev = [bad(v) for v in recent]  # type: ignore[arg-type]
        if all(sev):
            worst = "critical" if sev[-1] == "critical" else (sev[-1] or rule.severity)
            return {"value": latest, "severity": worst, "detail": {"days": [d.isoformat() for d, _ in series[-n:]], "values": recent}}
        return None
    nums = [v for v in vals if v is not None]
    if rule.condition == "total_above":
        tot = sum(nums)
        if nums and th is not None and tot > th:
            return {"value": tot, "severity": rule.severity, "detail": {"days": span, "total": round(tot, 4)}}
        return None
    tr = kp.trend([(d, v) for d, v in series if v is not None])  # trend_down / trend_up
    if tr is None or th is None:
        return None
    if (rule.condition == "trend_down" and tr <= -abs(th)) or (rule.condition == "trend_up" and tr >= abs(th)):
        return {"value": tr, "severity": rule.severity, "detail": {"days": span, "change_pct": tr}}
    return None


def evaluate(db: Session, plant: Plant, now: datetime | None = None) -> dict:
    """Check every active rule of the plant. Returns counts (opened, updated, resolved, escalated)."""
    now = now or utcnow()
    today = plant_today(plant)
    stats = {"opened": 0, "updated": 0, "resolved": 0, "escalated": 0}
    rules = list(db.execute(select(OpAlertRule).where(OpAlertRule.plant_id == plant.id, OpAlertRule.is_active.is_(True))).scalars())
    for rule in rules:
        hit = check_rule(db, plant, rule, today)
        cur = db.execute(
            select(OpAlert).where(OpAlert.rule_id == rule.id, OpAlert.status.in_(OPEN)).order_by(OpAlert.first_seen.desc()).limit(1)
        ).scalar_one_or_none()
        if hit is None:
            if cur is not None:
                cur.status, cur.closed_at = "resolved", now
                stats["resolved"] += 1
            continue
        val = hit["value"]
        if cur is None:
            cur = OpAlert(plant_id=plant.id, rule_id=rule.id, machine_id=rule.machine_id, status="open", severity=hit["severity"],
                          period_date=today - timedelta(days=1), value=None if val is None else round(val, 4), detail=hit["detail"],
                          first_seen=now, last_seen=now)  # fmt: skip
            db.add(cur)
            db.flush()
            stats["opened"] += 1
            notify(db, plant.id, role_users(db, plant.id, rule.notify_role), kind="op_alert", title=f"{rule.name}", severity=_nsev(hit["severity"]),
                   body=_body(rule, val), link="/operations/insights", dedupe_key=f"op_alert:{cur.id}", email=rule.notify_email)  # fmt: skip
        else:
            if SEV_RANK.get(hit["severity"], 1) > SEV_RANK.get(cur.severity, 1) and cur.status == "acknowledged":
                cur.status = "open"  # got worse: needs attention again
            cur.severity, cur.value, cur.detail, cur.last_seen = hit["severity"], None if val is None else round(val, 4), hit["detail"], now
            cur.period_date = today - timedelta(days=1)
            stats["updated"] += 1
        if (
            cur.status == "open" and cur.escalated_at is None and rule.escalate_after_days is not None
            and cur.first_seen <= now - timedelta(days=rule.escalate_after_days)
        ):  # fmt: skip
            cur.escalated_at = now
            stats["escalated"] += 1
            notify(db, plant.id, role_users(db, plant.id, rule.escalate_role), kind="op_alert", title=f"Escalated: {rule.name}", severity="critical",
                   body=_body(rule, val), link="/operations/insights", dedupe_key=f"op_alert_esc:{cur.id}", email=True)  # fmt: skip
    return stats


def _nsev(s: str) -> str:
    return {"critical": "critical", "warning": "warning"}.get(s, "info")


def _body(rule: OpAlertRule, val: float | None) -> str:
    th = "" if rule.threshold is None else f" {float(rule.threshold):g}"
    v = "" if val is None else f" → {val:.4g}"
    return f"{rule.source_code or ''} {rule.condition}{th}{v}".strip()
