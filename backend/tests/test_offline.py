"""Field mode without internet: the catalogue a phone downloads, requests sent later without duplicates, and the
requester's own photos on a work request."""

import io
from datetime import UTC, datetime, timedelta

from tests.conftest import mk_asset

PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\r"
    b"IDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x35\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82"
)


def test_catalog_has_equipment_codes_and_recent_jobs_in_scope(world):
    planner = world.api("planner")
    line = mk_asset(planner, world, "PM1-LINE")
    planner.ok("patch", f"/assets/{line['id']}", {"equipment_type": "Pumps"})
    pump = mk_asset(planner, world, "PM1-PUMP", level="unit", parent=line["id"])
    sp = mk_asset(planner, world, "SP-LINE", dept="SP")
    planner.ok("post", "/work-orders", {"asset_id": pump["id"], "title": "Check pump seal", "type": "corrective"}, status=201)
    cat = world.api("production").ok("get", "/offline/catalog")
    by = {a["c"]: a for a in cat["assets"]}
    assert {"PM1-LINE", "PM1-PUMP", "SP-LINE"} <= set(by)
    assert by["PM1-PUMP"]["et"] == "Pumps" and by["PM1-PUMP"]["p"] == line["id"] and by["PM1-PUMP"]["q"]  # type from the parent
    assert cat["recent"][pump["id"]][0]["t"] == "Check pump seal"
    assert cat["plant"]["id"] == str(world.plant.id) and cat["user"]["name"]
    assert any(c["k"] == "symptom" for c in cat["codes"]) or cat["codes"] == []
    # A supervisor limited to SP gets only SP equipment; without request.create there is no catalogue.
    sp_only = {a["c"] for a in world.api("sp_sup").ok("get", "/offline/catalog")["assets"]}
    assert "SP-LINE" in sp_only and "PM1-PUMP" not in sp_only and sp["id"]
    assert world.api("viewer").get("/offline/catalog").status_code == 403


def test_request_sent_twice_from_the_phone_is_created_once(world):
    planner, prod = world.api("planner"), world.api("production")
    pump = mk_asset(planner, world, "PUMP-7")
    written = (datetime.now(UTC) - timedelta(hours=3)).replace(microsecond=0)
    body = {"asset_id": pump["id"], "title": "Oil leak at seal", "client_ref": "phone-1234-abcd", "reported_at": written.isoformat()}
    first = prod.ok("post", "/work-requests", body, status=201)
    again = prod.ok("post", "/work-requests", body, status=(200, 201))  # lost answer, sent again
    assert again["id"] == first["id"] and again["number"] == first["number"]
    assert datetime.fromisoformat(first["reported_at"]) == written and first["open_on_asset"] == 0
    second = prod.ok("post", "/work-requests", {**body, "client_ref": "phone-5678-efgh", "reported_at": None}, status=201)
    assert second["open_on_asset"] == 1 and second["reported_at"] is None  # the first one is still open
    assert world.api("tech").post("/work-requests", body).status_code == 409  # someone else's reference
    future = prod.ok("post", "/work-requests", {**body, "client_ref": "phone-9999-zzzz", "reported_at": "2099-01-01T00:00:00Z"}, status=201)
    assert future["reported_at"] is None  # a wrong phone clock is ignored
    assert prod.post("/work-requests", {**body, "client_ref": "bad ref!"}).status_code == 422


def test_requester_adds_photos_to_own_request_only(world):
    planner, prod, tech = world.api("planner"), world.api("production"), world.api("tech")
    pump = mk_asset(planner, world, "PUMP-8")
    mine = prod.ok("post", "/work-requests", {"asset_id": pump["id"], "title": "Noise at motor"}, status=201)
    theirs = tech.ok("post", "/work-requests", {"asset_id": pump["id"], "title": "Hot bearing"}, status=201)

    def up(api, rid, category="photo"):
        files = {"file": ("leak.png", io.BytesIO(PNG), "image/png")}
        return api.post("/attachments", None, data={"entity_type": "work_request", "entity_id": rid, "category": category}, files=files)

    assert up(prod, mine["id"]).status_code == 201  # production user has no general upload right, but it is their request
    assert up(prod, theirs["id"]).status_code == 403
    assert up(prod, mine["id"], "document").status_code == 403  # own request: photos only
    assert len(prod.ok("get", "/attachments", params={"entity_type": "work_request", "entity_id": mine["id"]})) == 1
    assert len(planner.ok("get", "/attachments", params={"entity_type": "work_request", "entity_id": mine["id"]})) == 1


