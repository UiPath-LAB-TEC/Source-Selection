"""Render a synthetic RFP Section M (Evaluation Factors for Award) with the Section L page limits,
from each evaluation plan, for the intake wizard's Section M agent demo.

Usage: .venv/bin/python tools/generate_section_m.py   -> data/solicitations/<sol>/Section-M.pdf (+ .txt)
"""
import json
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

ROOT = Path(__file__).resolve().parent.parent
BANNER = "SYNTHETIC DEMO SOLICITATION — NOT AN ACTUAL GOVERNMENT REQUIREMENT"
styles = getSampleStyleSheet()
H1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=14, spaceAfter=8)
H2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=11.5, spaceBefore=8, spaceAfter=4)
BODY = ParagraphStyle("body", parent=styles["BodyText"], fontSize=10, leading=14, spaceAfter=6)

VOLUME_NAMES = {"technical": "Volume I — Technical", "management": "Volume II — Management", "pastPerformance": "Volume III — Past Performance", "price": "Volume IV — Price"}

MERIT = [
    ("Outstanding", "Proposal indicates an exceptional approach and understanding of the requirements and contains multiple strengths, and risk of unsuccessful performance is low."),
    ("Good", "Proposal indicates a thorough approach and understanding of the requirements and contains at least one strength, and risk of unsuccessful performance is low to moderate."),
    ("Acceptable", "Proposal indicates an adequate approach and understanding of the requirements, and risk of unsuccessful performance is no worse than moderate."),
    ("Marginal", "Proposal has not demonstrated an adequate approach and understanding of the requirements, and/or risk of unsuccessful performance is high."),
    ("Unacceptable", "Proposal does not meet requirements of the solicitation and, thus, contains one or more deficiencies, and/or risk of unsuccessful performance is unacceptable. Proposal is unawardable."),
]
CONFIDENCE = [
    ("Substantial Confidence", "Based on the offeror's recent/relevant performance record, the Government has a high expectation that the offeror will successfully perform the required effort."),
    ("Satisfactory Confidence", "Based on the offeror's recent/relevant performance record, the Government has a reasonable expectation that the offeror will successfully perform the required effort."),
    ("Neutral Confidence", "No recent/relevant performance record is available or the record is so sparse that no meaningful confidence assessment rating can be reasonably assigned. The offeror may not be evaluated favorably or unfavorably on the factor of past performance."),
    ("Limited Confidence", "Based on the offeror's recent/relevant performance record, the Government has a low expectation that the offeror will successfully perform the required effort."),
    ("No Confidence", "Based on the offeror's recent/relevant performance record, the Government has no expectation that the offeror will be able to successfully perform the required effort."),
]
DOD_COLORS = ["Blue", "Purple", "Green", "Yellow", "Red"]


