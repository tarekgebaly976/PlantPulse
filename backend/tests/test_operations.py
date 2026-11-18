"""Operations module: the paper machine's daily production report.

The main test fills one invented sample day and checks every figure against values worked out by hand:
gross 398 t, net 392.3 t, A-grade 375 t, run 19 h, ideal 466.8 t, OEE 64.52 %
(availability 79.17 % × performance 85.26 % × quality 95.59 %)."""

import pytest

from app.core.config import get_settings
from tests.conftest import World, mk_asset

DAY = "2026-11-05"
NEXT = "2026-11-06"


@pytest.fixture(autouse=True)
def _module_on():
    s = get_settings()
    before = s.operations_module
    s.operations_module = True
    yield
    s.operations_module = before


def setup_mill(world: World) -> dict:
    mgr = world.api("manager")
    line = mk_asset(mgr, world, "PM1")
    cal = mk_asset(mgr, world, "PM1-CAL", level="unit", parent=line["id"])
    m = mgr.ok(
        "post",
        "/operations/machines",
        {
            "code": "PM1",
            "name": "Paper machine 1",
            "department_id": str(world.depts["PM"].id),
            "asset_id": line["id"],
            "report_profile": "paper_machine",
            "trim_width_m": 3.2,
            "day_start": "07:00",
            "shifts": [{"code": "D", "name": "Day shift", "start": "07:00"}, {"code": "N", "name": "Night shift", "start": "19:00"}],
        },
        status=201,
    )
    g400 = mgr.ok(
        "post",
        f"/operations/machines/{m['id']}/grades",
        {"code": "400", "gsm": 400, "target_speed_mpm": 312, "ideal_mt_min": 0.4},
        status=201,
    )
    g300 = mgr.ok(
        "post",
        f"/operations/machines/{m['id']}/grades",
        {"code": "300", "gsm": 300, "target_speed_mpm": 448, "ideal_mt_min": 0.43},
        status=201,
    )
    sec = mgr.ok("post", f"/operations/machines/{m['id']}/sections", {"name": "Calender section", "asset_id": cal["id"]}, status=201)
    bc = mgr.ok("post", f"/operations/machines/{m['id']}/sections", {"name": "Back coater"}, status=201)
    d = {
        code: mgr.ok("post", "/operations/disciplines", {"code": code, "name": code, "maintenance": maint}, status=201)["id"]
        for code, maint in (("MECH", True), ("ELEC", True), ("PROC", False), ("PREP", False))
    }
    pps = mgr.ok("post", "/operations/defects", {"name": "Rough surface", "disposition": "R/P"}, status=201)["id"]
    return {"mgr": mgr, "machine": m, "line": line, "cal": cal, "g400": g400, "g300": g300, "sec": sec, "bc": bc, "d": d, "pps": pps}


def fill_day(api, s: dict) -> str:
    rid = api.ok("post", "/operations/reports", {"machine_id": s["machine"]["id"], "report_date": DAY}, status=201)["id"]
    seg = f"/operations/reports/{rid}/segments"
    api.ok(
        "post",
        seg,
        {
            "started_at": f"{DAY}T07:00:00",
            "ended_at": f"{DAY}T15:00:00",
            "grade_id": s["g400"]["id"],
            "speed_mpm": 300,
            "reason": "From previous shift",
        },
    )
    api.ok("post", seg, {"started_at": f"{DAY}T18:00:00", "ended_at": f"{DAY}T23:00:00", "grade_id": s["g400"]["id"], "speed_mpm": 300})
    api.ok("post", seg, {"started_at": f"{NEXT}T01:00:00", "ended_at": f"{NEXT}T07:00:00", "grade_id": s["g300"]["id"], "speed_mpm": 440})
    stop = f"/operations/reports/{rid}/stops"
    # One calender fault, 1 h 30 mechanical then 1 h 30 electrical
    api.ok("post", stop, {
        "started_at": f"{DAY}T15:00:00", "ended_at": f"{DAY}T18:00:00", "event_type": "breakdown", "section_id": s["sec"]["id"],
        "reason": "Calender hydraulics fault",
        "parts": [{"discipline_id": s["d"]["MECH"], "hours": 1.5}, {"discipline_id": s["d"]["ELEC"], "hours": 1.5}],
    })  # fmt: skip
    api.ok("post", stop, {"started_at": f"{DAY}T23:00:00", "ended_at": f"{NEXT}T01:00:00", "event_type": "planned", "section_id": s["bc"]["id"],
                          "reason": "Planned cleaning"})  # fmt: skip
    reel = f"/operations/reports/{rid}/reels"
    api.ok("post", reel, {"shift": "D", "reel_no": "11", "gsm": 400, "gross_mt": 10.0, "net_mt": 8.0, "reject_mt": 1.5})
    api.ok("post", reel, {"shift": "D", "reel_no": "12", "gsm": 400, "gross_mt": 8.0, "net_mt": 7.8, "b_grade_mt": 7.8})
    api.ok("post", reel, {"shift": "D", "reel_no": "13-22", "gsm": 400, "gross_mt": 150.0, "net_mt": 147.0})
    api.ok("post", reel, {"shift": "N", "reel_no": "23-37", "gsm": 300, "gross_mt": 230.0, "net_mt": 220.0, "reject_mt": 8.0})
    loss = f"/operations/reports/{rid}/losses"
    api.ok("post", loss, {"kind": "reject", "shift": "D", "defect_id": s["pps"], "qty_mt": 1.5})
    api.ok("post", loss, {"kind": "reject", "defect_text": "Machine start-up", "qty_mt": 8, "disposition": "R/P"})
    api.ok("post", loss, {"kind": "downgrade", "defect_id": s["pps"], "qty_mt": 7.8, "disposition": "F/H"})
    return rid


