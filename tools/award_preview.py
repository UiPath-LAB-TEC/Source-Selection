"""Run AW_Robots' Award steps against the Contract Award preview snapshot, so the local previews show what the robots
would write: the award phase opened and the contract award and notices drafted for each awarded evaluation.

Usage: .venv/bin/python tools/award_preview.py [steps...] [--as-of YYYY-MM-DD]   (default: StartAward PrepareAwardDocument)
WatchContracts runs once over every contract, as the daily watch does.
Writes award-workspace/src/dev/snapshot.json in place. Nothing touches Data Fabric or storage.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "Award" / "AW_Robots"))

import main  # noqa: E402
import repo  # noqa: E402

SNAPSHOT = ROOT / "award-workspace" / "src" / "dev" / "snapshot.json"
KEYS = {"SSSolicitation": "solicitations", "SSOfferor": "offerors", "SSProposalPage": "pages", "SSFinding": "findings", "SSRating": "ratings",
        "SSDecision": "decisions", "SSAuditEvent": "audit", "SSAward": "awards", "SSCorrespondence": "correspondence", "SSProtest": "protests",
        "SSSchedule": "schedule", "SSFunding": "funding", "SSAlert": "alerts"}


def main_(steps, as_of=""):
    snap = json.loads(SNAPSHOT.read_text())
    now = lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")  # noqa: E731

    def rows(entity, sol=None):
        return [r for r in snap.get(KEYS[entity], []) if sol is None or r.get("SolicitationId") == sol]

    def upsert(entity, key, recs):
        table = snap.setdefault(KEYS[entity], [])
        for r in recs:
            hit = next((x for x in table if x.get(key) == r[key]), None)
            hit.update(r) if hit else table.append({"Id": f"preview-{key}-{r[key]}", **r})
        return len(recs), 0

    def audit(sol, ref, action, detail, actor=repo.ACTOR):
        snap["audit"].append({"Id": f"preview-{len(snap['audit'])}", "EventId": f"{sol}-{action}-{len(snap['audit'])}", "SolicitationId": sol,
                              "EntityRef": ref, "Action": action, "Actor": actor, "OccurredAt": now(), "Detail": detail})

    repo.rows, repo.upsert, repo.audit, repo.now = rows, upsert, audit, now
    repo.upload = lambda bucket, path, content, content_type="application/pdf": print(f"  (would file {bucket}/{path}, {len(content):,} bytes)")
    repo.solicitation = lambda sol: next(r for r in rows("SSSolicitation") if r["SolicitationId"] == sol)
    repo.plan = lambda sol: json.loads(repo.solicitation(sol)["PlanJson"])
    for step in steps:
        if step == "WatchContracts":  # every contract at once, as the daily watch runs
            out = main.run(main.RobotInput(step=step, asOf=as_of))
            print(f"{step} as of {as_of or 'today'}: {out.content[:300]}")
            continue
        for s in [s for s in snap["solicitations"] if s.get("Status") == "Awarded"]:
            out = main.run(main.RobotInput(step=step, solicitationId=s["SolicitationId"]))
            print(f"{s['SolicitationId']} {step}: {out.content[:80]}")
    SNAPSHOT.write_text(json.dumps(snap, indent=1))


if __name__ == "__main__":
    args = sys.argv[1:]
    as_of = args[args.index("--as-of") + 1] if "--as-of" in args else ""
    steps = [a for i, a in enumerate(args) if a != "--as-of" and (i == 0 or args[i - 1] != "--as-of")]
    main_(steps or ["StartAward", "PrepareAwardDocument"], as_of)
