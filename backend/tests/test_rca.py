"""Root cause analysis: rules decide the major breakdowns, the manager decides, the team analyses, actions, the
effectiveness check and recurrence."""

from datetime import timedelta

from app.core.db import SessionLocal
from app.models.rca import RCA
from app.models.tenancy import Plant
from app.services import rca as svc
from app.services.common import plant_today
from tests.conftest import mk_asset


def _codes(admin):
    out = {}
    for kind, code in (("problem", "BRG"), ("problem", "SEAL"), ("cause", "LUB"), ("remedy", "REPL")):
        out[code] = admin.ok("post", "/failure-codes", {"kind": kind, "code": code, "description": f"{code} failure"}, status=201)["id"]
    return out


def _breakdown(sup, tech, world, asset, codes, *, downtime=1.0, problem="BRG", safety=False, title="Pump trip"):
    """An emergency breakdown taken to completed with the given downtime and failure mode."""
    em = sup.ok("post", "/work-orders", {"asset_id": asset["id"], "type": "emergency", "title": title}, status=201)
    sup.ok("post", f"/work-orders/{em['id']}/assign", {"user_ids": [str(world.users["tech"].id)]})
    tech.ok("post", f"/work-orders/{em['id']}/status", {"to": "in_progress"})
    tech.ok(
        "patch",
        f"/work-orders/{em['id']}",
        {
            "root_cause": "bearing dry",
            "problem_code_id": codes[problem],
            "cause_code_id": codes["LUB"],
            "remedy_code_id": codes["REPL"],
            "downtime_hours": downtime,
            "safety_event": safety,
            "findings": "Bearing DE seized",
        },
    )
    tech.ok("post", f"/work-orders/{em['id']}/status", {"to": "awaiting_review"})
    sup.ok("post", f"/work-orders/{em['id']}/status", {"to": "completed"})
    return em


def test_rules_make_candidates_and_manager_decides(world):
    admin, manager, sup, tech = world.api("admin"), world.api("manager"), world.api("mech_sup"), world.api("tech")
    codes = _codes(admin)
    pump_a = mk_asset(world.api("planner"), world, "PUMP-A", crit="A")
    pump_c = mk_asset(world.api("planner"), world, "PUMP-C", crit="C")
    rules = manager.ok("get", "/rca/rules")
    assert rules["downtime_hours"] == {"A": 2, "B": 3, "C": 5} and rules["repeat_count"] == 2
    # Technicians can't change the rules; the manager can (rca.settings).
    assert tech.put("/rca/rules", {**rules, "downtime_hours": {"A": 1}}).status_code == 403
    manager.ok("put", "/rca/rules", {**rules, "downtime_hours": {"A": 2, "B": 3, "C": 4}})

    # 3 h on a C asset (limit 4) and SEAL mode: no RCA.
    small = _breakdown(sup, tech, world, pump_c, codes, downtime=3, problem="SEAL")
    assert manager.get(f"/work-orders/{small['id']}/detail").json()["rca"] is None
    # 2.5 h on an A asset (limit 2): candidate.
    big = _breakdown(sup, tech, world, pump_a, codes, downtime=2.5)
    link = manager.get(f"/work-orders/{big['id']}/detail").json()["rca"]
    assert link and link["status"] == "candidate"
    d = manager.ok("get", f"/rca/{link['id']}")
    assert [x["rule"] for x in d["rca"]["trigger_reasons"]] == ["downtime"]
    assert d["failure_mode"]["code"] == "BRG" and len(d["work_orders"]) == 1
    notes = manager.get("/notifications").json()["items"]
    assert any("RCA proposed" in n["title"] for n in notes)
    # Correcting the downtime of the small one later (completed WO) re-checks the rules.
    tech2 = sup  # supervisor may edit execution fields
    tech2.ok("patch", f"/work-orders/{small['id']}", {"downtime_hours": 4.5})
    small_rca = manager.get(f"/work-orders/{small['id']}/detail").json()["rca"]
    assert small_rca and small_rca["id"] != link["id"]

    # Only the manager decides; not required needs a reason.
    assert sup.post(f"/rca/{small_rca['id']}/not-required", {"note": "known issue"}).status_code == 403
    assert manager.post(f"/rca/{small_rca['id']}/not-required", {}).status_code == 422
    manager.ok("post", f"/rca/{small_rca['id']}/not-required", {"note": "Seal supplier issue already handled"})
    # Leader must hold an engineering position (rca.lead): a technician is refused.
    r = manager.post(f"/rca/{link['id']}/start", {"leader_id": str(world.users["tech"].id)})
    assert r.status_code == 422
    manager.ok(
        "post",
        f"/rca/{link['id']}/start",
        {"leader_id": str(world.users["engineer"].id), "member_ids": [str(world.users["tech"].id), str(world.users["production"].id)]},
    )
    d = manager.ok("get", f"/rca/{link['id']}")["rca"]
    assert d["status"] == "investigation" and d["leader"] == "Engineer"
    assert d["problem"]["what"].startswith("BRG") and "PUMP-A" in d["problem"]["where"]  # 5W1H pre-filled
    assert d["timeline"] and d["due_date"]
    leaders = {x["full_name"] for x in manager.ok("get", "/rca/leaders")}
    assert "Engineer" in leaders and "Tech" not in leaders
    # Register
    lst = manager.ok("get", "/rca", params={"status": "active"})
    assert lst["total"] == 1 and lst["items"][0]["downtime_hours"] == 2.5
    # The production user (team member) sees it via "mine"; storekeeper (no rca.view, not on team) does not.
    assert world.api("production").ok("get", "/rca", params={"mine": True})["total"] == 1
    assert world.api("store").get(f"/rca/{link['id']}").status_code == 404


