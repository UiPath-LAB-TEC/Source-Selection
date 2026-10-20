"""Render the IXP training corpus: cover letters, price volumes and past performance volumes from 30 fictional
offerors (20 federal, 10 State & Local), each document type in three layouts, so the extraction models learn the
fields rather than one template. Three cover letters are image-only "scans" to exercise OCR.

Usage:  .venv/bin/python tools/generate_ixp_corpus.py [out_dir]          (default data/ixp)
Output: <out>/<project>/train/<doc>.pdf, <out>/<project>/holdout/<doc>.pdf and <out>/<project>/truth.json
        (the values each document states, used to review IXP predictions and to score the held-out documents).
Every page carries the synthetic-demo banner. Seeded, so reruns are identical.
"""
import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

sys.path.insert(0, str(Path(__file__).parent))
from official_docs import BODY as T_BODY, CELL, CELL_B, H as T_H, ruled  # noqa: E402

RNG = random.Random(2714)
ROOT = Path(__file__).resolve().parent.parent
BANNER = "SYNTHETIC DEMO PROPOSAL — FICTIONAL OFFEROR — NOT REAL SOURCE SELECTION INFORMATION"
SLED_BANNER = "SYNTHETIC DEMO PROPOSAL — FICTIONAL PROPOSER — NOT A REAL PROCUREMENT"
SANS_H = ParagraphStyle("sh", fontName="Helvetica-Bold", fontSize=12.5, leading=16, spaceBefore=8, spaceAfter=6)
SANS = ParagraphStyle("s", fontName="Helvetica", fontSize=10.2, leading=14.5, spaceAfter=7)
SANS_SMALL = ParagraphStyle("ss", fontName="Helvetica", fontSize=9, leading=12)
FONT_DIR = Path("/System/Library/Fonts/Supplemental")

# ── Fictional people, companies and places ──────────────────────────────────────────────────────────────────────
WORDS = ["Bluewater", "Cedarline", "Northfield", "Granite Peak", "Harborlight", "Ironbridge", "Juniper", "Keelson", "Lantern",
         "Meridian Arc", "Nimbus", "Orchard Hill", "Pinecrest", "Quarry Lane", "Ridgeway", "Summitpoint", "Tidewater", "Upland",
         "Vantage Row", "Westbrook", "Yarrow", "Copperfield", "Driftwood", "Evergreen Gate", "Foxglove", "Glacier Run",
         "Highmark", "Inlet", "Larkspur", "Marlow"]
KINDS = ["Systems", "Digital", "Analytics", "Technologies", "Solutions", "Data Services", "Consulting", "Software", "Mission Services", "Labs"]
SUFFIX = ["LLC", "Inc.", "Corporation", "Group LLC", "Inc."]
FIRST = ["Avery", "Jordan", "Morgan", "Riley", "Casey", "Taylor", "Quinn", "Reese", "Rowan", "Sasha", "Devon", "Harper",
         "Emerson", "Logan", "Parker", "Sloane", "Kendall", "Marlowe", "Bennett", "Hollis"]
LAST = ["Calloway", "Ferreira", "Lindqvist", "Okonkwo", "Marchetti", "Delacroix", "Ashworth", "Pemberton", "Valdivia",
        "Hargrove", "Nakamura", "Oyelaran", "Brennan", "Castellano", "Whitlock", "Szabo", "Abernathy", "Kowalczyk"]
FED_TITLES = ["Chief Executive Officer", "President", "Vice President, Contracts", "Director of Contracts", "Chief Operating Officer"]
SLED_TITLES = ["President", "Director of K-12 Partnerships", "Chief Executive Officer", "Contracts Manager"]
STREETS = ["Commonwealth Drive", "Sunrise Valley Drive", "Research Boulevard", "Liberty Parkway", "Corporate Center Way",
           "Innovation Loop", "Harbor Point Road", "Meadowbrook Lane", "Foundry Street", "Aspen Court"]
CITIES = [("Arlington", "VA", "22201"), ("Reston", "VA", "20190"), ("Herndon", "VA", "20171"), ("Columbia", "MD", "21044"),
          ("Huntsville", "AL", "35806"), ("Colorado Springs", "CO", "80903"), ("San Antonio", "TX", "78205"),
          ("Dayton", "OH", "45402"), ("Tampa", "FL", "33602"), ("Portland", "OR", "97204"), ("Boise", "ID", "83702"),
          ("Sacramento", "CA", "95814")]
