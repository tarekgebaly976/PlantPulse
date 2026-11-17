"""Operations daily logs: utilities daily generation and electricity report, stock preparation shift report, and any
other configured daily / per-shift form.

Values: a meter or counter line is entered as opening and closing reading (the opening is taken from the previous
log's closing) and its value is the difference; number, check and text lines are entered; calc lines are worked out
from a formula over other lines' codes. Out-of-range values are flagged. Daily totals feed the production dashboard
(also per tonne of paper, using the paper machine's net production of the same day)."""

import ast
import operator
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.operations import OpLog, OpLogField, OpLogTemplate, OpLogValue
from app.models.tenancy import Plant

KINDS = ("meter", "counter", "number", "check", "text", "calc")
READING_KINDS = ("meter", "counter")
NUMERIC_KINDS = ("meter", "counter", "number", "check", "calc")

_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}


def check_formula(formula: str, codes: set[str]) -> None:
    """Allowed: numbers, line codes, + − × ÷ and brackets. Raises ValueError otherwise."""
    try:
        tree = ast.parse(formula, mode="eval")
    except SyntaxError as e:
        raise ValueError("The formula cannot be read") from e
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            if node.id not in codes:
                raise ValueError(f"Unknown code in the formula: {node.id}")
        elif not isinstance(node, (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.Load, ast.USub, ast.UAdd, *_OPS)):
            raise ValueError("Only numbers, codes, + - * / and brackets are allowed")
        if isinstance(node, ast.Constant) and not isinstance(node.value, (int, float)):
            raise ValueError("Only numbers, codes, + - * / and brackets are allowed")


def evaluate(formula: str, env: dict[str, float | None]) -> float | None:
    """Value of a checked formula; None when a line it needs is empty or it divides by zero."""

    def ev(n: ast.AST) -> float | None:
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant):
            return float(n.value) if isinstance(n.value, (int, float)) else None
        if isinstance(n, ast.Name):
            return env.get(n.id)
        if isinstance(n, ast.UnaryOp):
            v = ev(n.operand)
            return None if v is None else (-v if isinstance(n.op, ast.USub) else v)
        if isinstance(n, ast.BinOp):
            a, b = ev(n.left), ev(n.right)
            if a is None or b is None:
                return None
            if isinstance(n.op, ast.Div) and b == 0:
                return None
            return float(_OPS[type(n.op)](a, b))
        return None

    try:
        return ev(ast.parse(formula, mode="eval"))
    except (SyntaxError, KeyError, TypeError):
        return None


def f(v: Decimal | float | None) -> float | None:
    return float(v) if v is not None else None


def windows(t: OpLogTemplate, plant: Plant, d: date) -> list[tuple[str, str, datetime, datetime]]:
    """[(shift, name, start, end)] of log day d: one window "-" for a daily log, else one per shift."""
    tz = ZoneInfo(plant.timezone)
    t0 = datetime.combine(d, t.day_start or time(7, 0), tzinfo=tz)
    t1 = t0 + timedelta(days=1)
    if t.frequency != "shift" or not t.shifts:
        return [("-", "", t0, t1)]
    starts = []
    for s in t.shifts:
        hh, mm = (int(x) for x in str(s.get("start", "07:00")).split(":")[:2])
        st = datetime.combine(d, time(hh, mm), tzinfo=tz)
        if st < t0:
            st += timedelta(days=1)
        starts.append((st, str(s["code"]), str(s.get("name") or s["code"])))
    starts.sort()
    return [(c, n, st, starts[i + 1][0] if i + 1 < len(starts) else t1) for i, (st, c, n) in enumerate(starts)]


def window_of(t: OpLogTemplate, plant: Plant, d: date, shift: str) -> tuple[datetime, datetime]:
    for c, _, a, b in windows(t, plant, d):
        if c == shift:
            return a, b
    raise ValueError("Unknown shift")


