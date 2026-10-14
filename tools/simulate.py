"""Write the Data Fabric records each case stage would produce, for UI development
and as the reference behaviour for SS_Robots.

Usage: python3 tools/simulate.py <solicitationId> --through intake|screen|drafts|evaluate|consensus|price|award

Findings come from the PLANTED answer key plus generic per-section findings, each
cited to a real page and quote from data/proposals/pages.json. Ratings are what a
reasonable evaluator would assign; humans make these calls in the real flow.
"""
import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from proposal_content import CLIN_LABELS, OFFERORS, PLANTED  # noqa: E402

IDS = json.loads((ROOT / "tools" / "schema" / "entity-ids.json").read_text())
PAGES = json.loads((ROOT / "data" / "proposals" / "pages.json").read_text())
STAGES = ["intake", "screen", "drafts", "evaluate", "consensus", "price", "award"]
DEMO_USER = "anagh.bhave@uipath.com"
T0 = datetime(2026, 10, 1, 14, 0, tzinfo=timezone.utc)


def uip(*args, body=None):
    cmd = ["uip", *args, "--output", "json"]
    if body is not None:
        cmd += ["--body", json.dumps(body)]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    return json.loads(out[out.index("{"):])


def upsert(entity, key, rows):
    """Insert rows whose key is new; update rows whose key exists."""
    have = {}
    r = uip("df", "records", "list", IDS[entity], "--limit", "1000")
    for row in r["Data"]["Items"]:
        k = next(v for kk, v in row.items() if kk.lower() == key.lower())
        have[k] = row["Id"]
    new = [x for x in rows if x[key] not in have]
    upd = [{**x, "Id": have[x[key]]} for x in rows if x[key] in have]
    for chunk in (new[i:i + 50] for i in range(0, len(new), 50)):
        res = uip("df", "records", "insert", IDS[entity], body=chunk if len(chunk) > 1 else chunk[0])
        bad = (res.get("Data") or {}).get("FailureCount", 0) if res.get("Result") == "Success" else len(chunk)
        if bad:
            sys.exit(f"{entity} insert failed: {res.get('Instructions') or res['Data'].get('FailureRecords')}")
    for chunk in (upd[i:i + 50] for i in range(0, len(upd), 50)):
        res = uip("df", "records", "update", IDS[entity], body=chunk if len(chunk) > 1 else chunk[0])
        if res.get("Result") != "Success":
            sys.exit(f"{entity} update failed: {res.get('Instructions') or res.get('Message')}")
    print(f"  {entity}: +{len(new)} new, {len(upd)} updated")


def ts(hours):
    return (T0 + timedelta(hours=hours)).isoformat()


def audit(sol, ref, action, actor, detail, hours):
    return {"EventId": f"{sol}-{ref}-{action}", "SolicitationId": sol, "EntityRef": ref, "Action": action,
            "Actor": actor, "OccurredAt": ts(hours), "Detail": detail}


def find_page(sol, oid, volume, needle):
    """Locate the page whose text contains the most words of `needle`; return (page, quote)."""
    words = [w.lower() for w in re.findall(r"[A-Za-z0-9-]{4,}", needle)]
    best = None
    for p in PAGES:
        if p["solicitationId"] != sol or p["offerorId"] != oid or p["volume"] != volume:
            continue
        sentences = re.split(r"(?<=[.!?])\s+", p["text"])
        for s in sentences:
            score = sum(w in s.lower() for w in words)
            if not best or score > best[0]:
                best = (score, p["pageNumber"], s)
    return (best[1], best[2]) if best else (1, "")


def plan_for(sol):
    return json.loads((ROOT / "evaluation-plans" / f"{sol}.json").read_text())


# ------------------------------------------------------------------ stages

def intake(sol, plan):
    offerors, pages = [], []
    for code in plan["offerors"]:
        o = OFFERORS[code]
        lines = [{"clin": c, "description": CLIN_LABELS[sol][c], "amount": a} for c, a in o["price"].items()]
        offerors.append({"OfferorId": f"{sol}-{code}", "SolicitationId": sol, "OfferorCode": code, "Name": o["name"],
                         "UEI": o["uei"], "CAGE": o["cage"], "PriceLinesJson": json.dumps(lines),
                         "ComplianceStatus": "Pending"})
    for p in PAGES:
        if p["solicitationId"] == sol:
            pages.append({"PageId": f"{sol}-{p['offerorId']}-{p['volume']}-{p['pageNumber']}", "SolicitationId": sol,
                          "OfferorId": f"{sol}-{p['offerorId']}", "Volume": p["volume"], "PageNumber": p["pageNumber"],
                          "PageText": p["text"]})
    upsert("SSOfferor", "OfferorId", offerors)
    upsert("SSProposalPage", "PageId", pages)
    upsert("SSAuditEvent", "EventId", [audit(sol, "case", "ProposalsIngested", "SS_Robots", f"{len(offerors)} offerors, {len(pages)} pages", 0.5)])