def test_repeated_failure_same_mode_same_asset(world):
    admin, manager, sup, tech = world.api("admin"), world.api("manager"), world.api("mech_sup"), world.api("tech")
    codes = _codes(admin)
    fan = mk_asset(world.api("planner"), world, "FAN-1", crit="C")
    first = _breakdown(sup, tech, world, fan, codes, downtime=0.5)
    assert manager.get(f"/work-orders/{first['id']}/detail").json()["rca"] is None
    other_mode = _breakdown(sup, tech, world, fan, codes, downtime=0.5, problem="SEAL")
    assert manager.get(f"/work-orders/{other_mode['id']}/detail").json()["rca"] is None  # different mode: not a repeat
    second = _breakdown(sup, tech, world, fan, codes, downtime=0.5)
    link = manager.get(f"/work-orders/{second['id']}/detail").json()["rca"]
    assert link
    d = manager.ok("get", f"/rca/{link['id']}")
    assert d["rca"]["trigger_reasons"][0]["rule"] == "repeat" and d["rca"]["trigger_reasons"][0]["value"] == 2
    assert {w["number"] for w in d["work_orders"]} == {first["number"], second["number"]}  # earlier failure gathered
    # A third failure with the same mode joins the same RCA instead of a new one.
    third = _breakdown(sup, tech, world, fan, codes, downtime=0.5)
    assert manager.get(f"/work-orders/{third['id']}/detail").json()["rca"]["id"] == link["id"]


def test_safety_event_and_manual_request(world):
    admin, manager, sup, tech = world.api("admin"), world.api("manager"), world.api("mech_sup"), world.api("tech")
    codes = _codes(admin)
    m = mk_asset(world.api("planner"), world, "MIX-1", crit="C")
    em = _breakdown(sup, tech, world, m, codes, downtime=0.2, problem="SEAL", safety=True)
    d = manager.ok("get", f"/rca/{manager.get(f'/work-orders/{em["id"]}/detail').json()['rca']['id']}")
    assert d["rca"]["trigger_reasons"][0]["rule"] == "safety"
    # Manual request on a small breakdown.
    em2 = _breakdown(sup, tech, world, m, codes, downtime=0.1, problem="BRG", title="Noise")
    assert tech.post("/rca", {"work_order_id": em2["id"], "note": "please"}).status_code == 403  # technicians can't
    r = world.api("engineer").ok("post", "/rca", {"work_order_id": em2["id"], "note": "Third noise complaint this month"}, status=201)
    assert r["status"] == "candidate"
    assert world.api("engineer").post("/rca", {"work_order_id": em2["id"], "note": "again"}).status_code == 409


