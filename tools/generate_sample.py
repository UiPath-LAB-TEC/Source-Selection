"""Render the self-contained sample package for trying "New source selection" end to end.

Usage: .venv/bin/python tools/generate_sample.py [--id <solicitation number>] [--seed-vendors]
Output: samples/<solicitationId>/Section-M.pdf and samples/<solicitationId>/<OFFEROR>/<volume>.pdf
--seed-vendors adds the sample offerors to SSRefVendor (idempotent) so SAM, exclusion and FAPIIS screening
finds them; without it each one is flagged "No SAM registration found".
"""
import json
import os
import sys
from pathlib import Path

# --id prints the same sample under another solicitation number (each number can be started only once).
if "--id" in sys.argv:
    os.environ["SAMPLE_SOLICITATION_ID"] = sys.argv[sys.argv.index("--id") + 1]

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import generate_proposals as gp  # noqa: E402
import generate_section_m as sm  # noqa: E402
import sample_content as sc  # noqa: E402

out = ROOT / "samples"
sm.render(sc.PLAN, out / sc.SOLICITATION_ID)
(out / sc.SOLICITATION_ID / "Section-M.txt").unlink(missing_ok=True)


# Fictional contacts for the synthetic package (the Contracting Officer matches the workspace persona).
CO = ("Dana Whitfield", "Contracting Officer", "(555) 010-4417", "dana.whitfield@tac.example")
PERIODS = ["Base year", "Option year 1", "Option year 2", "Option year 3", "Option year 4"]


