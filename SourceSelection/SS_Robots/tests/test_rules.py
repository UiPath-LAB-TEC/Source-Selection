"""Golden tests: the rules reproduce the synthetic proposals' answer key with no platform calls."""
import json
import sys
from pathlib import Path

import pytest
from pypdf import PdfReader

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path[:0] = [str(HERE.parent), str(ROOT / "tools")]

import rules  # noqa: E402
from proposal_content import OFFERORS  # noqa: E402

PAGES = json.loads((ROOT / "data" / "proposals" / "pages.json").read_text())
PLANS = {p.stem: json.loads(p.read_text()) for p in (ROOT / "evaluation-plans").glob("*.json")}
PDF_DIR = ROOT / "data" / "proposals"


def pdf_pages(sol, code, vol):
    return [rules.clean_page(p.extract_text(), sol) for p in PdfReader(str(PDF_DIR / sol / code / f"{vol}.pdf")).pages]


@pytest.mark.parametrize("page", PAGES, ids=lambda p: f"{p['offerorId']}-{p['volume']}-{p['pageNumber']}")
def test_clean_page_matches_extracted_text(page):
    assert pdf_pages(page["solicitationId"], page["offerorId"], page["volume"])[page["pageNumber"] - 1] == page["text"]


@pytest.mark.parametrize("code", OFFERORS)
def test_cover_and_price_parse(code):
    o = OFFERORS[code]
    cover = rules.parse_cover(" ".join(pdf_pages(o["solicitation"], code, "cover")))
    assert (cover["name"], cover["uei"], cover["cage"], cover["signatory"]) == (o["name"], o["uei"], o["cage"], o["signatory"])
    lines, total = rules.parse_price(" ".join(pdf_pages(o["solicitation"], code, "price")))
    assert {l["clin"]: l["amount"] for l in lines} == {k: float(v) for k, v in o["price"].items()}
    assert total == sum(o["price"].values())


def test_screen_flags_missing_volume_page_limit_and_sam():
    plan = PLANS["FA8771-27-R-0012"]
    ok = {"cover": 1, "technical": 3, "management": 2, "pastPerformance": 2, "price": 1}
    active = {"SamStatus": "Active", "Exclusion": False, "FapiisRecords": "None"}
    assert rules.screen(plan, ok, active)[0] == "Compliant"
    assert rules.screen(plan, {k: v for k, v in ok.items() if k != "price"}, active)[0] == "Non-compliant"
    assert rules.screen(plan, ok | {"technical": 26}, active)[0] == "Non-compliant"
    status, notes = rules.screen(plan, ok, {"SamStatus": "Expired", "RegistrationExpiry": "2026-08-30", "Exclusion": False})
    assert status == "Responsibility concern" and "expired 2026-08-30" in " ".join(notes)
    status, notes = rules.screen(plan, ok, active | {"FapiisRecords": "2023 Termination for Default"})
    assert status == "Compliant" and any(n.startswith("FAPIIS:") for n in notes)


def test_citations_resolve_and_reject():
    pages = [{"PageNumber": p["pageNumber"], "PageText": p["text"]} for p in PAGES
             if p["offerorId"] == "APEX" and p["volume"] == "technical"]
    quote = pages[1]["PageText"].split(". ")[1]
    assert rules.resolve_citation(quote, 1, pages) == 2  # wrong page number is corrected
    assert rules.resolve_citation("A sentence that is not in the proposal.", 1, pages) is None


def test_agent_pages_respect_budget():
    pages = [{"PageNumber": i, "PageText": "word " * 3000} for i in range(1, 4)]
    assert len(rules.agent_pages(pages, 6000)) <= 6000


def test_agent_findings_accepts_either_case():
    assert rules.agent_findings({"Findings": [{"Kind": "Strength", "Page": 1}]}) == [{"kind": "Strength", "page": 1}]


def test_spread_and_conflict():
    plan = PLANS["FA8771-27-R-0012"]
    f = plan["factors"][0]
    assert rules.spread(plan, f, ["Outstanding", "Marginal"]) == 3
    assert rules.spread(plan, f, ["Good"]) == 0
    assert rules.finding_conflict([{"Kind": "Strength", "CitationVolume": "technical", "CitationPage": 2},
                                   {"Kind": "Weakness", "CitationVolume": "technical", "CitationPage": 2}])


def test_price_flags_unbalanced_lines():
    plan = PLANS["FA8771-27-R-0012"]
    lines = [{"clin": c, "description": c, "amount": a} for c, a in plan["igce"]["lines"].items()]
    assert rules.price_result(plan, lines) == {"total": plan["igce"]["total"], "variancePct": 0.0, "unbalanced": []}
    lines[0]["amount"] *= 1.3
    assert len(rules.price_result(plan, lines)["unbalanced"]) == 1


# ── State & Local (K-12 district RFP) ───────────────────────────────────────

def test_sled_screen_speaks_vendor_registration_and_debarment():
    plan = PLANS["WUSD-RFP-27-014"]
    ok = {"cover": 1, "technical": 3, "management": 3, "pastPerformance": 2, "price": 1}
    status, notes = rules.screen(plan, ok, {"SamStatus": "Active", "Exclusion": False, "FapiisRecords": "None"})
    assert status == "Compliant"
    assert "Not on the state debarment list." in notes and "State vendor registration active." in notes
    status, notes = rules.screen(plan, ok, None)
    assert status == "Responsibility concern" and notes[-1] == "No state vendor registration found for the vendor ID."
    assert not any("SAM" in n or "FAPIIS" in n for n in notes)


def test_sled_price_flags_items_against_the_estimate():
    plan = PLANS["WUSD-RFP-27-014"]
    lines = [{"clin": "0002", "description": "Implementation and data migration", "amount": 380000}]
    assert rules.price_result(plan, lines)["unbalanced"][0].startswith("Item 0002 Implementation and data migration: $380,000 vs estimate $240,000")


def test_sled_scores_points_cost_formula_and_rank():
    plan = PLANS["WUSD-RFP-27-014"]
    offerors = [{"OfferorId": "A", "Name": "Alpha", "TotalEvaluatedPrice": 2_000_000}, {"OfferorId": "B", "Name": "Beta", "TotalEvaluatedPrice": 2_500_000}]
    cons = [{"OfferorId": "A", "FactorId": f, "Rating": "Good"} for f in ("T1", "T2", "T3")] + \
           [{"OfferorId": "B", "FactorId": f, "Rating": "Excellent"} for f in ("T1", "T2", "T3")]
    rows = {r["offeror"]: r for r in rules.sled_scores(plan, cons, offerors)}
    # Alpha: 80% of 35/20/15 = 56, plus all 30 cost points as the lowest cost.
    assert rows["Alpha"]["total"] == 86.0 and rows["Alpha"]["costPoints"] == 30.0
    # Beta: all 70 criterion points, plus 2.0M / 2.5M × 30 = 24 cost points.
    assert rows["Beta"]["total"] == 94.0 and rows["Beta"]["costPoints"] == 24.0
    assert rows["Beta"]["rank"] == 1 and rows["Alpha"]["rank"] == 2
