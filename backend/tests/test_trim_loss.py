"""Paper waste (trim loss), phase A: the analysis of the waste already in the production reports, checked against
figures worked out by hand from the sample day of test_operations (gross 398 t, saleable 382.8 t, reject 9.5 t,
trim 5.7 t) and a small sheeter day (1700 packs, 50 rejected, one size change)."""

import pytest

from app.core.config import get_settings
from tests.conftest import World, mk_asset
from tests.test_operations import DAY, fill_day, setup_mill


@pytest.fixture(autouse=True)
def _module_on():
    s = get_settings()
    before = s.operations_module
    s.operations_module = True
    yield
    s.operations_module = before


def test_paper_machine_waste_by_grade_week_and_cause(world: World):
    s = setup_mill(world)
    fill_day(world.api("production"), s)
    r = world.api("viewer").ok("get", "/operations/trim-loss", params={"from": "2026-11-01", "to": "2026-11-07"})
    assert (r["from"], r["to"]) == ("2026-11-01", "2026-11-07")
    pm = next(m for m in r["machines"] if m["code"] == "PM1")
    assert pm["kind"] == "paper" and pm["deckle_m"] == 3.2 and pm["days"] == 1
    t = pm["totals"]
    assert (t["reels"], t["gross"], t["saleable"], t["reject"], t["trim"], t["waste"]) == (
        4,
        398.0,
        382.8,
        9.5,
        pytest.approx(5.7),
        pytest.approx(15.2),
    )
    assert t["trim_pct"] == pytest.approx(5.7 / 398, abs=1e-4) and t["waste_pct"] == pytest.approx(15.2 / 398, abs=1e-4)
    g = {x["grade"]: x for x in pm["by_grade"]}
    assert (g["400"]["gross"], g["400"]["trim"], g["400"]["reject"]) == (168.0, pytest.approx(3.7), 1.5)
    assert (g["300"]["gross"], g["300"]["trim"], g["300"]["reject"], g["300"]["gsm"]) == (230.0, pytest.approx(2.0), 8.0, 300)
    assert [w["week"] for w in pm["by_week"]] == ["2026-11-01"]  # the week starts on Sunday
    assert {x["shift"]: x["gross"] for x in pm["by_shift"]} == {"D": 168.0, "N": 230.0}
    assert pm["worst_days"][0]["date"] == DAY
    # the trim first, then the quality losses, biggest first
    assert [(c["kind"], c["cause"], c["qty"]) for c in pm["causes"]] == [
        ("trim", None, pytest.approx(5.7)),
        ("reject", "Machine start-up", 8.0),
        ("downgrade", "Rough surface", 7.8),
        ("reject", "Rough surface", 1.5),
    ]
    assert "reel_width" in pm["gaps"] and "trim_split" in pm["gaps"] and "deckle" not in pm["gaps"]
    # another period: nothing
    empty = world.api("viewer").ok("get", "/operations/trim-loss", params={"from": "2026-10-01", "to": "2026-10-31"})
    assert next(m for m in empty["machines"] if m["code"] == "PM1")["totals"]["gross"] == 0
    world.api("viewer").ok("get", "/operations/trim-loss", params={"from": "2026-11-07", "to": "2026-11-01"}, status=422)


def test_sheeter_waste_by_size_and_size_changes(world: World):
    mgr = world.api("manager")
    line = mk_asset(mgr, world, "SH1")
    m = mgr.ok("post", "/operations/machines", {
        "code": "SH1", "name": "Sheeter 1", "department_id": str(world.depts["PM"].id), "asset_id": line["id"],
        "production_model": "discrete", "output_unit": "packs", "report_profile": "generic", "day_start": "07:00",
        "shifts": [{"code": "D", "name": "Day", "start": "07:00"}, {"code": "N", "name": "Night", "start": "19:00"}],
    }, status=201)  # fmt: skip
    a = mgr.ok(
        "post",
        "/operations/products",
        {"code": "PK-70100", "name": "70 × 100", "machine_id": m["id"], "attributes": {"size": "70 × 100 cm"}},
        status=201,
    )
    b = mgr.ok(
        "post",
        "/operations/products",
        {"code": "PK-65090", "name": "65 × 90", "machine_id": m["id"], "attributes": {"size": "65 × 90 cm"}},
        status=201,
    )
    sup = world.api("production")
    rid = sup.ok("post", "/operations/reports", {"machine_id": m["id"], "report_date": DAY}, status=201)["id"]
    out = f"/operations/reports/{rid}/outputs"
    sup.ok("post", out, {"shift": "D", "product_id": a["id"], "started_at": f"{DAY}T07:00:00", "ended_at": f"{DAY}T17:00:00",
                         "produced_qty": 900, "reject_qty": 20}, status=201)  # fmt: skip
    sup.ok("post", out, {"shift": "N", "product_id": b["id"], "started_at": f"{DAY}T19:00:00", "ended_at": f"{DAY}T23:00:00",
                         "produced_qty": 800, "reject_qty": 30, "downgrade_qty": 10}, status=201)  # fmt: skip
    sup.ok("post", f"/operations/reports/{rid}/losses", {"kind": "reject", "defect_text": "Size change", "qty_mt": 30})
    r = world.api("viewer").ok("get", "/operations/trim-loss", params={"from": "2026-11-01", "to": "2026-11-07", "machine_id": m["id"]})
    assert [x["code"] for x in r["machines"]] == ["SH1"]
    sh = r["machines"][0]
    assert sh["kind"] == "converting" and sh["unit"] == "packs"
    t = sh["totals"]
    assert (t["produced"], t["reject"], t["downgrade"], t["changes"]) == (1700, 50, 10, 1)
    assert t["waste_pct"] == pytest.approx(50 / 1700, abs=1e-4) and t["input"] is None
    sizes = {x["size"]: x for x in sh["by_product"]}
    assert sizes["70 × 100 cm"]["waste_pct"] == pytest.approx(20 / 900, abs=1e-4) and sizes["65 × 90 cm"]["changes"] == 1
    assert sh["causes"] == [{"kind": "reject", "cause": "Size change", "qty": 30.0, "pct": pytest.approx(30 / 1700, abs=1e-4)}]
    assert "sheeter_input" in sh["gaps"]
