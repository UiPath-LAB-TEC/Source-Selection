"""Render the State & Local sample package for trying "New RFP evaluation" end to end in the workspace.

Usage: .venv/bin/python tools/generate_sled_sample.py [--id <RFP number>] [--seed-vendors]
Output: samples/<RFP number>/RFP.pdf, Cost-Estimate.pdf, Evaluation-Criteria.pdf, README.md and
        samples/<RFP number>/<PROPOSER>/<section>.pdf
--seed-vendors adds the sample proposers to SSRefVendor (idempotent), so the state vendor registration and debarment
screen finds them; without it each one is flagged "No state vendor registration found".

The District's documents differ from the federal package on purpose: an RFP cover page instead of an SF 33, a
District cost estimate instead of an IGCE, and an Evaluation Criteria section scored out of 100 points instead of
Section M. The wizard's agents read them the same way (RFP → details, estimate → price items, criteria → points).
"""
import json
import os
import sys
from pathlib import Path

# --id prints the same package under another RFP number (each number can be started only once).
if "--id" in sys.argv:
    os.environ["SLED_SAMPLE_SOLICITATION_ID"] = sys.argv[sys.argv.index("--id") + 1]

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import generate_proposals as gp  # noqa: E402
import sled_sample_content as sc  # noqa: E402
from reportlab.lib.pagesizes import LETTER  # noqa: E402
from reportlab.lib.units import inch  # noqa: E402
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer  # noqa: E402
from official_docs import BODY, CELL, CELL_B, H, SUBTITLE, TITLE, numbered_canvas, ruled  # noqa: E402

SOL = sc.SOLICITATION_ID
PLAN = sc.PLAN
D = sc.DISTRICT
OUT = ROOT / "samples" / SOL
OUT.mkdir(parents=True, exist_ok=True)
LABELS = sc.CLIN_LABELS[SOL]
SECTIONS = gp.SLED_VOLUMES
CONTACT = f"{D['contact'][0]}, {D['contact'][1]}"
money = lambda n: f"${n:,.0f}"
rated = [f for f in PLAN["factors"] if not f.get("evaluatedNotRated")]
cost = next(f for f in PLAN["factors"] if f.get("evaluatedNotRated"))
BASIS = (f"The District will award to the responsive and responsible proposer whose proposal is most advantageous to the District, "
         f"determined by the highest total score out of 100 points. Award is subject to approval by the {D['name']} Board of Education.")
GUIDE = [
    ("Excellent", "100%", "Fully meets and in places exceeds every requirement of the criterion, with clear, specific and well-supported detail. No weaknesses of consequence."),
    ("Good", "80%", "Meets every requirement of the criterion with sound detail. Any weaknesses are minor and easily corrected."),
    ("Satisfactory", "60%", "Meets the basic requirements of the criterion, but with gaps in detail or weaknesses that add some risk."),
    ("Poor", "40%", "Does not meet one or more requirements of the criterion, or is vague enough that the committee cannot judge how they will be met."),
    ("Unacceptable", "0%", "Fails to address the criterion, or contains a deficiency that makes that part of the proposal unworkable."),
]


def doc(path: Path, story, left: str, right: str, marking: str = "", banner: str = "SYNTHETIC DEMO RFP — NOT AN ACTUAL DISTRICT PROCUREMENT", skip_first=False):
    SimpleDocTemplate(str(path), pagesize=LETTER, leftMargin=inch * 0.85, rightMargin=inch * 0.85, topMargin=inch * 1.0,
                      bottomMargin=inch * 0.85, title=f"{SOL} {right}").build(
        story, canvasmaker=numbered_canvas(left, right, marking=marking, banner=banner, skip_first=skip_first))


