"""Management presentation (PowerPoint): who may generate it, the period arithmetic, and what lands on the slides."""

import io
from datetime import date, datetime
from zoneinfo import ZoneInfo

from pptx import Presentation

from app.services.mgmt_report import next_period, previous_period
from tests.conftest import mk_asset

TZ = ZoneInfo("Asia/Riyadh")
SEPT = {"start": "2026-09-01", "end": "2026-09-30"}
URL = "/kpis/management-report.pptx"


def _texts(content: bytes) -> list[str]:
    prs = Presentation(io.BytesIO(content))
    out = []
    for slide in prs.slides:
        parts = []
        for sh in slide.shapes:
            if sh.has_text_frame:
                parts.append(sh.text_frame.text)
            if sh.has_table:
                parts += [c.text for r in sh.table.rows for c in r.cells]
        out.append("\n".join(parts))
    return out


def test_periods_whole_months_and_free_ranges():
    assert previous_period(date(2026, 10, 1), date(2026, 10, 31)) == (date(2026, 9, 1), date(2026, 9, 30))
    assert next_period(date(2026, 10, 1), date(2026, 10, 31)) == (date(2026, 11, 1), date(2026, 11, 30))
    # a quarter compares with the previous quarter
    assert previous_period(date(2026, 4, 1), date(2026, 6, 30)) == (date(2026, 1, 1), date(2026, 3, 31))
    assert next_period(date(2026, 10, 1), date(2026, 12, 31)) == (date(2027, 1, 1), date(2027, 3, 31))
    # a free range keeps its length in days
    assert previous_period(date(2026, 10, 5), date(2026, 10, 18)) == (date(2026, 9, 21), date(2026, 10, 4))
    assert next_period(date(2026, 10, 5), date(2026, 10, 18)) == (date(2026, 10, 19), date(2026, 11, 1))


def test_only_planning_and_managers_may_generate(world):
    for who in ("manager", "planner", "admin"):
        r = world.api(who).get(URL, params=SEPT)
        assert r.status_code == 200, who
        assert r.content[:2] == b"PK" and "presentationml" in r.headers["content-type"]
    for who in ("mech_sup", "engineer", "tech", "viewer", "production", "store"):
        assert world.api(who).get(URL, params=SEPT).status_code == 403, who
    assert world.api("manager").get(URL, params={**SEPT, "lang": "fr"}).status_code == 422


def test_slides_carry_the_period_figures_in_each_language(world):
    mgr, sup = world.api("manager"), world.api("mech_sup")
    line = mk_asset(mgr, world, "PM1")
    for d, h in ((5, 4), (20, 6)):
        sup.ok(
            "post",
            f"/assets/{line['id']}/downtime",
            {
                "started_at": datetime(2026, 9, d, 0, tzinfo=TZ).isoformat(),
                "ended_at": datetime(2026, 9, d, h, tzinfo=TZ).isoformat(),
                "is_failure": True,
            },
            status=201,
        )
    en = _texts(mgr.get(URL, params={**SEPT, "lang": "en"}).content)
    assert len(en) == 11
    assert "Maintenance Management Report" in en[0] and "2026-09-01 → 2026-09-30" in en[0]
    assert "2026-08-01 → 2026-08-31" in en[1]  # September is compared with August
    assert "MTTR" in en[2] and "5 h" in en[2]  # (4 h + 6 h) / 2 repairs
    assert "PM1" in en[5] and "10" in en[5]  # top bad actor with 10 h of breakdown downtime
    assert "2026-10-01 → 2026-10-31" in en[9]  # plan for the next period

    ar = _texts(mgr.get(URL, params={**SEPT, "lang": "ar"}).content)
    assert "تقرير إدارة الصيانة" in ar[0] and "من 2026-09-01 إلى 2026-09-30" in ar[0]
    bn = _texts(mgr.get(URL, params={**SEPT, "lang": "bn"}).content)
    assert "রক্ষণাবেক্ষণ ব্যবস্থাপনা রিপোর্ট" in bn[0]


def test_language_defaults_to_the_users_interface_language(world):
    mgr = world.api("manager")
    mgr.ok("post", "/auth/locale", {"locale": "ar"}, status=204)
    assert "تقرير إدارة الصيانة" in _texts(mgr.get(URL, params=SEPT).content)[0]
