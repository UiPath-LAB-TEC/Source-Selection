"""Write the eval sets of the Award solution's agents from the demo's own data.

Usage: .venv/bin/python tools/build_award_evals.py
- AW_DeliverableReviewer: the sample October status reports (tools/generate_status_reports.py; run it first). Each
  case's inputs are exactly what AW_Robots PrepareDeliverableReview sends (admin.review_inputs).
- AW_OptionWriter: the incumbent's extension of services and the follow-on's first option, as AW_Robots
  PrepareOptionPackage builds them (admin.option_package, admin.writer_inputs), in the situations the CO meets.
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
OPTION_EVAL_SET = ROOT / "Award" / "AW_OptionWriter" / "evals" / "eval-sets" / "evaluation-set-default.json"
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


# ── AW_OptionWriter ─────────────────────────────────────────────────────────

KEYSTONE_LINES = [("0001", "Platform build and analytics operations", 7_900_000), ("0002", "Data integration and engineering", 4_850_000),
                  ("0003", "Cybersecurity and RMF support", 3_450_000), ("0004", "Program management", 2_000_000), ("0005", "Transition-in", 1_100_000)]
KEYSTONE_VENDOR = {"UEI": "KR7D2M9QX4LB", "LegalName": "Keystone Ridge Analytics LLC", "SamStatus": "Active", "RegistrationExpiry": "2027-09-30",
                   "Exclusion": False, "CparsSummaryJson": "[]"}


def follow_on():
    """The follow-on as signed on Oct 23: its plan, schedule, money and abstract, with Keystone's real line items."""
    plan = json.loads((ROOT / "evaluation-plans" / "W52P1J-27-R-0023.json").read_text())
    keystone = {"Name": "Keystone Ridge Analytics LLC", "OfferorId": "W52P1J-27-R-0023-KEYSTONE", "UEI": KEYSTONE_VENDOR["UEI"], "CAGE": "7KRA2",
                "PriceLinesJson": json.dumps([{"clin": c, "description": d, "amount": a} for c, d, a in KEYSTONE_LINES]), "TotalEvaluatedPrice": 19_300_000}
    summary = letters.award_summary(plan, {"SolicitationId": plan["solicitationId"]}, keystone, None)
    schedule, funding, abstract = admin.build_schedule(plan["solicitationId"], plan, summary, "2026-10-23")
    contract = {"AwardId": f"{plan['solicitationId']}-award", "SolicitationId": plan["solicitationId"], "ContractNumber": "W52P1J-27-C-0023",
                "AwardeeName": keystone["Name"], "Agency": plan["agency"], "Office": plan["office"], "Title": plan["title"], "Stage": "Debriefings",
                "ClocksJson": json.dumps({"stayByAward": "2026-11-02"}), "PeriodStart": "2026-10-23", "AbstractJson": json.dumps(abstract)}
    return plan, schedule, funding, contract


def extension_inputs(as_of: str, stayed: bool = False, ratings: list[str] | None = None):
    """The incumbent's extension of services on `as_of`, with the follow-on in its protest window (or stayed)."""
    rows = incumbent.build("2026-10-23")
    contract = rows["SSAward"][0]
    vendor = dict(rows["SSRefVendor"][0])
    if ratings:
        vendor["CparsSummaryJson"] = json.dumps([dict(x, rating=r) for x, r in zip(json.loads(vendor["CparsSummaryJson"]), ratings)])
    _, f_schedule, _, successor = follow_on()
    if stayed:
        successor = dict(successor, PerformanceStatus="Suspended")
    row = next(r for r in rows["SSSchedule"] if r["ScheduleId"].endswith("-extension-EXT"))
    live = [{**a, "Status": "Open"} for a in admin.alerts(contract, rows["SSSchedule"], rows["SSFunding"], [], as_of, successor)[0]]
    pkg = admin.option_package(contract, row, rows["SSSchedule"], rows["SSFunding"], [], vendor, successor, f_schedule, live, as_of)
    return admin.writer_inputs(pkg)