def render_rfp(path: Path):
    """The RFP: a District cover page (number, title, dates, contact, term and basis of award), the schedule of events,
    the scope of work, the cost proposal form proposers complete, and the basis of award."""
    cover_facts = ruled([
        ["RFP number", f"<b>{SOL}</b>", "Issue date", D["issued"]],
        ["Title", f"<b>{PLAN['title']}</b>", "Proposals due", f"<b>{D['due']}</b>"],
        ["Issued by", f"{D['name']}<br/>{D['department']}<br/>{D['street']}, {D['city']}", "Contract term", PLAN["contractType"]],
        ["Procurement contact", f"{CONTACT}<br/>{D['contact'][2]} · {D['contact'][3]}", "Basis of award", PLAN["basisForAward"]],
    ], [1.25 * inch, 2.3 * inch, 1.15 * inch, 2.1 * inch], header=False)
    events = ruled([["Event", "Date"],
                    ["RFP issued", D["issued"]],
                    ["Pre-proposal conference", D["preproposal"]],
                    ["Written questions due", D["questions_due"]],
                    ["Proposals due", D["due"]],
                    ["Evaluation committee scoring", "November 2026"],
                    ["Board of Education action on the recommendation of award", D["board_meeting"]],
                    ["Notice of Intent to Award issued to all proposers", "The business day after Board approval"]],
                   [4.4 * inch, 2.4 * inch])
    form = [["Item", "Description", "Year 1", "Years 2–5", "Total (5 years)"]]
    for item, label in LABELS.items():
        form.append([item, label, "$__________", "$__________", "$__________"])
    form.append(["", "<b>Total proposed cost</b>", "", "", "$__________"])
    story = [
        Paragraph(D["name"].upper(), TITLE),
        Paragraph(f"{D['department']} · {D['street']} · {D['city']}", SUBTITLE),
        Spacer(1, 24),
        Paragraph("REQUEST FOR PROPOSALS", TITLE.clone("big", fontSize=22, leading=27, spaceAfter=6)),
        Paragraph(f"RFP No. {SOL}", TITLE.clone("num", fontSize=15, leading=19)),
        Paragraph(PLAN["title"], TITLE.clone("ttl", fontSize=15, leading=19, spaceAfter=20)),
        cover_facts, Spacer(1, 14),
        Paragraph(f"Sealed proposals will be received electronically by the {D['department']} until {D['due']}. Late proposals will not be accepted. "
                  f"This RFP is issued under the District's purchasing policy for competitive proposals; the District may award without negotiation, "
                  f"may hold oral presentations with the highest-scoring proposers, and may reject any or all proposals.", BODY),
        PageBreak(),
        Paragraph("SECTION 1 — INTRODUCTION AND SCHEDULE OF EVENTS", TITLE),
        Paragraph(f"RFP No. {SOL} · {PLAN['title']}", SUBTITLE),
        Paragraph("1.1 PURPOSE", H),
        Paragraph(f"The {D['name']} ({D['students']:,} students in {D['schools']} schools) requests proposals for {PLAN['title'].lower()} "
                  f"for its fleet of {D['buses']} buses and about {D['routes']} daily routes, under a {PLAN['contractType'][0].lower() + PLAN['contractType'][1:]}.", BODY),
        Paragraph("1.2 SCHEDULE OF EVENTS", H), events,
        Paragraph("SECTION 2 — SCOPE OF WORK", TITLE.clone("t2", spaceBefore=14)),
        *[Paragraph(p, BODY) for p in sc.SCOPE],
        Paragraph("SECTION 4 — COST PROPOSAL FORM", TITLE.clone("t4", spaceBefore=14)),
        Paragraph("Proposers shall complete this form in Section 4 of their proposal. Prices are firm fixed prices for the full five-year term "
                  "(the three-year initial term and both optional renewal years) and include all licensing, implementation, hardware, training, travel and other costs.", BODY),
        ruled(form, [0.55 * inch, 3.0 * inch, 1.05 * inch, 1.05 * inch, 1.15 * inch]),
        Paragraph("SECTION 6 — EXCERPT: BASIS OF AWARD", TITLE.clone("t6", spaceBefore=14)),
        Paragraph(BASIS + " The complete evaluation criteria and scoring are in Section 6, Evaluation Criteria and Scoring.", BODY),
    ]
    doc(path, story, f"RFP No. {SOL}", PLAN["title"], skip_first=True)


