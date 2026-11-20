"""Skill matrix: the engineer keeps the plant's skills and the technicians' levels and certificates; a work order (or the
job plan it comes from) can require skills, and assigning someone who does not meet them is a warning that needs force."""

from datetime import date, timedelta

from app.services.common import plant_today
from tests.conftest import mk_asset


def _skill(api, code, **kw):
    body = {"code": code, "name": f"{code} skill", "category": "equipment"} | kw
    return api.ok("post", "/skills", body, status=201)


def test_who_may_keep_the_matrix(world):
    eng, mgr, planner, tech = world.api("engineer"), world.api("manager"), world.api("planner"), world.api("tech")
    hyd = _skill(eng, "hyd", name="Hydraulics", name_ar="الهيدروليك", trade="mechanical")
    assert hyd["code"] == "HYD"
    assert eng.post("/skills", {"code": "HYD", "name": "Again"}).status_code == 409
    _skill(mgr, "HV", category="safety", needs_certificate=True)
    assert planner.post("/skills", {"code": "X1", "name": "Nope"}).status_code == 403
    assert tech.post("/skills", {"code": "X2", "name": "Nope"}).status_code == 403
    tid = world.users["tech"].id
    assert planner.put(f"/skills/matrix/{tid}/{hyd['id']}", {"level": 2}).status_code == 403
    # Everyone who sees shifts can read the matrix; a skill of another plant is not found here.
    assert tech.get("/skills/matrix").status_code == 200
    other = world.api("planner_b", world.plant_b)
    assert other.get("/skills").json() == []
    eng.ok("patch", f"/skills/{hyd['id']}", {"is_active": False})
    assert [s["code"] for s in eng.get("/skills").json()] == ["HV"]
    assert {s["code"] for s in eng.get("/skills", params={"active": False}).json()} == {"HV", "HYD"}


def test_matrix_levels_certificates_and_coverage(world):
    eng = world.api("engineer")
    today = plant_today(world.plant)
    hyd = _skill(eng, "HYD")
    hv = _skill(eng, "HV", category="safety", needs_certificate=True)
    t1, t2 = world.users["tech"].id, world.users["tech2"].id
    assert eng.ok("put", f"/skills/matrix/{t1}/{hyd['id']}", {"level": 3})["status"] == "valid"
    assert eng.ok("put", f"/skills/matrix/{t2}/{hyd['id']}", {"level": 1})["status"] == "valid"
    soon = (today + timedelta(days=10)).isoformat()
    assert eng.ok("put", f"/skills/matrix/{t1}/{hv['id']}", {"level": 2, "certified_until": soon})["status"] == "expiring"
    assert eng.ok("put", f"/skills/matrix/{t2}/{hv['id']}", {"level": 2})["status"] == "no_certificate"
    assert eng.put(f"/skills/matrix/{t2}/{hv['id']}", {"level": 4}).status_code == 422
    m = eng.ok("get", "/skills/matrix")
    names = {p["name"] for p in m["people"]}
    assert {"Tech", "Tech2", "Engineer", "Mech_Sup"} <= names and "Store" not in names  # field people by default
    assert "Store" in {p["name"] for p in eng.ok("get", "/skills/matrix", params={"everyone": True})["people"]}
    cov = m["coverage"]
    assert cov[hyd["id"]] == 1  # only level 2+ counts: tech2 is level 1
    assert cov[hv["id"]] == 1  # tech2 has no certificate date
    eng.ok("put", f"/skills/matrix/{t1}/{hv['id']}", {"level": 2, "certified_until": (today - timedelta(days=1)).isoformat()})
    cells = {(c["user_id"], c["skill_id"]): c for c in eng.ok("get", "/skills/matrix")["cells"]}
    assert cells[(str(t1), hv["id"])]["status"] == "expired"
    assert eng.delete(f"/skills/matrix/{t2}/{hyd['id']}").status_code == 204
    assert (str(t2), hyd["id"]) not in {(c["user_id"], c["skill_id"]) for c in eng.ok("get", "/skills/matrix")["cells"]}


