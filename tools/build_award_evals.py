"""Write the deliverable reviewer's eval set from the sample October status reports (tools/generate_status_reports.py).

Usage: .venv/bin/python tools/build_award_evals.py
Each case's inputs are exactly what AW_Robots PrepareDeliverableReview sends for that report (admin.review_inputs), so
the eval checks the agent on the demo's own data. Run the reports generator first.
"""
import json
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "Award" / "AW_Robots"))
sys.path.insert(0, str(ROOT / "tools"))

from pypdf import PdfReader  # noqa: E402

import admin  # noqa: E402
import generate_incumbent as incumbent  # noqa: E402
import letters  # noqa: E402

AS_OF = "2026-11-06"
EVAL_SET = ROOT / "Award" / "AW_DeliverableReviewer" / "evals" / "eval-sets" / "evaluation-set-default.json"
REQ = admin.DELIVERABLE_REQUIREMENTS["A001"]


def text(path: Path) -> str:
    raw = "\n".join(p.extract_text() or "" for p in PdfReader(str(path)).pages)
    return re.sub(r"SYNTHETIC DEMO[^\n]*NOT A[N]? (ACTUAL|REAL)[^\n]*", "", raw).strip()


def incumbent_inputs():
    rows = incumbent.build("2026-10-23")
    contract = rows["SSAward"][0]
    period = admin.current_period(rows["SSSchedule"], AS_OF)
    lines = admin.forecast(json.loads(contract["AbstractJson"]), rows["SSFunding"], period, AS_OF)
    row = {"Code": "A001", "Name": "Monthly status report, October", "DueDay": "2026-11-10", "ReceivedDay": AS_OF}
    report = text(ROOT / "samples" / incumbent.SOL / "deliverables" / "A001-2026-11-Ostrander-October-Status-Report.pdf")
    return admin.review_inputs(contract, row, report, {"period": period["Period"], "lines": list(lines.values())})


def follow_on_inputs():
    plan = json.loads((ROOT / "evaluation-plans" / "W52P1J-27-R-0023.json").read_text())
    lines = [("0001", "Platform build and analytics operations", 7_900_000), ("0002", "Data integration and engineering", 4_850_000),
             ("0003", "Cybersecurity and RMF support", 3_450_000), ("0004", "Program management", 2_000_000), ("0005", "Transition-in", 1_100_000)]
    keystone = {"Name": "Keystone Ridge Analytics LLC", "OfferorId": "W52P1J-27-R-0023-KEYSTONE", "UEI": "", "CAGE": "",
                "PriceLinesJson": json.dumps([{"clin": c, "description": d, "amount": a} for c, d, a in lines]), "TotalEvaluatedPrice": 19_300_000}
    summary = letters.award_summary(plan, {"SolicitationId": plan["solicitationId"]}, keystone, None)
    schedule, funding, abstract = admin.build_schedule(plan["solicitationId"], plan, summary, "2026-10-23")
    contract = {"ContractNumber": "W52P1J-27-C-0023", "AwardeeName": keystone["Name"], "AbstractJson": json.dumps(abstract), "CurrentPeriod": "Base"}
    period = admin.current_period(schedule, AS_OF)
    flines = admin.forecast(abstract, funding, period, AS_OF)
    row = {"Code": "A001", "Name": "Monthly status report, October", "DueDay": "2026-11-10", "ReceivedDay": AS_OF}
    report = text(ROOT / "samples" / "W52P1J-27-R-0023" / "deliverables" / "A001-2026-11-Keystone-October-Status-Report.pdf")
    return admin.review_inputs(contract, row, report, {"period": period["Period"], "lines": list(flines.values())})


def incumbent_text_inputs(code: str, name: str, due: str, report: str):
    """The incumbent's contract facts with a short report text of the given deliverable (for the edge cases)."""
    rows = incumbent.build("2026-10-23")
    contract = rows["SSAward"][0]
    period = admin.current_period(rows["SSSchedule"], AS_OF)
    lines = admin.forecast(json.loads(contract["AbstractJson"]), rows["SSFunding"], period, AS_OF)
    return admin.review_inputs(contract, {"Code": code, "Name": name, "DueDay": due, "ReceivedDay": AS_OF}, report,
                               {"period": period["Period"], "lines": list(lines.values())})


MISSING_SECTIONS = ("Monthly Status Report, September 2026. Contract W52P1J-22-C-0011.\n1. Work performed: platform operations continued "
                    "at 99.8 percent availability; data engineering extended the readiness extract.\n2. Hours: line item 0002, 735 hours in "
                    "September: senior data engineer 210, data engineer 400, data analyst 125; cumulative for option year 4: 6,400 hours.\n"
                    "3. Deliverables: August report accepted.")
THIN_PLAN = ("Transition-Out Plan, W52P1J-22-C-0011. 1. Inventory: 212 open work orders, 6 data pipelines, the analytics platform "
             "and its 3 environments will be handed over. 2. Schedule: hand-over runs from November 15 to December 18, 2026, before "
             "the contract expires on December 31.")