FED_SOLS = [("FA8771-27-R-0031", "Enterprise IT Modernization Services", "Department of the Air Force"),
            ("75N910-27-R-0052", "Research Data Platform and Analytics Support", "National Institutes of Health"),
            ("W52P1J-27-R-0023", "Army Logistics Data Analytics Platform", "Department of the Army"),
            ("36C10B-27-R-0058", "Veterans Claims Intake Modernization", "Department of Veterans Affairs"),
            ("70RSAT-27-R-0007", "Cyber Analytics Platform Sustainment", "Department of Homeland Security")]
SLED_SOLS = [("WUSD-RFP-27-014", "Student Information System", "Willowmere Unified School District"),
             ("WUSD-RFP-27-009", "Learning Management System", "Willowmere Unified School District"),
             ("WUSD-RFP-27-021", "Student Transportation Routing and Fleet Management", "Willowmere Unified School District"),
             ("CVSD-RFP-27-112", "Nutrition Services Point of Sale", "Cedar Valley School District")]
FED_CLINS = ["Program management", "Transition-in", "Engineering and integration services", "Operations and sustainment",
             "Cloud hosting (other direct costs)", "Cybersecurity and continuous ATO support", "Data migration", "Transition-out"]
SLED_ITEMS = ["Software subscription and licenses", "Implementation and data migration", "Training and change management",
              "Hosting, support and maintenance", "Hardware and devices", "Integration with district systems"]
FED_CUSTOMERS = ["Defense Health Agency", "Air Force Life Cycle Management Center", "Department of Veterans Affairs",
                 "Army Contracting Command", "Centers for Medicare & Medicaid Services", "Department of Homeland Security",
                 "National Institutes of Health", "General Services Administration", "Naval Information Warfare Center"]
FED_PROGRAMS = ["Enterprise Cloud Migration", "Clinical Data Warehouse Modernization", "Logistics Analytics Platform",
                "Benefits Claims Processing Modernization", "Zero Trust Architecture Implementation", "Case Management System Sustainment",
                "Research Data Commons", "Financial Systems Integration", "Mission Application Rationalization", "DevSecOps Software Factory"]
CONTRACT_PREFIX = ["HT0011", "FA8732", "36C10B", "W91QUZ", "75FCMC", "70CMSD", "47QTCA", "75N950", "N66001"]
CPARS = ["Exceptional", "Very Good", "Very Good", "Satisfactory", "Satisfactory", "Marginal"]
DISTRICTS = ["Lakeshore Unified School District", "Pine Ridge Public Schools", "Riverbend School District", "North Fork Unified School District",
             "Silver Creek Independent School District", "Maple Hollow County Schools", "Eastgate Public Schools", "Bayview Unified School District"]
SLED_PROGRAMS = ["Student Information System Implementation", "Learning Management System Rollout", "Transportation Routing Software",
                 "Special Education Case Management", "Nutrition Services Point of Sale", "Parent Communication Platform"]
SLED_RATINGS = ["Excellent (5 of 5)", "Good (4 of 5)", "Good (4 of 5)", "Satisfactory (3 of 5)"]
RELEVANCE = ["Very relevant", "Relevant", "Relevant", "Somewhat relevant"]
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
NARRATIVE = [
    "The effort delivered on schedule and within budget, and the customer exercised every option period.",
    "Our team retired legacy infrastructure ahead of plan and held availability above the service-level target throughout.",
    "We stood up the program management office in the first 30 days and kept staffing above 95 percent for the life of the contract.",
    "The customer cited our transition planning and weekly risk reviews as strengths in the most recent assessment.",
    "Two milestones slipped during the first year while a subcontractor was replaced; both were recovered within the quarter.",
    "The work closely matches this requirement in scope, user population and security controls.",
]


def uei(n=12):
    return RNG.choice("ABCDEFGHJKLMNPQRSTUVWXYZ") + "".join(RNG.choice("ABCDEFGHJKLMNPQRSTUVWXYZ0123456789") for _ in range(n - 1))


def cage():
    return RNG.choice("123456789") + "".join(RNG.choice("ABCDEFGHJKLMNPQRSTUVWXYZ0123456789") for _ in range(3)) + RNG.choice("0123456789")