# ---------------- phase 2: work orders without internet ----------------
def _ready_wo(world, title="Replace coupling", **extra):
    """An approved corrective work order with a check line and a reading line, assigned to the technician."""
    planner, sup = world.api("planner"), world.api("mech_sup")
    pump = mk_asset(planner, world, "PUMP-" + title[:3].upper() + str(len(title)))
    wo = planner.ok("post", "/work-orders", {"asset_id": pump["id"], "title": title, "type": "corrective", **extra}, status=201)
    planner.ok("post", f"/work-orders/{wo['id']}/checklist", {"description": "Check alignment"}, status=201)
    planner.ok(
        "post",
        f"/work-orders/{wo['id']}/checklist",
        {"description": "Vibration DE", "kind": "reading", "unit": "mm/s", "min_value": 0, "max_value": 4.5},
        status=201,
    )
    sup.ok("post", f"/work-orders/{wo['id']}/status", {"to": "approved"})
    planner.ok("post", f"/work-orders/{wo['id']}/assign", {"user_ids": [str(world.users["tech"].id)]})
    return wo


def _snap(api, wo_id):
    return next(w for w in api.ok("get", "/offline/catalog")["wos"] if w["id"] == wo_id)


def test_work_order_created_offline_once_and_assigned_to_its_writer(world):
    planner, eng = world.api("planner"), world.api("engineer")
    pump = mk_asset(planner, world, "PUMP-OFF")
    written = (datetime.now(UTC) - timedelta(hours=2)).replace(microsecond=0)
    body = {
        "asset_id": pump["id"],
        "title": "Seal leaking badly",
        "type": "emergency",
        "client_ref": "f-wo-0001-aaaa",
        "reported_at": written.isoformat(),
        "assign_me": True,
    }
    first = eng.ok("post", "/work-orders", body, status=201)
    again = eng.ok("post", "/work-orders", body, status=(200, 201))
    assert again["id"] == first["id"] and again["number"] == first["number"]
    assert datetime.fromisoformat(first["reported_at"]) == written
    assert [a["user_id"] for a in first["assignments"]] == [str(world.users["engineer"].id)]
    assert world.api("mech_sup").post("/work-orders", body).status_code == 409  # someone else's reference
    snap = eng.ok("get", f"/offline/work-orders/{first['id']}")
    assert snap["s"] == "triage" and snap["sb"] is None and snap["mine"]  # an emergency may start at once
    # Started and submitted offline in one batch.
    r = eng.ok(
        "post",
        f"/offline/work-orders/{first['id']}/sync",
        {
            "client_ref": "f-sync-0001-aaaa",
            "start": True,
            "fields": [{"name": "findings", "base": None, "value": "Seal worn"}],
            "finish": "awaiting_review",
        },
    )
    assert r["conflicts"] == [] and r["work_order"]["status"] == "awaiting_review"


def test_offline_batch_applied_once_with_labour_parts_and_readings(world):
    wo = _ready_wo(world)
    tech = world.api("tech")
    cat = tech.ok("get", "/offline/catalog")
    snap = next(w for w in cat["wos"] if w["id"] == wo["id"])
    assert snap["sb"] is None and snap["mine"] and len(snap["cl"]) == 2 and cat["perms"]["execute"] and not cat["perms"]["create"]
    check, reading = snap["cl"]
    today = datetime.now(UTC).date().isoformat()
    batch = {
        "client_ref": "f-sync-0002-bbbb",
        "base_version": snap["v"],
        "written_at": (datetime.now(UTC) - timedelta(minutes=30)).isoformat(),
        "start": True,
        "checklist": [
            {"id": check["id"], "base": {"done": False}, "is_done": True, "remark": "OK"},
            {"id": reading["id"], "base": {"done": False}, "is_done": True, "reading_value": 6.1},
        ],
        "fields": [
            {"name": "findings", "base": None, "value": "Coupling rubber cracked"},
            {"name": "downtime_hours", "base": None, "value": 1.5},
        ],
        "labor": [{"work_date": today, "hours": 2.5}],
        "parts": [{"description": "Coupling rubber", "quantity": 1}],
        "comments": ["Done without network in the basement"],
        "finish": "awaiting_review",
    }
    r = tech.ok("post", f"/offline/work-orders/{wo['id']}/sync", batch)
    assert r["conflicts"] == [], r["conflicts"]
    assert r["work_order"]["status"] == "awaiting_review"
    assert len(r["applied"]) == 9 and not r.get("repeat")
    again = tech.ok("post", f"/offline/work-orders/{wo['id']}/sync", batch)  # lost answer, sent again
    assert again["repeat"] and again["applied"] == r["applied"]
    d = world.api("planner").ok("get", f"/work-orders/{wo['id']}/detail")
    assert len(d["labor"]) == 1 and float(d["labor"][0]["hours"]) == 2.5 and "offline" in d["labor"][0]["notes"]
    assert len(d["parts_used"]) == 1 and len(d["comments"]) == 1
    assert d["work_order"]["findings"] == "Coupling rubber cracked" and d["work_order"]["downtime_hours"] == 1.5
    by = {c["description"]: c for c in d["checklist"]}
    assert by["Vibration DE"]["is_ok"] is False and by["Check alignment"]["is_done"]  # out of range reading flagged
    assert world.api("tech2").post(f"/offline/work-orders/{wo['id']}/sync", batch).status_code == 409  # someone else's ref


