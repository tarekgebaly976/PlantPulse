"""Codes are optional: left blank, a code is made from the name and kept unique where it must be (e.g. per plant)."""

from app.core.autocode import code_from_text
from tests.conftest import mk_asset


def test_code_from_text():
    assert code_from_text("Hydraulics", 30) == "HYD"
    assert code_from_text("Laser shaft alignment", 30) == "LSA"
    assert code_from_text("Line 2", 30) == "L2"
    assert code_from_text("Day", 8) == "DAY"
    assert code_from_text("Confined space entry and rescue", 30) == "CSER"
    assert code_from_text("الهيدروليك", 30) == ""


def test_blank_codes_are_made_from_the_name(world):
    eng, planner, admin = world.api("engineer"), world.api("planner"), world.api("admin")
    # Skills: from the name; the same name again gets a number; a typed code is kept as typed (upper case).
    assert eng.ok("post", "/skills", {"name": "Hydraulics"}, status=201)["code"] == "HYD"
    assert eng.ok("post", "/skills", {"name": "Hydraulic pumps"}, status=201)["code"] == "HP"
    assert eng.ok("post", "/skills", {"name": "Hydraulics"}, status=201)["code"] == "HYD2"
    assert eng.ok("post", "/skills", {"code": "own", "name": "Own code"}, status=201)["code"] == "OWN"
    assert eng.ok("post", "/skills", {"name": "الهيدروليك"}, status=201)["code"] == "SKL-001"
    # Assets: under a parent the parent's code comes first.
    line = mk_asset(planner, world, "PM1")
    unit = planner.ok("post", "/assets", {"name": "Press section", "department_id": str(world.depts["PM"].id), "parent_id": line["id"],
                                          "level": "unit", "criticality": "A"}, status=201)  # fmt: skip
    assert unit["code"] == "PM1-PS"
    # Job plans, shifts, warehouses, departments
    assert planner.ok("post", "/pm/job-plans", {"name": "Weekly gearbox inspection", "estimated_hours": 1, "tasks": []}, status=201)["code"] == "WGI"
    assert planner.ok("post", "/shifts/definitions", {"name": "Day", "kind": "day", "start_time": "06:00", "end_time": "14:00", "paid_hours": 8},
                      status=201)["code"] == "DAY"  # fmt: skip
    assert planner.ok("post", "/shifts/definitions", {"name": "Day", "kind": "day", "start_time": "06:00", "end_time": "14:00", "paid_hours": 8},
                      status=201)["code"] == "DAY2"  # fmt: skip
    # The same code may exist in another plant (codes are unique per plant).
    other = world.api("planner_b", world.plant_b)
    assert other.ok("post", "/pm/job-plans", {"name": "Weekly gearbox inspection", "estimated_hours": 1, "tasks": []}, status=201)["code"] == "WGI"
    assert admin.ok("post", "/departments", {"name": "Finishing house", "type": "PM"}, status=201)["code"]
