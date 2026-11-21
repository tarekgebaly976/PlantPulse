"""Paper waste, phase B: the winder's cutting plan. Small cases whose best answer is known by hand, the plan's life
(orders, calculate, release, reopen) and the rights."""

from datetime import UTC

import pytest

from app.core.config import get_settings
from app.services.cutting import Converter, Limits, Line, patterns, solve
from tests.conftest import World
from tests.test_operations import fill_day, setup_mill

LIM = Limits(deckle=3200, max_reels=6, min_trim=20, max_trim=250, min_width=300, change_cost_sets=0.5)


@pytest.fixture(autouse=True)
def _module_on():
    s = get_settings()
    before = s.operations_module
    s.operations_module = True
    yield
    s.operations_module = before


def test_patterns_respect_the_winder():
    pats, capped = patterns([1000, 1060], LIM)
    assert not capped
    # 3 × 1060 = 3180 (trim 20) fits; 3 × 1000 = 3000 (trim 200) fits; 1000 + 2 × 1060 = 3120 (trim 80) fits
    assert {(0, 3), (3, 0), (1, 2), (2, 1)} <= set(pats)
    assert all(3200 - 1000 * a - 1060 * b >= 20 for a, b in pats) and all(3200 - 1000 * a - 1060 * b <= 250 for a, b in pats)
    assert (1, 0) not in pats  # 2200 mm trim: more than the winder allows
    assert all(a + b <= 2 for a, b in patterns([1000, 1060], Limits(3200, 2, 20, 2000, 300, 0.5))[0])  # 2 reels a set at most


def test_known_best_plans():
    r = solve([Line("a", 1060, 30, 0, None)], LIM)
    assert (r["status"], r["sets"], r["patterns_used"], r["trim_mm_total"]) == ("optimal", 10, 1, 200)
    assert r["patterns"] == [{"widths": [1060, 1060, 1060], "sets": 10, "trim_mm": 20, "trim_pct": 0.0063}]
    # two widths that fill the jumbo together: 1500 + 1680 = 3180, one pattern, no extra reels
    r = solve([Line("a", 1500, 12, 0, None), Line("b", 1680, 12, 0, None)], LIM)
    assert (r["sets"], r["patterns_used"], r["trim_pct"]) == (12, 1, 0.0063) and r["orders"] == {"a": 12, "b": 12}
    # a tolerance lets the plan round to whole sets: 31 reels of 1060 (±5 %: 30 to 32) → 10 sets of three (30 reels);
    # a set of two would leave 1080 mm of trim
    r = solve([Line("a", 1060, 31, 5, None)], LIM)
    assert (r["patterns_used"], r["sets"], r["widths"][0]["made"]) == (1, 10, 30)
    # the earliest due date gets its reels first
    from datetime import date

    r = solve([Line("late", 1060, 15, 0, date(2026, 12, 9)), Line("soon", 1060, 15, 0, date(2026, 12, 1))], LIM)
    assert r["orders"] == {"soon": 15, "late": 15}


def test_impossible_orders_are_explained():
    assert solve([Line("a", 3190, 1, 0, None)], LIM)["problems"] == [{"code": "too_wide", "params": {"width": 3190, "max": 3180}}]
    assert solve([Line("a", 200, 1, 0, None)], LIM)["problems"][0]["code"] == "too_narrow"
    assert solve([], LIM)["problems"][0]["code"] == "no_orders"
    # 2000 mm alone leaves 1200 mm of trim, more than the winder allows; with no tolerance nothing else fits
    assert solve([Line("a", 2000, 4, 0, None)], LIM)["status"] == "infeasible"


