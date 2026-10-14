"""Reset one solicitation's demo state between takes.

Usage: python3 tools/reset.py <solicitationId>

Permanently deletes that solicitation's rows in SSOfferor, SSProposalPage, SSFinding,
SSRating, SSDecision and SSAuditEvent, then resets the SSSolicitation row to
"Proposals Received". Vendor reference data and the proposal PDFs are untouched.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IDS = json.loads((ROOT / "tools" / "schema" / "entity-ids.json").read_text())
CHILDREN = ["SSOfferor", "SSProposalPage", "SSFinding", "SSRating", "SSDecision", "SSAuditEvent"]


def uip(*args, body=None):
    cmd = ["uip", *args, "--output", "json"]
    if body is not None:
        cmd += ["--body", json.dumps(body)]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    return json.loads(out[out.index("{"):])


def main(sol):
    for entity in CHILDREN:
        rows = uip("df", "records", "list", IDS[entity], "--limit", "1000")["Data"]["Items"]
        ids = [r["Id"] for r in rows if r.get("SolicitationId") == sol]
        for i in range(0, len(ids), 50):
            res = uip("df", "records", "delete", IDS[entity], *ids[i:i + 50], "--yes", "--reason", f"Demo reset of {sol}")
            if res.get("Result") != "Success":
                sys.exit(f"{entity}: {res.get('Message')} {res.get('Instructions')}")
        print(f"{entity}: deleted {len(ids)}")
    sols = uip("df", "records", "list", IDS["SSSolicitation"], "--limit", "100")["Data"]["Items"]
    row = next(r for r in sols if r["SolicitationId"] == sol)
    uip("df", "records", "update", IDS["SSSolicitation"], body={"Id": row["Id"], "Status": "Proposals Received", "Stage": "Not started",
                                                               "CaseInstanceId": "", "AwardeeName": ""})
    print(f"SSSolicitation {sol}: reset")


if __name__ == "__main__":
    main(sys.argv[1])