def render_estimate(path: Path):
    """The District's cost estimate, prepared before proposals were opened: basis, the estimate by price item and year,
    assumptions and the preparer / reviewer / approver block. Confidential until award."""
    small = CELL.clone("small", fontSize=8.5, leading=10.5)
    small_b = CELL_B.clone("smallb", fontSize=8.5, leading=10.5)
    years = len(next(iter(sc.ESTIMATE_PERIODS.values())))
    rows = [["Item", "Description", *[f"Year {i}" for i in range(1, years + 1)], "Total"]]
    for item, amounts in sc.ESTIMATE_PERIODS.items():
        rows.append([item, LABELS[item], *map(money, amounts), money(sum(amounts))])
    totals = [sum(v[i] for v in sc.ESTIMATE_PERIODS.values()) for i in range(years)]
    rows.append(["", "<b>Total estimate</b>", *[f"<b>{money(t)}</b>" for t in totals], f"<b>{money(sum(totals))}</b>"])
    facts = ruled([
        ["RFP number", SOL, "Estimate date", "September 8, 2026"],
        ["Requirement", PLAN["title"], "Contract term", PLAN["contractType"]],
        ["Requesting department", "Transportation Services", "Estimate total", money(sum(totals))],
        ["Purchasing office", f"{D['name']}, {D['department']}", "Fleet", f"{D['buses']} buses, about {D['routes']} routes"],
    ], [1.3 * inch, 2.1 * inch, 1.2 * inch, 2.2 * inch], header=False)
    who = [("Prepared by", "Lorena Castillo", "Director of Transportation Services"),
           ("Reviewed by", "Gregory Ashford", "Assistant Superintendent, Business Services"),
           ("Approved by", D["contact"][0], D["contact"][1])]
    signatures = ruled([[w[0] for w in who], *[[f"{field}: {w[i]}" for w in who] for field, i in (("Name", 1), ("Title", 2))],
                        ["Signature:<br/><br/>______________________"] * 3, ["Date: ______________"] * 3], [6.8 * inch / 3] * 3)
    story = [
        Paragraph("DISTRICT COST ESTIMATE", TITLE),
        Paragraph(f"{D['name']} · {D['department']}", SUBTITLE),
        facts,
        Paragraph("1. PURPOSE", H),
        Paragraph("This estimate supports the cost evaluation of proposals received under the RFP above: each proposer's total is compared with it, "
                  "and individual price items more than 25 percent above or below their estimate line are reviewed for balance. It was prepared by District staff "
                  "before proposals were opened and without input from any proposer.", BODY),
        Paragraph("2. BASIS OF ESTIMATE", H),
        Paragraph(f"Subscription pricing is based on per-bus licensing for a fleet of {D['buses']} buses, drawn from two neighbouring districts' recent awards "
                  f"and escalated 3 percent a year. Hardware assumes one GPS unit and one RFID reader per bus with installation. Year 1 carries the one-time "
                  f"implementation, route conversion, SIS integration and hardware costs, which do not recur in Years 2 to 5.", BODY),
        Paragraph("3. ESTIMATE BY PRICE ITEM AND YEAR", H),
        ruled(rows, [0.45 * inch, 1.75 * inch] + [0.72 * inch] * years + [0.85 * inch], style=small, head_style=small_b, align_right_from=2),
        Spacer(1, 6),
        Paragraph(f"All amounts are firm fixed price estimates in U.S. dollars. The total estimate for the full five-year term is {money(sum(totals))}.", BODY),
        Paragraph("4. ASSUMPTIONS", H),
        *[Paragraph(f"{chr(97 + i)}. {t}", BODY.clone(f"as{i}", leftIndent=14, spaceAfter=3)) for i, t in enumerate([
            "Go-live before the first day of the 2027–28 school year, with routes converted and tested over the summer.",
            "Integration with the District student information system through OneRoster or a nightly file, at no extra cost.",
            "Hosting, data storage and mobile apps are included in the subscription; no District servers are required.",
            "Renewal years 4 and 5 are priced at the same annual rate as Years 2 and 3 after escalation.",
        ])],
        KeepTogether([Paragraph("5. APPROVAL", H),
                      Paragraph("The undersigned certify that this estimate was developed by District staff, without the assistance of any proposer, "
                                "and represents the District's best estimate of the cost of the requirement.", BODY),
                      signatures]),
    ]
    doc(path, story, f"RFP No. {SOL}", "District Cost Estimate", marking="CONFIDENTIAL — NOT FOR RELEASE UNTIL AWARD",
        banner="SYNTHETIC DEMO COST ESTIMATE — NOT AN ACTUAL DISTRICT ESTIMATE")


