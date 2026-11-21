"""Paper waste, phase B: the winder's cutting plan. Small cases whose best answer is known by hand, the plan's life
(orders, calculate, release, reopen) and the rights."""

import pytest

from app.core.config import get_settings
from app.services.cutting import Limits, Line, patterns, solve
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