def option_inputs():
    """The follow-on's option 1 ten months after award: its preliminary notice comes due Aug 23, 2027."""
    plan, schedule, funding, contract = follow_on()
    row = next(r for r in schedule if r["Name"] == "Option 1")
    pkg = admin.option_package(contract, row, schedule, funding, [], KEYSTONE_VENDOR, None, [], [], "2027-08-12", plan["igce"])
    return admin.writer_inputs(pkg)


def writing(requirement, performance, price, recommendation, months, reason, summary, risks):
    return {"findings": [{"element": "requirement", "text": requirement, "sources": ["requirement"]},
                         {"element": "performance", "text": performance, "sources": ["performance"]},
                         {"element": "price", "text": price, "sources": ["price"]}],
            "recommendation": recommendation, "recommendedMonths": months, "reason": reason, "summary": summary, "risks": risks}


PERFORMANCE_OK = ("Performance has been acceptable: CPARS ratings were Very Good for the base period and option 1 and Satisfactory for options 2 "
                  "and 3, and nine deliverables were accepted this period. The trend is down: the transition-out plan due Oct 2 hasn't arrived, "
                  "and line item 0002 is past 85% of its ceiling (about 87%, not over it) with no notice from Ostrander, so raise both with Ostrander.")
PRICE_OK = ("At the contract's rates the extension costs $290,000 a month, 4% below the follow-on's competed prices of $303,333 a month for the "
            "same line items. Line item 0002 (Data engineering support) is 19% above the follow-on's price, while the other three are 12% to 15% "
            "below it. Continuing at these rates costs far less than a gap in the work, so exercise is in the Government's best interest.")