def fields_of(db: Session, template_id: uuid.UUID, active_only: bool = False) -> list[OpLogField]:
    q = select(OpLogField).where(OpLogField.template_id == template_id)
    if active_only:
        q = q.where(OpLogField.is_active.is_(True))
    return list(db.execute(q.order_by(OpLogField.sort, OpLogField.code)).scalars())


def previous_log(db: Session, log: OpLog) -> OpLog | None:
    return db.execute(
        select(OpLog)
        .where(
            OpLog.template_id == log.template_id,
            (OpLog.log_date < log.log_date) | ((OpLog.log_date == log.log_date) & (OpLog.shift < log.shift)),
        )
        .order_by(OpLog.log_date.desc(), OpLog.shift.desc())
        .limit(1)
    ).scalar_one_or_none()


def last_closings(db: Session, template_id: uuid.UUID, before: OpLog | None) -> dict[uuid.UUID, Decimal]:
    """Latest closing reading of every meter / counter line from the logs before this one (the next opening)."""
    q = select(OpLog.id).where(OpLog.template_id == template_id)
    if before is not None:
        q = q.where((OpLog.log_date < before.log_date) | ((OpLog.log_date == before.log_date) & (OpLog.shift < before.shift)))
    q = q.order_by(OpLog.log_date.desc(), OpLog.shift.desc()).limit(10)
    out: dict[uuid.UUID, Decimal] = {}
    for lid in db.execute(q).scalars():
        for v in db.execute(select(OpLogValue).where(OpLogValue.log_id == lid, OpLogValue.closing.is_not(None))).scalars():
            out.setdefault(v.field_id, v.closing)  # type: ignore[arg-type]
    return out


def compute(fields: list[OpLogField], values: dict[uuid.UUID, OpLogValue]) -> tuple[dict[str, dict], list[dict]]:
    """{field id: {value, opening, closing, text, flag}} and warnings."""
    out: dict[str, dict] = {}
    env: dict[str, float | None] = {}
    warnings: list[dict] = []
    for fl in fields:
        v = values.get(fl.id)
        row: dict = {
            "opening": f(v.opening) if v else None,
            "closing": f(v.closing) if v else None,
            "text": v.text if v else None,
            "value": None,
        }
        if fl.kind in READING_KINDS:
            if row["opening"] is not None and row["closing"] is not None:
                row["value"] = row["closing"] - row["opening"]
                if row["value"] < 0:
                    warnings.append({"code": "reading_down", "item": fl.label})
        elif fl.kind in ("number", "check"):
            row["value"] = f(v.value) if v else None
        out[str(fl.id)] = row
        env[fl.code] = row["value"]
    for _ in range(3):  # calc lines may use other calc lines
        for fl in fields:
            if fl.kind == "calc" and fl.formula:
                val = evaluate(fl.formula, env)
                out[str(fl.id)]["value"] = val
                env[fl.code] = val
    for fl in fields:
        val = out[str(fl.id)]["value"]
        flag = None
        if val is not None and fl.low is not None and val < float(fl.low):
            flag = "low"
        if val is not None and fl.high is not None and val > float(fl.high):
            flag = "high"
        out[str(fl.id)]["flag"] = flag
        if flag:
            warnings.append({"code": f"value_{flag}", "item": fl.label})
    return out, warnings


def values_of(db: Session, log_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict[uuid.UUID, OpLogValue]]:
    out: dict[uuid.UUID, dict[uuid.UUID, OpLogValue]] = {i: {} for i in log_ids}
    if log_ids:
        for v in db.execute(select(OpLogValue).where(OpLogValue.log_id.in_(log_ids))).scalars():
            out[v.log_id][v.field_id] = v
    return out


def averaged(fl: OpLogField) -> bool:
    """Is the line's day figure the average of the shifts (else their sum)? Set per line (day_agg); automatically:
    numbers and % lines are averaged, meters, counters and other calculated lines are added up."""
    if fl.day_agg in ("sum", "avg"):
        return fl.day_agg == "avg"
    return fl.kind == "number" or (fl.kind == "calc" and (fl.unit or "").strip() == "%")


