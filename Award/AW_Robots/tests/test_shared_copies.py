"""repo.py and records.py are SS_Robots' own, copied so each function package stands alone. Both robots must read and
write the one record the same way, so a change to either copy has to be made to both."""
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
SS_ROBOTS = HERE.parents[2] / "SourceSelection" / "SS_Robots"


@pytest.mark.parametrize("name", ["repo.py", "records.py"])
def test_shared_module_matches_ss_robots(name):
    assert (HERE.parent / name).read_text() == (SS_ROBOTS / name).read_text(), f"{name} differs from SourceSelection/SS_Robots/{name}"
