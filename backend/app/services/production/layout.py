"""Production dashboard layout: which sections each view shows (whole mill, each area), in which order, and which
KPIs. Set once per plant by the production manager or the administrator (op.manage) and the same for everyone who
sees the dashboard; a view never customised shows every section and the KPIs marked "show on dashboard"."""

import uuid

from sqlalchemy.orm import Session

from app.services.production import templates as tpl

MILL = "mill"
SECTIONS = {
    MILL: ("areas", "kpis", "production", "losses", "safety", "follow_up"),
    "area": ("kpis", "summary", "charts", "logs"),
}


def kind(scope: str) -> str:
    return MILL if scope == MILL else "area"


def normalise(scope: str, raw: dict | None) -> dict:
    """Known sections in the saved order (new sections appended, shown), KPI ids or None (= the default KPIs)."""
    known = SECTIONS[kind(scope)]
    raw = raw or {}
    seen: list[dict] = []
    for s in raw.get("sections") or []:
        if isinstance(s, dict) and s.get("id") in known and all(x["id"] != s["id"] for x in seen):
            seen.append({"id": s["id"], "on": bool(s.get("on", True))})
    seen += [{"id": k, "on": True} for k in known if all(x["id"] != k for x in seen)]
    kpis = raw.get("kpis")
    return {"sections": seen, "kpis": [str(k) for k in kpis] if isinstance(kpis, list) else None, "custom": bool(raw)}


def get(db: Session, plant_id: uuid.UUID, scope: str) -> dict:
    return normalise(scope, (tpl.config(db, plant_id).dashboard or {}).get(scope))


def put(db: Session, plant_id: uuid.UUID, scope: str, sections: list[dict] | None, kpis: list[str] | None) -> dict:
    c = tpl.config(db, plant_id)
    d = dict(c.dashboard or {})
    if sections is None and kpis is None:
        d.pop(scope, None)  # back to the default
    else:
        n = normalise(scope, {"sections": sections or [], "kpis": kpis})
        d[scope] = {"sections": n["sections"], "kpis": n["kpis"]}
    c.dashboard = d
    db.flush()
    return get(db, plant_id, scope)