def money(v):
    return f"${v:,.0f}"


def make_offerors(n_fed=20, n_sled=10, first=1):
    names, out = set(), []
    for i in range(n_fed + n_sled):
        sled = i >= n_fed
        while True:
            name = f"{RNG.choice(WORDS)} {RNG.choice(KINDS)} {RNG.choice(SUFFIX)}"
            if name not in names:
                names.add(name)
                break
        city, state, zip_ = RNG.choice(CITIES)
        sol = RNG.choice(SLED_SOLS if sled else FED_SOLS)
        signed = RNG.random() > 0.1
        day = RNG.randint(20, 29)
        o = {
            "id": f"{'S' if sled else 'F'}{first + i:02d}", "sled": sled, "name": name, "uei": uei(), "cage": cage(),
            "address": f"{RNG.randint(100, 9900)} {RNG.choice(STREETS)}, Suite {RNG.randint(100, 900)}, {city}, {state} {zip_}",
            "signatory": f"{RNG.choice(FIRST)} {RNG.choice(LAST)}" if signed else None,
            "title": RNG.choice(SLED_TITLES if sled else FED_TITLES), "date": f"2026-10-{day:02d}",
            "solicitation": sol[0], "sol_title": sol[1], "agency": sol[2], "validity": RNG.choice([90, 120, 180]),
            "amendments": RNG.choice(["0001", "0001 and 0002", "0001, 0002 and 0003", "none issued"]),
        }
        if sled:
            o["certs"] = {"non_collusion": RNG.random() > 0.15, "debarment": RNG.random() > 0.1, "data_privacy": RNG.random() > 0.2}
        else:
            o["certs"] = {"reps_certs_current": RNG.random() > 0.12}
        items = RNG.sample(SLED_ITEMS if sled else FED_CLINS, RNG.randint(4, 6))
        lines = [{"item": f"{n + 1:04d}" if not sled else f"{n + 1}", "description": d,
                  "amount": RNG.randint(30, 900) * (1000 if sled else 10000)} for n, d in enumerate(items)]
        total = sum(x["amount"] for x in lines)
        mismatch = RNG.random() < 0.12
        o["price"] = {"lines": lines, "stated_total": total + (RNG.choice([10000, -25000, 40000]) if mismatch else 0)}
        refs = []
        for _ in range(3):
            start = RNG.randint(2019, 2023)
            end = start + RNG.randint(2, 5)
            refs.append({
                "program": RNG.choice(SLED_PROGRAMS if sled else FED_PROGRAMS),
                "customer": RNG.choice(DISTRICTS if sled else FED_CUSTOMERS),
                "contract": (f"Agreement {start}-{RNG.randint(100, 999)}" if sled
                             else f"{RNG.choice(CONTRACT_PREFIX)}-{start % 100:02d}-{RNG.choice('CDF')}-{RNG.randint(1, 9999):04d}"),
                "value": RNG.randint(3, 40) * (100000 if sled else 1000000),
                "period": f"{RNG.choice(MONTHS)} {start} – {'present' if end >= 2026 else f'{RNG.choice(MONTHS)} {end}'}",
                "rating": RNG.choice(SLED_RATINGS if sled else CPARS),
                "relevance": RNG.choice(RELEVANCE),
            })
        o["references"] = refs
        out.append(o)
    return out


# ── Page chrome ─────────────────────────────────────────────────────────────────────────────────────────────────
def chrome(o, volume):
    def draw(c, doc):
        c.saveState()
        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColor(colors.HexColor("#b42318"))
        c.drawCentredString(LETTER[0] / 2, LETTER[1] - 0.35 * inch, SLED_BANNER if o["sled"] else BANNER)
        c.setFillColor(colors.HexColor("#475467"))
        c.setFont("Helvetica", 8.5)
        c.drawString(0.75 * inch, 0.5 * inch, f"{o['name']} | {o['solicitation']} | {volume}")
        c.drawRightString(LETTER[0] - 0.75 * inch, 0.5 * inch, f"Page {doc.page}")
        c.restoreState()
    return draw