def test_full_rca_lifecycle_actions_effectiveness_and_recurrence(world):
    admin, manager, sup, tech = world.api("admin"), world.api("manager"), world.api("mech_sup"), world.api("tech")
    eng = world.api("engineer")
    codes = _codes(admin)
    pump = mk_asset(world.api("planner"), world, "PUMP-9", crit="A")
    em = _breakdown(sup, tech, world, pump, codes, downtime=6)
    rid = manager.get(f"/work-orders/{em['id']}/detail").json()["rca"]["id"]
    manager.ok("post", f"/rca/{rid}/start", {"leader_id": str(world.users["engineer"].id), "member_ids": [str(world.users["tech"].id)]})
    # Submitting an empty analysis is refused with what is missing.
    r = eng.post(f"/rca/{rid}/submit")
    assert r.status_code == 409 and "root cause" in r.text and "5 Whys" in r.text
    # The team (technician member included) writes the analysis.
    tech.ok(
        "patch",
        f"/rca/{rid}",
        {
            "problem": {
                "what": "DE bearing seized",
                "where": "PUMP-9",
                "when": "night shift",
                "who": "operator found",
                "which": "6 h stop",
                "how": "noise then trip",
            },
            "whys": [
                {"id": "w1", "parent_id": None, "text": "Bearing seized"},
                {"id": "w2", "parent_id": "w1", "text": "No grease"},
                {"id": "w3", "parent_id": "w2", "text": "Point not in lube route", "is_root": True},
            ],
            "fishbone": [
                {"id": "f1", "category": "method", "text": "Lube route missing point", "status": "verified"},
                {"id": "f2", "category": "material", "text": "Wrong grease", "status": "ruled_out"},
            ],
        },
    )
    assert tech.patch(f"/rca/{rid}", {"whys": [{"id": "x", "parent_id": "nope", "text": "?"}]}).status_code == 422
    # More than five whys are allowed; the root cause can only be the last why of its chain.
    deep = [{"id": f"d{i}", "parent_id": f"d{i - 1}" if i else None, "text": f"why {i + 1}"} for i in range(7)]
    assert tech.patch(f"/rca/{rid}", {"whys": [*deep[:-1], {**deep[-1], "is_root": True}]}).status_code == 200
    assert tech.patch(f"/rca/{rid}", {"whys": [{**deep[0], "is_root": True}, *deep[1:]]}).status_code == 422
    tech.ok("patch", f"/rca/{rid}", {"whys": [
        {"id": "w1", "parent_id": None, "text": "Bearing seized"},
        {"id": "w2", "parent_id": "w1", "text": "No grease"},
        {"id": "w3", "parent_id": "w2", "text": "Point not in lube route", "is_root": True},
    ]})  # fmt: skip
    assert tech.patch(f"/rca/{rid}", {"fishbone": [{"id": "x", "category": "money", "text": "?"}]}).status_code == 422
    eng.ok("patch", f"/rca/{rid}", {"root_causes": [{"id": "rc1", "type": "latent", "text": "PM/lube plan did not cover the DE bearing"}]})
    a1 = eng.ok("post", f"/rca/{rid}/actions", {"description": "Add DE bearing to lube route", "kind": "corrective", "owner_id": str(world.users["tech"].id), "root_cause_ref": "rc1", "due_date": str(plant_today(world.plant) + timedelta(days=7))}, status=201)  # fmt: skip
    a2 = eng.ok("post", f"/rca/{rid}/actions", {"description": "Check all pumps of this type", "kind": "preventive"}, status=201)
    assert eng.post(f"/rca/{rid}/actions", {"description": "x y z", "root_cause_ref": "nope"}).status_code == 422
    # Only the leader (or manager) submits.
    assert tech.post(f"/rca/{rid}/submit").status_code == 403
    eng.ok("post", f"/rca/{rid}/submit")
    assert tech.patch(f"/rca/{rid}", {"analysis_summary": "late edit"}).status_code == 409  # locked while waiting
    # Manager returns it once, then approves.
    assert manager.post(f"/rca/{rid}/return", {}).status_code == 422
    manager.ok("post", f"/rca/{rid}/return", {"note": "Add the human factor"})
    eng.ok(
        "patch",
        f"/rca/{rid}",
        {
            "root_causes": [
                {"id": "rc1", "type": "latent", "text": "Lube plan gap"},
                {"id": "rc2", "type": "human", "text": "No check at install"},
            ]
        },
    )
    eng.ok("post", f"/rca/{rid}/submit")
    manager.ok("post", f"/rca/{rid}/approve", {"note": "OK"})
    assert manager.ok("get", f"/rca/{rid}")["rca"]["status"] == "action_plan"
    assert any("actions to do" in n["title"] for n in tech.get("/notifications").json()["items"])
    # A work order from action 2; completing it finishes the action.
    wo = sup.ok("post", f"/rca/{rid}/actions/{a2['id']}/work-order", status=201)
    assert sup.post(f"/rca/{rid}/actions/{a2['id']}/work-order").status_code == 409
    wod = sup.get(f"/work-orders/{wo['id']}").json()
    assert wod["type"] == "improvement" and wod["title"].startswith("RCA-")
    # The owner (technician) finishes action 1 (status only).
    tech.ok("patch", f"/rca/{rid}/actions/{a1['id']}", {"description": "Add DE bearing to lube route LR-3"})  # team member
    assert world.api("planner_b", world.plant_b).patch(f"/rca/{rid}/actions/{a1['id']}", {"status": "done"}).status_code in (403, 404)
    world_store = world.api("store")
    assert world_store.patch(f"/rca/{rid}/actions/{a1['id']}", {"status": "done"}).status_code == 404
    tech.ok("patch", f"/rca/{rid}/actions/{a1['id']}", {"status": "done", "completion_note": "Added to route LR-3"})
    assert manager.ok("get", f"/rca/{rid}")["rca"]["status"] == "action_plan"  # action 2 still open
    sup.ok("post", f"/work-orders/{wo['id']}/status", {"to": "awaiting_approval"})
    sup.ok("post", f"/work-orders/{wo['id']}/status", {"to": "approved"})
    sup.ok("post", f"/work-orders/{wo['id']}/assign", {"user_ids": [str(world.users["tech"].id)]})
    sup.ok("patch", f"/work-orders/{wo['id']}", {"planned_start": "2030-01-01T08:00:00+03:00"})
    sup.ok("post", f"/work-orders/{wo['id']}/status", {"to": "scheduled"})
    tech.ok("post", f"/work-orders/{wo['id']}/status", {"to": "in_progress"})
    tech.ok("post", f"/work-orders/{wo['id']}/status", {"to": "awaiting_review"})
    sup.ok("post", f"/work-orders/{wo['id']}/status", {"to": "completed"})
    d = manager.ok("get", f"/rca/{rid}")
    assert d["rca"]["status"] == "monitoring" and d["rca"]["effectiveness_due"]
    assert all(a["status"] == "done" for a in d["actions"])
    # Closing early needs a reason.
    assert manager.post(f"/rca/{rid}/close", {}).status_code == 422
    # Same failure mode on the same pump during the check: recurrence reopens the investigation.
    again = _breakdown(sup, tech, world, pump, codes, downtime=1)
    assert manager.get(f"/work-orders/{again['id']}/detail").json()["rca"]["id"] == rid
    d = manager.ok("get", f"/rca/{rid}")["rca"]
    assert d["status"] == "investigation" and d["recurrence_count"] == 1
    # Back through the flow quickly and close at the end of the check period (worker tells the manager).
    eng.ok("post", f"/rca/{rid}/actions", {"description": "Change grease type", "owner_id": str(world.users["engineer"].id)}, status=201)
    eng.ok("post", f"/rca/{rid}/submit")
    manager.ok("post", f"/rca/{rid}/approve", {})
    acts = manager.ok("get", f"/rca/{rid}")["actions"]
    for a in acts:
        if a["status"] != "done":
            eng.ok("patch", f"/rca/{rid}/actions/{a['id']}", {"status": "done"})
    assert manager.ok("get", f"/rca/{rid}")["rca"]["status"] == "monitoring"
    with SessionLocal() as db, db.begin():
        r = db.get(RCA, rid)
        r.effectiveness_due = plant_today(world.plant) - timedelta(days=1)
        db.flush()
        out = svc.run_reminders(db, db.get(Plant, world.plant.id))
    assert out["ready_to_close"] == 1
    assert any("ready to close" in n["title"] for n in manager.get("/notifications").json()["items"])
    manager.ok("post", f"/rca/{rid}/close", {})
    d = manager.ok("get", f"/rca/{rid}")["rca"]
    assert d["status"] == "closed" and d["effectiveness_result"] == "effective"
    st = manager.ok("get", "/rca/stats")
    assert st["closed"] == 1 and st["recurrence_pct"] == 100.0
    x = manager.get("/rca/export.xlsx")
    assert x.status_code == 200 and x.content[:2] == b"PK"