def paragraphs(plan):
    dod = "Air Force" in plan["agency"] or "Defense" in plan["agency"] or "Army" in plan["agency"] or "Navy" in plan["agency"]
    rated = [f for f in plan["factors"] if not f.get("evaluatedNotRated")]
    price = next((f for f in plan["factors"] if f.get("evaluatedNotRated")), None)
    out = [("h1", f"SECTION M — EVALUATION FACTORS FOR AWARD"),
           ("p", f"Solicitation {plan['solicitationId']} · {plan['title']} · {plan['agency']}"),
           ("h2", "M.1 Basis for Award"),
           ("p", f"The Government intends to award a single contract resulting from this solicitation to the responsible offeror whose proposal, conforming to the solicitation, represents the best value to the Government using a tradeoff process in accordance with FAR 15.101-1. "
                 "The Government may award to other than the lowest priced offeror or other than the highest technically rated offeror. The Government intends to award without discussions but reserves the right to conduct discussions if determined necessary by the Contracting Officer."),
           ("h2", "M.2 Evaluation Factors and Relative Importance"),
           ("p", f"Proposals will be evaluated on the following factors: {', '.join(f'Factor {i + 1}, {f['name']}' for i, f in enumerate(plan['factors']))}. {plan['relativeImportance']}")]
    for i, f in enumerate(rated, start=1):
        out.append(("h2", f"M.3.{i} Factor {i} — {f['name']}"))
        out.append(("p", f["criteria"]))
        if f.get("subfactors"):
            kind = "elements" if f.get("scale") == "confidence" else "subfactors, which are of equal importance"
            out.append(("p", f"The {f['name']} factor consists of the following {kind}: " + "; ".join(f"({chr(97 + j)}) {s}" for j, s in enumerate(f["subfactors"])) + "."))
        out.append(("p", f"This factor will be evaluated from {VOLUME_NAMES.get(f['volume'], f['volume'])}."
                         + (" The Government will assign a performance confidence assessment rating." if f.get("scale") == "confidence"
                            else " The Government will assign a combined technical/risk rating.")))
    if price:
        out.append(("h2", f"M.3.{len(rated) + 1} Factor {len(plan['factors'])} — Price"))
        out.append(("p", price["criteria"] + " Price will not be rated. The Government will evaluate price for reasonableness in accordance with FAR 15.404-1 and may evaluate for balance. Unbalanced pricing may be grounds for rejection of the proposal."))
    out.append(("h2", "M.4 Rating Definitions"))
    if dod:
        out.append(("p", "Combined technical/risk ratings will be assigned using the following color ratings and adjectival descriptions, consistent with the DoD Source Selection Procedures:"))
        out += [("p", f"<b>{DOD_COLORS[i]} / {name}.</b> {desc}") for i, (name, desc) in enumerate(MERIT)]
    else:
        out.append(("p", "Technical factors will be assigned the following adjectival ratings:"))
        out += [("p", f"<b>{name}.</b> {desc}") for name, desc in MERIT]
    out.append(("p", "Past performance will be assigned the following performance confidence assessment ratings:"))
    out += [("p", f"<b>{name}.</b> {desc}") for name, desc in CONFIDENCE]
    out.append(("h1", "SECTION L — EXCERPT: L.4 PROPOSAL VOLUMES AND PAGE LIMITATIONS"))
    limits = plan["submission"].get("pageLimits", {})
    out.append(("p", "Offerors shall submit the following volumes. Pages in excess of the stated limits will not be evaluated. " + "; ".join(
        f"{VOLUME_NAMES.get(v, v)}: " + (f"not to exceed {limits[v]} pages" if v in limits else "no page limit") for v in plan["submission"]["volumes"]) + "."))
    return out