def build(path, o, volume, story):
    path.parent.mkdir(parents=True, exist_ok=True)
    SimpleDocTemplate(str(path), pagesize=LETTER, leftMargin=0.85 * inch, rightMargin=0.85 * inch,
                      topMargin=0.8 * inch, bottomMargin=0.8 * inch, title=f"{o['name']} — {volume}").build(
        story, onFirstPage=chrome(o, volume), onLaterPages=chrome(o, volume))


def box(on):
    return "[X]" if on else "[ ]"


# ── Cover letter / transmittal: three layouts ───────────────────────────────────────────────────────────────────
def cert_sentences(o):
    c = o["certs"]
    if not o["sled"]:
        return [("The offeror certifies that its representations and certifications in SAM are current, accurate and complete as of the date of this proposal."
                 if c["reps_certs_current"] else "The offeror's SAM representations and certifications are being updated and will be current before award.")]
    return [s for s, on in [("The non-collusion affidavit is signed and enclosed.", c["non_collusion"]),
                            ("The suspension and debarment certification is signed and enclosed.", c["debarment"]),
                            ("The student data privacy agreement is signed and enclosed.", c["data_privacy"])] if on] + \
           [f"The {n} will follow under separate cover." for n, on in [("non-collusion affidavit", c["non_collusion"]),
                                                                       ("suspension and debarment certification", c["debarment"]),
                                                                       ("student data privacy agreement", c["data_privacy"])] if not on]


def amend_sentence(o):
    word = "addenda" if o["sled"] else "amendments"
    return f"No {word} were issued." if o["amendments"] == "none issued" else f"The {'proposer' if o['sled'] else 'offeror'} acknowledges {word} {o['amendments']}."


def cover_labelled(o):
    vid, code = ("State vendor ID", "Vendor code") if o["sled"] else ("Unique Entity ID (UEI)", "CAGE code")
    head = "Proposer identification" if o["sled"] else "Offeror identification"
    story = [Paragraph(o["name"], ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=16, leading=20, spaceAfter=6)),
             Paragraph(f"Proposal in response to {'RFP' if o['sled'] else 'Solicitation'} {o['solicitation']} — {o['sol_title']}", SANS),
             Paragraph(o["agency"], SANS), Spacer(1, 6), Paragraph(head, SANS_H),
             Paragraph(f"Legal name: {o['name']}<br/>{vid}: {o['uei']}<br/>{code}: {o['cage']}<br/>Address: {o['address']}", SANS),
             Paragraph("Required forms and certifications" if o["sled"] else "Representations and certifications", SANS_H)]
    story += [Paragraph(s, SANS) for s in cert_sentences(o)] + [Paragraph(amend_sentence(o), SANS),
              Paragraph(f"This proposal is valid for {o['validity']} days from the proposal due date.", SANS), Spacer(1, 16)]
    story.append(Paragraph(f"Signed: {o['signatory']}, {o['title']}<br/>Date: {o['date']}" if o["signatory"] else "Signed: ____________________", SANS))
    return story


def cover_letter(o):
    vid, code = ("state vendor ID", "vendor code") if o["sled"] else ("UEI", "CAGE code")
    who = "Procurement Officer" if o["sled"] else "Contracting Officer"
    d = o["date"].split("-")
    when = f"{MONTHS[int(d[1]) - 1]} {int(d[2])}, {d[0]}"
    story = [Paragraph(f"<b>{o['name']}</b><br/>{o['address']}", T_BODY), Spacer(1, 10), Paragraph(when, T_BODY),
             Paragraph(f"{who}<br/>{o['agency']}", T_BODY), Paragraph(f"Subject: {'RFP' if o['sled'] else 'Solicitation'} {o['solicitation']}, {o['sol_title']}", T_BODY),
             Paragraph(f"Dear {who}:", T_BODY),
             Paragraph(f"{o['name']} ({vid} {o['uei']}, {code} {o['cage']}) is pleased to submit this proposal. "
                       f"Our offer remains valid for {o['validity']} calendar days after the closing date. {amend_sentence(o)}", T_BODY),
             Paragraph(" ".join(cert_sentences(o)), T_BODY), Spacer(1, 14), Paragraph("Sincerely,", T_BODY), Spacer(1, 20)]
    story.append(Paragraph(f"{o['signatory']}<br/>{o['title']}" if o["signatory"] else "(signature pending)", T_BODY))
    return story