def render_criteria(path: Path):
    """Section 6 of the RFP: the evaluation process, the criteria and their points, the cost formula, the scoring guide,
    award and protest, then the Section 5 page limits."""
    lowest, other = 1_400_000, 1_600_000
    example = round(cost["weight"] * lowest / other, 2)
    n = 3
    story = [
        Paragraph("SECTION 6 — EVALUATION CRITERIA AND SCORING", TITLE),
        Paragraph(f"RFP No. {SOL} · {PLAN['title']} · {D['name']}", SUBTITLE),
        Paragraph("6.1 EVALUATION PROCESS", H),
        Paragraph("Proposals are first reviewed by the Procurement Officer for responsiveness (every required section and form, within its page limit) "
                  "and responsibility (an active state vendor registration and no listing on the state debarment list). Responsive proposals are released "
                  "to an evaluation committee whose members score each proposal independently, then meet to agree a consensus score for each criterion. "
                  "The District may invite the highest-scoring proposers to oral presentations and request a best and final offer.", BODY),
        Paragraph("6.2 EVALUATION CRITERIA AND POINTS", H),
        Paragraph("Proposals will be scored out of 100 points on the following criteria:", BODY),
        ruled([["Criterion", "Maximum points", "Evaluated from"]] +
              [[f["name"], str(f["weight"]), SECTIONS.get(f["volume"], f["volume"])] for f in PLAN["factors"]] +
              [["<b>Total</b>", "<b>100</b>", ""]], [2.8 * inch, 1.2 * inch, 2.8 * inch]),
        Spacer(1, 6), Paragraph(PLAN["relativeImportance"], BODY),
    ]
    for i, f in enumerate(rated, start=1):
        story.append(Paragraph(f"6.{n} CRITERION {i} — {f['name'].upper()} ({f['weight']} POINTS)", H))
        story.append(Paragraph(f["criteria"], BODY))
        if f.get("subfactors"):
            story.append(Paragraph("The committee will consider the following, which are of equal importance:", BODY))
            story += [Paragraph(f"({chr(97 + j)}) {s}", BODY.clone(f"li{n}{j}", leftIndent=18, spaceAfter=2)) for j, s in enumerate(f["subfactors"])]
            story.append(Spacer(1, 4))
        story.append(Paragraph(f"This criterion will be scored from {SECTIONS.get(f['volume'], f['volume'])} using the scoring guide in Section 6.{len(rated) + 4}.", BODY))
        n += 1
    story += [
        Paragraph(f"6.{n} CRITERION {len(PLAN['factors'])} — COST ({cost['weight']} POINTS)", H),
        Paragraph(cost["criteria"], BODY),
        Paragraph(f"Cost points are awarded by formula and are not scored by the committee: the proposal with the lowest total five-year cost receives all "
                  f"{cost['weight']} points, and each other proposal receives (lowest total cost ÷ its total cost) × {cost['weight']}. For example, if the lowest "
                  f"total cost is {money(lowest)}, a proposal at {money(other)} receives {example} points.", BODY),
    ]
    n += 1
    story += [
        Paragraph(f"6.{n} SCORING GUIDE", H),
        Paragraph("Each committee member scores each criterion on the following guide. The score earns the stated share of the criterion's maximum points "
                  "(for example, Good on a 40-point criterion earns 32 points).", BODY),
        ruled([["Score", "Share of points", "Description"]] + [list(g) for g in GUIDE], [1.1 * inch, 1.1 * inch, 4.6 * inch]),
    ]
    n += 1
    story += [
        Paragraph(f"6.{n} BASIS OF AWARD, NOTICE OF INTENT AND PROTEST", H),
        Paragraph(BASIS, BODY),
        Paragraph("The Award Authority signs the recommendation of award for the Board. After Board approval the Purchasing Department issues a Notice of "
                  "Intent to Award to every proposer. A proposer may protest in writing within five business days of the notice; the contract is executed "
                  "after the protest period closes.", BODY),
        Spacer(1, 10),
        Paragraph("SECTION 5 — EXCERPT: PROPOSAL FORMAT AND PAGE LIMITS", TITLE),
        Paragraph("Proposals shall be organized in the following sections. Pages beyond a stated limit will not be scored.", BODY),
        ruled([["Section", "Page limit"]] + [[SECTIONS["cover"], "No page limit"]] +
              [[SECTIONS.get(v, v), f"Not to exceed {PLAN['submission']['pageLimits'][v]} pages" if v in PLAN["submission"]["pageLimits"] else "No page limit"]
               for v in PLAN["submission"]["volumes"]], [4.2 * inch, 2.6 * inch]),
    ]
    doc(path, story, f"RFP No. {SOL}", "Section 6 — Evaluation Criteria and Scoring")


