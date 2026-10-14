"""Permanently delete one solicitation from the demo tenant.

Usage: python3 tools/delete_solicitation.py <solicitationId> [--confirm <solicitationId>]

Lists, then (after you type the solicitation number to confirm, or pass it again with --confirm) permanently deletes:
  - its rows in SSSolicitation, SSOfferor, SSProposalPage, SSFinding, SSRating, SSDecision and SSAuditEvent
  - its files under <solicitationId>/ in the SS-Proposals and SS-Records buckets
Vendor reference data (SSRefVendor) is shared and left alone. Nothing here can be undone.
Requires `uip login` to the target tenant.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IDS = json.loads((ROOT / "tools" / "schema" / "entity-ids.json").read_text())
FOLDER_KEY = "08605f4c-2b90-4971-81b7-2f4310a2b81a"  # SourceSelection
BUCKETS = {"SS-Proposals": "ccdb6826-a255-4587-8dcb-080b99100706", "SS-Records": "4fb0d0cc-d588-4c15-bb65-8b5babc8c3cb"}
# Children first, the solicitation row last, so a partial run never leaves orphans without their parent.
ENTITIES = ["SSOfferor", "SSProposalPage", "SSFinding", "SSRating", "SSDecision", "SSAuditEvent", "SSSolicitation"]


def uip(*args):
    out = subprocess.run(["uip", *args, "--output", "json"], capture_output=True, text=True).stdout
    return json.loads(out[out.index("{"):])


def rows_for(entity, sol):
    r = uip("df", "records", "list", IDS[entity], "--limit", "1000")
    items = r["Data"]["Items"]
    if len(items) >= 1000:
        sys.exit(f"{entity} has 1000+ rows; this script reads one page. Stop and page through it first.")
    return [x["Id"] for x in items if x.get("SolicitationId") == sol]


def files_for(bucket_key, sol):
    r = uip("or", "bucket-files", "list", bucket_key, "--folder-key", FOLDER_KEY, "--prefix", f"{sol}/")
    data = r.get("Data") or {}
    items = data.get("Items", data) if isinstance(data, dict) else data
    return [x.get("FullPath") or x.get("Path") for x in items if (x.get("FullPath") or x.get("Path") or "").startswith(f"{sol}/")]


def main(sol, confirm=None):
    plan = {e: rows_for(e, sol) for e in ENTITIES}
    files = {b: files_for(k, sol) for b, k in BUCKETS.items()}
    for e, ids in plan.items():
        print(f"{e}: {len(ids)} rows")
    for b, paths in files.items():
        print(f"{b}: {len(paths)} files")
    if not any(plan.values()) and not any(files.values()):
        print(f"Nothing found for {sol}.")
        return
    answer = confirm if confirm is not None else input(f"\nType {sol} to delete all of this permanently: ")
    if answer.strip().upper() != sol.upper():
        print(f"Cancelled; nothing deleted (got {answer.strip()!r}, expected {sol}).")
        return
    for e, ids in plan.items():
        for i in range(0, len(ids), 50):
            res = uip("df", "records", "delete", IDS[e], *ids[i:i + 50], "--yes", "--reason", f"Delete demo solicitation {sol}")
            if res.get("Result") != "Success":
                sys.exit(f"{e}: {res.get('Message')} {res.get('Instructions')}")
        print(f"{e}: deleted {len(ids)}")
    for b, paths in files.items():
        for p in paths:
            res = uip("or", "bucket-files", "delete", BUCKETS[b], p, "--folder-key", FOLDER_KEY, "--yes")
            if res.get("Result") != "Success":
                sys.exit(f"{b}/{p}: {res.get('Message')}")
        print(f"{b}: deleted {len(paths)} files")
    print(f"\n{sol} is gone.")


if __name__ == "__main__":
    args = sys.argv[1:]
    confirm = None
    if "--confirm" in args:
        i = args.index("--confirm")
        confirm = args[i + 1] if i + 1 < len(args) else ""
        args = args[:i] + args[i + 2:]
    if len(args) != 1:
        sys.exit(__doc__)
    main(args[0], confirm)
