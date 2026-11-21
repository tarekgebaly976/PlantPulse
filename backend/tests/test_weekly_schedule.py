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
    # ... as a code with parameters for the page to translate.
    assert (items[ids["nohours"]][0]["reason_code"], items[ids["nohours"]][0]["reason_params"]) == ("no_hours", {})
    assert items[ids["long"]][0]["reason_code"] == "too_long" and items[ids["long"]][0]["reason_params"]["hours"] > 0
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
    assert moved["warnings"][0]["code"] == "not_at_work" and moved["warnings"][0]["params"]["date"] == sun
    assert moved["warnings"][0]["text"] == f"{world.users['tech2'].full_name} is not at work on {sun}"
    v = planner.ok("patch", f"/schedule/items/{plain['id']}", {"user_id": tech, "work_date": sun})
    assert not _by_wo(v)[ids["plain"]][0]["warnings"]
    # Defer by hand; proposing again keeps the hand edits.
    planner.ok("post", f"/schedule/{sid}/work-orders/{ids['sht']}/defer", {"reason": "Waiting for knives"})
    v = planner.ok("post", f"/schedule/weeks/{ws.isoformat()}/propose", {})
    items = _by_wo(v)
    assert items[ids["sht"]][0]["deferred"] and items[ids["sht"]][0]["reason"] == "Waiting for knives"
    assert items[ids["sht"]][0]["reason_code"] is None  # typed by hand: shown as written
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


def test_work_that_needs_the_line_stopped_goes_in_a_stop_window(world):
    ws, ids = _setup(world)
    planner, sup, eng, mgr = world.api("planner"), world.api("mech_sup"), world.api("engineer"), world.api("manager")
    line = next(a for a in planner.ok("get", "/assets", params={"q": "PM1"})["items"] if a["code"] == "PM1")
    unit = planner.ok("post", "/assets", {"code": "PM1-PRESS", "name": "Press", "department_id": str(world.depts["PM"].id),
                                          "parent_id": line["id"], "level": "unit", "criticality": "A"}, status=201)  # fmt: skip
    other = mk_asset(planner, world, "SH1", crit="B")
    mon = (ws + timedelta(days=1)).isoformat()
    # Who may enter stop windows
    assert (
        world.api("tech")
        .post("/schedule/stop-windows", {"asset_id": line["id"], "work_date": mon, "start_time": "09:00", "hours": 4})
        .status_code
        == 403
    )
    planner.ok(
        "post",
        "/schedule/stop-windows",
        {"asset_id": line["id"], "work_date": mon, "start_time": "09:00", "hours": 4, "note": "Wash-up"},
        status=201,
    )

    def wo(asset, title, hours, prio="P2"):
        w = planner.ok("post", "/work-orders", {"asset_id": asset["id"], "type": "corrective", "title": title, "priority": prio,
                                                "estimated_hours": hours, "requires_stop": True}, status=201)  # fmt: skip
        assert w["requires_stop"] is True
        sup.ok("post", f"/work-orders/{w['id']}/status", {"to": "approved"})
        return w["id"]

    fits, too_long, no_window = wo(unit, "Felt change", 3), wo(unit, "Roll change", 6), wo(other, "Knife change", 2)
    v = planner.ok("post", f"/schedule/weeks/{ws.isoformat()}/propose", {})
    items = _by_wo(v)
    assert [(i["work_date"], i["deferred"]) for i in items[fits]] == [(mon, False)]  # a window on the line above the unit
    assert "every stop window is shorter" in items[too_long][0]["reason"]
    assert "no stop window" in items[no_window][0]["reason"]
    assert (items[too_long][0]["reason_code"], items[no_window][0]["reason_code"]) == ("windows_too_short", "no_window")
    assert [w["asset_code"] for w in v["windows"]] == ["PM1"] and v["windows"][0]["start"] == "09:00"
    # Approved: the stop work is timed inside the window, the rest of the day around it.
    sid = v["schedule"]["id"]
    eng.ok("post", f"/schedule/{sid}/review")
    mgr.ok("post", f"/schedule/{sid}/approve")
    tech = str(world.users["tech"].id)
    w = planner.ok("get", f"/work-orders/{fits}")
    w = w.get("work_order", w)
    assert w["planned_start"] == f"{mon}T06:00:00Z", w["planned_start"]  # 09:00 in the plant (UTC+3): the window start
    spans = []
    for it in v["items"]:
        if not it["deferred"] and it["user_id"] == tech and it["work_date"] == mon:
            x = planner.ok("get", f"/work-orders/{it['work_order']['id']}")
            x = x.get("work_order", x)
            spans.append((x["planned_start"], x["planned_end"]))
    spans.sort()
    for (_, end), (start, _) in zip(spans, spans[1:], strict=False):
        assert start >= end
    # Copy the week's windows to the next week, once.
    nxt = (ws + timedelta(days=7)).isoformat()
    assert planner.ok("post", "/schedule/stop-windows/copy", {"from_week": ws.isoformat(), "to_week": nxt})["copied"] == 1
    assert planner.ok("post", "/schedule/stop-windows/copy", {"from_week": ws.isoformat(), "to_week": nxt})["copied"] == 0
    win = planner.ok("get", f"/schedule/weeks/{nxt}")["windows"][0]
    assert planner.delete(f"/schedule/stop-windows/{win['id']}").status_code == 204