def render_igce(path: Path):
    """The Government's cost estimate, marked as source selection information, with its basis, the estimate by CLIN
    and period, assumptions and the preparer / reviewer / approver certification."""
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.units import inch
    from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer
    from official_docs import BODY, CELL, CELL_B, H, SUBTITLE, TITLE, numbered_canvas, ruled
    plan, labels = sc.PLAN, sc.CLIN_LABELS[sc.SOLICITATION_ID]
    money = lambda n: f"${n:,.0f}"
    small = CELL.clone("small", fontSize=8.5, leading=10.5)
    small_b = CELL_B.clone("smallb", fontSize=8.5, leading=10.5)
    rows = [["CLIN", "Description", "Base<br/>year", *[f"Option<br/>year {i}" for i in range(1, 5)], "Total"]]
    for clin, amounts in sc.IGCE_PERIODS.items():
        rows.append([clin, labels[clin], *map(money, amounts), money(sum(amounts))])
    totals = [sum(v[i] for v in sc.IGCE_PERIODS.values()) for i in range(5)]
    rows.append(["", "<b>Total estimate</b>", *[f"<b>{money(t)}</b>" for t in totals], f"<b>{money(sum(totals))}</b>"])
    table = ruled(rows, [0.5 * inch, 1.45 * inch] + [0.78 * inch] * 5 + [0.95 * inch], style=small, head_style=small_b, align_right_from=2)
    facts = ruled([
        ["Solicitation number", plan["solicitationId"], "Estimate date", "August 28, 2026"],
        ["Requirement", plan["title"], "Contract type", plan["contractType"]],
        ["Requiring activity", "Veterans Benefits Administration, Office of Business Integration", "Period of performance", "One 12-month base year and four 12-month option years"],
        ["Contracting office", plan["office"], "Estimate total", money(sum(totals))],
    ], [1.25 * inch, 2.15 * inch, 1.25 * inch, 2.15 * inch], header=False)
    who = [("Prepared by", "Marisol Grant", "Cost/Price Analyst, VBA Office of Business Integration"),
           ("Reviewed by", "Program Manager", "Veterans Claims Intake Modernization"),
           ("Approved by", CO[0], f"{CO[1]}, {plan['office'].split(',')[0]}")]
    signatures = ruled([[w[0] for w in who], *[[f"{field}: {w[i]}" for w in who] for field, i in (("Name", 1), ("Title", 2))],
                        ["Signature:<br/><br/>______________________"] * 3, ["Date: ______________"] * 3], [6.8 * inch / 3] * 3)
    story = [
        Paragraph("INDEPENDENT GOVERNMENT COST ESTIMATE (IGCE)", TITLE),
        Paragraph(f"{plan['agency']} · {plan['office']}", SUBTITLE),
        facts,
        Paragraph("1. PURPOSE", H),
        Paragraph("This Independent Government Cost Estimate supports the evaluation of price reasonableness for the requirement above under FAR 15.404-1. It was prepared by the requiring activity without input from any prospective offeror.", BODY),
        Paragraph("2. BASIS OF ESTIMATE", H),
        Paragraph("Labor hours are drawn from the Veterans Benefits Administration document intake pilot (2023 to 2025) and scaled to national claim volumes of roughly 1.6 million claims a year. Labor rates use GSA Multiple Award Schedule ceiling rates for comparable categories, escalated 2.5 percent a year. The base year includes one-time platform build and transition-in costs that do not recur in the option years.", BODY),
        Paragraph("3. ESTIMATE BY CLIN AND PERIOD", H),
        table, Spacer(1, 6),
        Paragraph(f"All amounts are firm-fixed-price estimates in U.S. dollars and include labor, travel and other direct costs. The total estimate for the base year and all four option years is {money(sum(totals))}.", BODY),
        Paragraph("4. ASSUMPTIONS", H),
        *[Paragraph(f"{chr(97 + i)}. {t}", BODY.clone(f"as{i}", leftIndent=14, spaceAfter=3)) for i, t in enumerate([
            "Performance begins within 30 days of award; the base year carries the transition-in and platform build.",
            "Option years are priced at steady-state operations with 2.5 percent annual escalation already applied.",
            "Government-furnished cloud hosting under the VA Enterprise Cloud; no hosting costs are included.",
            "Travel is limited to quarterly program reviews at the Technology Acquisition Center.",
        ])],
        KeepTogether([Paragraph("5. CERTIFICATION", H),
                      Paragraph("The undersigned certify that this estimate was developed independently by Government personnel, without the assistance of any prospective offeror, and represents the Government's best estimate of the cost of the requirement.", BODY),
                      signatures]),
    ]
    canvas = numbered_canvas(f"Solicitation No. {plan['solicitationId']}", "Independent Government Cost Estimate",
                             marking="SOURCE SELECTION INFORMATION — SEE FAR 2.101 AND 3.104", banner="SYNTHETIC DEMO COST ESTIMATE — NOT AN ACTUAL GOVERNMENT ESTIMATE")
    SimpleDocTemplate(str(path), pagesize=LETTER, leftMargin=inch * 0.85, rightMargin=inch * 0.85, topMargin=inch * 1.0,
                      bottomMargin=inch * 0.85, title=f"{plan['solicitationId']} IGCE").build(story, canvasmaker=canvas)


render_igce(out / sc.SOLICITATION_ID / "IGCE.pdf")


