"""Industry-independent production core: a generic discrete line (invented "assembly" sample, counted in pieces),
products with ideal rates, output lines, configurable loss categories, KPIs (standard and custom, missing data),
alert rules (open, notify, acknowledge, resolve), actions and insights, templates and form-builder field types.

Hand-worked sample day (past day, so 24 planned hours): two shifts, 10 h + 9 h run; product A at 100 pcs/h ideal;
produced 900 + 800 = 1700, reject 20 + 30 = 50, downgrade 0 + 10; good = 1640, net = 1700, ideal = 1900;
availability 19/24 = 79.17 %, performance 1700/1900 = 89.47 %, quality 1640/1700 = 96.47 %, OEE = 68.33 %."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.core.config import get_settings
from tests.conftest import World, mk_asset

DAY = "2026-11-05"


@pytest.fixture(autouse=True)
def _module_on():
    s = get_settings()
    before = s.operations_module
    s.operations_module = True
    yield
    s.operations_module = before


def _yesterday() -> str:
    now = datetime.now(ZoneInfo("Asia/Riyadh")) - timedelta(hours=7)  # production day starts 07:00
    return (now.date() - timedelta(days=1)).isoformat()


def setup_line(world: World) -> dict:
    mgr = world.api("manager")
    added = mgr.ok("post", "/operations/templates/general/apply")
    assert added["loss_categories"] == 10 and added["kpis"] == 8 and added["alert_rules"] == 5
    assert mgr.ok("post", "/operations/templates/general/apply") == {"loss_categories": 0, "kpis": 0, "alert_rules": 0}  # only what is missing
    line = mk_asset(mgr, world, "AL1")
    m = mgr.ok("post", "/operations/machines", {
        "code": "AL1", "name": "Assembly line 1", "department_id": str(world.depts["PM"].id), "asset_id": line["id"],
        "production_model": "discrete", "output_unit": "pcs", "report_profile": "generic", "day_start": "07:00",
        "shifts": [{"code": "D", "name": "Day", "start": "07:00"}, {"code": "N", "name": "Night", "start": "19:00"}],
    }, status=201)  # fmt: skip
    pa = mgr.ok("post", "/operations/products", {"code": "A-100", "name": "Sample product A", "ideal_rate_per_h": 100, "attributes": {"colour": "blue"}}, status=201)
    mech = mgr.ok("post", "/operations/disciplines", {"code": "MECH", "name": "Mechanical", "maintenance": True}, status=201)["id"]
    cats = {c["code"]: c for c in mgr.ok("get", "/operations/loss-categories")}
    return {"mgr": mgr, "m": m, "pa": pa, "mech": mech, "cats": cats, "line": line}


def fill(api, s: dict, day: str = DAY) -> str:
    rid = api.ok("post", "/operations/reports", {"machine_id": s["m"]["id"], "report_date": day}, status=201)["id"]
    out = f"/operations/reports/{rid}/outputs"
    o1 = api.ok("post", out, {"shift": "D", "product_id": s["pa"]["id"], "order_ref": "PO-1", "run_hours": 10, "planned_qty": 1000,
                              "produced_qty": 900, "reject_qty": 20}, status=201)  # fmt: skip
    assert o1["good_qty"] == 880 and o1["ideal_qty"] == 1000 and o1["ideal_rate_per_h"] == 100
    api.ok("post", out, {"shift": "N", "product_id": s["pa"]["id"], "order_ref": "PO-2", "run_hours": 9, "planned_qty": 1000,
                         "produced_qty": 800, "reject_qty": 30, "downgrade_qty": 10, "completed": False}, status=201)  # fmt: skip
    nxt = (datetime.fromisoformat(day) + timedelta(days=1)).date().isoformat()
    st = f"/operations/reports/{rid}/stops"
    api.ok("post", st, {"started_at": f"{day}T17:00:00", "ended_at": f"{day}T19:00:00", "loss_category_id": s["cats"]["EQUIP"]["id"],
                        "parts": [{"discipline_id": s["mech"]}], "reason": "Press fault"}, status=201)  # fmt: skip
    api.ok("post", st, {"started_at": f"{nxt}T04:00:00", "ended_at": f"{nxt}T07:00:00", "loss_category_id": s["cats"]["CHANGEOVER"]["id"]}, status=201)
    return rid


def test_generic_line_report_figures(world: World):
    s = setup_line(world)
    sup = world.api("production")
    rid = fill(sup, s)
    rep = sup.ok("get", f"/operations/reports/{rid}")
    c = rep["calc"]
    assert c["profile"] == "generic" and c["unit"] == "pcs"
    d = c["day"]
    assert (d["produced"], d["good"], d["reject"], d["downgrade"], d["net"]) == (1700, 1640, 50, 10, 1700)
    assert d["planned_qty"] == 2000 and d["target_pct"] == 0.85 and d["batches"] == 2 and d["batches_completed"] == 1
    assert c["run_hours"] == 19 and c["ideal"] == 1900
    o = c["oee"]
    assert (o["availability"], o["performance"], o["quality"], o["oee"]) == (0.7917, 0.8947, 0.9647, 0.6833)
    m = c["measures"]
    assert m["failure_hours"] == 2 and m["failures"] == 1 and m["stops"] == 2 and m["loss_EQUIP"] == 2 and m["loss_CHANGEOVER"] == 3
    assert m["input_qty"] is None  # not recorded: stays None, never 0
    stops = rep["stops"]
    assert {x["loss_category_id"] for x in stops} == {s["cats"]["EQUIP"]["id"], s["cats"]["CHANGEOVER"]["id"]}
    assert next(x for x in stops if x["loss_category_id"] == s["cats"]["EQUIP"]["id"])["is_failure"] is True
    assert c["warnings"] == []
    # paper-only rows are refused on a generic line, a stop needs a category
    sup.ok("post", f"/operations/reports/{rid}/reels", {"shift": "D", "reel_no": "1", "gross_mt": 1, "net_mt": 1}, status=422)
    sup.ok("post", f"/operations/reports/{rid}/stops", {"started_at": f"{DAY}T08:00:00", "ended_at": f"{DAY}T08:30:00"}, status=422)
    sup.ok("post", f"/operations/reports/{rid}/outputs", {"produced_qty": 5, "reject_qty": 6}, status=422)
    # confirm → production record in the line's unit
    mgr = s["mgr"]
    mgr.ok("post", f"/operations/reports/{rid}/confirm")
    lst = sup.ok("get", "/operations/reports", params={"machine_id": s["m"]["id"], "month": "2026-11"})
    assert lst["items"][0]["gross"] == 1700 and lst["items"][0]["a"] == 1640 and lst["mtd"]["measures"]["produced"] == 1700


def test_kpis_standard_custom_missing(world: World):
    s = setup_line(world)
    mgr = s["mgr"]
    day = _yesterday()
    fill(world.api("production"), s, day)
    # custom KPI over a daily-log line: energy per piece
    t = mgr.ok("post", "/operations/log-templates", {"code": "EN", "name": "Energy", "department_id": str(world.depts["PM"].id), "machine_id": s["m"]["id"]}, status=201)
    mgr.ok("post", f"/operations/log-templates/{t['id']}/fields", {"section": "Power", "code": "KWH", "label": "Line energy", "kind": "number",
                                                                    "unit": "kWh", "per_ton": True}, status=201)  # fmt: skip
    mgr.ok("post", f"/operations/log-templates/{t['id']}/fields", {"section": "Power", "code": "produced", "label": "x", "kind": "number"}, status=422)
    lg = mgr.ok("post", "/operations/logs", {"template_id": t["id"], "log_date": day}, status=201)
    fid = mgr.ok("get", "/operations/log-templates")[0]["fields"][0]["id"]
    mgr.ok("put", f"/operations/logs/{lg['id']}/values", {"values": [{"field_id": fid, "value": 3400}]})
    mgr.ok("post", "/operations/kpis", {"code": "KWH_PC", "name": "Energy per piece", "formula": "KWH / net", "unit": "kWh/pcs", "direction": "lower",
                                        "target": 1.5, "warn": 2.5, "critical": 4}, status=201)  # fmt: skip
    mgr.ok("post", "/operations/kpis", {"code": "BAD", "name": "x", "formula": "nope * 2"}, status=422)
    mgr.ok("post", "/operations/kpis", {"code": "BAD2", "name": "x", "formula": "good", "direction": "higher", "target": 1, "warn": 5}, status=422)
    mgr.ok("post", "/operations/kpis/library/YIELD", status=201)
    res = {k["code"]: k for k in mgr.ok("get", "/operations/kpi-results", params={"machine_id": s["m"]["id"]})}
    assert res["OEE"]["values"]["day"]["value"] == pytest.approx(68.33, abs=0.01)
    assert res["OEE"]["values"]["day"]["status"] == "off_target"  # target 75, warning 65: 68.3 misses the target only
    assert res["KWH_PC"]["values"]["day"]["value"] == 2 and res["KWH_PC"]["values"]["day"]["status"] == "off_target"
    assert res["YIELD"]["values"]["day"] == {"value": None, "status": "missing", "missing": ["input_qty"]}
    assert res["PRODUCTION"]["unit"] == "pcs"
    kpis = mgr.ok("get", "/operations/kpis")
    assert any(v["code"] == "KWH" and v["kind"] == "log" for v in kpis["variables"])
    assert next(k for k in kpis["items"] if k["code"] == "OEE")["standard"] is True


def test_alerts_actions_insights(world: World):
    s = setup_line(world)
    mgr = s["mgr"]
    day = _yesterday()
    fill(world.api("production"), s, day)
    mgr.ok("post", "/operations/alert-rules", {"code": "LOW_GOOD", "name": "Good output low", "source_kind": "measure", "source_code": "good",
                                               "condition": "below", "threshold": 2000, "severity": "critical", "notify_role": "production_user"}, status=201)  # fmt: skip
    mgr.ok("post", "/operations/alert-rules", {"code": "X", "name": "x", "source_kind": "measure", "source_code": "nope", "condition": "below", "threshold": 1}, status=422)
    mgr.ok("post", "/operations/alert-rules", {"code": "Y", "name": "y", "source_kind": "measure", "source_code": "good", "condition": "below"}, status=422)
    r = mgr.ok("post", "/operations/alerts/evaluate")
    assert r["opened"] >= 1
    alerts = mgr.ok("get", "/operations/alerts")
    low = next(a for a in alerts if a["rule"]["code"] == "LOW_GOOD")
    assert low["status"] == "open" and low["severity"] == "critical" and low["value"] == 1640
    note = world.api("production").ok("get", "/notifications")
    items = note["items"] if isinstance(note, dict) else note
    assert any("Good output low" in n["title"] for n in items)
    assert mgr.ok("post", "/operations/alerts/evaluate")["opened"] == 0  # same alert updated, not duplicated
    # action from the alert acknowledges it; overdue action rule
    sup = world.api("production")
    sup.ok("post", "/operations/actions", {"title": "Check the press", "alert_id": low["id"], "due_date": "2026-01-01", "source": "alert"}, status=201)
    low = next(a for a in mgr.ok("get", "/operations/alerts") if a["rule"]["code"] == "LOW_GOOD")
    assert low["status"] == "acknowledged" and low["line"] is None
    acts = mgr.ok("get", "/operations/actions")
    assert acts["items"][0]["overdue"] is True and acts["items"][0]["source"] == "alert"
    mgr.ok("post", "/operations/alerts/evaluate")
    assert any(a["rule"]["code"] == "ACTIONS_LATE" for a in mgr.ok("get", "/operations/alerts"))
    # threshold lowered: the condition no longer holds → resolved
    rule = next(x for x in mgr.ok("get", "/operations/alert-rules")["items"] if x["code"] == "LOW_GOOD")
    mgr.ok("put", f"/operations/alert-rules/{rule['id']}", {**{k: v for k, v in rule.items() if k != "id"}, "threshold": 100})
    assert mgr.ok("post", "/operations/alerts/evaluate")["resolved"] >= 1
    # insights: generic, no paper terms needed
    ins = mgr.ok("get", "/operations/insights")
    kinds = {i["kind"] for i in ins["items"]}
    assert {"maintenance_loss", "overdue_actions", "low_target"} <= kinds
    # dashboard of a generic line
    dash = mgr.ok("get", "/operations/dashboard", params={"machine_id": s["m"]["id"]})
    assert dash["profile"] == "generic" and dash["unit"] == "pcs" and dash["production"][-1]["gross"] == 1700 and dash["production"][-1]["breaks"] is None
    assert dash["period"]["loss_by_category"]["Changeover"] == 3 and any(k["code"] == "OEE" for k in dash["kpis"])


def test_config_and_form_fields(world: World):
    mgr = world.api("manager")
    cfg = mgr.ok("get", "/operations/config")
    assert cfg["features"]["insights"] is True and {t["key"] for t in cfg["templates"]} >= {"general", "paper_mill"}
    cfg = mgr.ok("put", "/operations/config", {"industry": "Food (sample)", "features": {"logs": False}, "labels": {"reports": "Shift production report"}})
    assert cfg["features"]["logs"] is False and cfg["labels"] == {"reports": "Shift production report"}
    world.api("production").ok("put", "/operations/config", {}, status=403)
    st = mgr.ok("get", "/operations/setup")
    assert st["counts"]["lines"] == 0 and st["config"]["industry"] == "Food (sample)"
    # form builder: select / multi with options, required lines block submit
    t = mgr.ok("post", "/operations/log-templates", {"code": "QC", "name": "Quality checks", "department_id": str(world.depts["PM"].id)}, status=201)
    base = f"/operations/log-templates/{t['id']}/fields"
    mgr.ok("post", base, {"section": "QC", "code": "ST", "label": "Status", "kind": "select", "options": ["OK"]}, status=422)
    st_id = mgr.ok("post", base, {"section": "QC", "code": "ST", "label": "Status", "kind": "select", "options": ["OK", "Hold"], "required": True}, status=201)["id"]
    ck_id = mgr.ok("post", base, {"section": "QC", "code": "CK", "label": "Checklist", "kind": "multi", "options": ["Guards", "Labels", "Seals"]}, status=201)["id"]
    lot = mgr.ok("post", base, {"section": "QC", "code": "LOT", "label": "Lot", "kind": "ref"}, status=201)["id"]
    lg = mgr.ok("post", "/operations/logs", {"template_id": t["id"], "log_date": DAY}, status=201)
    mgr.ok("post", f"/operations/logs/{lg['id']}/submit", status=422)  # required line empty
    mgr.ok("put", f"/operations/logs/{lg['id']}/values", {"values": [{"field_id": st_id, "text": "Bad"}]}, status=422)
    mgr.ok("put", f"/operations/logs/{lg['id']}/values", {"values": [{"field_id": st_id, "text": "Hold"}, {"field_id": ck_id, "text": '["Guards", "Seals"]'},
                                                                     {"field_id": lot, "text": "LOT-7"}]})  # fmt: skip
    got = mgr.ok("get", f"/operations/logs/{lg['id']}")["values"]
    assert got[st_id]["text"] == "Hold" and got[ck_id]["text"] == '["Guards", "Seals"]'
    mgr.ok("post", f"/operations/logs/{lg['id']}/submit")