def test_required_skills_warn_on_assignment(world):
    planner, eng, sup = world.api("planner"), world.api("engineer"), world.api("mech_sup")
    line = mk_asset(planner, world, "PM1")
    hyd = _skill(eng, "HYD")
    hv = _skill(eng, "HV", category="safety", needs_certificate=True)
    wo = planner.ok("post", "/work-orders", {"asset_id": line["id"], "type": "corrective", "title": "HPU hose"}, status=201)
    need = planner.ok("put", f"/work-orders/{wo['id']}/skills", {"skills": [{"skill_id": hyd["id"], "min_level": 2}, {"skill_id": hv["id"]}]})
    assert [n["code"] for n in need] == ["HYD", "HV"] or {n["code"] for n in need} == {"HYD", "HV"}
    assert world.api("tech").put(f"/work-orders/{wo['id']}/skills", {"skills": []}).status_code == 403
    tid = str(world.users["tech"].id)
    r = sup.post(f"/work-orders/{wo['id']}/assign", {"user_ids": [tid]})
    assert r.status_code == 409 and "no skill HYD" in r.text and "no skill HV" in r.text
    eng.ok("put", f"/skills/matrix/{tid}/{hyd['id']}", {"level": 1})
    eng.ok("put", f"/skills/matrix/{tid}/{hv['id']}", {"level": 1, "certified_until": "2020-01-01"})
    r = sup.post(f"/work-orders/{wo['id']}/assign", {"user_ids": [tid]})
    assert r.status_code == 409 and "level 1 < 2 for HYD" in r.text and "certificate HV expired" in r.text
    # Overridable, like the other assignment warnings
    assert sup.ok("post", f"/work-orders/{wo['id']}/assign", {"user_ids": [tid], "force": True})["warnings"]
    # Qualified: no warning
    eng.ok("put", f"/skills/matrix/{tid}/{hyd['id']}", {"level": 2})
    eng.ok("put", f"/skills/matrix/{tid}/{hv['id']}", {"level": 1, "certified_until": (date.today() + timedelta(days=400)).isoformat()})
    wo2 = planner.ok("post", "/work-orders", {"asset_id": line["id"], "type": "corrective", "title": "HPU hose 2"}, status=201)
    planner.ok("put", f"/work-orders/{wo2['id']}/skills", {"skills": [{"skill_id": hyd["id"], "min_level": 2}]})
    assert sup.ok("post", f"/work-orders/{wo2['id']}/assign", {"user_ids": [tid]})["warnings"] == []


def test_job_plan_skills_copied_to_generated_work_orders(world):
    planner, eng = world.api("planner"), world.api("engineer")
    today = plant_today(world.plant)
    line = mk_asset(planner, world, "PM1")
    jp = planner.ok("post", "/pm/job-plans", {"code": "JP1", "name": "Weekly insp", "estimated_hours": 2, "tasks": []}, status=201)
    hyd = _skill(eng, "HYD")
    eng.ok("put", f"/pm/job-plans/{jp['id']}/skills", {"skills": [{"skill_id": hyd["id"], "min_level": 2}]})  # engineer may set it too
    assert planner.ok("get", f"/pm/job-plans/{jp['id']}/skills")[0]["min_level"] == 2
    body = {"code": "PM-W", "name": "Weekly", "asset_id": line["id"], "job_plan_id": jp["id"], "frequency_unit": "week",
            "frequency_interval": 1, "start_date": today.isoformat(), "horizon_days": 7, "lead_days": 3}  # fmt: skip
    planner.ok("post", "/pm/plans", body, status=201)
    planner.ok("post", "/pm/scheduler/run", {})
    wo = planner.get("/work-orders", params={"type": "preventive"}).json()["items"][0]
    assert [(n["code"], n["min_level"]) for n in planner.ok("get", f"/work-orders/{wo['id']}/skills")] == [("HYD", 2)]