def screen(sol, plan):
    refs = {r["Uei"]: r for r in uip("df", "records", "list", IDS["SSRefVendor"], "--limit", "100")["Data"]["Items"]}
    rows = []
    for code in plan["offerors"]:
        o = OFFERORS[code]
        ref = refs[o["uei"]]
        notes, status = ["All required volumes received; page limits met."], "Compliant"
        if ref["SamStatus"] != "Active":
            notes.append(f"SAM registration {ref['SamStatus'].lower()} (expired {ref['RegistrationExpiry']}) before the proposal due date.")
            status = "Responsibility concern"
        if ref["FapiisRecords"] not in ("None", "", None):
            notes.append(f"FAPIIS: {ref['FapiisRecords']}")
        rows.append({"OfferorId": f"{sol}-{code}", "SolicitationId": sol, "OfferorCode": code, "SamStatus": ref["SamStatus"],
                     "Exclusion": False, "ComplianceStatus": status, "ComplianceNotes": " ".join(notes)})
    upsert("SSOfferor", "OfferorId", rows)
    upsert("SSAuditEvent", "EventId", [audit(sol, "case", "ComplianceScreened", "SS_Robots", "Volumes, page limits, SAM, exclusions and FAPIIS checked", 1)])
    upsert("SSDecision", "DecisionId", [{"DecisionId": f"{sol}-release", "SolicitationId": sol, "Kind": "Release", "Outcome": "Release",
                                         "Rationale": "All offerors released to the SSEB; responsibility concerns noted for the Contracting Officer's determination.",
                                         "DecidedBy": DEMO_USER, "DecidedAt": ts(3)}])


def drafts(sol, plan):
    findings, events = [], []
    factor_by_volume = {f["volume"]: f for f in plan["factors"] if not f.get("evaluatedNotRated")}
    for code in plan["offerors"]:
        n = 0
        for vol, kind, text in PLANTED.get(code, []):
            f = factor_by_volume.get(vol)
            if not f:
                continue
            page, quote = find_page(sol, code, vol, text)
            n += 1
            fid = f"{sol}-{code}-{f['id']}-A{n}"
            findings.append({"FindingId": fid, "SolicitationId": sol, "OfferorId": f"{sol}-{code}", "FactorId": f["id"], "Kind": kind,
                             "FindingText": text + ".", "AgentText": text + ".", "CitationVolume": vol, "CitationPage": page,
                             "CitationQuote": quote, "Author": "SS_EvaluationAssistant", "Origin": "Agent", "Status": "Draft",
                             "EvaluatorSlot": 0, "Revision": 1})
            events.append(audit(sol, fid, "FindingDrafted", "SS_EvaluationAssistant", f"{kind}: {text}", 2 + n * 0.1))
    upsert("SSFinding", "FindingId", findings)
    upsert("SSAuditEvent", "EventId", events)


RATINGS = {  # what the evaluators assign, per offeror and factor order
    "APEX": ["Outstanding", "Good", "Substantial Confidence"],
    "NORTHSTAR": ["Acceptable", "Marginal", "Satisfactory Confidence"],
    "CIVICWORKS": ["Marginal", "Acceptable", "Limited Confidence"],
    "HELIX": ["Outstanding", "Outstanding", "Substantial Confidence"],
    "LUMINA": ["Good", "Marginal", "Satisfactory Confidence"],
    "NORTHBRIDGE": ["Marginal", "Good", "Neutral Confidence"],
}


# Individual ratings that differ from consensus, to give the SSEB Chair something to reconcile.
SPLITS = {("APEX", 0, 2): "Good", ("NORTHSTAR", 1, 1): "Acceptable", ("CIVICWORKS", 0, 3): "Acceptable",
          ("HELIX", 1, 2): "Good", ("LUMINA", 0, 3): "Acceptable", ("NORTHBRIDGE", 0, 1): "Unacceptable"}


def evaluate(sol, plan):
    """Each evaluator gets their own copy of the agent drafts for their factors and rates them."""
    rated = [f for f in plan["factors"] if not f.get("evaluatedNotRated")]
    rows, events, copies = [], [], []
    drafts = [r for r in uip("df", "records", "list", IDS["SSFinding"], "--limit", "1000")["Data"]["Items"]
              if r["SolicitationId"] == sol and r["Origin"] == "Agent"]
    for ev in plan["panel"]["evaluators"]:
        slot = ev["slot"]
        for d in drafts:
            if d["FactorId"] not in ev["factors"]:
                continue
            edited = d["Kind"] in ("Weakness", "Significant Weakness") and slot == 1
            text = d["FindingText"].rstrip(".") + (", which increases the risk of unsuccessful performance." if edited else ".")
            fid = f"{d['FindingId']}-E{slot}"
            copies.append({**{k: d[k] for k in ("SolicitationId", "OfferorId", "FactorId", "Kind", "CitationVolume", "CitationPage", "CitationQuote", "AgentText")},
                           "FindingId": fid, "FindingText": text, "Author": DEMO_USER, "Origin": "Evaluator",
                           "Status": "Edited" if edited else "Accepted", "EvaluatorSlot": slot, "Revision": 2 if edited else 1})
            events.append(audit(sol, fid, "FindingEdited" if edited else "FindingAccepted", f"Evaluator {slot}", text, 30 + slot))
        for code in plan["offerors"]:
            for i, f in enumerate(rated):
                if f["id"] not in ev["factors"]:
                    continue
                r = SPLITS.get((code, i, slot), RATINGS[code][i])
                rid = f"{sol}-{code}-{f['id']}-E{slot}"
                rows.append({"RatingId": rid, "SolicitationId": sol, "OfferorId": f"{sol}-{code}", "FactorId": f["id"], "Level": "Individual",
                             "EvaluatorSlot": slot, "Rating": r, "Rationale": f"{r} based on my accepted findings for {f['name']}.",
                             "RatedBy": DEMO_USER, "RatedAt": ts(40 + slot)})
                events.append(audit(sol, rid, "RatingAssigned", f"Evaluator {slot}", f"{f['name']}: {r}", 40 + slot))
    upsert("SSFinding", "FindingId", copies)
    upsert("SSRating", "RatingId", rows)
    upsert("SSAuditEvent", "EventId", events)


