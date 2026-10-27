"""The placeholders letters.py leaves must be the ones the executeAward form fills (record.ts LETTER_DATE / LETTER_SIGNATURE)."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import letters  # noqa: E402


def test_placeholders_match_the_form():
    ts = (HERE.parents[2] / "award-task-forms" / "src" / "lib" / "record.ts").read_text()
    assert f"export const LETTER_DATE = '{letters.DATE}'" in ts
    assert f'export const LETTER_SIGNATURE = "{letters.SIGNATURE}"' in ts
