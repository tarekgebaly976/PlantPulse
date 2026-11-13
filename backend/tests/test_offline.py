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
