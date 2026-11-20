"""The demo comes with what the weekly schedule needs: skills, a roster for this week and the next, a line stop window
and approved work for next week; proposing next week places most of it and says why the rest is deferred."""

from datetime import timedelta

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models.tenancy import Plant
from app.seed import seed_demo
from app.services.common import plant_today
from app.services.weekly import week_of
from tests.conftest import login

PW = "Demo-test-Pass-2026!"


def test_demo_has_a_week_to_schedule():
    seed_demo(PW, "general")
    with SessionLocal() as db:
        plant = db.execute(select(Plant).where(Plant.code == "DMO")).scalar_one()
        pid, nxt = plant.id, week_of(plant_today(plant)) + timedelta(days=7)
    planner = login("planner@demo.example.com", pid, PW)
    assert len(planner.ok("get", "/skills")) == 6
    v = planner.ok("post", f"/schedule/weeks/{nxt.isoformat()}/propose", {})
    placed = [i for i in v["items"] if not i["deferred"]]
    reasons = {i["work_order"]["title"]: i["reason"] for i in v["items"] if i["deferred"]}
    assert len({i["work_order"]["id"] for i in placed}) >= 6
    assert reasons["Safety guard inspection"] == "no estimated hours"
    assert "longer than one shift" in reasons["Pump overhaul"]
    assert "HV certificate" in reasons["Medium-voltage breaker test"]
    assert len(v["windows"]) == 1 and not v["windows"][0]["asset_code"].startswith("ELE-")  # on a real line
    # Line-stop work sits on the day of the window; Friday and Saturday are work days for some.
    stop_day = (nxt + timedelta(days=2)).isoformat()
    assert all(i["work_date"] == stop_day for i in placed if i["work_order"]["stop"])
    assert any(d["kind"] == "work" for p in v["people"] for day, d in p["days"].items() if day == (nxt + timedelta(days=6)).isoformat())
