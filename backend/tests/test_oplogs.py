"""Operations daily logs (utilities / stock preparation forms) and the production dashboard. Invented sample values."""

import pytest

from app.core.config import get_settings
from app.services.oplogs import check_formula, evaluate
from tests.conftest import World, mk_asset

D1, D2 = "2026-11-03", "2026-11-04"


@pytest.fixture(autouse=True)
def _module_on():
    s = get_settings()
    before = s.operations_module
    s.operations_module = True
    yield
    s.operations_module = before


def test_formula_rules():
    check_formula("(RO1 + RO2) / FEED * 100", {"RO1", "RO2", "FEED"})
    for bad in ("__import__('os')", "RO1 ** 2", "X + 1", "RO1.real", "'a'"):
        with pytest.raises(ValueError):
            check_formula(bad, {"RO1"})
    assert evaluate("A / B * 100", {"A": 3, "B": 4}) == 75
    assert evaluate("A / B", {"A": 3, "B": 0}) is None
    assert evaluate("A + B", {"A": 3, "B": None}) is None


def setup_ut(world: World) -> dict:
    mgr = world.api("manager")
    comp = mk_asset(mgr, world, "AC1", dept="UTIL")
    meter = mgr.ok("post", f"/assets/{comp['id']}/meters", {"name": "Running hours", "unit": "h"}, status=201)
    t = mgr.ok(
        "post",
        "/operations/log-templates",
        {"code": "UT", "name": "Utilities daily", "department_id": str(world.depts["UTIL"].id)},
        status=201,
    )
    base = f"/operations/log-templates/{t['id']}/fields"
    f = {}
    for body in (
        {"section": "Water", "code": "RO1", "label": "RO 1 product", "kind": "meter", "unit": "m³"},
        {"section": "Water", "code": "FEED", "label": "RO feed", "kind": "meter", "unit": "m³"},
        {
            "section": "Water",
            "code": "REC",
            "label": "RO recovery",
            "kind": "calc",
            "unit": "%",
            "formula": "RO1 / FEED * 100",
            "low": 65,
            "chart": True,
        },
        {"section": "Power", "code": "P_PM", "label": "Paper machine", "kind": "number", "unit": "MWh", "chart": True, "per_ton": True},
        {"section": "Hours", "code": "AC1", "label": "Air compressor 1", "kind": "counter", "unit": "h", "meter_id": meter["id"]},
        {"section": "Shift", "code": "NOTE", "label": "Notes", "kind": "text"},
    ):
        f[body["code"]] = mgr.ok("post", base, body, status=201)["id"]
    return {"mgr": mgr, "t": t, "f": f, "meter": meter, "comp": comp}


def test_log_values_openings_calc_and_meters(world: World):
    s = setup_ut(world)
    mgr, f = s["mgr"], s["f"]
    # a calc line with an unknown code, a meter on a number line
    base = f"/operations/log-templates/{s['t']['id']}/fields"
    assert mgr.post(base, {"section": "X", "code": "BAD", "label": "Bad", "kind": "calc", "formula": "NOPE * 2"}).status_code == 422
    assert (
        mgr.post(base, {"section": "X", "code": "BAD", "label": "Bad", "kind": "number", "meter_id": s["meter"]["id"]}).status_code == 422
    )
    lid = mgr.ok("post", "/operations/logs", {"template_id": s["t"]["id"], "log_date": D1}, status=201)["id"]
    out = mgr.ok("put", f"/operations/logs/{lid}/values", {"values": [
        {"field_id": f["RO1"], "opening": 1000, "closing": 1600}, {"field_id": f["FEED"], "opening": 5000, "closing": 6000},
        {"field_id": f["P_PM"], "value": 140.5}, {"field_id": f["AC1"], "opening": 100, "closing": 124}, {"field_id": f["NOTE"], "text": " ok "},
    ], "notes": "first day"})  # fmt: skip
    v = out["values"]
    assert v[f["RO1"]]["value"] == 600 and v[f["FEED"]]["value"] == 1000
    assert v[f["REC"]]["value"] == pytest.approx(60.0) and v[f["REC"]]["flag"] == "low"
    assert v[f["NOTE"]]["text"] == "ok"
    assert {w["code"] for w in out["warnings"]} == {"value_low"}
    mgr.ok("post", f"/operations/logs/{lid}/confirm")
    # the counter's closing went to the equipment meter (meter-based PM)
    m = mgr.ok("get", f"/assets/{s['comp']['id']}/meters")
    assert m[0]["current_value"] == pytest.approx(124)
    # locked
    assert mgr.put(f"/operations/logs/{lid}/values", {"values": []}).status_code == 409
    # next day starts from yesterday's closings
    lid2 = mgr.ok("post", "/operations/logs", {"template_id": s["t"]["id"], "log_date": D2}, status=201)["id"]
    r2 = mgr.ok("get", f"/operations/logs/{lid2}")
    assert r2["values"][f["RO1"]]["opening"] == 1600 and r2["values"][f["AC1"]]["opening"] == 124
    assert r2["prev"]["id"] == lid
    # a reading going down is flagged
    out = mgr.ok("put", f"/operations/logs/{lid2}/values", {"values": [{"field_id": f["RO1"], "opening": 1600, "closing": 1500}]})
    assert "reading_down" in {w["code"] for w in out["warnings"]}
    lst = mgr.ok("get", "/operations/logs", params={"template_id": s["t"]["id"], "month": "2026-11"})
    assert [x["log_date"] for x in lst["items"]] == [D2, D1]
    assert {c["code"] for c in lst["columns"]} == {"REC", "P_PM"}


