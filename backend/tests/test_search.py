"""Search: the top-bar search over every module (permissions and departments respected), and word / Arabic matching
in the lists."""

from tests.conftest import mk_asset


def test_global_search_groups_permissions_and_departments(world):
    planner, admin = world.api("planner"), world.api("admin")
    pump = planner.ok(
        "post",
        "/assets",
        {"code": "PUMP-301", "name": "Cooling water pump", "department_id": str(world.depts["PM"].id), "level": "production_line",
         "criticality": "A", "name_ar": "مضخة مياه التبريد", "location": "Cooling tower"},
        status=201,
    )  # fmt: skip
    sp = mk_asset(planner, world, "SP-FAN-9", dept="SP")
    wo = planner.ok("post", "/work-orders", {"asset_id": pump["id"], "type": "corrective", "title": "Seal leaking"}, status=201)
    admin.ok("post", "/inventory/parts", {"code": "BRG-6205", "description": "Bearing 6205 2RS", "uom": "EA"}, status=201)

    r = planner.ok("get", "/search", params={"q": "pump"})
    kinds = {g["kind"]: g["items"] for g in r["groups"]}
    assert kinds["asset"][0]["title"].startswith("PUMP-301")
    assert any(i["title"].startswith(wo["number"]) for i in kinds["work_order"])  # found through its equipment
    # several words, each anywhere: "seal" in the title and "301" in the equipment code
    r = planner.ok("get", "/search", params={"q": "seal 301"})
    assert [i["id"] for g in r["groups"] if g["kind"] == "work_order" for i in g["items"]] == [wo["id"]]
    # exact work-order number comes first
    r = planner.ok("get", "/search", params={"q": wo["number"]})
    assert r["groups"][0]["kind"] == "work_order" and r["groups"][0]["items"][0]["id"] == wo["id"]
    # Arabic, with a different spelling of alef (اْ / أ) and taa marbuta (ة / ه)
    r = planner.ok("get", "/search", params={"q": "مضخه"})
    assert any(i["id"] == pump["id"] for g in r["groups"] if g["kind"] == "asset" for i in g["items"])
    # parts only for users with inventory.view; production users see no parts group
    assert any(g["kind"] == "part" for g in planner.ok("get", "/search", params={"q": "6205"})["groups"])
    assert not any(g["kind"] == "part" for g in world.api("production").ok("get", "/search", params={"q": "6205"})["groups"])
    # an SP-only supervisor finds SP equipment but not the PM pump or its work order
    sp_sup = world.api("sp_sup")
    found = {i["id"] for g in sp_sup.ok("get", "/search", params={"q": "PUMP"})["groups"] for i in g["items"]}
    assert pump["id"] not in found and wo["id"] not in found
    assert any(i["id"] == sp["id"] for g in sp_sup.ok("get", "/search", params={"q": "FAN"})["groups"] for i in g["items"])
    # other plant: nothing
    assert world.api("planner_b", world.plant_b).ok("get", "/search", params={"q": "PUMP"})["groups"] == []
    # % and _ are literal, one letter is too short
    assert planner.ok("get", "/search", params={"q": "%"})["groups"] == []
    assert planner.ok("get", "/search", params={"q": "P_MP"})["groups"] == []


def test_list_search_words_and_new_filters(world):
    planner, sup = world.api("planner"), world.api("mech_sup")
    a = mk_asset(planner, world, "MIX-7")
    planner.ok("patch", f"/assets/{a['id']}", {"location": "Hall B", "oem": "Siemens"})
    assert planner.ok("get", "/assets", params={"q": "siemens hall"})["total"] == 1
    assert planner.ok("get", "/assets", params={"q": "siemens hall C"})["total"] == 0
    wo = planner.ok("post", "/work-orders", {"asset_id": a["id"], "type": "corrective", "title": "Gearbox noise"}, status=201)
    assert planner.ok("get", "/work-orders", params={"q": "MIX-7 noise"})["total"] == 1
    req = world.api("production").ok("post", "/work-requests", {"asset_id": a["id"], "title": "Oil leak under gearbox"}, status=201)
    assert sup.ok("get", "/work-requests", params={"q": "leak"})["total"] == 1
    assert sup.ok("get", "/work-requests", params={"q": "MIX-7"})["items"][0]["id"] == req["id"]
    assert sup.ok("get", "/work-requests", params={"q": "nothing-like-this"})["total"] == 0
    assert wo["number"]