def test_daily_report_figures(world: World):
    s = setup_mill(world)
    sup = world.api("production")  # production user: enters the report
    rid = fill_day(sup, s)
    r = sup.ok("get", f"/operations/reports/{rid}")
    c = r["calc"]
    assert c["day"]["gross"] == pytest.approx(398.0)
    assert c["day"]["net"] == pytest.approx(392.3)
    assert c["day"]["a"] == pytest.approx(375.0)
    assert c["day"]["b"] == pytest.approx(7.8)
    assert c["day"]["reject"] == pytest.approx(9.5)
    assert c["day"]["trim"] == pytest.approx(5.7, abs=0.001)
    assert c["run_hours"] == pytest.approx(19.0)
    assert c["ideal_mt"] == pytest.approx(466.8)
    o = c["oee"]
    assert o["availability"] == pytest.approx(0.7917, abs=0.0001)
    assert o["performance"] == pytest.approx(0.8526, abs=0.0001)
    assert o["quality"] == pytest.approx(0.9559, abs=0.0001)
    assert o["oee"] == pytest.approx(0.6452, abs=0.0001)
    shifts = {x["code"]: x for x in c["shifts"]}
    assert shifts["D"]["gross"] == pytest.approx(168.0) and shifts["N"]["gross"] == pytest.approx(230.0)
    assert shifts["D"]["a"] == pytest.approx(155.0) and shifts["D"]["trim"] == pytest.approx(3.7)
    assert shifts["D"]["run_hours"] == pytest.approx(9.0) and shifts["N"]["run_hours"] == pytest.approx(10.0)
    st = c["stops"]
    assert st["downtime_by_discipline"] == {s["d"]["MECH"]: 1.5, s["d"]["ELEC"]: 1.5}
    assert st["planned_hours"] == pytest.approx(2.0)
    assert st["breaks_count"] == 0
    assert c["gross_by_gsm"] == {"300": 230.0, "400": 168.0}
    assert c["warnings"] == []  # 24 h accounted for, losses explain the reject and B-grade
    # the calender stop is an equipment failure of the calender (maintenance KPIs), the cleaning is planned
    stops = {x["event_type"]: x for x in r["stops"]}
    assert stops["breakdown"]["is_failure"] is True and stops["breakdown"]["asset_id"] == s["cal"]["id"]
    assert stops["planned"]["is_failure"] is False
    # production user cannot confirm; submits
    assert sup.post(f"/operations/reports/{rid}/confirm").status_code == 403
    sup.ok("post", f"/operations/reports/{rid}/submit")
    # after submitting, the production user can no longer change it
    assert sup.post(f"/operations/reports/{rid}/reels", {"shift": "N", "reel_no": "999", "gross_mt": 1, "net_mt": 1}).status_code == 409
    mgr = s["mgr"]
    mgr.ok("post", f"/operations/reports/{rid}/confirm")
    # confirmed: the KPI page's OEE uses the same figures
    k = mgr.ok("get", "/kpis/oee", params={"start": DAY, "end": DAY, "asset_id": s["line"]["id"]})
    assert k["available"] and k["value"] == pytest.approx(64.52, abs=0.02)
    # MTBF sees one failure (the calender), not the planned cleaning
    mt = mgr.ok("get", "/kpis/mtbf", params={"start": DAY, "end": NEXT, "asset_id": s["line"]["id"]})
    assert mt["details"]["failures"] == 1
    # locked; reopen makes revision 2
    assert mgr.patch(f"/operations/reports/{rid}", {"notes": "x"}).status_code == 409
    assert mgr.post(f"/operations/reports/{rid}/reopen", {"note": "no"}).status_code == 422
    out = mgr.ok("post", f"/operations/reports/{rid}/reopen", {"note": "Reel 12 weight corrected"})
    assert out == {"status": "draft", "revision": 2}