def consensus(sol, plan):
    rated = [f for f in plan["factors"] if not f.get("evaluatedNotRated")]
    rows, events = [], []
    for code in plan["offerors"]:
        for i, f in enumerate(rated):
            r = RATINGS[code][i]
            rid = f"{sol}-{code}-{f['id']}-C"
            rows.append({"RatingId": rid, "SolicitationId": sol, "OfferorId": f"{sol}-{code}", "FactorId": f["id"], "Level": "Consensus",
                         "EvaluatorSlot": 0, "Rating": r, "Rationale": f"SSEB consensus: {r}. Supported by the accepted findings for {f['name']}.",
                         "RatedBy": DEMO_USER, "RatedAt": ts(70)})
            events.append(audit(sol, rid, "ConsensusRatingSet", "SSEB Chair", f"{f['name']}: {r}", 70))
    upsert("SSRating", "RatingId", rows)
    upsert("SSDecision", "DecisionId", [{"DecisionId": f"{sol}-consensus", "SolicitationId": sol, "Kind": "Consensus", "Outcome": "Approve",
                                         "Rationale": "SSEB report signed.", "DecidedBy": DEMO_USER, "DecidedAt": ts(72)}])
    upsert("SSAuditEvent", "EventId", events)


def price(sol, plan):
    igce = plan["igce"]
    rows = []
    for code in plan["offerors"]:
        p = OFFERORS[code]["price"]
        total = sum(p.values())
        unbalanced = [c for c, a in p.items() if abs(a - igce["lines"][c]) / igce["lines"][c] > 0.25]
        rows.append({"OfferorId": f"{sol}-{code}", "SolicitationId": sol, "OfferorCode": code, "TotalEvaluatedPrice": total,
                     "IgceVariancePct": round((total - igce["total"]) / igce["total"] * 100, 2),
                     "ComplianceNotes": None} if False else
                    {"OfferorId": f"{sol}-{code}", "SolicitationId": sol, "OfferorCode": code, "TotalEvaluatedPrice": total,
                     "IgceVariancePct": round((total - igce["total"]) / igce["total"] * 100, 2)})
        if unbalanced:
            print(f"  {code}: potentially unbalanced CLINs {unbalanced}")
    upsert("SSOfferor", "OfferorId", rows)
    upsert("SSDecision", "DecisionId", [{"DecisionId": f"{sol}-price", "SolicitationId": sol, "Kind": "Price", "Outcome": "Proceed",
                                         "Rationale": "Prices determined fair and reasonable based on adequate price competition and comparison with the IGCE.",
                                         "DecidedBy": DEMO_USER, "DecidedAt": ts(80)}])


def award(sol, plan):
    winner = OFFERORS[plan["offerors"][0]]["name"]
    upsert("SSDecision", "DecisionId", [{"DecisionId": f"{sol}-award", "SolicitationId": sol, "Kind": "Award", "Outcome": "Award",
                                         "Rationale": f"Award to {winner} as the best value.", "DecidedBy": DEMO_USER, "DecidedAt": ts(96),
                                         "DocumentText": f"SOURCE SELECTION DECISION DOCUMENT\n\nI have selected {winner} for award as the proposal representing the best value to the Government."}])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("solicitation")
    ap.add_argument("--through", choices=STAGES, default="consensus")
    a = ap.parse_args()
    plan = plan_for(a.solicitation)
    stage_label = {"intake": "Proposal Intake", "screen": "Proposal Intake", "drafts": "Individual Evaluation", "evaluate": "Consensus",
                   "consensus": "Price Evaluation", "price": "Award Decision", "award": "Awarded"}
    for s in STAGES[: STAGES.index(a.through) + 1]:
        print(f"{s}:")
        globals()[s](a.solicitation, plan)
    sol_row = {"SolicitationId": a.solicitation, "Stage": stage_label[a.through],
               "Status": "Awarded" if a.through == "award" else "In evaluation", "StartedAt": ts(0)}
    if a.through == "award":
        sol_row |= {"AwardeeName": OFFERORS[plan["offerors"][0]]["name"], "AwardedAt": ts(96)}
    upsert("SSSolicitation", "SolicitationId", [sol_row])


if __name__ == "__main__":
    main()
