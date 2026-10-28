"""Export the SS Data Fabric records to a JSON snapshot for the action app's local preview harness.

Usage: python3 tools/export_snapshot.py [out.json] [--only SOL1,SOL2] [--drop pages,findings]
--only keeps just those solicitations' rows (the Award app's preview uses the awarded ones); --drop empties tables the
preview doesn't need, to keep the snapshot small.
Keys are restored to the entity schema's exact field names (the CLI envelope PascalCases them).
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IDS = json.loads((ROOT / "tools" / "schema" / "entity-ids.json").read_text())
KEYS = {"SSSolicitation": "solicitations", "SSOfferor": "offerors", "SSProposalPage": "pages", "SSFinding": "findings",
        "SSRating": "ratings", "SSDecision": "decisions", "SSAuditEvent": "audit",
        "SSAward": "awards", "SSCorrespondence": "correspondence", "SSProtest": "protests",
        "SSSchedule": "schedule", "SSFunding": "funding", "SSAlert": "alerts", "SSModification": "modifications", "SSRefVendor": "vendors"}
# Rows that belong to no one solicitation (SAM and CPARS stand-ins, by UEI) are kept whole under --only.
SHARED = {"vendors"}


def uip(*args):
    out = subprocess.run(["uip", *args, "--output", "json"], capture_output=True, text=True).stdout
    return json.loads(out[out.index("{"):])


def main(out, only=None, drop=()):
    snap = {}
    for entity, key in KEYS.items():
        fields = [f["Name"] for f in uip("df", "entities", "get", IDS[entity])["Data"]["Fields"]]
        canon = {f.lower(): f for f in fields}
        rows = uip("df", "records", "list", IDS[entity], "--limit", "1000")["Data"]["Items"]
        snap[key] = [{canon.get(k.lower(), k): v for k, v in r.items()} for r in rows]
        if only and key not in SHARED:
            snap[key] = [r for r in snap[key] if r.get("SolicitationId") in only]
        if key in drop:
            snap[key] = []
        print(f"{entity}: {len(snap[key])}")
    Path(out).write_text(json.dumps(snap, indent=1))


if __name__ == "__main__":
    args = sys.argv[1:]
    only = set(args[args.index("--only") + 1].split(",")) if "--only" in args else None
    drop = set(args[args.index("--drop") + 1].split(",")) if "--drop" in args else set()
    paths = [a for i, a in enumerate(args) if a not in ("--only", "--drop") and (i == 0 or args[i - 1] not in ("--only", "--drop"))]
    main(paths[0] if paths else str(ROOT / "ss-task-forms" / "src" / "dev" / "snapshot.json"), only, drop)