def test_month_to_date_and_list(world: World):
    s = setup_mill(world)
    mgr = s["mgr"]
    rid = fill_day(mgr, s)
    rid2 = mgr.ok("post", "/operations/reports", {"machine_id": s["machine"]["id"], "report_date": NEXT}, status=201)["id"]
    mgr.ok("post", f"/operations/reports/{rid2}/segments",
           {"started_at": f"{NEXT}T07:00:00", "ended_at": f"{NEXT}T19:00:00", "grade_id": s["g300"]["id"]})  # fmt: skip
    mgr.ok("post", f"/operations/reports/{rid2}/reels", {"shift": "D", "reel_no": "154", "gross_mt": 100, "net_mt": 98})
    mgr.ok("post", f"/operations/reports/{rid2}/stops", {
        "started_at": f"{NEXT}T19:00:00", "ended_at": f"{NEXT}T19:30:00", "event_type": "sheet_break",
        "parts": [{"discipline_id": s["d"]["PROC"]}],
    })  # fmt: skip
    r2 = mgr.ok("get", f"/operations/reports/{rid2}")
    assert r2["calc"]["stops"]["breaks_count"] == 1
    assert r2["calc"]["stops"]["breaks_hours_by_discipline"] == {s["d"]["PROC"]: 0.5}
    assert r2["stops"][0]["is_failure"] is False  # sheet breaks never count as equipment failures
    assert r2["calc"]["mtd"]["days"] == 2
    assert r2["calc"]["mtd"]["production"]["gross"] == pytest.approx(498.0)
    assert {w["code"] for w in r2["calc"]["warnings"]} >= {"time_not_accounted"}
    assert r2["prev"]["id"] == rid
    lst = mgr.ok("get", "/operations/reports", params={"machine_id": s["machine"]["id"], "month": "2026-11"})
    assert [x["report_date"] for x in lst["items"]] == [NEXT, DAY]
    assert lst["mtd"]["days"] == 2
    # same day again: the existing report is returned
    again = mgr.ok("post", "/operations/reports", {"machine_id": s["machine"]["id"], "report_date": DAY}, status=201)
    assert again == {"id": rid, "existing": True}


