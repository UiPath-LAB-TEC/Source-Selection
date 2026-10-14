"""Render synthetic proposal PDFs for the demo solicitations.

Usage:  .venv/bin/python tools/generate_proposals.py [out_dir]
Output: <out>/<solicitationId>/<offerorId>/<volume>.pdf and <out>/pages.json
        (page-level text, the same text the robots index for citations).
"""
import json
import sys
from pathlib import Path

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

sys.path.insert(0, str(Path(__file__).parent))
from proposal_content import CLIN_LABELS, OFFERORS, SOLICITATIONS  # noqa: E402

VOLUMES = {
    "cover": "Cover Letter and Certifications",
    "technical": "Volume I — Technical",
    "management": "Volume II — Management",
    "pastPerformance": "Volume III — Past Performance",
    "price": "Volume IV — Price",
}
# A State & Local (K-12 district) RFP response comes in sections, with a transmittal letter (ss-task-forms terms.ts).
SLED_VOLUMES = {
    "cover": "Transmittal Letter and Required Forms",
    "technical": "Section 1 — Functional and Technical Response",
    "management": "Section 2 — Implementation and Support",
    "pastPerformance": "Section 3 — Experience and References",
    "price": "Section 4 — Cost Proposal",
}

BANNER = "SYNTHETIC DEMO PROPOSAL — FICTIONAL OFFEROR — NOT REAL SOURCE SELECTION INFORMATION"
SLED_BANNER = "SYNTHETIC DEMO PROPOSAL — FICTIONAL PROPOSER — NOT A REAL PROCUREMENT"


def sled(o) -> bool:
    return SOLICITATIONS[o["solicitation"]].get("framework") == "sled"


def volumes(o) -> dict:
    return SLED_VOLUMES if sled(o) else VOLUMES


def banner(o) -> str:
    return SLED_BANNER if sled(o) else BANNER
styles = getSampleStyleSheet()
H1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=16, spaceAfter=10)
H2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=12.5, spaceBefore=8, spaceAfter=6)
BODY = ParagraphStyle("body", parent=styles["BodyText"], fontSize=10.5, leading=15, spaceAfter=8)