def cover_form(o):
    c = o["certs"]
    rows = [["Item", "Response"],
            ["Offeror legal name" if not o["sled"] else "Proposer legal name", o["name"]],
            ["SAM Unique Entity ID" if not o["sled"] else "State vendor ID", o["uei"]],
            ["CAGE / NCAGE code" if not o["sled"] else "Vendor code", o["cage"]],
            ["Business address", o["address"]],
            ["Solicitation number", o["solicitation"]],
            ["Offer validity", f"{o['validity']} days"],
            ["Amendments acknowledged" if not o["sled"] else "Addenda acknowledged", o["amendments"]]]
    story = [Paragraph(f"{'Proposal Transmittal Form' if o['sled'] else 'Offer Summary and Certifications'}", T_H),
             ruled(rows, [2.2 * inch, 4.4 * inch]), Spacer(1, 10), Paragraph("Certifications", T_H)]
    certs = ([("Representations and certifications in SAM are current", c["reps_certs_current"])] if not o["sled"] else
             [("Non-collusion affidavit signed and enclosed", c["non_collusion"]), ("Suspension and debarment certification signed", c["debarment"]),
              ("Student data privacy agreement signed", c["data_privacy"])])
    story += [Paragraph(f"{box(on)} {label}", T_BODY) for label, on in certs]
    story += [Spacer(1, 12), ruled([["Authorized signature", "Name and title", "Date"],
                                    ["/s/ " + o["signatory"] if o["signatory"] else "", f"{o['signatory']}, {o['title']}" if o["signatory"] else "", o["date"] if o["signatory"] else ""]],
                                   [2.0 * inch, 3.0 * inch, 1.6 * inch])]
    return story