def test_plan_life_and_rights(world: World):
    s = setup_mill(world)
    fill_day(world.api("production"), s)
    mgr = s["mgr"]
    mid = s["machine"]["id"]
    w = mgr.ok("get", "/operations/cutting/winders")
    assert w[0]["deckle_mm"] == 3200 and not w[0]["saved"]  # from the machine's trim width until saved
    assert mgr.ok("put", f"/operations/cutting/winders/{mid}", {"deckle_mm": 3200, "max_reels": 5, "min_trim_mm": 20, "max_trim_mm": 200})[
        "saved"
    ]
    mgr.ok("put", f"/operations/cutting/winders/{mid}", {"deckle_mm": 3200, "min_trim_mm": 300, "max_trim_mm": 200}, status=422)
    # production users see plans but do not make them
    assert world.api("production").post("/operations/cutting/plans", {"machine_id": mid, "title": "Week 49"}).status_code == 403
    p = mgr.ok("post", "/operations/cutting/plans", {"machine_id": mid, "grade_id": s["g400"]["id"], "title": "Week 49"}, status=201)
    assert p["status"] == "draft" and p["grade"] == "400"
    p = mgr.ok("put", f"/operations/cutting/plans/{p['id']}/orders", {"orders": [
        {"customer": "A", "width_mm": 1500, "reels": 12, "due_date": "2026-12-01"},
        {"customer": "B", "width_mm": 1680, "reels": 12, "tolerance_pct": 10},
    ]})  # fmt: skip
    assert p["orders_count"] == 2 and p["reels"] == 24
    p = mgr.ok("post", f"/operations/cutting/plans/{p['id']}/calculate")
    assert p["status"] == "calculated" and p["result"]["sets"] == 12 and p["trim_pct"] == 0.0063
    assert [o["made"] for o in p["orders"]] == [12, 12]
    # the actual trim of the grade over the last 4 weeks sits beside it (the sample day is older: none)
    assert set(p["baseline"]) == {"from", "to", "machine_trim_pct", "grade_trim_pct"}
    assert world.api("viewer").ok("get", "/operations/cutting/plans")[0]["sets"] == 12
    # released: locked until reopened; changing the orders makes the result out of date
    mgr.ok("post", f"/operations/cutting/plans/{p['id']}/release")
    assert mgr.put(f"/operations/cutting/plans/{p['id']}/orders", {"orders": []}).status_code == 409
    mgr.ok("post", f"/operations/cutting/plans/{p['id']}/reopen")
    p = mgr.ok("put", f"/operations/cutting/plans/{p['id']}/orders", {"orders": [{"width_mm": 3300, "reels": 1}]})
    assert p["status"] == "draft" and p["result"] == {}
    p = mgr.ok("post", f"/operations/cutting/plans/{p['id']}/calculate")
    assert p["status"] == "draft" and p["result"]["problems"][0]["code"] == "too_wide"
    mgr.ok("delete", f"/operations/cutting/plans/{p['id']}", status=204)


SH = Converter("sh1", "SH1", "sheeter", 500, 1700, 400, 1600, 10, 250, 30, 1)
RW = Converter("rw1", "RW1", "rewinder", 600, 2600, None, None, 10, 800, 20, 1)


def test_sheet_orders_choose_their_parent_reel_with_the_winder():
    lim = Limits(3200, 6, 20, 250, 300, 0.5, set_length_m=6000)  # one set: 6000 m → 6000 sheets 1 m long per strip
    # 1050 mm sheets, one across: parent reels of 1060 mm (the sheeter trims 10 mm), three to a set (trim 20 mm)
    r = solve([Line("s", 1050, 54000, 5, None, "sheet", 1000)], lim, units=[SH])
    assert (r["status"], r["sets"], r["orders"]) == ("optimal", 3, {"s": 54000})
    assert r["routes"] == [{"order": "s", "unit": "sh1", "unit_code": "SH1", "parent_width": 1060, "across": 1, "reels": 9, "made": 54000,
                            "side_trim_mm": 10}]  # fmt: skip
    assert r["trim_mm_total"] == 60 and r["converting_trim_mm_total"] == 90 and r["total_trim_pct"] == round(150 / (3200 * 3), 4)
    assert r["load"] == [{"unit": "sh1", "code": "SH1", "kind": "sheeter", "reels": 9, "sizes": 1, "hours": 3.6}]  # 9 × 6000 m at 250 m/min
    # sheets and reels on the same jumbo: the sheet order's parent reels share the sets with the reel orders
    r = solve([Line("s", 700, 60000, 5, None, "sheet", 1000), Line("w", 1000, 20, 10, None), Line("x", 750, 30, 10, None)], lim, units=[SH])
    assert r["status"] in ("optimal", "feasible") and 57000 <= r["orders"]["s"] <= 63000 and 18 <= r["orders"]["w"] <= 22
    assert {rt["parent_width"] for rt in r["routes"] if rt["order"] == "s"} <= {710, 1410, 2110}
    assert all(20 <= p["trim_mm"] <= 250 for p in r["patterns"])
    # the set length is needed, and a sheet the sheeters cannot cut is said so
    no_len = Limits(3200, 6, 20, 250, 300, 0.5)
    assert solve([Line("s", 700, 100, 0, None, "sheet", 1000)], no_len, units=[SH])["problems"][0]["code"] == "no_set_length"
    assert solve([Line("s", 700, 100, 0, None, "sheet", 2000)], lim, units=[SH])["problems"][0]["code"] == "no_sheeter"


