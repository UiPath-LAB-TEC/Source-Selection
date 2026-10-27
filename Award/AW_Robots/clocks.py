"""The Award phase's statutory clocks, mirrored line for line from award-task-forms/src/lib/clocks.ts. Both run the cases
in award-task-forms/src/lib/clock-cases.json, so the deadline the robot files is the one the screen shows.

Days are calendar days, and a period ending on a Saturday, Sunday or federal holiday runs to the next business day
(FAR 33.102(a) under the RFO deviation; 4 CFR 21.0(d)); FAR 15.207-2(a) applies the same rule to Part 15's notice and
debriefing periods. DoD's follow-up questions count business days (DFARS 215.301-270).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo

# Federal agencies keep Eastern time on the record's dates, so a notice sent at 10 p.m. ET counts that day.
TIME_ZONE = ZoneInfo("America/New_York")


def day_of(iso: str) -> str:
    """The agency-local calendar day of a timestamp."""
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(TIME_ZONE).date().isoformat()


def _nth(year: int, month: int, dow: int, n: int) -> date:
    """The nth (1-based) weekday `dow` (0 = Sunday, as in JavaScript) of a month, or the last when n is -1."""
    py = (dow - 1) % 7  # Python: Monday = 0
    if n == -1:
        last = (date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1))
        return last - timedelta(days=(last.weekday() - py) % 7)
    first = date(year, month, 1)
    return first + timedelta(days=(py - first.weekday()) % 7 + (n - 1) * 7)


def _observed(d: date) -> date:
    """A fixed-date holiday on a weekend is observed the Friday before or the Monday after (5 U.S.C. 6103(b))."""
    return d - timedelta(days=1) if d.weekday() == 5 else d + timedelta(days=1) if d.weekday() == 6 else d


@lru_cache(maxsize=None)
def federal_holidays(year: int) -> frozenset[date]:
    """The federal holidays of a year (5 U.S.C. 6103(a)), as observed."""
    fixed = lambda m, d: _observed(date(year, m, d))  # noqa: E731
    return frozenset([
        fixed(1, 1), _nth(year, 1, 1, 3), _nth(year, 2, 1, 3), _nth(year, 5, 1, -1), fixed(6, 19), fixed(7, 4),
        _nth(year, 9, 1, 1), _nth(year, 10, 1, 2), fixed(11, 11), _nth(year, 11, 4, 4), fixed(12, 25),
    ])


def is_business_day(d: date) -> bool:
    if d.weekday() >= 5:
        return False
    # New Year's Day on a Saturday is observed on December 31 of the year before.
    return d not in federal_holidays(d.year) and d not in federal_holidays(d.year + 1)


def add_calendar_days(start: str, n: int) -> str:
    """`n` calendar days after `start`, run forward to the next business day if it lands on a weekend or holiday."""
    d = date.fromisoformat(start) + timedelta(days=n)
    while not is_business_day(d):
        d += timedelta(days=1)
    return d.isoformat()


def prior_business_day(day: str) -> str:
    """A contract deadline on a weekend or federal holiday moves back to the business day before, so whoever must act
    does it in time. The protest-counting rule above runs the other way, because there the rule gives the extra day."""
    d = date.fromisoformat(day)
    while not is_business_day(d):
        d -= timedelta(days=1)
    return d.isoformat()


def add_business_days(start: str, n: int) -> str:
    d, left = date.fromisoformat(start), n
    while left > 0:
        d += timedelta(days=1)
        if is_business_day(d):
            left -= 1
    return d.isoformat()


def award_clocks(awarded_at: str | None, notices: list[dict]) -> dict:
    """The deadlines stored in SSAward.ClocksJson (shape of clocks.ts AwardClocks).

    noticesDue: notices to unsuccessful offerors within 3 days after award (FAR 15.207-2(b)).
    requestDue: each unsuccessful offeror may request a debriefing within 3 days after its notice (FAR 15.301-1(a)(1)).
    stayByAward: a GAO protest stays performance if GAO's notice arrives within 10 days after award
    (31 U.S.C. 3553(d)(4)(A)), or later once a debriefing is offered.
    """
    request_due = {n["offerorId"]: add_calendar_days(day_of(n["deliveredAt"]), 3)
                   for n in notices if n.get("kind") == "UnsuccessfulNotice" and n.get("deliveredAt")}
    out: dict = {}
    if awarded_at:
        award = day_of(awarded_at)
        out |= {"noticesDue": add_calendar_days(award, 3), "stayByAward": add_calendar_days(award, 10)}
    return out | {"requestDue": request_due}
