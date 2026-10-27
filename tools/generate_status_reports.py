"""Write the October monthly status reports the two Army contractors submit, for the deliverable review demo.

Usage: .venv/bin/python tools/generate_status_reports.py
Writes samples/<solicitation>/deliverables/*.pdf with the synthetic-demo banner, and a README with what the reviewer
agent should find. In the demo, the COR uploads one with Record receipt on its action item in Contract Management.

- Ostrander Analytics Group (the incumbent, W52P1J-22-C-0011): every section is there, but hours on the labor-hour line
  item come as one total with no labor categories or cumulative figure, it says nothing about the line item being past
  85% of its ceiling, and it puts off the overdue transition-out plan. The reviewer should find hours partly met and
  raise the ceiling and the late plan; the COR can accept it with comments or reject it.
- Keystone Ridge Analytics (the follow-on, W52P1J-27-C-0023): complete, for its first nine days. The reviewer should
  find every element met; it also notes it is still waiting on the incumbent's transition-out plan.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "Award" / "AW_Robots"))

import records  # noqa: E402

REPORTS = {
    "W52P1J-22-R-0011": {
        "file": "A001-2026-11-Ostrander-October-Status-Report.pdf",
        "title": "Monthly Status Report, October 2026",
        "header": "Ostrander Analytics Group Inc | W52P1J-22-C-0011 | Army Logistics Data Analytics Support",
        "sections": [
            ("Contract", "Contract W52P1J-22-C-0011, Army Logistics Data Analytics Support. Reporting period: October 1 to October 31, 2026 "
                         "(option year 4). Submitted by Ostrander Analytics Group Inc to the Contracting Officer's Representative."),
            ("1. Work performed", "Platform operations (line item 0001): the analytics platform ran at 99.7 percent availability; two patch "
                                  "releases were deployed on October 8 and October 22.\n"
                                  "Data engineering support (line item 0002): the supply-chain data pipeline was extended to two new depot "
                                  "feeds, and the weekly readiness extract was rebuilt for the new schema.\n"
                                  "Cybersecurity and RMF support (line item 0003): quarterly vulnerability scans completed with no high findings.\n"
                                  "Program management (line item 0004): monthly program review held October 14."),
            ("2. Hours", "Line item 0002 (labor-hour): 742 hours in October."),
            ("3. Deliverables", "September monthly status report delivered October 9 and accepted.\n"
                                "Transition-out plan: in preparation; it will be delivered with the November report."),
            ("4. Risks and issues", "No new risks this month. The depot feed integration is on schedule."),
            ("5. Staffing", "One data engineer left the program on October 17. A replacement with the same labor category starts "
                            "November 3. No change to key personnel."),
            ("6. Next month", "Continue platform operations and data engineering support, complete the November patch release, and "
                              "begin transition-out activities with the follow-on contractor."),
        ],
    },
    "W52P1J-27-R-0023": {
        "file": "A001-2026-11-Keystone-October-Status-Report.pdf",
        "title": "Monthly Status Report, October 2026",
        "header": "Keystone Ridge Analytics LLC | W52P1J-27-C-0023 | Army Logistics Data Analytics Platform",
        "sections": [
            ("Contract", "Contract W52P1J-27-C-0023, Army Logistics Data Analytics Platform. Reporting period: October 23 (contract "
                         "start) to October 31, 2026, base year. Submitted by Keystone Ridge Analytics LLC to the Contracting Officer's "
                         "Representative."),
            ("1. Work performed", "Transition-in (line item 0005): kickoff held October 23; the transition-in plan was delivered October "
                                  "26; access requests submitted for all 14 staff; the inventory of the incumbent's open work orders is 40 "
                                  "percent complete.\n"
                                  "Platform build (line item 0001): environment design started.\n"
                                  "Data integration and engineering (line item 0002): source-system survey started.\n"
                                  "Cybersecurity and RMF support (line item 0003): the system security plan outline was drafted.\n"
                                  "Program management (line item 0004): integrated master schedule baselined."),
            ("2. Hours by labor category", "Line item 0002 (labor-hour), October: Senior data engineer 64 hours; data engineer 120 hours; "
                                           "data analyst 48 hours; total 232 hours. Cumulative for the base year: 232 hours.\n"
                                           "Line item 0003 (labor-hour), October: Cybersecurity lead 40 hours; RMF analyst 56 hours; total 96 "
                                           "hours. Cumulative for the base year: 96 hours."),
            ("3. Deliverables", "Transition-in plan: delivered October 26, awaiting acceptance. Integrated master schedule: delivered "
                                "October 30."),
            ("4. Risks and issues", "Risk: the incumbent's transition-out plan has not been received, which could delay the hand-off of "
                                    "open work orders. Mitigation: we have asked the COR to request it from the incumbent, and are "
                                    "building the inventory from the work-order system directly in the meantime."),
            ("5. Staffing", "All key personnel are on board: program manager, lead data architect and cybersecurity lead. 11 of 14 "
                            "planned staff started; the remaining three start November 4."),
            ("6. Next month", "Complete the open work-order inventory, finish access provisioning, hold the first joint session with the "
                              "incumbent, and complete transition-in by December 22."),
        ],
    },
}

README = """# October status reports (deliverable review demo)

Synthetic monthly status reports (deliverable A001) for the two Army contracts, for the deliverable review in Contract
Management. Generated by `tools/generate_status_reports.py`. Every page carries the synthetic-demo banner.

In the demo, as Owen Mercer (COR) or Dana Whitfield (CO): open the "Monthly status report, October" action item on a
contract, choose Record receipt, and upload its report. The review runs in Maestro: the reviewer agent checks the report
against what the contract requires, and Owen gets the review task in Action Center (also openable from the item).

| Contract | File | What the reviewer should find |
|---|---|---|
| W52P1J-22-C-0011 (Ostrander, incumbent) | `W52P1J-22-R-0011/deliverables/{a}` | Hours on line item 0002 partly met (one total, no labor categories, no cumulative figure). Raise that line item 0002 is past 85% of its ceiling with no notice from the contractor, and that the transition-out plan (due Oct 2) is put off to November. Accept with comments, or reject. |
| W52P1J-27-C-0023 (Keystone, follow-on) | `W52P1J-27-R-0023/deliverables/{b}` | Every element met. Notes it's waiting on the incumbent's transition-out plan. Accept. |
"""


def main():
    for sol, r in REPORTS.items():
        out = ROOT / "samples" / sol / "deliverables" / r["file"]
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(records.render(r["title"], r["header"], r["sections"], banner=records.RELEASED_BANNER))
        print(f"{out.relative_to(ROOT)}: {out.stat().st_size:,} bytes")
    readme = ROOT / "samples" / "deliverables-README.md"
    readme.write_text(README.replace("{a}", REPORTS["W52P1J-22-R-0011"]["file"]).replace("{b}", REPORTS["W52P1J-27-R-0023"]["file"]))
    print(readme.relative_to(ROOT))


if __name__ == "__main__":
    main()
