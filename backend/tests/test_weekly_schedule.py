"""Weekly maintenance schedule: the optimiser places open work orders on the people the roster has at work (any of the
seven days), with the trade, skills and LOTO sign-off rules; deferred work says why; hand edits are kept; the engineer then
the maintenance manager approve, and the manager's approval writes assignments and planned dates."""

from datetime import timedelta

from app.services.common import plant_today
from app.services.weekly import week_of
from tests.conftest import mk_asset


def _setup(world):
    planner, sup, eng = world.api("planner"), world.api("mech_sup"), world.api("engineer")
    ws = week_of(plant_today(world.plant)) + timedelta(days=7)  # next week: every day is still open
    d_shift = str(world.shifts["D"].id)

    def roster(key, offset, kind="work", hours=8):
        body = {"user_id": str(world.users[key].id), "work_date": (ws + timedelta(days=offset)).isoformat(), "kind": kind, "hours": hours}
        if kind != "leave":
            body["shift_id"] = d_shift
        planner.ok("put", "/shifts/roster", body)

    for o in (0, 1, 5, 6):  # Sunday, Monday, Friday, Saturday
        roster("tech", o)
    for o in range(5):
        roster("tech2", o, "leave", 0)
    roster("tech2", 6)  # Saturday only: the plant does not stop
    roster("mech_sup", 1)  # the only one who may sign off LOTO this week: Monday
    line = mk_asset(planner, world, "PM1")
    hyd = eng.ok("post", "/skills", {"code": "HYD", "name": "Hydraulics"}, status=201)
    sht = eng.ok("post", "/skills", {"code": "SHT", "name": "Sheeter"}, status=201)
    eng.ok("put", f"/skills/matrix/{world.users['tech'].id}/{hyd['id']}", {"level": 2})
    eng.ok("put", f"/skills/matrix/{world.users['tech2'].id}/{sht['id']}", {"level": 2})

    def wo(title, hours=None, prio="P3", due=None, skill=None, **kw):
        body = {"asset_id": line["id"], "type": "corrective", "title": title, "priority": prio, **kw}
        if hours is not None:
            body["estimated_hours"] = hours
        if due is not None:
            body["due_date"] = (ws + timedelta(days=due)).isoformat()
        w = planner.ok("post", "/work-orders", body, status=201)
        if skill:
            planner.ok("put", f"/work-orders/{w['id']}/skills", {"skills": [{"skill_id": skill["id"], "min_level": 2}]})
        sup.ok("post", f"/work-orders/{w['id']}/status", {"to": "approved"})
        return w["id"]

    ids = {
        "hyd": wo("HPU hose", 6, "P2", due=1, skill=hyd),
        "loto": wo("Motor change", 2, requires_loto=True),
        "long": wo("Rebuild gearbox", 30, "P4"),
        "nohours": wo("Check guard"),
        "sht": wo("Knife drum", 4, skill=sht),
        "plain": wo("Grease rollers", 3, due=3),
        "triage": None,
    }
    planner.ok(
        "post", "/work-orders", {"asset_id": line["id"], "type": "corrective", "title": "Not approved", "estimated_hours": 1}, status=201
    )
    return ws, ids


def _by_wo(view):
    out: dict = {}
    for it in view["items"]:
        out.setdefault(it["work_order"]["id"], []).append(it)
    return out


def test_propose_respects_roster_skills_and_lotos(world):
    ws, ids = _setup(world)
    planner = world.api("planner")
    assert planner.post(f"/schedule/weeks/{(ws + timedelta(days=1)).isoformat()}/propose", {}).status_code == 422  # not a Sunday
    assert world.api("tech").post(f"/schedule/weeks/{ws.isoformat()}/propose", {}).status_code == 403
    v = planner.ok("post", f"/schedule/weeks/{ws.isoformat()}/propose", {"max_overtime_hours": 2})
    assert v["schedule"]["status"] == "draft" and v["schedule"]["stats"]["solver"] in ("OPTIMAL", "FEASIBLE")
    items = _by_wo(v)
    tech, tech2 = str(world.users["tech"].id), str(world.users["tech2"].id)
    days = {(ws + timedelta(days=i)).isoformat(): i for i in range(7)}
    # Only approved work comes in; the triage one does not.
    assert set(items) == {ids[k] for k in ("hyd", "loto", "long", "nohours", "sht", "plain")}
    # Required skill → the only qualified person; LOTO → the day a supervisor is at work.
    assert [(i["user_id"], i["deferred"]) for i in items[ids["hyd"]]] == [(tech, False)]
    assert days[items[ids["loto"]][0]["work_date"]] == 1
    # SHT is held by tech2 only, at work on Saturday only: weekends can be work days.
    sht = items[ids["sht"]][0]
    assert sht["user_id"] == tech2 and days[sht["work_date"]] == 6
    # Nobody works on a day the roster does not have them at work.
    for it in v["items"]:
        if not it["deferred"]:
            p = next(p for p in v["people"] if p["user_id"] == it["user_id"])
            assert p["days"][it["work_date"]]["kind"] == "work" and not it["warnings"]
    # Deferred, with the reason.
    assert items[ids["long"]][0]["deferred"] and "longer than one shift" in items[ids["long"]][0]["reason"]
    assert items[ids["nohours"]][0]["reason"] == "no estimated hours"
    assert v["schedule"]["stats"]["scheduled"] == 4 and v["schedule"]["stats"]["deferred"] == 2