def render_readme(path: Path):
    """The walkthrough: what to upload at each wizard step, what the agents should fill in, and the answer key."""
    o = sc.OFFERORS
    total = sum(sc.ESTIMATE.values())
    pct = lambda code: (sum(o[code]["price"].values()) - total) / total * 100
    lines = [
        f"# Sample: {PLAN['title']} ({SOL})", "",
        "A fresh, fully synthetic K-12 district RFP for trying **New RFP evaluation** end to end in the State & Local workspace. "
        f"Every proposer, person, contract number and vendor ID is fictional. Regenerate with `.venv/bin/python tools/generate_sled_sample.py --id {SOL}`.", "",
        "On the sign-in screen pick **State & Local**, sign in as **Dana Whitfield (Procurement Officer)** and open **New RFP evaluation**.", "",
        "## 1 · RFP", "",
        "In the **Request for Proposals** card, select **Upload RFP** and choose **`RFP.pdf`** (this folder), the District's RFP cover page and scope. "
        "The UiPath Agent should fill these values; you can type any of them yourself.", "",
        "| Field | Expected |", "|---|---|",
        f"| RFP number | `{SOL}` |", f"| Title | `{PLAN['title']}` |", f"| District | `{D['name']}` |",
        f"| Purchasing office | `{D['department']}` |", f"| Contract type | `{PLAN['contractType']}` |",
        f"| Basis for award | {PLAN['basisForAward']} |", "",
        f"In the **District cost estimate** card, select **Upload cost estimate** and choose **`Cost-Estimate.pdf`**. The agent adds each item's five years. It should fill these four lines, totalling {money(total)}:", "",
        "| Item | Description | Amount |", "|---|---|---|",
        *[f"| {k} | {LABELS[k]} | {v} |" for k, v in sc.ESTIMATE.items()], "",
        "## 2 · Scoring criteria", "",
        "Upload **`Evaluation-Criteria.pdf`** (Section 6 of the RFP) and the criteria analyst agent drafts each criterion with its points, "
        "or choose **Use default criteria** to start from the K-12 template. The agent should come back with:", "",
        *[f"{i}. **{f['name']}**: {f['weight']} points, {SECTIONS.get(f['volume'], f['volume'])}." + (f" Sub-criteria: {'; '.join(s[0].lower() + s[1:] for s in f['subfactors'])}." if f.get('subfactors') else "")
          for i, f in enumerate(PLAN["factors"], start=1)], "",
        "Points total 100, and cost points come from the formula (lowest total five-year cost earns all 30). "
        f"Page limits: {', '.join(f'{SECTIONS[v]} {n}' for v, n in PLAN['submission']['pageLimits'].items())}.", "",
        "## 3 · Evaluation committee", "",
        "Keep **Three evaluators**, or pick **Two evaluators** to try a smaller committee.", "",
        "## 4 · Proposals", "",
        "Add each proposer with its code, then drag all five PDFs from its folder onto the drop zone. The section is detected from each file name.", "",
        "| Proposer code | Folder | Proposer |", "|---|---|---|",
        *[f"| `{c}` | `{c}/` | {o[c]['name']} |" for c in sorted(o)], "",
        "## 5 · Review and start", "",
        "Choose **Create and start RFP evaluation**. Maestro then runs:", "",
        "1. Robots ingest the PDFs and check required sections, page limits, state vendor registration and the debarment list. All three proposers screen Compliant.",
        "2. Dana releases the proposals to the evaluation committee.",
        "3. The evaluation agent drafts cited findings.",
        "4. Each committee member scores their criteria.",
        "5. The Committee Chair sets the consensus scores.",
        "6. Dana confirms the cost evaluation and cost points.",
        "7. The agent drafts the Recommendation of Award.",
        "8. James Thornton (Award Authority) signs the recommendation for the Board.", "",
        "## What the agents should find (answer key)", "",
        "| Proposer | Planted findings | Total cost vs estimate |", "|---|---|---|",
        *[f"| {o[c]['name']} | " + "; ".join(f"**{k}**: {t}" for _, k, t in sc.PLANTED.get(c, [])) + f" | {pct(c):+.1f}% ({money(sum(o[c]['price'].values()))}) |" for c in sorted(o)], "",
        "## Running it again", "",
        "An RFP number can only be started once. To print this package under a new number, run "
        "`.venv/bin/python tools/generate_sled_sample.py --id <new number>` from the repo root, for example `--id WUSD-RFP-27-022`, "
        "or delete the evaluation as System Admin and reuse this one.", "",
    ]
    path.write_text("\n".join(lines))


