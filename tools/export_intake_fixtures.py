"""Dev-only fixtures for the intake wizard's ?preview mode (no sign-in):
- ss-workspace/src/dev/bucket.json: proposal files per solicitation, as listed in SS-Proposals
- ss-workspace/src/dev/sectionm.json: what SS_SectionMAnalyst returns for each generated Section M,
  derived from the evaluation plan the Section M was rendered from

Usage: python3 tools/export_intake_fixtures.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "ss-workspace" / "src" / "dev"

bucket = {}
for f in sorted((ROOT / "data" / "proposals").glob("*/*/*.pdf")):
    sol, code, name = f.parts[-3:]
    bucket.setdefault(sol, []).append(f"{sol}/{code}/{name}")

sectionm = {}
for p in sorted((ROOT / "evaluation-plans").glob("*.json")):
    plan = json.loads(p.read_text())
    text = (ROOT / "data" / "solicitations" / plan["solicitationId"] / "Section-M.txt").read_text()
    sentences = re.split(r"(?<=\.)\s+", text)
    ri = plan["relativeImportance"]
    ranks = {}
    for f in plan["factors"]:
        ranks[f["id"]] = f["order"]
    if "equal importance" in ri:  # e.g. "T1 and T2 are of equal importance"
        rated = [f for f in plan["factors"] if not f.get("evaluatedNotRated")]
        ranks[rated[1]["id"]] = ranks[rated[0]["id"]]
        for f in rated[2:]:
            ranks[f["id"]] -= 1
    sectionm[plan["solicitationId"]] = {
        "basisForAward": plan["basisForAward"],
        "relativeImportance": ri,
        "factors": [{
            "name": f["name"], "criteria": f["criteria"], "subfactors": f.get("subfactors", []),
            "ratingType": "price" if f.get("evaluatedNotRated") else "confidence" if f.get("scale") == "confidence" else "merit",
            "volume": f["volume"], "importanceRank": ranks[f["id"]],
            "sourceQuote": next((s for s in sentences if s.startswith(f["criteria"][:40])), f["criteria"]),
        } for f in plan["factors"]],
        "volumes": [{"volume": v, "pageLimit": plan["submission"].get("pageLimits", {}).get(v, 0)} for v in plan["submission"]["volumes"]],
        "ratingMethod": "color" if "Air Force" in plan["agency"] else "adjectival",
        "openQuestions": "None" if "Air Force" in plan["agency"] else "Section M states non-price factors combined are approximately equal to Price; confirm Price's position in the importance order.",
    }

(OUT / "bucket.json").write_text(json.dumps(bucket, indent=1))
(OUT / "sectionm.json").write_text(json.dumps(sectionm, indent=1))
print("wrote", len(bucket), "solicitations of proposal files and", len(sectionm), "Section M results")