def test_hand_edits_and_two_step_approval(world):
    ws, ids = _setup(world)
    planner, eng, mgr = world.api("planner"), world.api("engineer"), world.api("manager")
    tech, tech2 = str(world.users["tech"].id), str(world.users["tech2"].id)
    v = planner.ok("post", f"/schedule/weeks/{ws.isoformat()}/propose", {})
    sid = v["schedule"]["id"]
    # Engineer approves; the planner may not, and the engineer may not give the final approval.
    assert planner.post(f"/schedule/{sid}/review").status_code == 403
    assert eng.ok("post", f"/schedule/{sid}/review")["schedule"]["status"] == "engineer_approved"
    assert eng.post(f"/schedule/{sid}/approve").status_code == 403
    # A hand edit sends it back to the engineer, and is pinned; a rule it breaks shows as a warning.
    plain = _by_wo(v)[ids["plain"]][0]
    sun = ws.isoformat()
    v = planner.ok("patch", f"/schedule/items/{plain['id']}", {"user_id": tech2, "work_date": sun})
    moved = _by_wo(v)[ids["plain"]][0]
    assert v["schedule"]["status"] == "draft" and moved["pinned"] and moved["warnings"]  # tech2 is on leave on Sunday
    v = planner.ok("patch", f"/schedule/items/{plain['id']}", {"user_id": tech, "work_date": sun})
    assert not _by_wo(v)[ids["plain"]][0]["warnings"]
    # Defer by hand; proposing again keeps the hand edits.
    planner.ok("post", f"/schedule/{sid}/work-orders/{ids['sht']}/defer", {"reason": "Waiting for knives"})
    v = planner.ok("post", f"/schedule/weeks/{ws.isoformat()}/propose", {})
    items = _by_wo(v)
    assert items[ids["sht"]][0]["deferred"] and items[ids["sht"]][0]["reason"] == "Waiting for knives"
    assert (items[ids["plain"]][0]["user_id"], items[ids["plain"]][0]["work_date"]) == (tech, sun)
    # Send back with a comment, then the two steps.
    eng.ok("post", f"/schedule/{sid}/review")
    v = mgr.ok("post", f"/schedule/{sid}/return", {"comment": "Move the motor change"})
    assert v["schedule"]["status"] == "draft" and v["schedule"]["returned_comment"] == "Move the motor change"
    eng.ok("post", f"/schedule/{sid}/review")
    v = mgr.ok("post", f"/schedule/{sid}/approve")
    assert v["schedule"]["status"] == "approved" and v["schedule"]["manager_by"] == "Manager"
    # Written to the work orders: people, planned dates from the shift start (06:00), one after the other.
    hyd = planner.ok("get", f"/work-orders/{ids['hyd']}")
    w = hyd.get("work_order", hyd)
    assert w["status"] == "scheduled" and [a["user_id"] for a in w["assignments"]] == [tech]
    assert w["planned_start"] is not None
    same_day = [planner.ok("get", f"/work-orders/{ids[k]}") for k in ("hyd", "plain", "loto")]
    spans = sorted(
        (x.get("work_order", x)["planned_start"], x.get("work_order", x)["planned_end"])
        for x in same_day
        if x.get("work_order", x)["planned_start"][:10] == w["planned_start"][:10]
    )
    for (_, end), (start, _) in zip(spans, spans[1:], strict=False):
        assert start >= end  # no overlap for one person on one day
    # Approved: locked until the manager reopens it.
    assert planner.post(f"/schedule/weeks/{ws.isoformat()}/propose", {}).status_code == 409
    assert planner.patch(f"/schedule/items/{plain['id']}", {"work_date": sun}).status_code in (404, 409)
    assert eng.post(f"/schedule/{sid}/reopen").status_code == 403
    assert mgr.ok("post", f"/schedule/{sid}/reopen")["schedule"]["status"] == "draft"


def test_week_view_for_everyone_who_sees_work_orders(world):
    ws, _ = _setup(world)
    v = world.api("tech").ok("get", f"/schedule/weeks/{ws.isoformat()}")
    assert v["schedule"] is None and len(v["days"]) == 7 and v["days"][0] == ws.isoformat()
    names = {p["name"] for p in v["people"]}
    assert {"Tech", "Tech2"} <= names and "Mech_Sup" not in names  # supervisors sign off, they are not in the grid
