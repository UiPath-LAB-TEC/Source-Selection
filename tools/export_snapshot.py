"""Export the SS Data Fabric records to a JSON snapshot for the action app's local preview harness.

Usage: python3 tools/export_snapshot.py [out.json]
Keys are restored to the entity schema's exact field names (the CLI envelope PascalCases them).
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IDS = json.loads((ROOT / "tools" / "schema" / "entity-ids.json").read_text())
KEYS = {"SSSolicitation": "solicitations", "SSOfferor": "offerors", "SSProposalPage": "pages", "SSFinding": "findings",
        "SSRating": "ratings", "SSDecision": "decisions", "SSAuditEvent": "audit"}


def uip(*args):
    out = subprocess.run(["uip", *args, "--output", "json"], capture_output=True, text=True).stdout
    return json.loads(out[out.index("{"):])


def main(out):
    snap = {}
    for entity, key in KEYS.items():
        fields = [f["Name"] for f in uip("df", "entities", "get", IDS[entity])["Data"]["Fields"]]
        canon = {f.lower(): f for f in fields}
        rows = uip("df", "records", "list", IDS[entity], "--limit", "1000")["Data"]["Items"]
        snap[key] = [{canon.get(k.lower(), k): v for k, v in r.items()} for r in rows]
        print(f"{entity}: {len(rows)}")
    Path(out).write_text(json.dumps(snap, indent=1))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "ss-task-forms" / "src" / "dev" / "snapshot.json"))
