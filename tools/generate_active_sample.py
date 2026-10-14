"""Render one of the demo proposal packages under another solicitation number, with factor weights.

Usage: .venv/bin/python tools/generate_active_sample.py [--source FA8771-27-R-0012] [--id FA8771-27-R-0031]
                                                         [--weights F1=40,F2=30,F3=20,PRICE=10]
Output: samples/<id>/<OFFEROR>/<volume>.pdf (official look) and samples/<id>/plan.json, the evaluation plan
(evaluation-plans/<source>.json renumbered, with the weights). --source names a package in tools/proposal_content.py.
Each solicitation number can be started only once, so a fresh demo run needs a fresh number.
"""
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import generate_proposals as gp  # noqa: E402
import proposal_content as pc  # noqa: E402


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


SOURCE = arg("--source", "FA8771-27-R-0012")
NEW = arg("--id", "FA8771-27-R-0031")
WEIGHTS = {k: int(v) for k, v in (p.split("=") for p in arg("--weights", "F1=40,F2=30,F3=20,PRICE=10").split(","))}


def renumber(v):
    """Deep copy with every occurrence of the source number replaced, in keys and text alike."""
    if isinstance(v, dict):
        return {renumber(k): renumber(x) for k, x in v.items()}
    if isinstance(v, list):
        return [renumber(x) for x in v]
    return v.replace(SOURCE, NEW) if isinstance(v, str) else v


out = ROOT / "samples"
gp.OFFERORS = {k: renumber(copy.deepcopy(o)) for k, o in pc.OFFERORS.items() if o["solicitation"] == SOURCE}
gp.SOLICITATIONS = {NEW: copy.deepcopy(pc.SOLICITATIONS[SOURCE])}
gp.CLIN_LABELS = {NEW: copy.deepcopy(pc.CLIN_LABELS[SOURCE])}
pages = gp.render(out, official=True)
(out / "pages.json").unlink(missing_ok=True)

plan = renumber(json.loads((ROOT / "evaluation-plans" / f"{SOURCE}.json").read_text()))
for f in plan["factors"]:
    f["weight"] = WEIGHTS[f["id"]]
assert sum(f["weight"] for f in plan["factors"]) == 100, "weights must total 100"
(out / NEW / "plan.json").write_text(json.dumps(plan, indent=1, ensure_ascii=False))
print(f"{NEW}: {len(pages)} proposal pages across {len(gp.OFFERORS)} offerors and plan.json -> {out / NEW}")