def render_solicitation(path: Path):
    """The solicitation: a Standard Form 33 (Solicitation, Offer and Award) front page with its numbered blocks, then
    Section B (the CLIN schedule offerors price) and the Section M basis for award."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.units import inch
    from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from official_docs import BODY, CELL, H, LABEL, RULE, SHADE, SUBTITLE, TITLE, VALUE, VALUE_B, numbered_canvas, ruled
    plan, labels = sc.PLAN, sc.CLIN_LABELS[sc.SOLICITATION_ID]
    office = plan["office"].split(",")[0]
    box = lambda label, value="", bold=False: [Paragraph(label, LABEL), Paragraph(value or "&nbsp;", VALUE_B if bold else VALUE)]
    band = lambda text: Paragraph(f"<b>{text}</b>", VALUE.clone("band", alignment=1))
    X = "<b>X</b>"
    toc = [
        ("PART I — THE SCHEDULE", "PART II — CONTRACT CLAUSES"),
        (("A", "Solicitation/Contract Form", "1"), ("I", "Contract Clauses", "")),
        (("B", "Supplies or Services and Prices/Costs", "2"), "PART III — LIST OF DOCUMENTS, EXHIBITS AND OTHER ATTACH."),
        (("C", "Description/Specs./Work Statement", ""), ("J", "List of Attachments", "")),
        (("D", "Packaging and Marking", ""), "PART IV — REPRESENTATIONS AND INSTRUCTIONS"),
        (("E", "Inspection and Acceptance", ""), ("K", "Representations, Certifications and Other Statements of Offerors", "")),
        (("F", "Deliveries or Performance", ""), ("L", "Instrs., Conds., and Notices to Offerors", "")),
        (("G", "Contract Administration Data", ""), ("M", "Evaluation Factors for Award", "Separate")),
        (("H", "Special Contract Requirements", ""), None),
    ]
    c = 7.3 * inch / 12
    rows, spans, shaded = [], [], []

    def add(cells, spec, shade=False):
        """cells: list of (col_from, col_to, content)."""
        r = len(rows)
        row = [""] * 12
        for a, b, content in cells:
            row[a] = content
            if b > a:
                spans.append(("SPAN", (a, r), (b, r)))
        rows.append(row)
        if shade:
            shaded.append(r)

    add([(0, 7, Paragraph("<b>SOLICITATION, OFFER AND AWARD</b>", VALUE_B.clone("t", fontSize=11, leading=13))),
         (8, 9, box("1. THIS CONTRACT IS A RATED ORDER UNDER DPAS (15 CFR 700)", "No")), (10, 10, box("RATING", "N/A")), (11, 11, box("PAGE OF PAGES", "1 &nbsp; &nbsp; 2"))], None)
    add([(0, 1, box("2. CONTRACT NUMBER")), (2, 4, box("3. SOLICITATION NUMBER", plan["solicitationId"], True)),
         (5, 7, box("4. TYPE OF SOLICITATION", "[ &nbsp;] SEALED BID (IFB)<br/>[X] NEGOTIATED (RFP)")),
         (8, 9, box("5. DATE ISSUED", "September 15, 2026")), (10, 11, box("6. REQUISITION/PURCHASE NUMBER", "36C10B-27-0193"))], None)
    add([(0, 5, box("7. ISSUED BY &nbsp; &nbsp; CODE 36C10B", f"{plan['agency']}<br/>{office}<br/>Building 2, Eatontown, NJ 07724")),
         (6, 11, box("8. ADDRESS OFFER TO (If other than Item 7)", "Same as Item 7. Offers are submitted electronically as stated in Section L."))], None)
    add([(0, 11, Paragraph('NOTE: In sealed bid solicitations "offer" and "offeror" mean "bid" and "bidder".', LABEL))], None)
    add([(0, 11, band("SOLICITATION"))], None, shade=True)
    add([(0, 11, Paragraph("9. Sealed offers in original and 0 copies for furnishing the supplies or services in the Schedule will be received at the place specified in Item 8, or if hand carried, in the depository located in N/A (electronic submission only) until <b>2:00 PM local time October 30, 2026</b>.", VALUE))], None)
    add([(0, 11, Paragraph("CAUTION — LATE Submissions, Modifications, and Withdrawals: See Section L, Provision No. 52.214-7 or 52.215-1. All offers are subject to all terms and conditions contained in this solicitation.", LABEL))], None)
    add([(0, 1, box("10. FOR INFORMATION CALL:")), (2, 5, box("A. NAME", f"{CO[0]}, {CO[1]}")), (6, 8, box("B. TELEPHONE (Include area code)", CO[2])),
         (9, 11, box("C. E-MAIL ADDRESS", CO[3]))], None)
    add([(0, 11, band("11. TABLE OF CONTENTS"))], None, shade=True)
    add([(0, 0, Paragraph("(X)", LABEL)), (1, 1, Paragraph("SEC.", LABEL)), (2, 4, Paragraph("DESCRIPTION", LABEL)), (5, 5, Paragraph("PAGE(S)", LABEL)),
         (6, 6, Paragraph("(X)", LABEL)), (7, 7, Paragraph("SEC.", LABEL)), (8, 10, Paragraph("DESCRIPTION", LABEL)), (11, 11, Paragraph("PAGE(S)", LABEL))], None)
    for left, right in toc:
        cells = []
        for base, item in ((0, left), (6, right)):
            if item is None:
                continue
            if isinstance(item, str):
                cells.append((base, base + 5, Paragraph(f"<b>{item}</b>", LABEL)))
            else:
                sec, desc, pg = item
                cells += [(base, base, Paragraph(X, LABEL)), (base + 1, base + 1, Paragraph(sec, LABEL)),
                          (base + 2, base + 4, Paragraph(desc, LABEL)), (base + 5, base + 5, Paragraph(pg, LABEL))]
        add(cells, None)
    add([(0, 11, band("OFFER (Must be fully completed by offeror)"))], None, shade=True)
    add([(0, 11, Paragraph("12. In compliance with the above, the undersigned agrees, if this offer is accepted within ____ calendar days (60 calendar days unless a different period is inserted by the offeror) from the date for receipt of offers specified above, to furnish any or all items upon which prices are offered at the price set opposite each item, delivered at the designated point(s), within the time specified in the schedule.", LABEL))], None)
    add([(0, 3, box("13. DISCOUNT FOR PROMPT PAYMENT (See Section I, Clause No. 52.232-8)")), (4, 7, box("14. ACKNOWLEDGMENT OF AMENDMENTS (AMENDMENT NO. / DATE)")),
         (8, 11, box("15A. NAME AND ADDRESS OF OFFEROR &nbsp; CODE &nbsp; FACILITY"))], None)
    add([(0, 3, box("15B. TELEPHONE NUMBER (Include area code)")), (4, 7, box("16. NAME AND TITLE OF PERSON AUTHORIZED TO SIGN OFFER")),
         (8, 9, box("17. SIGNATURE")), (10, 11, box("18. OFFER DATE"))], None)
    add([(0, 11, band("AWARD (To be completed by Government)"))], None, shade=True)
    add([(0, 3, box("19. ACCEPTED AS TO ITEMS NUMBERED")), (4, 7, box("20. AMOUNT")), (8, 11, box("21. ACCOUNTING AND APPROPRIATION"))], None)
    add([(0, 5, box("25. ADMINISTERED BY (If other than Item 7)")), (6, 11, box("26. NAME OF CONTRACTING OFFICER (Type or print)"))], None)
    add([(0, 7, box("27. UNITED STATES OF AMERICA (Signature of Contracting Officer)")), (8, 11, box("28. AWARD DATE"))], None)
    form = Table(rows, colWidths=[c] * 12)
    form.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, RULE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                              ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                              ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3), *spans,
                              *[("BACKGROUND", (0, r), (-1, r), SHADE) for r in shaded]]))
    foot = Table([[Paragraph("AUTHORIZED FOR LOCAL REPRODUCTION<br/>Previous edition is unusable", LABEL),
                   Paragraph("STANDARD FORM 33 (REV. 9-97)<br/>Prescribed by GSA - FAR (48 CFR) 53.214(c)", LABEL.clone("r", alignment=2))]],
                 colWidths=[3.65 * inch, 3.65 * inch])
    foot.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))

    schedule = [["CLIN", "Supplies or services", "Qty", "Unit", "Unit price", "Amount"]]
    for clin, label in labels.items():
        schedule.append([clin, f"{label} (base year and option years 1 through 4)", "60", "MO", "$__________", "$__________"])
    schedule.append(["", "<b>Total evaluated price (all CLINs, base and option periods)</b>", "", "", "", "$__________"])
    story = [
        form, Spacer(1, 3), foot, PageBreak(),
        Paragraph("SECTION B — SUPPLIES OR SERVICES AND PRICES/COSTS", TITLE),
        Paragraph(f"Solicitation No. {plan['solicitationId']} · {plan['title']}", SUBTITLE),
        Paragraph("B.1 DESCRIPTION OF REQUIREMENT", H),
        Paragraph(f"{plan['title']}. The contractor shall modernize intake of Veterans' benefits claims: classifying and extracting incoming claim evidence, routing established claims to the right work queue, and delivering a Section 508 conformant experience for Veterans and VA staff, in accordance with the Performance Work Statement in Section C.", BODY),
        Paragraph("B.2 CONTRACT TYPE", H),
        Paragraph(f"This requirement will be awarded as a {plan['contractType'][0].lower() + plan['contractType'][1:]}.", BODY),
        Paragraph("B.3 SCHEDULE OF SUPPLIES OR SERVICES", H),
        Paragraph("Offerors shall enter a unit price and amount for each CLIN. Prices are fixed for each period of performance.", BODY),
        ruled(schedule, [0.55 * inch, 3.2 * inch, 0.45 * inch, 0.5 * inch, 1.05 * inch, 1.05 * inch], style=CELL),
        Paragraph("B.4 PERIOD OF PERFORMANCE", H),
        Paragraph("The period of performance is one 12-month base year from the date of award and four 12-month option years, exercisable at the Government's discretion in accordance with FAR 52.217-9, Option to Extend the Term of the Contract.", BODY),
        Paragraph("SECTION M — EXCERPT", TITLE),
        Paragraph("M.1 BASIS FOR AWARD", H),
        Paragraph("The Government will award to the offeror whose proposal represents the best value using a tradeoff process in accordance with FAR 15.101-1. The complete evaluation factors are in Section M.", BODY),
    ]
    canvas = numbered_canvas(f"Solicitation No. {plan['solicitationId']}", plan["title"], skip_first=True,
                             banner="SYNTHETIC DEMO SOLICITATION — NOT AN ACTUAL GOVERNMENT REQUIREMENT")
    SimpleDocTemplate(str(path), pagesize=LETTER, leftMargin=inch * 0.6, rightMargin=inch * 0.6, topMargin=inch * 0.8,
                      bottomMargin=inch * 0.6, title=f"{plan['solicitationId']} Solicitation").build(story, canvasmaker=canvas)


render_solicitation(out / sc.SOLICITATION_ID / "Solicitation.pdf")
# The proposal renderer reads its content from module globals; point them at the sample.
gp.OFFERORS, gp.SOLICITATIONS, gp.CLIN_LABELS = sc.OFFERORS, sc.SOLICITATIONS, sc.CLIN_LABELS
pages = gp.render(out, official=True)
(out / "pages.json").unlink(missing_ok=True)
print(f"{sc.SOLICITATION_ID}: Section M and {len(pages)} proposal pages across {len(sc.OFFERORS)} offerors -> {out / sc.SOLICITATION_ID}")

if "--seed-vendors" in sys.argv:
    import seed  # noqa: E402
    seed.insert("SSRefVendor", "UEI", [{
        "UEI": o["uei"], "LegalName": o["name"], "SamStatus": ref["SamStatus"], "RegistrationExpiry": ref["RegistrationExpiry"],
        "Exclusion": ref["Exclusion"], "FapiisRecords": ref["FapiisRecords"],
        "CparsSummaryJson": json.dumps([{"contract": c, "rating": r, "year": y} for c, r, y in ref["cpars"]]),
    } for code, o in sc.OFFERORS.items() for ref in [sc.VENDOR_REF[code]]])