OPTION_CASES = [
    ("ostrander-extension-protest-window", lambda: extension_inputs("2026-10-27"), writing(
        "Keystone Ridge is set to take over on time under W52P1J-27-C-0023: its transition-in completes Dec 22, before this contract ends Dec 31. "
        "The need is the risk that a GAO protest filed by Nov 2 stays Keystone's performance, and this contract's Oct 30 notice deadline comes "
        "before that window closes; without an extension the work would stop after Dec 31.", PERFORMANCE_OK, PRICE_OK, "Extend", 1,
        "One month keeps the work going if the follow-on is protested and stayed, and the next notice day, Dec 2, comes after its protest window closes.",
        "Extend for one month, to Jan 31, 2027, at $290,000. The follow-on can be protested until Nov 2, after the Oct 30 notice deadline, "
        "and a second decision is due Dec 2 once the window has closed.",
        ["If Keystone's award isn't protested, the January extension may not be needed.",
         "The transition-out plan is late and the ceiling notice on line item 0002 is missing."]),
     "Recommends a one-month extension. Grounds the need on the protest risk, not on the transition-in date (which is before the contract ends). "
     "Finds performance acceptable but declining, saying line item 0002 is past 85% of its ceiling, not over it. Gives the rates as 4% below the "
     "follow-on's and names line item 0002 as 19% above. Uses only the figures the facts give."),
    ("ostrander-extension-window-closed-follow-on-under-way", lambda: extension_inputs("2026-11-05"), writing(
        "The follow-on, W52P1J-27-C-0023, is under way and its transition-in completes Dec 22, before this contract ends Dec 31, so no work "
        "is left for an extension to cover.", PERFORMANCE_OK, PRICE_OK.replace("so exercise is in the Government's best interest",
                                                                                 "but with the follow-on in place no extension is needed"),
        "Do not extend", 0,
        "The notice window closed Oct 30, so an extension would now need Ostrander's agreement in a bilateral modification, and the follow-on "
        "takes over before the contract ends.",
        "Don't extend. The follow-on's protest window closed with no protest, its transition-in completes Dec 22, and the notice window for "
        "a unilateral extension closed Oct 30.",
        ["If Keystone's transition-in slips past Dec 31, a bridge would need Ostrander's agreement."]),
     "Recommends not extending: the notice window has closed (an extension would now need a bilateral modification) and the follow-on is "
     "under way with its transition-in done before the contract ends."),
    ("ostrander-extension-follow-on-stayed", lambda: extension_inputs("2026-10-27", stayed=True), writing(
        "A protest has stayed the follow-on, W52P1J-27-C-0023, so Keystone can't start. Ostrander's work has to continue past Dec 31 until "
        "GAO decides and Keystone completes its transition-in.", PERFORMANCE_OK, PRICE_OK, "Extend", 4,
        "GAO decides within 100 days and Keystone then needs its 60-day transition-in, so four months, to Apr 30, 2027, covers it.",
        "Extend for four months, to Apr 30, 2027, at about $1,160,000. The follow-on is stayed by a protest, and four months covers GAO's "
        "decision and Keystone's transition-in.",
        ["Ostrander's SAM registration expires Feb 14, 2027, inside the extension: ask it to renew.",
         "If GAO decides early, part of the extension may not be needed."]),
     "Recommends a four-month extension to cover the protest decision and the follow-on's transition-in, and flags the SAM registration "
     "that lapses Feb 14, 2027, inside the extension."),
    ("ostrander-extension-performance-marginal", lambda: extension_inputs("2026-10-27", ratings=["Very Good", "Satisfactory", "Marginal", "Marginal"]), writing(
        "Ostrander's work must continue until Keystone Ridge takes over under W52P1J-27-C-0023, which can still be protested until Nov 2.",
        "Performance hasn't been acceptable: CPARS ratings fell from Very Good to Marginal for options 2 and 3, the transition-out plan due Oct 2 "
        "hasn't arrived, and line item 0002 is past 85 percent of its ceiling with no notice from Ostrander.", PRICE_OK.replace(
            "so exercise is in the Government's best interest", "but price alone can't support exercise"),
        "Do not extend", 0,
        "FAR 17.204-1(b)(3)(iv) requires acceptable performance before exercising, and the last two ratings are Marginal.",
        "Don't extend on this record. The last two CPARS ratings are Marginal, so the performance finding can't be made, though the "
        "follow-on's protest window leaves a risk of a gap in the work.",
        ["If the follow-on is protested and stayed, the work stops after Dec 31.", "A bridge would need a new justification."]),
     "Recommends not extending because the performance finding can't be made with two Marginal ratings, and names the risk of a gap if the "
     "follow-on is stayed."),
    ("keystone-option-1-preliminary-notice", option_inputs, writing(
        "The Army's logistics data analytics platform runs through the contract's option years, and Keystone's work under option 1 continues "
        "the platform it is building in the base year.",
        "No CPARS ratings for this contract are on file yet. Record the base-year evaluation, or the COR's assessment, before the exercise.",
        "Option 1 costs $3,640,000, $303,333 a month, about 6 percent above the independent Government cost estimate for the period. The "
        "price was evaluated at award in a competition, so it reflects market prices, and continuing avoids a new procurement.",
        "Send preliminary notice", 0,
        "The preliminary notice is due Aug 23, 2027, doesn't commit the Government, and keeps option 1 available.",
        "Send the preliminary notice of intent to exercise option 1 by Aug 23, 2027. It doesn't commit the Government; confirm funds and "
        "performance before the exercise, due Oct 22.",
        ["No performance evaluation is on file yet.", "The contract's CMMC requirement isn't on the record."]),
     "Recommends sending the preliminary notice, notes it doesn't commit the Government, asks for a performance evaluation before the "
     "exercise, and compares option 1's price with the cost estimate."),
]


def write_set(path: Path, cases) -> None:
    doc = json.loads(path.read_text())
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    known = {e.get("name"): e.get("id") for e in doc.get("evaluations", [])}
    doc["evaluations"] = [{
        "id": known.get(name) or str(uuid.uuid4()), "name": name, "inputs": build(), "expectedOutput": out,
        "simulationInstructions": "", "expectedAgentBehavior": behavior, "simulateInput": False, "inputGenerationInstructions": "",
        "simulateTools": False, "evalSetId": doc["id"], "createdAt": now, "updatedAt": now, "source": "manual",
    } for name, build, out, behavior in cases]
    path.write_text(json.dumps(doc, indent=2))
    for e in doc["evaluations"]:
        print(path.parent.parent.parent.name, e["name"], "input chars:", sum(len(v) for v in e["inputs"].values()))


def main():
    write_set(EVAL_SET, CASES)
    write_set(OPTION_EVAL_SET, OPTION_CASES)


if __name__ == "__main__":
    main()