def daily_series(db: Session, t: OpLogTemplate, d0: date, d1: date) -> dict[str, dict[str, float]]:
    """{field id: {date: value}} for the template's dashboard lines from d0 to d1. Shift logs: meters, counters and
    calc lines … are added up over the day's shifts, numbers are averaged, checks count the shifts ticked."""
    logs = list(db.execute(select(OpLog).where(OpLog.template_id == t.id, OpLog.log_date >= d0, OpLog.log_date <= d1)).scalars())
    fields = fields_of(db, t.id)
    vals = values_of(db, [x.id for x in logs])
    acc: dict[str, dict[str, list[float]]] = {}
    for lg in logs:
        calc, _ = compute(fields, vals[lg.id])
        for fl in fields:
            v = calc[str(fl.id)]["value"]
            if v is None or fl.kind == "text":
                continue
            acc.setdefault(str(fl.id), {}).setdefault(lg.log_date.isoformat(), []).append(v)
    out: dict[str, dict[str, float]] = {}
    for fl in fields:
        per = acc.get(str(fl.id), {})
        avg = averaged(fl)
        out[str(fl.id)] = {d: round(sum(xs) / len(xs) if avg else sum(xs), 4) for d, xs in per.items()}
    return out


def report_sections(db: Session, plant: Plant, d: date, dept_ok) -> list[dict]:
    """Log forms shown inside the paper machine's daily report (in_pm_report), for production day d: each shift's
    log (id, status) and, per line, the shifts' values and the day figure (sum; numbers and % averaged)."""
    out = []
    templates = db.execute(
        select(OpLogTemplate).where(OpLogTemplate.plant_id == plant.id, OpLogTemplate.in_pm_report.is_(True), OpLogTemplate.is_active.is_(True))
        .order_by(OpLogTemplate.sort)
    ).scalars()  # fmt: skip
    for t in templates:
        if not dept_ok(t.department_id):
            continue
        fields = [x for x in fields_of(db, t.id, active_only=True)]
        logs = {lg.shift: lg for lg in db.execute(select(OpLog).where(OpLog.template_id == t.id, OpLog.log_date == d)).scalars()}
        vals = values_of(db, [lg.id for lg in logs.values()])
        shifts = [w[0] for w in windows(t, plant, d)]
        per: dict[str, dict] = {}
        warn_n: dict[str, int] = {}
        for sh, lg in logs.items():
            calc, warns = compute(fields, vals[lg.id])
            per[sh] = calc
            warn_n[sh] = len(warns)
        lines = []
        for fl in fields:
            by_shift = {sh: (per[sh][str(fl.id)]["value"] if fl.kind != "text" else per[sh][str(fl.id)]["text"]) for sh in per}
            flags = {sh: per[sh][str(fl.id)]["flag"] for sh in per}
            nums = [v for v in by_shift.values() if isinstance(v, (int, float))]
            day = None
            if nums and fl.kind not in ("text", "check"):
                avg = averaged(fl)
                day = round(sum(nums) / len(nums) if avg else sum(nums), 4)
            lines.append({"id": str(fl.id), "section": fl.section, "label": fl.label, "kind": fl.kind, "unit": fl.unit, "decimals": fl.decimals,
                          "shifts": by_shift, "flags": flags, "day": day})  # fmt: skip
        out.append({
            "template": {"id": str(t.id), "code": t.code, "name": t.name, "frequency": t.frequency,
                         "shifts": [{"code": s["code"], "name": s.get("name") or s["code"]} for s in (t.shifts or [])] or [{"code": "-", "name": ""}]},
            "logs": {sh: {"id": str(lg.id), "status": lg.status.value, "warnings": warn_n.get(sh, 0)} for sh, lg in logs.items()},
            "shift_codes": shifts, "lines": lines,
        })  # fmt: skip
    return out