def test_overdue_reminders_and_department_scope(world):
    admin, manager, sup, tech = world.api("admin"), world.api("manager"), world.api("mech_sup"), world.api("tech")
    codes = _codes(admin)
    pump = mk_asset(world.api("planner"), world, "PUMP-2", crit="A")
    em = _breakdown(sup, tech, world, pump, codes, downtime=3)
    rid = manager.get(f"/work-orders/{em['id']}/detail").json()["rca"]["id"]
    manager.ok("post", f"/rca/{rid}/start", {"leader_id": str(world.users["reliability"].id)})
    manager.ok("post", f"/rca/{rid}/actions", {"description": "Containment: daily temp check", "kind": "containment", "owner_id": str(world.users["tech"].id), "due_date": str(plant_today(world.plant) - timedelta(days=2))}, status=201)  # fmt: skip
    with SessionLocal() as db, db.begin():
        r = db.get(RCA, rid)
        r.due_date = plant_today(world.plant) - timedelta(days=1)
        db.flush()
        out = svc.run_reminders(db, db.get(Plant, world.plant.id))
    assert out["overdue_rcas"] == 1 and out["overdue_actions"] == 1
    assert any("action overdue" in n["title"] for n in tech.get("/notifications").json()["items"])
    assert any("analysis overdue" in n["title"] for n in world.api("reliability").get("/notifications").json()["items"])
    # An SP-only supervisor does not see an RCA of a PM-department asset.
    assert world.api("sp_sup").get(f"/rca/{rid}").status_code == 404
    assert world.api("sp_sup").ok("get", "/rca")["total"] == 0
    # Plant B users never see it.
    assert world.api("planner_b", world.plant_b).get(f"/rca/{rid}").status_code in (403, 404)


