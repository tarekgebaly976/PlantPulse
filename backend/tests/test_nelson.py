"""Nelson rules (control-chart sheet variant: 7 in a row for rules 2 and 3, 14 for rule 7) and where the app uses them."""

from datetime import UTC, datetime, timedelta

from app.services.nelson import nelson
from tests.test_pdm import _point

BASE = [10.0, 11.0, 10.0, 9.0, 10.0, 11.0, 10.0, 9.0, 10.0, 11.0]  # in control: no rule


def rules_at(x):
    return {i: t for i, t in enumerate(nelson(x).triggers) if t}


def test_in_control_and_too_few_points():
    assert nelson(BASE).rules == []
    assert nelson([1.0, 2.0]).mean is None and nelson([5.0, 5.0, 5.0]).rules == []  # no variation: no sigma


def test_each_rule():
    assert 1 in rules_at([*BASE, 30.0])[10]  # far outside
    assert 2 in nelson([*BASE, 8, 12, 12.5, 12, 12.5, 12, 12.5, 12]).triggers[-1]  # 7 above the centre line
    assert 2 not in nelson([*BASE, 8, 12, 12.5, 12, 12.5, 12, 12.5]).triggers[-1]  # only 6
    up = nelson([*BASE, 8, 9, 10, 11, 12, 13, 14]).triggers  # 7 rising
    assert 3 in up[-1] and 3 not in up[-2]
    zigzag = [10.0 + (1 if i % 2 else -1) for i in range(14)]
    assert 4 in nelson(zigzag).triggers[-1] and 4 not in nelson(zigzag[:13]).triggers[-1]
    assert 5 in nelson([*BASE, *BASE, 13.5, 10, 13.5]).triggers[-1]  # 2 of 3 beyond 2 sigma, same side
    assert 6 in nelson([*BASE, *BASE, 12, 12, 10, 12, 12]).triggers[-1]  # 4 of 5 beyond 1 sigma
    calm = [*BASE, 30.0, *[10.0 + (0.1 if i % 3 else -0.1) for i in range(14)]]
    assert 7 in nelson(calm).triggers[-1]
    wide = [*BASE, *BASE, 13, 13.2, 13.1, 13.3, 7, 7.1, 6.9, 7.2]  # 8 in a row away from the centre, either side
    assert 8 in nelson(wide).triggers[-1]


def test_condition_monitoring_signals(world):
    rel, _, p = _point(world, warning_high=None, alarm_high=None)
    t0 = datetime(2026, 10, 1, tzinfo=UTC)
    for i, v in enumerate([*BASE, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6]):
        rel.ok("post", f"/pdm/points/{p['id']}/readings", {"value": v, "measured_at": (t0 + timedelta(days=i)).isoformat()}, status=201)
    sig = world.api("tech").ok("get", "/pdm/signals")
    assert 3 in sig[p["id"]] and 2 in sig[p["id"]]  # rising for 7 readings, all below the centre line


def test_dashboard_prefs_are_per_user(world):
    a, b = world.api("admin"), world.api("tech")
    assert a.ok("get", "/dashboard/prefs") == {"hidden": [], "calc": None, "company": None}
    saved = a.ok(
        "put", "/dashboard/prefs", {"hidden": ["tile.lube_overdue", "section.activity"], "calc": ["mtbf", "backlog"], "company": None}
    )
    assert saved["calc"] == ["mtbf", "backlog"]
    assert a.ok("get", "/dashboard/prefs")["hidden"] == ["tile.lube_overdue", "section.activity"]
    assert b.ok("get", "/dashboard/prefs")["hidden"] == []  # another user's layout is untouched
    assert a.put("/dashboard/prefs", {"hidden": ["<script>"]}).status_code == 422
    assert a.put("/dashboard/prefs", {"other": 1}).status_code == 422