def test_reopened_week_is_planned_again(world):
    ws, ids = _setup(world)
    planner, eng, mgr = world.api("planner"), world.api("engineer"), world.api("manager")
    v = planner.ok("post", f"/schedule/weeks/{ws.isoformat()}/propose", {})
    sid = v["schedule"]["id"]
    eng.ok("post", f"/schedule/{sid}/review")
    mgr.ok("post", f"/schedule/{sid}/approve")
    mgr.ok("post", f"/schedule/{sid}/reopen")
    # The plain job (no skills, no LOTO) now must wait for a stop of its line that only comes on Saturday.
    w = planner.ok("get", f"/work-orders/{ids['plain']}")
    w = w.get("work_order", w)
    planner.ok("patch", f"/work-orders/{ids['plain']}", {"requires_stop": True, "version": w["version"]})
    line = next(a for a in planner.ok("get", "/assets", params={"q": "PM1"})["items"] if a["code"] == "PM1")
    sat = (ws + timedelta(days=6)).isoformat()
    planner.ok("post", "/schedule/stop-windows", {"asset_id": line["id"], "work_date": sat, "start_time": "08:00", "hours": 5}, status=201)
    v = planner.ok("post", f"/schedule/weeks/{ws.isoformat()}/propose", {})
    assert [i["work_date"] for i in _by_wo(v)[ids["plain"]]] == [sat]
    # Approved again: the work order it now defers comes off the schedule.
    hyd = ids["hyd"]
    v = planner.ok("post", f"/schedule/{sid}/work-orders/{hyd}/defer", {"reason": "Parts late"})
    eng.ok("post", f"/schedule/{sid}/review")
    assert any(
        x["code"] == "taken_off" and x["params"]["number"] and "taken off the schedule" in x["text"]
        for x in mgr.ok("post", f"/schedule/{sid}/approve")["apply_warnings"]
    )
    w = planner.ok("get", f"/work-orders/{hyd}")
    w = w.get("work_order", w)
    assert w["status"] == "planned" and w["planned_start"] is None


def test_plan_of_any_length_from_any_day(world):
    """A plan is a week by default, or 1–31 days from any day (e.g. 10 or 20 days); plans may not overlap."""
    ws, ids = _setup(world)
    planner = world.api("planner")
    start = ws + timedelta(days=3)  # a Wednesday
    v = planner.ok("get", f"/schedule/weeks/{start.isoformat()}", params={"days": 10})
    assert len(v["days"]) == 10 and v["days"][0] == start.isoformat() and v["schedule"] is None
    v = planner.ok("post", f"/schedule/weeks/{start.isoformat()}/propose", {"days": 10})
    assert v["schedule"]["days"] == 10 and len(v["days"]) == 10
    assert all(start.isoformat() <= i["work_date"] <= (start + timedelta(days=9)).isoformat() for i in v["items"] if not i["deferred"])
    # once proposed, the plan keeps its length without asking
    assert len(planner.ok("get", f"/schedule/weeks/{start.isoformat()}")["days"]) == 10
    # a plan sharing a day with it is refused; the page shows the plan it overlaps
    r = planner.post(f"/schedule/weeks/{ws.isoformat()}/propose", {"days": 7})
    assert r.status_code == 409 and r.json()["code"] == "schedule_overlap"
    assert planner.ok("get", f"/schedule/weeks/{ws.isoformat()}")["overlaps"][0]["start"] == start.isoformat()
    # right after it is free; shortening the plan itself is allowed
    after = start + timedelta(days=10)
    assert planner.ok("post", f"/schedule/weeks/{after.isoformat()}/propose", {"days": 20})["schedule"]["days"] == 20
    assert planner.ok("post", f"/schedule/weeks/{start.isoformat()}/propose", {"days": 5})["schedule"]["days"] == 5
    assert planner.post(f"/schedule/weeks/{start.isoformat()}/propose", {"days": 32}).status_code == 422
