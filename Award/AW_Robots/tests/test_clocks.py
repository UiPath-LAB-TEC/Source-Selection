"""clocks.py against the cases clocks.ts also runs (award-task-forms/src/lib/clock-cases.json)."""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import clocks  # noqa: E402

CASES = json.loads((HERE.parents[2] / "award-task-forms" / "src" / "lib" / "clock-cases.json").read_text())


@pytest.mark.parametrize("c", CASES["calendar"], ids=lambda c: c["why"])
def test_calendar_days(c):
    assert clocks.add_calendar_days(c["from"], c["n"]) == c["expect"]


@pytest.mark.parametrize("c", CASES["business"], ids=lambda c: c["why"])
def test_business_days(c):
    assert clocks.add_business_days(c["from"], c["n"]) == c["expect"]


@pytest.mark.parametrize("c", CASES["dayOf"], ids=lambda c: c["iso"])
def test_day_of(c):
    assert clocks.day_of(c["iso"]) == c["expect"]


@pytest.mark.parametrize("c", CASES["award"])
def test_award_clocks(c):
    assert clocks.award_clocks(c["awardedAt"], c["notices"]) == c["expect"]


@pytest.mark.parametrize("c", CASES["priorBusiness"], ids=lambda c: c["why"])
def test_prior_business_day(c):
    assert clocks.prior_business_day(c["day"]) == c["expect"]