render_rfp(OUT / "RFP.pdf")
render_estimate(OUT / "Cost-Estimate.pdf")
render_criteria(OUT / "Evaluation-Criteria.pdf")
# The proposal renderer reads its content from module globals; point them at the sample.
gp.OFFERORS, gp.SOLICITATIONS, gp.CLIN_LABELS = sc.OFFERORS, sc.SOLICITATIONS, sc.CLIN_LABELS
pages = gp.render(OUT.parent, official=True)
(OUT.parent / "pages.json").unlink(missing_ok=True)
render_readme(OUT / "README.md")
print(f"{SOL}: RFP, cost estimate, evaluation criteria and {len(pages)} proposal pages across {len(sc.OFFERORS)} proposers -> {OUT}")

if "--seed-vendors" in sys.argv:
    import seed  # noqa: E402
    seed.insert("SSRefVendor", "UEI", [{
        "UEI": o["uei"], "LegalName": o["name"], "SamStatus": ref["SamStatus"], "RegistrationExpiry": ref["RegistrationExpiry"],
        "Exclusion": ref["Exclusion"], "FapiisRecords": ref["FapiisRecords"],
        "CparsSummaryJson": json.dumps([{"contract": c, "rating": r, "year": y} for c, r, y in ref["cpars"]]),
    } for code, o in sc.OFFERORS.items() for ref in [sc.VENDOR_REF[code]]])