def test_auto_open_and_rules_off(world):
    admin, manager, sup, tech = world.api("admin"), world.api("manager"), world.api("mech_sup"), world.api("tech")
    codes = _codes(admin)
    rules = manager.ok("get", "/rca/rules")
    manager.ok("put", "/rca/rules", {**rules, "auto_open": True, "failure_mode_ids": [codes["SEAL"]]})
    p = mk_asset(world.api("planner"), world, "P-SEAL", crit="C")
    em = _breakdown(sup, tech, world, p, codes, downtime=0.1, problem="SEAL")
    link = manager.get(f"/work-orders/{em['id']}/detail").json()["rca"]
    assert link["status"] == "investigation"
    d = manager.ok("get", f"/rca/{link['id']}")["rca"]
    assert d["trigger_reasons"][0]["rule"] == "failure_mode" and d["leader_id"] is None
    manager.ok("post", f"/rca/{link['id']}/start", {"leader_id": str(world.users["engineer"].id)})  # name the leader
    assert manager.ok("get", f"/rca/{link['id']}")["rca"]["leader"] == "Engineer"
    manager.ok("put", "/rca/rules", {**rules, "enabled": False})
    p2 = mk_asset(world.api("planner"), world, "P-OFF", crit="A")
    em2 = _breakdown(sup, tech, world, p2, codes, downtime=50)
    assert manager.get(f"/work-orders/{em2['id']}/detail").json()["rca"] is None


def test_management_deck_has_rca_slide(world):
    import io

    from pptx import Presentation

    admin, manager, sup, tech = world.api("admin"), world.api("manager"), world.api("mech_sup"), world.api("tech")
    codes = _codes(admin)
    pump = mk_asset(world.api("planner"), world, "PUMP-D", crit="A")
    em = _breakdown(sup, tech, world, pump, codes, downtime=8)
    rid = manager.get(f"/work-orders/{em['id']}/detail").json()["rca"]["id"]
    manager.ok("post", f"/rca/{rid}/start", {"leader_id": str(world.users["engineer"].id)})
    today = plant_today(world.plant)
    period = {"start": today.replace(day=1).isoformat(), "end": today.isoformat()}
    for lang, title in (("en", "Root cause analysis"), ("ar", "تحليل السبب الجذري")):
        r = manager.get("/kpis/management-report.pptx", params={**period, "lang": lang})
        assert r.status_code == 200
        texts = []
        for slide in Presentation(io.BytesIO(r.content)).slides:
            for sh in slide.shapes:
                if sh.has_text_frame:
                    texts.append(sh.text_frame.text)
                if sh.has_table:
                    texts += [c.text for row in sh.table.rows for c in row.cells]
        joined = "\n".join(texts)
        assert title in joined and "RCA-P1-000001" in joined, lang