def render(plan, out_dir: Path):
    """Section M in the solicitation's own format: title block, factor table, numbered factor sections, rating
    tables and the Section L page limits, with a running header and Page X of Y."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from official_docs import BODY, CELL, H, SUBTITLE, TITLE, numbered_canvas, ruled

    out_dir.mkdir(parents=True, exist_ok=True)
    paras = paragraphs(plan)
    dod = any(k in plan["agency"] for k in ("Air Force", "Defense", "Army", "Navy"))
    rated = [f for f in plan["factors"] if not f.get("evaluatedNotRated")]
    price = next((f for f in plan["factors"] if f.get("evaluatedNotRated")), None)
    method = lambda f: ("Evaluated, not rated" if f.get("evaluatedNotRated") else "Performance confidence assessment"
                        if f.get("scale") == "confidence" else "Combined technical/risk rating")
    W = 6.8 * inch
    basis = next(t for k, t in paras if k == "p" and t.startswith("The Government intends to award"))
    story = [
        Paragraph("PART IV — REPRESENTATIONS AND INSTRUCTIONS", SUBTITLE),
        Paragraph("SECTION M — EVALUATION FACTORS FOR AWARD", TITLE),
        Paragraph(f"Solicitation No. {plan['solicitationId']} · {plan['title']} · {plan['agency']}", SUBTITLE),
        Paragraph("M.1 BASIS FOR AWARD", H), Paragraph(basis, BODY),
        Paragraph("M.2 EVALUATION FACTORS AND RELATIVE IMPORTANCE", H),
        Paragraph("Proposals will be evaluated on the following factors:", BODY),
        ruled([["Factor", "Title", "Evaluated from", "Rating method"]] + [
            [str(i + 1), f["name"], VOLUME_NAMES.get(f["volume"], f["volume"]), method(f)] for i, f in enumerate(plan["factors"])],
            [0.6 * inch, 2.0 * inch, 2.0 * inch, 2.2 * inch]),
        Spacer(1, 6), Paragraph(plan["relativeImportance"], BODY),
    ]
    n = 3
    for i, f in enumerate(rated, start=1):
        story.append(Paragraph(f"M.{n} FACTOR {i} — {f['name'].upper()}", H))
        story.append(Paragraph(f["criteria"], BODY))
        if f.get("subfactors"):
            kind = "elements" if f.get("scale") == "confidence" else "subfactors, which are of equal importance"
            story.append(Paragraph(f"The {f['name']} factor consists of the following {kind}:", BODY))
            story += [Paragraph(f"({chr(97 + j)}) {sub}", ParagraphStyle(f"li{n}{j}", parent=BODY, leftIndent=18, spaceAfter=2)) for j, sub in enumerate(f["subfactors"])]
            story.append(Spacer(1, 4))
        story.append(Paragraph(f"This factor will be evaluated from {VOLUME_NAMES.get(f['volume'], f['volume'])}."
                               + (" The Government will assign a performance confidence assessment rating." if f.get("scale") == "confidence"
                                  else " The Government will assign a combined technical/risk rating."), BODY))
        n += 1
    if price:
        story.append(Paragraph(f"M.{n} FACTOR {len(plan['factors'])} — PRICE", H))
        story.append(Paragraph(price["criteria"] + " Price will not be rated. The Government will evaluate price for reasonableness in accordance with FAR 15.404-1 and may evaluate for balance. Unbalanced pricing may be grounds for rejection of the proposal.", BODY))
        n += 1
    story.append(Paragraph(f"M.{n} RATING DEFINITIONS", H))
    if dod:
        story.append(Paragraph("Table M-1. Combined technical/risk ratings (color and adjectival, consistent with the DoD Source Selection Procedures)", BODY))
        story.append(ruled([["Color", "Rating", "Description"]] + [[DOD_COLORS[i], name, desc] for i, (name, desc) in enumerate(MERIT)], [0.8 * inch, 1.1 * inch, 4.9 * inch]))
    else:
        story.append(Paragraph("Table M-1. Combined technical/risk ratings", BODY))
        story.append(ruled([["Rating", "Description"]] + [[name, desc] for name, desc in MERIT], [1.3 * inch, 5.5 * inch]))
    story += [Spacer(1, 8), Paragraph("Table M-2. Past performance confidence assessment ratings", BODY),
              ruled([["Rating", "Description"]] + [[name, desc] for name, desc in CONFIDENCE], [1.6 * inch, 5.2 * inch])]
    limits = plan["submission"].get("pageLimits", {})
    story += [Spacer(1, 10), Paragraph("SECTION L — EXCERPT", TITLE), Paragraph("L.4 PROPOSAL VOLUMES AND PAGE LIMITATIONS", H),
              Paragraph("Offerors shall submit the following volumes. Pages in excess of the stated limits will not be evaluated.", BODY),
              ruled([["Volume", "Page limitation"]] + [[VOLUME_NAMES.get(v, v), f"Not to exceed {limits[v]} pages" if v in limits else "No page limit"]
                                                       for v in plan["submission"]["volumes"]], [3.4 * inch, 3.4 * inch])]

    canvas = numbered_canvas(f"Solicitation No. {plan['solicitationId']}", "Section M — Evaluation Factors for Award", banner=BANNER)
    SimpleDocTemplate(str(out_dir / "Section-M.pdf"), pagesize=LETTER, leftMargin=inch * 0.85, rightMargin=inch * 0.85,
                      topMargin=inch * 0.9, bottomMargin=inch * 0.85, title=f"{plan['solicitationId']} Section M").build(story, canvasmaker=canvas)
    text = "\n\n".join(t.replace("<b>", "").replace("</b>", "") for _, t in paras)
    (out_dir / "Section-M.txt").write_text(text)
    return len(text)


if __name__ == "__main__":
    for p in sorted((ROOT / "evaluation-plans").glob("*.json")):
        plan = json.loads(p.read_text())
        n = render(plan, ROOT / "data" / "solicitations" / plan["solicitationId"])
        print(f"{plan['solicitationId']}: Section-M.pdf ({n} chars of text)")
    sys.exit(0)
