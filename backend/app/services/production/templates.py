"""Industry templates: starting points for a plant's production setup (loss categories, KPIs with targets, alert
rules, which features to show and what the menu entries are called). Applying a template only adds what is missing
(by code) — it never changes or removes what the plant already configured, and everything stays editable.

Templates are data, not code paths: the engine never asks which template a plant uses. "general" suits any
continuous, batch or discrete plant; "paper_mill" is the configuration of the paper mill demo. Future templates
(food, plastics, metals …) are new entries here."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.production import OpAlertRule, OpKpi, OpLossCategory, OpPlantConfig
from app.services.production.kpis import LIBRARY_BY_CODE

FEATURES = ("reports", "logs", "dashboard", "kpis", "alerts", "insights", "actions")

# (code, name, affects, event_type, planned, failure, parent)
GENERAL_LOSSES = [
    ("EQUIP", "Equipment failure", "availability", "breakdown", False, True, None),
    ("PROCESS", "Process interruption", "availability", "other", False, False, None),
    ("MATERIAL", "Material shortage", "availability", "other", False, False, None),
    ("QUALITY", "Quality issue", "quality", "other", False, False, None),
    ("OPERATOR", "Operator-related interruption", "availability", "other", False, False, None),
    ("PLANNED", "Planned maintenance", "availability", "planned", True, False, None),
    ("CHANGEOVER", "Changeover", "availability", "other", False, False, None),
    ("SPEED", "Reduced speed", "performance", "other", False, False, None),
    ("UTILITY", "Utility interruption", "availability", "other", False, False, None),
    ("OTHER", "Other", "availability", "other", False, False, None),
]

# (kpi code, target, warn, critical, decimals)
GENERAL_KPIS = [
    ("OEE", 75, 65, 50, 1),
    ("AVAILABILITY", 90, 85, 75, 1),
    ("PERFORMANCE", 90, 85, 75, 1),
    ("QUALITY", 98, 96, 93, 1),
    ("PRODUCTION", None, None, None, 1),
    ("SCRAP", 2, 3, 5, 2),
    ("DOWNTIME", None, None, None, 2),
    ("MAINT_LOSS", 2, 4, 8, 2),
]

GENERAL_RULES = [
    {"code": "OEE_LOW", "name": "OEE below its limits", "source_kind": "kpi", "source_code": "OEE", "condition": "kpi_limits", "periods": 2,
     "severity": "warning", "notify_role": "production_manager", "escalate_after_days": 3, "escalate_role": "management_viewer"},
    {"code": "SCRAP_UP", "name": "Scrap rate rising", "source_kind": "kpi", "source_code": "SCRAP", "condition": "trend_up", "threshold": 20,
     "lookback_days": 14, "severity": "warning", "notify_role": "production_manager"},
    {"code": "STOPS_REPEAT", "name": "Repeated stops", "source_kind": "measure", "source_code": "stops", "condition": "total_above", "threshold": 10,
     "lookback_days": 7, "severity": "warning", "notify_role": "production_supervisor"},
    {"code": "FAILURE_TIME", "name": "Equipment failure time high", "source_kind": "measure", "source_code": "failure_hours", "condition": "total_above",
     "threshold": 8, "lookback_days": 7, "severity": "critical", "notify_role": "maintenance_manager"},
    {"code": "ACTIONS_LATE", "name": "Production actions overdue", "source_kind": "none", "source_code": None, "condition": "action_overdue",
     "threshold": 0, "severity": "warning", "notify_role": "production_manager"},
]  # fmt: skip

PAPER_LOSSES = [
    ("SHEETBREAK", "Sheet break", "availability", "sheet_break", False, False, None),
    ("GRADECHANGE", "Grade change", "availability", "other", False, False, "CHANGEOVER"),
    ("WASHUP", "Wash-up / felt or wire change", "availability", "planned", True, False, "PLANNED"),
]
PAPER_KPIS_EXTRA = [
    {"code": "BREAKS", "name": "Sheet breaks", "formula": "breaks", "unit": "", "direction": "lower", "target": 6, "warn": 10, "critical": 15, "decimals": 0,
     "description": "Number of sheet breaks"},
    {"code": "STEAM_T", "name": "Steam per tonne", "formula": "STEAM / net", "unit": "t/t", "direction": "lower", "decimals": 2,
     "description": "Steam consumption per tonne of net paper"},
    {"code": "TRIM", "name": "Trim loss", "formula": "trim / produced * 100", "unit": "%", "direction": "lower", "target": 3, "warn": 4, "critical": 6, "decimals": 2,
     "description": "Machine trim ÷ gross production"},
]  # fmt: skip
PAPER_RULES = [
    {"code": "BREAKS_HIGH", "name": "Sheet breaks above limit", "source_kind": "kpi", "source_code": "BREAKS", "condition": "kpi_limits", "periods": 2,
     "severity": "warning", "notify_role": "production_manager"},
]  # fmt: skip

TEMPLATES: dict[str, dict] = {
    "general": {"name": "General manufacturing", "losses": GENERAL_LOSSES, "kpis": GENERAL_KPIS, "extra_kpis": [], "rules": GENERAL_RULES,
                "labels": {}},
    "paper_mill": {"name": "Paper mill", "losses": GENERAL_LOSSES + PAPER_LOSSES, "kpis": GENERAL_KPIS, "extra_kpis": PAPER_KPIS_EXTRA,
                   "rules": GENERAL_RULES + PAPER_RULES, "labels": {"reports": "PM & SP daily report", "logs": "Utilities daily report"}},
}  # fmt: skip


def config(db: Session, plant_id: uuid.UUID) -> OpPlantConfig:
    c = db.get(OpPlantConfig, plant_id)
    if c is None:
        c = OpPlantConfig(plant_id=plant_id, features={k: True for k in FEATURES}, labels={}, setup_done=False)
        db.add(c)
        db.flush()
    return c


def apply(db: Session, plant_id: uuid.UUID, key: str) -> dict:
    """Add the template's loss categories, KPIs and alert rules the plant does not have yet. Returns counts."""
    tpl = TEMPLATES[key]
    added = {"loss_categories": 0, "kpis": 0, "alert_rules": 0}
    have = {c.code: c for c in db.execute(select(OpLossCategory).where(OpLossCategory.plant_id == plant_id)).scalars()}
    for i, (code, name, affects, ev, planned, failure, parent) in enumerate(tpl["losses"]):
        if code in have:
            continue
        c = OpLossCategory(plant_id=plant_id, code=code, name=name, affects=affects, event_type=ev, planned=planned, failure=failure,
                           parent_id=have[parent].id if parent and parent in have else None, sort=(i + 1) * 10)  # fmt: skip
        db.add(c)
        db.flush()
        have[code] = c
        added["loss_categories"] += 1
    kpis = {row for (row,) in db.execute(select(OpKpi.code).where(OpKpi.plant_id == plant_id)).all()}
    sort = 10
    for code, target, warn, crit, dec in tpl["kpis"]:
        sort += 10
        if code in kpis:
            continue
        lib = LIBRARY_BY_CODE[code]
        db.add(OpKpi(plant_id=plant_id, code=code, name=lib["name"], description=lib["description"], formula=lib["formula"], unit=lib["unit"],
                     direction=lib["direction"], target=target, warn=warn, critical=crit, decimals=dec, standard=True, sort=sort))  # fmt: skip
        added["kpis"] += 1
    for k in tpl["extra_kpis"]:
        sort += 10
        if k["code"] in kpis:
            continue
        db.add(OpKpi(plant_id=plant_id, standard=False, sort=sort, **k))
        added["kpis"] += 1
    rules = {row for (row,) in db.execute(select(OpAlertRule.code).where(OpAlertRule.plant_id == plant_id)).all()}
    for r in tpl["rules"]:
        if r["code"] in rules:
            continue
        db.add(OpAlertRule(plant_id=plant_id, **r))
        added["alert_rules"] += 1
    c = config(db, plant_id)
    c.template = key
    c.labels = {**tpl["labels"], **(c.labels or {})}
    db.flush()
    return added