NO_CUMULATIVE = ("Monthly Status Report, November 2026. Contract W52P1J-22-C-0011.\n1. Work performed: platform operations continued; "
                 "transition-out sessions held with the follow-on contractor.\n2. Hours by labor category, line item 0002: senior data "
                 "engineer 180, data engineer 380, data analyst 120.\n3. Deliverables: October report accepted; transition-out plan "
                 "delivered November 12.\n4. Risks and issues: line item 0002 is near its ceiling; a revised estimate was sent to the "
                 "Contracting Officer on November 20.\n5. Staffing: no change to key personnel.\n6. Next month: complete the hand-over by "
                 "December 18.")


def expected(statuses, notes, recommendation, summary, issues):
    return {"requirements": [{"requirement": r, "status": s, "evidence": "", "note": n} for r, s, n in zip(REQ, statuses, notes)],
            "summary": summary, "recommendation": recommendation, "issues": issues}


PLAN_REQ = admin.DELIVERABLE_REQUIREMENTS["A002"]

CASES = [
    ("ostrander-october-hours-total-only", incumbent_inputs, expected(
        ["Met", "Partly met", "Met", "Met", "Met", "Met"],
        ["", "Hours on line item 0002 are one monthly total, with no labor categories and no cumulative figure for the period.", "", "", "", ""],
        "Accept with comments",
        "Every section is present, but hours on the labor-hour line item are a single total without labor categories or a cumulative figure.",
        ["Line item 0002 is past 85 percent of its ceiling and the report doesn't flag it or give a revised estimate.",
         "The transition-out plan, already overdue, is put off to the November report."]),
     "Marks hours partly met (no labor categories or cumulative hours), raises the line item 0002 ceiling and the late "
     "transition-out plan as issues, and quotes only text that is in the report."),
    ("keystone-october-complete", follow_on_inputs, expected(
        ["Met"] * 6, [""] * 6, "Accept",
        "The report covers every required element for the contract's first nine days, including hours by labor category with cumulative totals.",
        []),
     "Marks every element met and recommends Accept; may note the incumbent's missing transition-out plan, which the report "
     "itself raises as a risk."),
    ("ostrander-september-missing-sections", lambda: incumbent_text_inputs("A001", "Monthly status report, September", "2026-10-09", MISSING_SECTIONS),
     expected(["Met", "Met", "Met", "Missing", "Missing", "Missing"], ["", "", "", "No risks or issues section.", "No staffing section.", "No plan for next month."],
              "Reject", "The report covers work, hours and deliverables but has no risks, staffing or next-month sections.",
              ["Line item 0002 is past 85 percent of its ceiling and the report doesn't flag it."]),
     "Marks risks, staffing and next month missing and recommends Reject, with evidence empty for the missing elements."),
    ("ostrander-transition-out-plan-thin", lambda: incumbent_text_inputs("A002", "Transition-out plan", "2026-10-02", THIN_PLAN),
     {"requirements": [{"requirement": r, "status": s, "evidence": "", "note": n} for r, s, n in zip(PLAN_REQ, ["Met", "Met", "Missing", "Missing", "Missing"],
                       ["", "", "No knowledge-transfer sessions with the follow-on contractor.", "No staffing through the end of the contract.",
                        "No return of Government property, data or access."])],
      "summary": "The plan inventories the work and sets a schedule, but leaves out knowledge transfer, staffing and the return of Government property.",
      "recommendation": "Reject", "issues": []},
     "Checks against the transition-out plan's own requirements (not the status report's), marks three missing and recommends Reject."),
    ("ostrander-november-no-cumulative", lambda: incumbent_text_inputs("A001", "Monthly status report, November", "2026-12-10", NO_CUMULATIVE),
     expected(["Met", "Partly met", "Met", "Met", "Met", "Met"], ["", "Hours by labor category are given for the month but with no cumulative figure.", "", "", "", ""],
              "Accept with comments", "Complete except that hours have no cumulative figure for the period.", []),
     "Marks hours partly met for the missing cumulative figure and recommends Accept with comments."),
]


def main():
    doc = json.loads(EVAL_SET.read_text())
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    known = {e.get("name"): e.get("id") for e in doc.get("evaluations", [])}
    doc["evaluations"] = [{
        "id": known.get(name) or str(uuid.uuid4()), "name": name, "inputs": build(), "expectedOutput": out,
        "simulationInstructions": "", "expectedAgentBehavior": behavior, "simulateInput": False, "inputGenerationInstructions": "",
        "simulateTools": False, "evalSetId": doc["id"], "createdAt": now, "updatedAt": now, "source": "manual",
    } for name, build, out, behavior in CASES]
    EVAL_SET.write_text(json.dumps(doc, indent=2))
    for e in doc["evaluations"]:
        print(e["name"], "input chars:", sum(len(v) for v in e["inputs"].values()))


if __name__ == "__main__":
    main()