def test_rules_on_entries(world: World):
    s = setup_mill(world)
    mgr = s["mgr"]
    rid = mgr.ok("post", "/operations/reports", {"machine_id": s["machine"]["id"], "report_date": DAY}, status=201)["id"]
    base = f"/operations/reports/{rid}"
    # breakdown without a responsible discipline
    r = mgr.post(f"{base}/stops", {"started_at": f"{DAY}T08:00:00", "ended_at": f"{DAY}T09:00:00", "event_type": "breakdown"})
    assert r.status_code == 422
    # split hours must add up
    r = mgr.post(f"{base}/stops", {"started_at": f"{DAY}T08:00:00", "ended_at": f"{DAY}T09:00:00", "event_type": "breakdown",
                                   "parts": [{"discipline_id": s["d"]["MECH"], "hours": 0.5}, {"discipline_id": s["d"]["ELEC"], "hours": 0.2}]})  # fmt: skip
    assert r.status_code == 422
    # process breakdown (PM discipline): a stop, but not an equipment failure
    ok = mgr.ok("post", f"{base}/stops", {"started_at": f"{DAY}T08:00:00", "ended_at": f"{DAY}T09:00:00", "event_type": "breakdown",
                                          "parts": [{"discipline_id": s["d"]["PROC"]}]})  # fmt: skip
    assert ok["is_failure"] is False
    # reels: net + reject > gross, unknown shift, duplicate number
    assert mgr.post(f"{base}/reels", {"shift": "D", "reel_no": "1", "gross_mt": 10, "net_mt": 9, "reject_mt": 2}).status_code == 422
    assert mgr.post(f"{base}/reels", {"shift": "X", "reel_no": "1", "gross_mt": 10, "net_mt": 9}).status_code == 422
    mgr.ok("post", f"{base}/reels", {"shift": "D", "reel_no": "1", "gross_mt": 10, "net_mt": 9})
    assert mgr.post(f"{base}/reels", {"shift": "N", "reel_no": "1", "gross_mt": 10, "net_mt": 9}).status_code == 409
    # grade of another machine / end before start
    assert (
        mgr.post(
            f"{base}/segments", {"started_at": f"{DAY}T10:00:00", "ended_at": f"{DAY}T09:00:00", "grade_id": s["g400"]["id"]}
        ).status_code
        == 422
    )
    # future day
    assert mgr.post("/operations/reports", {"machine_id": s["machine"]["id"], "report_date": "2099-01-01"}).status_code == 422
    # changing the grade's rate does not change a run already written
    mgr.ok("post", f"{base}/segments", {"started_at": f"{DAY}T10:00:00", "ended_at": f"{DAY}T11:00:00", "grade_id": s["g400"]["id"]})
    g = s["g400"]
    mgr.ok("put", f"/operations/grades/{g['id']}", {"code": "400", "gsm": 400, "target_speed_mpm": 312, "ideal_mt_min": 0.5})
    rep = mgr.ok("get", base)
    assert rep["segments"][0]["ideal_mt_min"] == pytest.approx(0.4)
    assert rep["segments"][0]["speed_mpm"] == pytest.approx(312)  # target speed when none given
    # a draft can be deleted by the manager, its stops go with it
    mgr.ok("delete", base, status=204)
    assert mgr.get(base).status_code == 404


def test_access(world: World):
    s = setup_mill(world)
    tech = world.api("tech")
    assert tech.get("/operations/settings").status_code == 403  # technicians do not see operations
    viewer = world.api("viewer")
    assert viewer.get("/operations/settings").status_code == 200
    assert viewer.post("/operations/reports", {"machine_id": s["machine"]["id"], "report_date": DAY}).status_code == 403
    sup = world.api("production")
    assert sup.post("/operations/disciplines", {"code": "X", "name": "X"}).status_code == 403
    # plant B cannot see plant A's machine
    pb = world.api("planner_b", world.plant_b)
    assert pb.get(f"/operations/reports?machine_id={s['machine']['id']}").json()["items"] == []
    # an SP-only supervisor does not see the PM machine
    sp = world.api("sp_sup")
    assert sp.get("/operations/settings").json()["machines"] == []


def test_module_off_hides_everything(world: World):
    get_settings().operations_module = False
    mgr = world.api("manager")
    assert mgr.get("/operations/settings").status_code == 403
    me = mgr.ok("get", "/auth/me")
    assert not [p for p in me["plants"][0]["permissions"] if p.startswith("op.")]
    admin = world.api("admin")
    assert not [p for p in admin.ok("get", "/auth/me")["plants"][0]["permissions"] if p.startswith("op.")]
    assert not [p for p in admin.ok("get", "/permissions") if p["code"].startswith("op.")]


def test_day_in_progress_cannot_be_submitted(world: World):
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    s = setup_mill(world)
    mgr = s["mgr"]
    now = datetime.now(ZoneInfo("Asia/Riyadh"))
    today = (now - timedelta(hours=7)).date()  # production day in progress (starts 07:00)
    rid = mgr.ok("post", "/operations/reports", {"machine_id": s["machine"]["id"], "report_date": today.isoformat()}, status=201)["id"]
    start = f"{today.isoformat()}T07:00:00"
    end = now.replace(tzinfo=None, second=0, microsecond=0).isoformat()
    if datetime.fromisoformat(end) > datetime.fromisoformat(start) + timedelta(minutes=5):
        mgr.ok("post", f"/operations/reports/{rid}/segments", {"started_at": start, "ended_at": end, "grade_id": s["g400"]["id"]})
        c = mgr.ok("get", f"/operations/reports/{rid}")["calc"]
        assert c["in_progress"] is True
        assert c["oee"]["planned_hours"] < 24  # OEE over the hours so far
        assert c["oee"]["availability"] == pytest.approx(1.0, abs=0.01)
    assert mgr.post(f"/operations/reports/{rid}/submit").status_code == 422
    assert mgr.post(f"/operations/reports/{rid}/confirm").status_code == 422