def on_page(offeror, volume_label):
    def draw(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(colors.HexColor("#b42318"))
        canvas.drawString(inch * 0.75, LETTER[1] - inch * 0.5, banner(offeror))
        canvas.setFillColor(colors.HexColor("#475467"))
        canvas.setFont("Helvetica", 8.5)
        canvas.drawString(inch * 0.75, inch * 0.5, f"{offeror['name']} | {offeror['solicitation']} | {volume_label}")
        canvas.drawRightString(LETTER[0] - inch * 0.75, inch * 0.5, f"Page {doc.page}")
        canvas.restoreState()
    return draw


def title_block(o, volume_label):
    s = SOLICITATIONS[o["solicitation"]]
    return [
        Paragraph(f"{o['name']}", H1),
        Paragraph(f"Proposal in response to {'RFP' if sled(o) else 'Solicitation'} {o['solicitation']} — {s['title']}", BODY),
        Paragraph(f"{s['agency']}", BODY),
        Paragraph(f"<b>{volume_label}</b>", BODY),
        Spacer(1, 10),
    ]


def sections_story(o, key, volume_label):
    story = title_block(o, volume_label)
    for i, (heading, paras) in enumerate(o[key]):
        if i and key == "technical":
            story.append(PageBreak())  # one subfactor per page keeps citations crisp
        story.append(Paragraph(heading, H2))
        story += [Paragraph(p, BODY) for p in paras]
    return story


def cover_story(o):
    s = SOLICITATIONS[o["solicitation"]]
    story = title_block(o, volumes(o)["cover"])
    if sled(o):
        return story + [
            Paragraph("Proposer identification", H2),
            Paragraph(f"Legal name: {o['name']}<br/>State vendor ID: {o['uei']}<br/>Vendor code: {o['cage']}<br/>Address: {o['address']}", BODY),
            Paragraph("Required forms and certifications", H2),
            Paragraph(SLED_CERTIFICATION, BODY),
            Paragraph(f"This proposal is valid for 180 days from the proposal due date for {s['title']}.", BODY),
            Spacer(1, 18),
            Paragraph(f"Signed: {o['signatory']}", BODY),
        ]
    story += [
        Paragraph("Offeror identification", H2),
        Paragraph(f"Legal name: {o['name']}<br/>Unique Entity ID (UEI): {o['uei']}<br/>CAGE code: {o['cage']}<br/>Address: {o['address']}", BODY),
        Paragraph("Representations and certifications", H2),
        Paragraph("The offeror certifies that its representations and certifications in SAM are current, accurate and complete as of the date of this proposal, and acknowledges all amendments to the solicitation.", BODY),
        Paragraph(f"This proposal is valid for 120 days from the proposal due date for {s['title']}.", BODY),
        Spacer(1, 18),
        Paragraph(f"Signed: {o['signatory']}", BODY),
    ]
    return story


def price_story(o):
    labels = CLIN_LABELS[o["solicitation"]]
    rows = [["Item" if sled(o) else "CLIN", "Description", "Total price"]]
    for clin, amt in o["price"].items():
        rows.append([clin, labels[clin], f"${amt:,.0f}"])
    total = sum(o["price"].values())
    rows.append(["", "Total proposed cost" if sled(o) else "Total evaluated price", f"${total:,.0f}"])
    t = Table(rows, colWidths=[0.8 * inch, 4.2 * inch, 1.5 * inch])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 10),
        ("FONT", (0, 1), (-1, -1), "Helvetica", 10),
        ("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 10),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.black),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.black),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story = title_block(o, volumes(o)["price"])
    if sled(o):
        return story + [Paragraph("Cost schedule (full five-year term)", H2), t, Spacer(1, 12),
                        Paragraph("Prices are firm fixed prices for each item and include all licensing, implementation, training, travel and other costs.", BODY)]
    story += [Paragraph("Price schedule (base and all option periods)", H2), t, Spacer(1, 12),
              Paragraph("Prices are firm-fixed-price for each CLIN and include all labor, travel and other direct costs.", BODY)]
    return story


# ── Official look (the "New source selection" sample package) ────────────────
# The robots index each page's text after dropping lines that carry the banner or "| <solicitation> |", or that are
# a bare "Page N" (SS_Robots rules.clean_page), so every running header and footer line here carries the solicitation
# between pipes. The cover letter keeps "Legal name: … Unique Entity ID (UEI): … CAGE code: …" and ends on "Signed: …",
# and the price volume's schedule header is the first "Total price" — the cover and price parsers read those.
RESTRICTION = ("This proposal includes data that shall not be disclosed outside the Government and shall not be duplicated, used, or disclosed — "
               "in whole or in part — for any purpose other than to evaluate this proposal. If, however, a contract is awarded to this offeror as a "
               "result of — or in connection with — the submission of this data, the Government shall have the right to duplicate, use, or disclose "
               "the data to the extent provided in the resulting contract. This restriction does not limit the Government's right to use information "
               "contained in this data if it is obtainable from another source without restriction. The data subject to this restriction are contained "
               "in all pages of this volume.")
DUE = "October 30, 2026"
OFFICE = {
    "Department of Veterans Affairs": ("Technology Acquisition Center (TAC)", "Building 2, Eatontown, NJ 07724", "Dana Whitfield, Contracting Officer"),
    "Willowmere Unified School District": ("Purchasing Department", "410 Orchard Avenue, Willowmere, OR 97000", "Dana Whitfield, Procurement Officer"),
}
# A District RFP has no FAR 52.215-1(e) legend; proposers mark trade secrets under the state public records law instead.
SLED_RESTRICTION = ("Pages of this proposal marked \"Confidential\" contain trade secrets and proprietary information that the proposer asks the "
                    "District to withhold from public disclosure under the state public records law. The proposer understands that the "
                    "proposal becomes a public record once the District's award is final, except for the pages so marked, and that the "
                    "District may disclose any part of this proposal not so marked.")
SLED_CERTIFICATION = ("The proposer certifies that its representations and certifications in the required forms are current, accurate and "
                      "complete as of the date of this proposal, including the non-collusion affidavit, the suspension and debarment "
                      "certification and the student data privacy agreement, and acknowledges all addenda to the RFP.")


def _official_canvas(o, volume_label):
    from reportlab.pdfgen import canvas as rl_canvas
    sol = o["solicitation"]

    class Numbered(rl_canvas.Canvas):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            self._pages = []

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                w, h = self._pagesize
                self.saveState()
                self.setFont("Helvetica-Bold", 7.5)
                self.setFillColor(colors.HexColor("#b42318"))
                self.drawCentredString(w / 2, h - 0.32 * inch, banner(o))
                self.setFillColor(colors.HexColor("#111111"))
                self.setStrokeColor(colors.HexColor("#444444"))
                self.setLineWidth(0.6)
                self.setFont("Times-Roman", 9)
                self.drawCentredString(w / 2, h - 0.55 * inch, f"{o['name']} | {sol} | {volume_label}")
                self.line(0.75 * inch, h - 0.61 * inch, w - 0.75 * inch, h - 0.61 * inch)
                self.line(0.75 * inch, 0.62 * inch, w - 0.75 * inch, 0.62 * inch)
                self.setFont("Times-Italic", 8)
                lead = ("Transmittal letter" if sled(o) else "Cover letter") if volume_label == volumes(o)["cover"] else (
                    "Confidential pages are identified on the title page" if sled(o) else "Use or disclosure of data on this sheet is subject to the restriction on the title page")
                self.drawCentredString(w / 2, 0.45 * inch, f"{lead} | {sol} | Page {self._pageNumber} of {total}")
                self.restoreState()
                super().showPage()
            super().save()

    return Numbered


def _styles():
    from reportlab.lib.enums import TA_CENTER
    return {
        "firm": ParagraphStyle("firm", fontName="Times-Bold", fontSize=17, leading=20, alignment=TA_CENTER, spaceAfter=2),
        "firmline": ParagraphStyle("firmline", fontName="Times-Roman", fontSize=9.5, leading=12, alignment=TA_CENTER, textColor=colors.HexColor("#333333")),
        "vol": ParagraphStyle("vol", fontName="Times-Bold", fontSize=22, leading=27, alignment=TA_CENTER, spaceBefore=10, spaceAfter=6),
        "center": ParagraphStyle("center", fontName="Times-Roman", fontSize=11.5, leading=15, alignment=TA_CENTER, spaceAfter=3),
        "centerb": ParagraphStyle("centerb", fontName="Times-Bold", fontSize=12.5, leading=16, alignment=TA_CENTER, spaceAfter=3),
        "h": ParagraphStyle("oh", fontName="Times-Bold", fontSize=12, leading=15, spaceBefore=6, spaceAfter=6),
        "body": ParagraphStyle("ob", fontName="Times-Roman", fontSize=11, leading=15.5, spaceAfter=8),
        "small": ParagraphStyle("os", fontName="Times-Roman", fontSize=9, leading=12),
        "cell": ParagraphStyle("oc", fontName="Times-Roman", fontSize=10, leading=13),
        "cellb": ParagraphStyle("ocb", fontName="Times-Bold", fontSize=10, leading=13),
    }


def _letterhead(o, st):
    from reportlab.platypus import HRFlowable
    return [Paragraph(o["name"].upper(), st["firm"]), Paragraph(o["address"], st["firmline"]),
            Paragraph(f"State vendor ID {o['uei']}" if sled(o) else f"UEI {o['uei']} &nbsp;·&nbsp; CAGE {o['cage']}", st["firmline"]),
            HRFlowable(width="100%", thickness=1.2, color=colors.HexColor("#222222"), spaceBefore=8, spaceAfter=4),
            HRFlowable(width="100%", thickness=0.4, color=colors.HexColor("#222222"), spaceAfter=10)]


def _title_page(o, vol, st):
    sol = o["solicitation"]
    s = SOLICITATIONS[sol]
    office, street, co = OFFICE.get(s["agency"], ("Contracting Office", "", "Contracting Officer"))
    legend = Table([[Paragraph("<b>CONFIDENTIAL AND PROPRIETARY INFORMATION</b>" if sled(o) else "<b>RESTRICTION ON DISCLOSURE AND USE OF DATA</b> (FAR 52.215-1(e))", st["small"])],
                    [Paragraph(SLED_RESTRICTION if sled(o) else RESTRICTION, st["small"])]],
                   colWidths=[6.6 * inch])
    legend.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#222222")), ("TOPPADDING", (0, 0), (-1, -1), 5),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]))
    return [
        *_letterhead(o, st), Spacer(1, 70),
        Paragraph(volumes(o)[vol].upper(), st["vol"]),
        Paragraph("PROPOSAL", st["centerb"]), Spacer(1, 26),
        Paragraph(f"Submitted in response to {'RFP' if sled(o) else 'Solicitation'} No. {sol}", st["center"]),
        Paragraph(f"<b>{s['title']}</b>", st["center"]), Spacer(1, 22),
        Paragraph("Submitted to", st["centerb"]),
        Paragraph(f"{s['agency']}<br/>{office}<br/>{street}<br/>Attn: {co}", st["center"]), Spacer(1, 16),
        Paragraph("Submitted by", st["centerb"]),
        Paragraph(f"{o['name']}<br/>{o['address']}<br/>Point of contact: {o['signatory']}", st["center"]), Spacer(1, 16),
        Paragraph(f"{DUE} &nbsp;·&nbsp; Valid for {180 if sled(o) else 120} days from the proposal due date", st["center"]),
        Spacer(1, 48), legend, PageBreak(),
    ]


def _official_story(o, vol):
    st = _styles()
    sol = o["solicitation"]
    s = SOLICITATIONS[sol]
    if vol == "cover" and sled(o):
        office, street, co = OFFICE.get(s["agency"], ("Purchasing Department", "", "Procurement Officer"))
        sections = ", ".join(SLED_VOLUMES[v] for v in ("technical", "management", "pastPerformance")) + f" and {SLED_VOLUMES['price']}"
        return [
            *_letterhead(o, st),
            Paragraph(DUE, st["body"]),
            Paragraph(f"{co.split(',')[0]}<br/>{co.split(', ')[-1]}<br/>{s['agency']}<br/>{office}<br/>{street}", st["body"]),
            Paragraph(f"<b>Subject:</b> Proposal in response to RFP No. {sol}, {s['title']}", st["body"]),
            Paragraph(f"Dear {co.split(',')[0]}:", st["body"]),
            Paragraph(f"{o['name']} is pleased to submit this proposal in response to RFP No. {sol}. The proposal consists of this transmittal letter, the required forms and four sections: {sections}. We take no exception to the District's terms and conditions.", st["body"]),
            Paragraph("Proposer identification", st["h"]),
            Paragraph(f"Legal name: {o['name']}<br/>State vendor ID: {o['uei']}<br/>Vendor code: {o['cage']}<br/>Address: {o['address']}", st["body"]),
            Paragraph("Required forms and certifications", st["h"]),
            Paragraph(SLED_CERTIFICATION, st["body"]),
            Paragraph(f"This proposal is valid for 180 days from the proposal due date for {s['title']}. The individual signing below is authorized to bind the proposer contractually.", st["body"]),
            Paragraph("Respectfully submitted,", st["body"]), Spacer(1, 22),
            Paragraph(f"Signed: {o['signatory']}", st["body"]),
        ]
    if vol == "cover":
        office, street, co = OFFICE.get(s["agency"], ("Contracting Office", "", "Contracting Officer"))
        return [
            *_letterhead(o, st),
            Paragraph(DUE, st["body"]),
            Paragraph(f"{co.split(',')[0]}<br/>{co.split(', ')[-1]}<br/>{s['agency']}<br/>{office}<br/>{street}", st["body"]),
            Paragraph(f"<b>Subject:</b> Proposal in response to Solicitation No. {sol}, {s['title']}", st["body"]),
            Paragraph(f"Dear {co.split(',')[0]}:", st["body"]),
            Paragraph(f"{o['name']} is pleased to submit this proposal in response to Solicitation No. {sol}. The proposal consists of this cover letter and four volumes: Volume I — Technical, Volume II — Management, Volume III — Past Performance and Volume IV — Price. We take no exception to the terms and conditions of the solicitation.", st["body"]),
            Paragraph("Offeror identification", st["h"]),
            Paragraph(f"Legal name: {o['name']}<br/>Unique Entity ID (UEI): {o['uei']}<br/>CAGE code: {o['cage']}<br/>Address: {o['address']}", st["body"]),
            Paragraph("Representations and certifications", st["h"]),
            Paragraph("The offeror certifies that its representations and certifications in SAM are current, accurate and complete as of the date of this proposal, and acknowledges all amendments to the solicitation.", st["body"]),
            Paragraph(f"This proposal is valid for 120 days from the proposal due date for {s['title']}. The individual signing below is authorized to bind the offeror contractually.", st["body"]),
            Paragraph("Respectfully submitted,", st["body"]), Spacer(1, 22),
            Paragraph(f"Signed: {o['signatory']}", st["body"]),
        ]
    story = _title_page(o, vol, st)
    if vol == "price":
        labels = CLIN_LABELS[sol]
        rows = [[Paragraph("Item" if sled(o) else "CLIN", st["cellb"]), Paragraph("Description" if sled(o) else "Supplies or services", st["cellb"]), Paragraph("Total price", st["cellb"])]]
        rows += [[clin, Paragraph(labels[clin], st["cell"]), f"${amt:,.0f}"] for clin, amt in o["price"].items()]
        rows.append(["", Paragraph(f"<b>{'Total proposed cost' if sled(o) else 'Total evaluated price'}</b>", st["cell"]), f"${sum(o['price'].values()):,.0f}"])
        t = Table(rows, colWidths=[0.8 * inch, 4.3 * inch, 1.5 * inch])
        t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#444444")), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e9e9e9")),
                               ("FONT", (0, 1), (-1, -1), "Times-Roman", 10), ("FONT", (2, -1), (2, -1), "Times-Bold", 10),
                               ("ALIGN", (2, 0), (2, -1), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                               ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
        if sled(o):
            return story + [Paragraph("1. COST SCHEDULE", st["h"]),
                            Paragraph("Prices below are the proposer's firm fixed prices for each item across the full five-year term: the three-year initial term and both optional renewal years.", st["body"]),
                            t, Spacer(1, 12), Paragraph("2. BASIS OF COST", st["h"]),
                            Paragraph("Prices are firm fixed prices and include all licensing, implementation, data migration, training, travel and other costs. No cost is contingent on a minimum enrollment.", st["body"])]
        return story + [Paragraph("1. PRICE SCHEDULE", st["h"]),
                        Paragraph("Prices below are the offeror's firm-fixed prices for each CLIN across the base year and all four option years.", st["body"]),
                        t, Spacer(1, 12), Paragraph("2. BASIS OF PRICE", st["h"]),
                        Paragraph("Prices are firm-fixed-price for each CLIN and include all labor, travel and other direct costs.", st["body"])]
    for i, (heading, paras) in enumerate(o[vol]):
        if i and vol == "technical":
            story.append(PageBreak())  # one subfactor per page keeps citations crisp
        story.append(Paragraph(heading, st["h"]))
        story += [Paragraph(p, st["body"]) for p in paras]
    return story


def render(out: Path, official: bool = False):
    pages = []
    for oid, o in OFFERORS.items():
        d = out / o["solicitation"] / oid
        d.mkdir(parents=True, exist_ok=True)
        names = volumes(o)
        builders = {v: _official_story(o, v) for v in names} if official else {
            "cover": cover_story(o),
            "technical": sections_story(o, "technical", names["technical"]),
            "management": sections_story(o, "management", names["management"]),
            "pastPerformance": sections_story(o, "pastPerformance", names["pastPerformance"]),
            "price": price_story(o),
        }
        for vol, story in builders.items():
            path = d / f"{vol}.pdf"
            label = names[vol]
            side = inch * (0.95 if official else 0.75)
            doc = SimpleDocTemplate(str(path), pagesize=LETTER, leftMargin=side, rightMargin=side,
                                    topMargin=inch * (0.9 if official else 0.8), bottomMargin=inch * (0.85 if official else 0.8),
                                    title=f"{o['name']} — {label}", author=o["name"])
            if official:
                doc.build(story, canvasmaker=_official_canvas(o, label))
            else:
                cb = on_page(o, label)
                doc.build(story, onFirstPage=cb, onLaterPages=cb)
            for i, page in enumerate(PdfReader(str(path)).pages, start=1):
                text = " ".join(page.extract_text().split())
                for chrome in (banner(o), f"{o['name']} | {o['solicitation']} | {label}", f"Page {i}"):
                    text = text.replace(chrome, " ")
                pages.append({
                    "solicitationId": o["solicitation"], "offerorId": oid, "volume": vol,
                    "pageNumber": i, "text": " ".join(text.split()),
                })
    (out / "pages.json").write_text(json.dumps(pages, indent=1))
    return pages


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent.parent / "data" / "proposals")
    pages = render(out)
    print(f"{len(pages)} pages across {len(OFFERORS)} offerors -> {out}")