def scanned_cover(o, path):
    """An image-only PDF that looks like a printed, signed and rescanned letter."""
    w, h = 1275, 1650  # 150 dpi letter
    img = Image.new("L", (w, h), 250)
    d = ImageDraw.Draw(img)
    body = ImageFont.truetype(str(FONT_DIR / "Times New Roman.ttf"), 25)
    bold = ImageFont.truetype(str(FONT_DIR / "Times New Roman Bold.ttf"), 30)
    sig = ImageFont.truetype(str(FONT_DIR / "Brush Script.ttf"), 46)
    red = ImageFont.truetype(str(FONT_DIR / "Arial Bold.ttf"), 15)
    d.text((w // 2, 40), SLED_BANNER if o["sled"] else BANNER, font=red, fill=90, anchor="mm")
    vid, code = ("State vendor ID", "Vendor code") if o["sled"] else ("Unique Entity ID (UEI)", "CAGE code")
    y = 130
    d.text((120, y), o["name"], font=bold, fill=20); y += 60
    for line in [f"Proposal in response to {'RFP' if o['sled'] else 'Solicitation'} {o['solicitation']}", o["sol_title"], o["agency"], "",
                 f"Legal name: {o['name']}", f"{vid}: {o['uei']}", f"{code}: {o['cage']}", f"Address: {o['address']}", "",
                 *wrap(" ".join(cert_sentences(o)), 84), amend_sentence(o), f"This proposal is valid for {o['validity']} days from the proposal due date.", ""]:
        d.text((120, y), line, font=body, fill=25); y += 38
    if o["signatory"]:
        d.text((140, y + 10), o["signatory"], font=sig, fill=35); y += 80
        d.text((120, y), f"{o['signatory']}, {o['title']}    Date: {o['date']}", font=body, fill=25)
    else:
        d.text((120, y + 30), "Signature: ______________________", font=body, fill=25)
    noise = Image.effect_noise((w, h), 18)
    img = Image.blend(img, noise, 0.08).rotate(RNG.uniform(-0.8, 0.8), fillcolor=245, resample=Image.BICUBIC).filter(ImageFilter.GaussianBlur(0.6))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(str(path), "PDF", resolution=150)


def wrap(text, width):
    words, lines, cur = text.split(), [], ""
    for w_ in words:
        if len(cur) + len(w_) + 1 > width:
            lines.append(cur)
            cur = w_
        else:
            cur = f"{cur} {w_}".strip()
    return lines + ([cur] if cur else [])


# ── Price volume: three layouts ─────────────────────────────────────────────────────────────────────────────────
def price_simple(o):
    p = o["price"]
    rows = [["Item" if o["sled"] else "CLIN", "Description", "Total price"]] + [[x["item"], x["description"], money(x["amount"])] for x in p["lines"]]
    rows.append(["", "Total proposed cost" if o["sled"] else "Total evaluated price", money(p["stated_total"])])
    t = Table(rows, colWidths=[0.8 * inch, 4.2 * inch, 1.5 * inch])
    t.setStyle(TableStyle([("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 10), ("FONT", (0, 1), (-1, -1), "Helvetica", 10),
                           ("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 10), ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.black),
                           ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.black), ("ALIGN", (2, 0), (2, -1), "RIGHT")]))
    return [Paragraph(o["name"], SANS_H), Paragraph(f"{'Section 4 — Cost Proposal' if o['sled'] else 'Volume IV — Price'} · {o['solicitation']}", SANS),
            Paragraph("Price schedule" if not o["sled"] else "Cost schedule (full term)", SANS_H), t, Spacer(1, 10),
            Paragraph("Prices are firm fixed prices and include all labor, travel and other direct costs.", SANS)]


def split_years(amount, n):
    parts = [round(amount / n / 1000) * 1000 for _ in range(n - 1)]
    return parts + [amount - sum(parts)]


def price_periods(o):
    p = o["price"]
    if o["sled"]:
        head = ["Item", "Description", "Year 1", "Years 2–5", "Total"]
        rows = [head] + [[x["item"], x["description"], *(money(v) for v in split_years(x["amount"], 2)), money(x["amount"])] for x in p["lines"]]
        widths = [0.5 * inch, 2.6 * inch, 1.1 * inch, 1.1 * inch, 1.2 * inch]
    else:
        head = ["CLIN", "Supplies or services", "Base year", "Option 1", "Option 2", "Option 3", "Option 4", "Total"]
        rows = [head] + [[x["item"], x["description"], *(money(v) for v in split_years(x["amount"], 5)), money(x["amount"])] for x in p["lines"]]
        widths = [0.45 * inch, 1.5 * inch] + [0.78 * inch] * 5 + [0.85 * inch]
    rows.append(["", "Grand total", *[""] * (len(head) - 3), money(p["stated_total"])])
    return [Paragraph(f"{o['name']} — {'Cost Proposal' if o['sled'] else 'Price Volume'}", T_H),
            Paragraph(f"{'RFP' if o['sled'] else 'Solicitation'} {o['solicitation']}, {o['sol_title']}. All periods are firm fixed price.", T_BODY),
            ruled(rows, widths, style=ParagraphStyle("c8", parent=CELL, fontSize=8), head_style=ParagraphStyle("c8b", parent=CELL_B, fontSize=8), align_right_from=2)]


def price_section_b(o):
    p = o["price"]
    rows = [["Item No.", "Supplies / services", "Qty", "Unit", "Unit price", "Amount"]]
    for x in p["lines"]:
        qty = RNG.choice([1, 1, 5, 12]) if not o["sled"] else 1
        unit = "Lot" if qty == 1 else ("Year" if qty == 5 else "Month")
        rows.append([x["item"], x["description"], str(qty), unit, money(x["amount"] / qty), money(x["amount"])])
    story = [Paragraph(f"PART I — THE SCHEDULE · SECTION B — SUPPLIES OR SERVICES AND PRICES" if not o["sled"] else "COST PROPOSAL FORM", T_H),
             Paragraph(f"Offeror: {o['name']}" if not o["sled"] else f"Proposer: {o['name']}", T_BODY),
             ruled(rows, [0.7 * inch, 2.7 * inch, 0.5 * inch, 0.6 * inch, 1.05 * inch, 1.1 * inch], align_right_from=2), Spacer(1, 10),
             Paragraph(f"The total amount of this offer is {money(p['stated_total'])}.", T_BODY),
             Paragraph("Pricing assumptions: labor rates are fully burdened; travel is priced at cost per the Joint Travel Regulations." if not o["sled"]
                       else "Pricing assumptions: subscription fees are fixed for the full term; no additional fees apply.", T_BODY)]
    return story


# ── Past performance: three layouts ─────────────────────────────────────────────────────────────────────────────
def pp_headed(o):
    story = [Paragraph(o["name"], SANS_H), Paragraph(f"{'Section 3 — Experience and References' if o['sled'] else 'Volume III — Past Performance'} · {o['solicitation']}", SANS)]
    for n, r in enumerate(o["references"], 1):
        rating = f"Reference rating: {r['rating']}" if o["sled"] else f"CPARS: {r['rating']}"
        story += [Paragraph(f"Reference {n} — {r['program']} ({r['contract']})", SANS_H),
                  Paragraph(f"Customer: {r['customer']}. Value {money(r['value'])}, period {r['period']}, {rating}. Relevance: {r['relevance']}.", SANS),
                  Paragraph(" ".join(RNG.sample(NARRATIVE, 2)), SANS)]
    return story


def pp_narrative(o):
    story = [Paragraph(f"{o['name']}: Relevant Experience", T_H)]
    for r in o["references"]:
        rated = (f"The district rated our work {r['rating']} in its reference survey" if o["sled"]
                 else f"Our most recent CPARS assessment rated overall performance {r['rating']}")
        story += [Paragraph(f"<b>{r['customer']} — {r['program']}</b>", T_BODY),
                  Paragraph(f"Under {'' if o['sled'] else 'contract '}{r['contract']}, valued at {money(r['value'])}, we supported {r['customer']} "
                            f"from {r['period'].replace(' – ', ' to ')}. {rated}, and we consider the effort {r['relevance'].lower()} to this requirement. "
                            f"{' '.join(RNG.sample(NARRATIVE, 2))}", T_BODY)]
    return story


def pp_table(o):
    rows = [["Contract", "Customer", "Program", "Value", "Period", "Rating" if o["sled"] else "CPARS rating", "Relevance"]]
    rows += [[r["contract"], r["customer"], r["program"], money(r["value"]), r["period"], r["rating"], r["relevance"]] for r in o["references"]]
    small = ParagraphStyle("c75", parent=CELL, fontSize=7.5, leading=9.5)
    story = [Paragraph("Past Performance Summary" if not o["sled"] else "Summary of References", T_H),
             ruled(rows, [1.15 * inch, 1.15 * inch, 1.25 * inch, 0.8 * inch, 1.0 * inch, 0.75 * inch, 0.7 * inch], style=small,
                   head_style=ParagraphStyle("c75b", parent=small, fontName="Times-Bold")), Spacer(1, 10)]
    for r in o["references"]:
        story += [Paragraph(f"<b>{r['program']}</b>", T_BODY), Paragraph(" ".join(RNG.sample(NARRATIVE, 3)), T_BODY)]
    return story


AREAS = ["quality", "schedule", "cost control", "management"]
AREA_PROGRAMS = [("Air Force Materiel Command", "Application Migration"), ("Space Systems Command", "DevSecOps Platform"),
                 ("Defense Health Agency", "Hosting Consolidation"), ("National Cancer Institute", "Data Commons Operations"),
                 ("Department of the Navy", "Cloud Hosting"), ("Army Contracting Command", "Readiness Analytics"),
                 ("Centers for Medicare & Medicaid Services", "Claims Data Modernization"), ("Department of Veterans Affairs", "Benefits Intake Platform"),
                 ("Defense Logistics Agency", "Supply Chain Analytics"), ("Department of Homeland Security", "Case Management Sustainment")]


def area_references(o):
    """Past performance in the demo proposals' own style: the customer only inside the reference title, the value in
    millions, the period in years, and CPARS ratings given by evaluation area with quality first."""
    refs = []
    for r in o["references"]:
        customer, program = RNG.choice(AREA_PROGRAMS)
        start = int(r["period"].split()[1])
        end = "present" if r["period"].endswith("present") else str(start + RNG.randint(2, 4))
        quality = RNG.choice(["Exceptional", "Very Good", "Very Good", "Satisfactory"])
        others = RNG.sample(AREAS[1:], RNG.randint(0, 2))
        rating_text = (f"{quality} in quality" + "".join(f", {RNG.choice(['Exceptional', 'Very Good', 'Satisfactory'])} in {a}" for a in others)
                       if others or RNG.random() < 0.5 else quality)
        refs.append({**r, "program": f"{customer} {program}", "customer": customer, "value": RNG.randint(30, 450) * 100000,
                     "start": str(start), "end": end, "rating": quality, "relevance": None, "rating_text": rating_text})
    return refs


def pp_areas(o):
    story = [Paragraph(o["name"], SANS_H), Paragraph(f"Volume III — Past Performance · {o['solicitation']}", SANS)]
    for n, r in enumerate(o["references"], 1):
        when = RNG.choice(["final", f"{RNG.randint(2023, 2025)}", f"{RNG.randint(2023, 2024)} and 2025"])
        story += [Paragraph(f"<b>Reference {n} — {r['program']} ({r['contract']})</b>", SANS),
                  Paragraph(f"Value ${r['value'] / 1e6:.1f}M, period {r['start']}–{r['end']}. {RNG.choice(NARRATIVE)} CPARS {when}: {r['rating_text']}.", SANS)]
    return story


def truth_cover(o):
    t = {"legal_name": o["name"], "vendor_id": o["uei"], "vendor_code": o["cage"], "address": o["address"],
         "solicitation_number": o["solicitation"], "validity_days": o["validity"], "amendments_acknowledged": o["amendments"],
         "signatory_name": o["signatory"], "signatory_title": o["title"] if o["signatory"] else None,
         "date_signed": o["date"] if o["signatory"] else None, "dated": o["date"], **o["certs"]}
    return t


def main(out: Path):
    offerors = make_offerors()
    truth = {"cover": {}, "price": {}, "pastperf": {}}
    scanned = {"F03", "F11", "S24"}
    for i, o in enumerate(offerors):
        split = "holdout" if i % 5 == 4 else "train"
        layout = i % 3
        vol = {"cover": "Transmittal Letter and Required Forms" if o["sled"] else "Cover Letter and Certifications",
               "price": "Section 4 — Cost Proposal" if o["sled"] else "Volume IV — Price",
               "pastperf": "Section 3 — Experience and References" if o["sled"] else "Volume III — Past Performance"}
        doc = f"{o['id']}-{o['name'].split()[0].lower()}"
        cover_path = out / "cover" / split / f"{doc}-cover.pdf"
        if o["id"] in scanned:
            scanned_cover(o, cover_path)
        else:
            build(cover_path, o, vol["cover"], [cover_labelled, cover_letter, cover_form][layout](o))
        build(out / "price" / split / f"{doc}-price.pdf", o, vol["price"], [price_simple, price_periods, price_section_b][(layout + 1) % 3](o))
        build(out / "pastperf" / split / f"{doc}-pastperf.pdf", o, vol["pastperf"], [pp_headed, pp_narrative, pp_table][(layout + 2) % 3](o))
        meta = {"split": split, "framework": "sled" if o["sled"] else "federal"}
        truth["cover"][f"{doc}-cover.pdf"] = {**meta, "layout": "scanned" if o["id"] in scanned else ["labelled", "letter", "form"][layout], **truth_cover(o)}
        truth["price"][f"{doc}-price.pdf"] = {**meta, "layout": ["simple", "periods", "section_b"][(layout + 1) % 3], **o["price"]}
        truth["pastperf"][f"{doc}-pastperf.pdf"] = {**meta, "layout": ["headed", "narrative", "table"][(layout + 2) % 3], "references": o["references"]}
    # A second batch, separately seeded so the first is unchanged: past performance in the demo proposals' own style.
    global RNG
    saved, RNG = RNG, random.Random(9031)
    for i, o in enumerate(make_offerors(n_fed=12, n_sled=0, first=31)):
        o["references"] = area_references(o)
        split = "holdout" if i % 6 == 5 else "train"
        doc = f"{o['id']}-{o['name'].split()[0].lower()}"
        build(out / "pastperf" / split / f"{doc}-pastperf.pdf", o, "Volume III — Past Performance", pp_areas(o))
        truth["pastperf"][f"{doc}-pastperf.pdf"] = {"split": split, "framework": "federal", "layout": "areas",
                                                    "references": [{k: v for k, v in r.items() if k != "rating_text"} for r in o["references"]]}
    RNG = saved
    for project, t in truth.items():
        (out / project / "truth.json").write_text(json.dumps(t, indent=2))
        n = {s: sum(1 for v in t.values() if v["split"] == s) for s in ("train", "holdout")}
        print(f"{project}: {n['train']} train, {n['holdout']} holdout")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "ixp")
