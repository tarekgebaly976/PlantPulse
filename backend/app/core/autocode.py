"""Automatic codes: anything with a `code` that is saved with the code left blank gets one made from its name, unique
where the code has to be unique (e.g. per plant). "Hydraulics" → HYD, "Laser shaft alignment" → LSA, "Line 2" → L2;
an asset under a parent gets the parent's code in front (PM1 → PM1-PRS). A name with no Latin letters or digits
(e.g. only Arabic) gives a numbered code from the kind of record (SKL-001, AST-001 …). Typed codes are never changed."""

import re
import unicodedata
from typing import Any

from sqlalchemy import String, UniqueConstraint, event, func, inspect, select
from sqlalchemy.orm import Session

_SOURCES = ("name", "description", "title", "component")
_STOP = {"AND", "OF", "THE", "FOR", "WITH", "A", "AN", "TO", "IN", "ON", "&"}
_PREFIX = {
    "skill_definitions": "SKL", "assets": "AST", "parts": "PRT", "job_plans": "JP", "pm_plans": "PM", "departments": "DEP",
    "lubricants": "LUB", "lube_routes": "RT", "lubrication_points": "LP", "shift_definitions": "S", "shift_patterns": "PAT",
    "teams": "TM", "warehouses": "WH", "failure_codes": "FC", "shutdowns": "SD", "shutdown_packages": "PKG",
}  # fmt: skip
# Codes used as names in formulas: a letter first, then letters, digits and "_" only.
_IDENTIFIER = {"op_kpis", "op_alert_rules", "op_loss_categories", "op_disciplines"}


def code_from_text(text: str, max_len: int) -> str:
    """Letters for a code: one word → its first 3 letters, several → their initials (numbers kept whole)."""
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    words = [w for w in re.split(r"[^A-Za-z0-9]+", ascii_text.upper()) if w]
    words = [w for w in words if w not in _STOP] or words
    if not words:
        return ""
    if len(words) == 1:
        w = words[0]
        return (w if w.isdigit() or len(w) <= 4 else w[:3])[:max_len]
    out = "".join(w if w.isdigit() else w[0] for w in words[:5])
    return out[:max_len]


def _max_len(obj: Any) -> int:
    col = inspect(type(obj)).columns.get("code")
    length = getattr(col.type, "length", None) if col is not None and isinstance(col.type, String) else None
    return int(length or 40)


def _scope(obj: Any) -> list[str]:
    """Columns the code is unique together with (e.g. plant_id), from the table's unique constraints."""
    table = inspect(type(obj)).local_table
    for c in table.constraints:
        if isinstance(c, UniqueConstraint) and "code" in c.columns.keys():
            return [k for k in c.columns.keys() if k != "code"]
    col = table.c.get("code")
    if col is not None and col.unique:
        return []
    return [k for k in ("plant_id", "organization_id") if k in table.c]


def _taken(db: Session, obj: Any, scope: list[str], base: str) -> set[str]:
    model = type(obj)
    q = select(model.code).where(func.upper(model.code).like(f"{base.upper()}%"))
    for k in scope:
        q = q.where(getattr(model, k) == getattr(obj, k))
    with db.no_autoflush:
        return {str(c).upper() for c in db.execute(q).scalars()}


def make_code(db: Session, obj: Any, pending: set[tuple]) -> str:
    max_len = _max_len(obj)
    table = inspect(type(obj)).local_table.name
    text = next((str(getattr(obj, s)) for s in _SOURCES if getattr(obj, s, None)), "")
    base = code_from_text(text, max_len)
    numbered = not base
    if numbered:
        base = _PREFIX.get(table, table[:3].upper())
    parent_id = getattr(obj, "parent_id", None)
    if table == "assets" and parent_id is not None:
        with db.no_autoflush:
            parent = db.get(type(obj), parent_id)
        if parent is not None and parent.code and len(parent.code) + 1 + len(base) <= max_len:
            base = f"{parent.code}-{base}"
    ident = table in _IDENTIFIER
    if ident:
        base = re.sub(r"[^A-Za-z0-9_]", "_", base)
        base = base if base[:1].isalpha() else f"K{base}"
    scope = _scope(obj)
    key = tuple(getattr(obj, k) for k in scope)
    taken = _taken(db, obj, scope, base) | {c for k, c in pending if k == key}
    if not numbered and base.upper() not in taken:
        return base
    sep = ("_" if ident else "-") if numbered or base[-1].isdigit() else ""
    for n in range(1 if numbered else 2, 10000):
        cand = f"{base}{sep}{n:03d}" if numbered else f"{base}{sep}{n}"
        cand = cand[-max_len:] if len(cand) > max_len else cand
        if cand.upper() not in taken:
            return cand
    raise ValueError("could not make a unique code")


@event.listens_for(Session, "before_flush")
def _fill_codes(db: Session, _ctx: Any, _instances: Any) -> None:
    pending: set[tuple] = set()
    for obj in db.new:
        if "code" not in inspect(type(obj)).columns:
            continue
        if getattr(obj, "code", None):
            continue
        code = make_code(db, obj, pending)
        obj.code = code
        pending.add((tuple(getattr(obj, k) for k in _scope(obj)), code.upper()))
