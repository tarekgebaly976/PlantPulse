"""Text search used by every list and by the search box in the top bar.

Each word typed must be found (in any of the searched columns), so "pump 3 bearing" finds "Pump 3 – DE bearing".
Matching ignores case. Arabic letters that are often typed differently (أ إ آ ا, ة ه, ى ي) match each other."""

import re
from typing import Any

from sqlalchemy import ColumnElement, and_, func, or_, select

from app.models.assets import Asset

# Arabic spelling variants folded to one letter, on both sides of the comparison.
_FOLD_FROM = "أإآىة"
_FOLD_TO = "ااايه"


def fold(text: str) -> str:
    return text.translate(str.maketrans(_FOLD_FROM, _FOLD_TO)).lower()


def words(q: str | None) -> list[str]:
    """The words of a search (max 6, each at most 60 characters)."""
    if not q:
        return []
    return [w[:60] for w in re.split(r"\s+", q.strip()) if w][:6]


def _col(c: Any) -> Any:
    return func.lower(func.translate(func.coalesce(c, ""), _FOLD_FROM, _FOLD_TO))


def _like(c: Any, word: str) -> ColumnElement[bool]:
    """`word` inside column `c`; `%` and `_` typed by the user are matched literally. A word of 1-2 characters must start
    a word ("OS" finds "OS1", "Insp 1" finds "Insp 1", but not the 1 inside "WO-P1-000123")."""
    f = fold(word)
    if len(f) <= 2:
        return _col(c).op("~")(rf"(^|[^[:alnum:]]){re.escape(f)}")
    w = f.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return _col(c).like(f"%{w}%", escape="\\")


def match(q: str | None, *cols: Any) -> ColumnElement[bool] | None:
    """SQL condition: every word is in at least one of `cols`. None when nothing was typed."""
    ws = words(q)
    if not ws:
        return None
    return and_(*[or_(*[_like(c, w) for c in cols]) for w in ws])


def asset_ids_matching(q: str | None, plant_id: Any) -> Any:
    """Sub-select of the assets whose code / name matches, to find records by their equipment."""
    cond = match(q, Asset.code, Asset.name, Asset.name_ar)
    return select(Asset.id).where(Asset.plant_id == plant_id, cond if cond is not None else Asset.id.is_(None))


def where_text(stmt: Any, q: str | None, *cols: Any, asset_col: Any = None, plant_id: Any = None) -> Any:
    """Add the search to a query. With `asset_col`, a record also matches through its equipment's code or name
    (a whole search like "PUMP-3" or each word separately, e.g. "PUMP-3 bearing")."""
    ws = words(q)
    if not ws:
        return stmt
    if asset_col is None:
        cond = match(q, *cols)
        return stmt.where(cond) if cond is not None else stmt
    per_word = []
    for w in ws:
        in_asset = asset_col.in_(
            select(Asset.id).where(Asset.plant_id == plant_id, or_(_like(Asset.code, w), _like(Asset.name, w), _like(Asset.name_ar, w)))
        )
        per_word.append(or_(*[_like(c, w) for c in cols], in_asset))
    return stmt.where(and_(*per_word))