def test_offline_changes_made_meanwhile_by_others_come_back_as_conflicts(world):
    wo = _ready_wo(world, title="Change bearing")
    tech, sup = world.api("tech"), world.api("mech_sup")
    snap = _snap(tech, wo["id"])  # the phone downloads, then goes offline
    check, reading = snap["cl"]
    # Meanwhile, online: the supervisor starts the job, records the reading and writes the findings.
    sup.ok("post", f"/work-orders/{wo['id']}/status", {"to": "in_progress"})
    sup.ok("patch", f"/work-orders/{wo['id']}/checklist/{reading['id']}", {"is_done": True, "reading_value": 2.0})
    sup.ok("patch", f"/work-orders/{wo['id']}", {"findings": "Bearing pitted"})
    batch = {
        "client_ref": "f-sync-0003-cccc",
        "base_version": snap["v"],
        "start": True,
        "checklist": [
            {"id": check["id"], "base": {"done": False}, "is_done": True},
            {"id": reading["id"], "base": {"done": False}, "is_done": True, "reading_value": 3.0},
        ],
        "fields": [{"name": "findings", "base": None, "value": "Bearing ok"}],
        "labor": [{"work_date": datetime.now(UTC).date().isoformat(), "hours": 1}],
        "finish": "awaiting_review",
    }
    r = tech.ok("post", f"/offline/work-orders/{wo['id']}/sync", batch)
    keys = {c["key"]: c for c in r["conflicts"]}
    assert set(keys) == {f"check:{reading['id']}", "field:findings", "finish"} and r["changed_meanwhile"]
    assert keys[f"check:{reading['id']}"]["theirs"]["val"] == 2.0 and keys[f"check:{reading['id']}"]["theirs"]["by"] == "Mech_Sup"
    assert keys["field:findings"]["theirs"] == "Bearing pitted" and keys["finish"]["code"] == "held_back"
    assert {"start", f"check:{check['id']}", "labor:0"} <= set(r["applied"])
    assert r["work_order"]["status"] == "in_progress"
    # The technician keeps their reading, keeps the supervisor's findings, then submits.
    r2 = tech.ok(
        "post",
        f"/offline/work-orders/{wo['id']}/sync",
        {
            "client_ref": "f-sync-0004-dddd",
            "force": [f"check:{reading['id']}"],
            "checklist": [{"id": reading["id"], "base": {"done": False}, "is_done": True, "reading_value": 3.0}],
            "finish": "awaiting_review",
        },
    )
    assert r2["conflicts"] == [] and r2["work_order"]["status"] == "awaiting_review"
    d = sup.ok("get", f"/work-orders/{wo['id']}/detail")
    assert float(next(c for c in d["checklist"] if c["id"] == reading["id"])["reading_value"]) == 3.0
    assert d["work_order"]["findings"] == "Bearing pitted"


def test_offline_start_blocked_by_safety_and_finished_work_order(world):
    wo = _ready_wo(world, title="Weld guard", requires_loto=True)
    tech, sup = world.api("tech"), world.api("mech_sup")
    assert _snap(tech, wo["id"])["sb"] == "safety"  # LOTO sign-off is done on site, online
    r = tech.ok(
        "post",
        f"/offline/work-orders/{wo['id']}/sync",
        {"client_ref": "f-sync-0005-eeee", "start": True, "labor": [{"work_date": datetime.now(UTC).date().isoformat(), "hours": 1}]},
    )
    assert [c["code"] for c in r["conflicts"]][:1] == ["safety_signoff_required"] and r["work_order"]["status"] == "approved"
    sup.ok("post", f"/work-orders/{wo['id']}/status", {"to": "cancelled", "comment": "not needed"})
    r = tech.ok("post", f"/offline/work-orders/{wo['id']}/sync", {"client_ref": "f-sync-0006-ffff", "comments": ["late note"]})
    assert r["conflicts"][0]["code"] == "wo_finished" and r["applied"] == []
    assert world.api("tech2").post(f"/offline/work-orders/{wo['id']}/sync", {"client_ref": "f-sync-0007-gggg"}).json()["conflicts"] == []
    assert world.api("production").post(f"/offline/work-orders/{wo['id']}/sync", {"client_ref": "f-sync-0008-hhhh"}).status_code == 403
