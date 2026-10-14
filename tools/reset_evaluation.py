"""Clear an earlier run's evaluation records from one solicitation, so a restarted run starts clean.

Usage: python3 tools/reset_evaluation.py <solicitationId> --before <ISO time, UTC> [--confirm <solicitationId>]

Lists, then (after you type the solicitation number to confirm, or pass it again with --confirm) permanently deletes
the solicitation's rows in SSFinding, SSRating, SSDecision and SSAuditEvent last updated before --before: the agent
drafts, evaluator findings, ratings, decisions and audit events of runs that started earlier. Rows the current run has
written since are kept, and so are the solicitation, its offerors, proposal pages and bucket files.
Requires `uip login` to the target tenant. Nothing here can be undone.
"""
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IDS = json.loads((ROOT / "tools" / "schema" / "entity-ids.json").read_text())
ENTITIES = ["SSFinding", "SSRating", "SSDecision", "SSAuditEvent"]


def uip(*args):
    out = subprocess.run(["uip", *args, "--output", "json"], capture_output=True, text=True).stdout
    return json.loads(out[out.index("{"):])


def when(s):
    t = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def rows_for(entity, sol, before):
    r = uip("df", "records", "list", IDS[entity], "--limit", "1000")
    items = r["Data"]["Items"]
    if len(items) >= 1000:
        sys.exit(f"{entity} has 1000+ rows; this script reads one page. Stop and page through it first.")
    return [x for x in items if x.get("SolicitationId") == sol and when(x.get("UpdateTime") or x["CreateTime"]) < before]


def main(sol, before, confirm=None):
    plan = {e: rows_for(e, sol, before) for e in ENTITIES}
    for e, rows in plan.items():
        newest = max((r.get("UpdateTime") or r["CreateTime"] for r in rows), default="")
        print(f"{e}: {len(rows)} rows" + (f" (newest {newest[:19]})" if rows else ""))
    if not any(plan.values()):
        print(f"Nothing in {sol} older than {before.isoformat()}.")
        return
    answer = confirm if confirm is not None else input(f"\nType {sol} to delete these rows permanently: ")
    if answer.strip().upper() != sol.upper():
        print(f"Cancelled; nothing deleted (got {answer.strip()!r}, expected {sol}).")
        return
    for e, rows in plan.items():
        ids = [r["Id"] for r in rows]
        for i in range(0, len(ids), 50):
            res = uip("df", "records", "delete", IDS[e], *ids[i:i + 50], "--yes", "--reason", f"Reset {sol} before a restarted run")
            if res.get("Result") != "Success":
                sys.exit(f"{e}: {res.get('Message')} {res.get('Instructions')}")
        print(f"{e}: deleted {len(ids)}")
    print(f"\n{sol} keeps only what the current run wrote after {before.isoformat()}.")


if __name__ == "__main__":
    args = sys.argv[1:]
    confirm = before = None
    for flag in ("--confirm", "--before"):
        if flag in args:
            i = args.index(flag)
            value = args[i + 1] if i + 1 < len(args) else ""
            args = args[:i] + args[i + 2:]
            if flag == "--confirm":
                confirm = value
            else:
                before = when(value)
    if len(args) != 1 or before is None:
        sys.exit(__doc__)
    main(args[0], before, confirm)