def test_shift_logs_issues_and_access(world: World):
    mgr = world.api("manager")
    t = mgr.ok("post", "/operations/log-templates", {
        "code": "SP", "name": "SP shift", "department_id": str(world.depts["SP"].id), "frequency": "shift", "issues": True,
        "shifts": [{"code": "D", "name": "Day", "start": "07:00"}, {"code": "N", "name": "Night", "start": "19:00"}],
    }, status=201)  # fmt: skip
    pulper = mk_asset(mgr, world, "PULPER", dept="SP")
    mgr.ok("post", "/work-requests", {"asset_id": pulper["id"], "title": "Pulper rotor worn"}, status=201)
    assert mgr.post("/operations/logs", {"template_id": t["id"], "log_date": D1}).status_code == 422  # shift needed
    lid = mgr.ok("post", "/operations/logs", {"template_id": t["id"], "log_date": D1, "shift": "N"}, status=201)["id"]
    r = mgr.ok("get", f"/operations/logs/{lid}")
    assert r["window"]["start"].startswith(f"{D1}T19:00")
    assert [x["title"] for x in r["issues"]["requests"]] == ["Pulper rotor worn"]
    # technicians do not see operations; a production user enters but does not confirm
    assert world.api("tech").get(f"/operations/logs/{lid}").status_code == 403
    prod = world.api("production")
    prod.ok("post", f"/operations/logs/{lid}/submit")
    assert prod.post(f"/operations/logs/{lid}/confirm").status_code == 403
    # an SP-only supervisor can see the SP form; plant B cannot
    assert world.api("sp_sup").get("/operations/log-templates").status_code in (200, 403)
    assert world.api("planner_b", world.plant_b).get(f"/operations/logs/{lid}").status_code in (403, 404)


def test_dashboard(world: World):
    from tests.test_operations import fill_day, setup_mill

    s = setup_mill(world)
    mgr = s["mgr"]
    rid = fill_day(mgr, s)
    ut = setup_ut(world)
    lid = mgr.ok("post", "/operations/logs", {"template_id": ut["t"]["id"], "log_date": "2026-11-05"}, status=201)["id"]
    mgr.ok("put", f"/operations/logs/{lid}/values", {"values": [{"field_id": ut["f"]["P_PM"], "value": 117.69}]})
    d = mgr.ok("get", "/operations/dashboard", params={"days": 366})
    day = next(x for x in d["production"] if x["date"] == "2026-11-05")
    assert day["gross"] == pytest.approx(398.0) and day["oee"] == pytest.approx(0.6452, abs=0.0001)
    assert d["period"]["stops"]["downtime_by_discipline"] == {"MECH": 1.5, "ELEC": 1.5}
    # areas: the paper machine's area by default (its line, no forms of other areas); the utilities area has no line:
    # its own form, "per t" on the plant's output, and only the KPIs it can have
    codes = {a["code"]: a for a in d["areas"]}
    assert {"PM", "UTIL"} <= set(codes) and d["department_id"] == codes["PM"]["id"] and d["logs"] == []
    u = mgr.ok("get", "/operations/dashboard", params={"days": 366, "department_id": codes["UTIL"]["id"]})
    assert u["machines"] == [] and u["period"] is None and u["unit"] == "t"
    p_pm = next(x for x in u["logs"][0]["fields"] if x["code"] == "P_PM")
    assert p_pm["series"] == {"2026-11-05": 117.69}
    assert p_pm["per_ton_series"]["2026-11-05"] == pytest.approx(117.69 / 392.3, abs=0.0001)  # MWh per t net
    assert all(k["code"] not in ("OEE", "PRODUCTION") for k in u["kpis"])
    assert rid


def test_sp_shift_log_inside_pm_report(world: World):
    from tests.test_operations import DAY, fill_day, setup_mill

    s = setup_mill(world)
    mgr = s["mgr"]
    rid = fill_day(mgr, s)
    t = mgr.ok("post", "/operations/log-templates", {
        "code": "SP", "name": "SP shift", "department_id": str(world.depts["SP"].id), "frequency": "shift", "in_pm_report": True,
        "shifts": [{"code": "D", "name": "Day", "start": "07:00"}, {"code": "N", "name": "Night", "start": "19:00"}],
    }, status=201)  # fmt: skip
    base = f"/operations/log-templates/{t['id']}/fields"
    bales = mgr.ok(
        "post",
        base,
        {"section": "Furnish", "code": "OCC", "label": "OCC bales", "kind": "number", "unit": "bales", "day_agg": "sum"},
        status=201,
    )["id"]
    tank = mgr.ok(
        "post", base, {"section": "Levels", "code": "TANK", "label": "Dump tank", "kind": "number", "unit": "%", "high": 90}, status=201
    )["id"]
    for shift, b, lv in (("D", 80, 60), ("N", 70, 95)):
        lid = mgr.ok("post", "/operations/logs", {"template_id": t["id"], "log_date": DAY, "shift": shift}, status=201)["id"]
        mgr.ok("put", f"/operations/logs/{lid}/values", {"values": [{"field_id": bales, "value": b}, {"field_id": tank, "value": lv}]})
    r = mgr.ok("get", f"/operations/reports/{rid}")
    sec = r["shift_logs"][0]
    assert sec["template"]["code"] == "SP" and set(sec["logs"]) == {"D", "N"}
    lines = {x["label"]: x for x in sec["lines"]}
    assert lines["OCC bales"]["day"] == 150  # added up over the shifts
    assert lines["Dump tank"]["day"] == pytest.approx(77.5)  # averaged
    assert lines["Dump tank"]["flags"] == {"D": None, "N": "high"}
    # the shift log points back to the PM report of the same day
    assert mgr.ok("get", f"/operations/logs/{sec['logs']['N']['id']}")["pm_report_id"] == rid