def test_a_narrow_reel_goes_through_the_rewinder():
    lim = Limits(3200, 6, 20, 250, 700, 0.5)  # the winder makes nothing under 700 mm
    r = solve([Line("n", 320, 39, 5, None), Line("w", 1000, 20, 10, None), Line("v", 1200, 10, 20, None)], lim, units=[RW])
    assert r["status"] == "optimal" and r["orders"]["n"] == 39
    n = [rt for rt in r["routes"] if rt["order"] == "n"]
    assert n == [
        {"order": "n", "unit": "rw1", "unit_code": "RW1", "parent_width": 970, "across": 3, "reels": 13, "made": 39, "side_trim_mm": 10}
    ]
    assert solve([Line("n", 320, 40, 5, None)], lim)["problems"][0]["code"] == "too_narrow"  # no rewinder: impossible


def test_converting_units_and_sheet_orders_in_a_plan(world: World):
    s = setup_mill(world)
    mgr = s["mgr"]
    mid = s["machine"]["id"]
    mgr.ok("put", f"/operations/cutting/winders/{mid}", {"deckle_mm": 3200, "set_length_m": 6000})
    unit = {"machine_id": mid, "code": "SH2", "name": "Sheeter 2", "kind": "sheeter", "min_width_mm": 500, "max_width_mm": 1700,
            "min_length_mm": 400, "max_length_mm": 1600, "side_trim_mm": 10, "speed_mpm": 250, "change_minutes": 30}  # fmt: skip
    assert world.api("production").post("/operations/cutting/converters", unit).status_code == 403
    sh = mgr.ok("post", "/operations/cutting/converters", unit, status=201)
    assert mgr.post("/operations/cutting/converters", unit).status_code == 409  # the code is taken
    mgr.ok("post", "/operations/cutting/converters", {**unit, "code": "RW1", "name": "Rewinder", "kind": "rewinder", "min_width_mm": 600,
                                                      "max_width_mm": 2600}, status=201)  # fmt: skip
    w = mgr.ok("get", "/operations/cutting/winders")[0]
    assert w["set_length_m"] == 6000 and [c["code"] for c in w["converters"]] == ["RW1", "SH2"]
    assert next(c for c in w["converters"] if c["code"] == "RW1")["max_length_mm"] is None
    p = mgr.ok("post", "/operations/cutting/plans", {"machine_id": mid, "title": "Sheets"}, status=201)
    bad = {"orders": [{"kind": "sheet", "width_mm": 700, "reels": 60000}]}
    assert mgr.put(f"/operations/cutting/plans/{p['id']}/orders", bad).status_code == 422  # no sheet length
    p = mgr.ok("put", f"/operations/cutting/plans/{p['id']}/orders", {"orders": [
        {"customer": "Print house", "kind": "sheet", "width_mm": 1050, "sheet_length_mm": 1000, "reels": 54000, "tolerance_pct": 5,
         "converter_id": sh["id"]},
        {"customer": "Converter", "width_mm": 1000, "reels": 20, "tolerance_pct": 10},
    ]})  # fmt: skip
    assert p["orders"][0]["kind"] == "sheet" and p["orders"][0]["sheet_length_mm"] == 1000 and p["orders"][1]["sheet_length_mm"] is None
    p = mgr.ok("post", f"/operations/cutting/plans/{p['id']}/calculate")
    assert p["status"] == "calculated", p["result"]
    assert {rt["unit_code"] for rt in p["result"]["routes"]} == {"SH2", None}
    assert 51300 <= p["orders"][0]["made"] <= 56700 and p["result"]["load"][0]["code"] == "SH2"
    sc = p["result"]["schedule"]  # the sheeter's work is timed from the plan's start
    assert sc["status"] in ("optimal", "feasible") and sc["jobs"][0]["unit_code"] == "SH2" and sc["jobs"][0]["start"]
    p = mgr.ok("put", f"/operations/cutting/plans/{p['id']}", {"title": "Sheets", "start_at": "2026-12-01T06:00:00"})
    from datetime import datetime

    assert p["status"] == "draft"  # a new start time makes the result out of date
    assert datetime.fromisoformat(p["start_at"]).astimezone(UTC).isoformat() == "2026-12-01T03:00:00+00:00"  # read as plant time (UTC+3)
    p = mgr.ok("post", f"/operations/cutting/plans/{p['id']}/calculate")
    assert p["result"]["schedule"]["start"] == "2026-12-01T06:00+03:00"


