"""The Army award (W52P1J-27-R-0023) as the record has it: three offerors, consensus ratings, Keystone Ridge awarded."""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent))

PLAN = json.loads((ROOT / "evaluation-plans" / "W52P1J-27-R-0023.json").read_text())
SOL = PLAN["solicitationId"]


def offeror(code, name, address, lines):
    cover = {"name": name, "address": address, "uei": f"{code[:2]}UEI", "cage": f"{code[:2]}CG"}
    return {"OfferorId": f"{SOL}-{code}", "SolicitationId": SOL, "OfferorCode": code, "Name": name, "UEI": cover["uei"], "CAGE": cover["cage"],
            "ExtractionJson": json.dumps({"cover": cover}), "TotalEvaluatedPrice": sum(lines),
            "PriceLinesJson": json.dumps([{"clin": f"000{i + 1}", "description": f"Line {i + 1}", "amount": a} for i, a in enumerate(lines)])}


OFFERORS = [
    offeror("KEYSTONE", "Keystone Ridge Analytics LLC", "1200 Arsenal Way, Suite 410, Moline, IL 61265", [7_900_000, 4_850_000, 3_450_000, 2_000_000, 1_100_000]),
    offeror("IRONWOOD", "Ironwood Federal Solutions Inc", "8300 Boone Blvd, Suite 500, Vienna, VA 22182", [6_700_000, 4_200_000, 3_000_000, 1_700_000, 900_000]),
    offeror("BLUESTEM", "Bluestem Data Systems Corp", "4700 W 135th St, Suite 210, Overland Park, KS 66224", [5_900_000, 3_700_000, 2_600_000, 1_500_000, 800_000]),
]
CONSENSUS = [{"OfferorId": f"{SOL}-{code}", "SolicitationId": SOL, "FactorId": f, "Rating": r, "Level": "Consensus"}
             for code, ratings in {"KEYSTONE": ["Outstanding", "Good", "Substantial Confidence"],
                                   "IRONWOOD": ["Acceptable", "Good", "Satisfactory Confidence"],
                                   "BLUESTEM": ["Marginal", "Marginal", "Limited Confidence"]}.items()
             for f, r in zip(["F1", "F2", "F3"], ratings)]


@pytest.fixture
def record(monkeypatch):
    """In-memory Data Fabric and SS-Records for the Army award; upserts merge by key, as repo.upsert does."""
    import main
    import repo
    db = {
        "SSSolicitation": [{"SolicitationId": SOL, "Status": "Awarded", "AwardeeName": OFFERORS[0]["Name"], "AwardedAt": "2026-10-13T20:00:02+00:00",
                            "PlanJson": json.dumps(PLAN)}],
        "SSOfferor": [dict(o) for o in OFFERORS], "SSRating": [dict(r) for r in CONSENSUS],
        "SSDecision": [{"DecisionId": f"{SOL}-award", "SolicitationId": SOL, "Kind": "Award", "DecidedBy": "James Thornton", "DecidedAt": "2026-10-13T19:59:00+00:00"}],
        "SSCorrespondence": [], "SSAward": [], "SSAuditEvent": [],
    }
    keys = {"SSCorrespondence": "CorrespondenceId", "SSAward": "AwardId", "SSDecision": "DecisionId", "SSSolicitation": "SolicitationId"}
    state = {"db": db, "uploads": {}, "audit": []}

    def upsert(entity, key, recs):
        rows = db.setdefault(entity, [])
        for r in recs:
            hit = next((x for x in rows if x[key] == r[key]), None)
            hit.update(r) if hit else rows.append(dict(r))
        return len(recs), 0

    monkeypatch.setattr(repo, "solicitation", lambda sol: next(r for r in db["SSSolicitation"] if r["SolicitationId"] == sol))
    monkeypatch.setattr(repo, "plan", lambda sol: json.loads(repo.solicitation(sol)["PlanJson"]))
    monkeypatch.setattr(repo, "rows", lambda entity, sol=None: [r for r in db.get(entity, []) if sol is None or r.get("SolicitationId") == sol])
    monkeypatch.setattr(repo, "upsert", upsert)
    monkeypatch.setattr(repo, "audit", lambda sol, ref, action, detail, actor=repo.ACTOR: state["audit"].append((action, detail)))
    monkeypatch.setattr(repo, "upload", lambda bucket, path, content, content_type="application/pdf": state["uploads"].__setitem__(path, content))
    monkeypatch.setattr(repo, "now", lambda: "2026-10-22T16:00:00+00:00")
    monkeypatch.setattr(main.records, "render", lambda title, header, sections, sled=False, banner=None: f"{title}|{banner}|{sections[0][1]}".encode())
    state["keys"] = keys
    return state