def test_converting_schedule_spreads_orders_over_the_units_and_keeps_due_dates():
    from datetime import date, datetime
    from zoneinfo import ZoneInfo

    from app.services.cutting import schedule

    tz = ZoneInfo("Asia/Riyadh")
    lim = Limits(3200, 6, 20, 250, 300, 0.5, set_length_m=6000)
    units = [Converter(f"s{i}", f"SH{i}", "sheeter", 500, 1700, 400, 1600, 10, 250, 30, 1) for i in (1, 2)]
    # two sheet orders of the same parent reel size (1060 mm); the earlier due one must come first, the big one is split
    lines = [
        Line("late", 1050, 108000, 0, date(2026, 11, 25), "sheet", 1000),
        Line("soon", 1050, 54000, 0, date(2026, 11, 22), "sheet", 1000),
    ]
    r = solve(lines, lim, units=units)
    assert r["status"] in ("optimal", "feasible") and r["orders"] == {"late": 108000, "soon": 54000}
    start = datetime(2026, 11, 22, 7, 0, tzinfo=tz)
    sc = schedule(r, lines, units, lim.set_length_m, start, tz)
    assert sc["status"] in ("optimal", "feasible") and sc["late_orders"] == 0
    jobs = sc["jobs"]
    assert sum(j["reels"] for j in jobs if j["order"] == "late") == 18 and sum(j["reels"] for j in jobs if j["order"] == "soon") == 9
    assert {j["unit_code"] for j in jobs} == {"SH1", "SH2"}  # both sheeters work
    # 27 reels × 6000 m at 250 m/min = 648 min of work over two units: about 5.4 h each, well under the one-unit 10.8 h
    assert sc["hours"] <= 6.5 and all(u["busy_h"] > 0 for u in sc["units"])
    # every job of a unit after the previous one (one unit does one thing at a time)
    for u in ("SH1", "SH2"):
        mine = sorted((j for j in jobs if j["unit_code"] == u), key=lambda j: j["start_min"])
        assert all(a["end_min"] <= b["start_min"] for a, b in zip(mine, mine[1:], strict=False))
    # a unit with no speed cannot be timed: the job says so
    slow = [Converter("s9", "SH9", "sheeter", 500, 1700, 400, 1600, 10, None, 30, 1)]
    r = solve([Line("x", 1050, 54000, 0, None, "sheet", 1000)], lim, units=slow)
    assert schedule(r, [Line("x", 1050, 54000, 0, None, "sheet", 1000)], slow, 6000, start, tz)["unplaced"][0]["code"] == "no_unit_speed"


def test_suggestions_when_no_plan_is_possible():
    lim = Limits(3200, 6, 20, 250, 300, 0.5, set_length_m=6000)
    sheeter = [Converter("s1", "SH1", "sheeter", 500, 1700, 400, 1600, 10, 250, 30, 1)]
    # three tiny sheet orders (a 6000 m parent reel gives thousands of sheets): each is far smaller than one reel, and
    # even one reel of each (710 + 1110 + 610 mm) leaves 750 mm free: add a 750 mm order
    lines = [
        Line("a", 700, 100, 1, None, "sheet", 1000),
        Line("b", 600, 70, 1, None, "sheet", 800),
        Line("c", 1100, 80, 2, None, "sheet", 1000),
    ]
    r = solve(lines, lim, units=sheeter)
    assert r["status"] == "infeasible"
    s = {(x["code"], x["order"]): x["params"] for x in r["suggestions"]}
    assert s[("small", "a")] == {"step": 6000, "nearest": 6000, "kind": "sheet"} and s[("small", "b")]["step"] == 7500
    assert s[("filler", None)]["width"] == 750 and s[("filler", None)]["after_steps"] is True
    # close to a whole reel: change the quantity or the tolerance
    r = solve([Line("a", 700, 6200, 1, None, "sheet", 1000)], lim, units=sheeter)
    assert next(x for x in r["suggestions"] if x["code"] == "step")["params"] == {
        "step": 6000,
        "nearest": 6000,
        "tolerance": 3.3,
        "kind": "sheet",
    }
    # widths that only fit with a looser tolerance on one order
    r = solve([Line("a", 2000, 4, 0, None), Line("b", 1000, 20, 0, None)], lim)
    assert [x["code"] for x in r["suggestions"]] == ["widen_tolerance"] and r["suggestions"][0]["order"] == "b"
    assert "suggestions" not in solve([Line("a", 1060, 30, 0, None)], lim)  # a plan: nothing to suggest
