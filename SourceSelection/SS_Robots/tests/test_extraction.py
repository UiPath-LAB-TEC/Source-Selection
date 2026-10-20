"""IXP extraction: the SDK projection, field mapping and the rules fallback; the certification and CPARS checks; and
IngestProposals end to end on the golden proposal PDFs with IXP faked."""
import json
import shutil
import sys
from pathlib import Path
from types import SimpleNamespace as NS

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent))

import extraction  # noqa: E402
import main  # noqa: E402
import repo  # noqa: E402
import rules  # noqa: E402

FED = json.loads((ROOT / "evaluation-plans" / "FA8771-27-R-0012.json").read_text())
SLED = json.loads((ROOT / "evaluation-plans" / "WUSD-RFP-27-014.json").read_text())


def fv(name, value, confidence=0.9):
    return NS(name=name, value=value, confidence=confidence)


# ── Projection and mapping ──────────────────────────────────────────────────

def test_groups_splits_repeated_fields_into_occurrences():
    proj = [NS(field_group_name="Price line", field_values=[fv("Line number", "0001"), fv("Line total", "10 USD"),
                                                            fv("Line number", "0002"), fv("Line total", "20 USD")]),
            NS(field_group_name="Price line", field_values=[fv("Line number", "0003")])]
    g = extraction.groups(proj)
    assert [r["Line number"]["value"] for r in g["Price line"]] == ["0001", "0002", "0003"]


def test_entity_ids_are_upper_case_without_spaces():
    assert extraction.entity_id(" il8e4w2kd7nf ") == "IL8E4W2KD7NF"  # demo vendor IDs can carry I and O


def test_amount_reads_monetary_quantities():
    assert extraction.amount("19720000 USD") == 19720000
    assert extraction.amount("$1,250.50") == 1250.5
    assert extraction.amount("") is None


def test_cover_maps_ixp_fields(monkeypatch):
    monkeypatch.setattr(extraction, "ixp", lambda vol, path: {
        "Offeror": [{"Legal name": {"value": "Ridgeway Labs LLC", "confidence": 0.98}, "Vendor ID": {"value": "TONUKUGJ9LBQ", "confidence": 0.9},
                     "Vendor code": {"value": "3KEHO", "confidence": 0.95}, "Signatory name": {"value": "Avery Calloway", "confidence": 0.97},
                     "Signatory title": {"value": "President", "confidence": 0.97}, "Date signed": {"value": "2026-10-21T00:00:00Z", "confidence": 0.9}}],
        "Certifications": [{"SAM reps and certs current": {"value": "False", "confidence": 0.8}}]})
    c = extraction.cover("cover.pdf", "")
    assert (c["name"], c["uei"], c["cage"], c["signatory"], c["dated"]) == ("Ridgeway Labs LLC", "TONUKUGJ9LBQ", "3KEHO", "Avery Calloway, President", "2026-10-21")
    assert c["certifications"]["samRepsCurrent"] is False and c["certifications"]["nonCollusion"] is None
    assert c["source"] == "IXP" and c["confidence"] == 0.8


def test_cover_falls_back_to_the_rules(monkeypatch):
    monkeypatch.setattr(extraction, "ixp", lambda vol, path: None)
    c = extraction.cover("cover.pdf", "Legal name: Apex Federal LLC Unique Entity ID (UEI): QX7F3K8L9MP2 CAGE code: 8AXM4 Signed: Dana Whitcomb, CEO")
    assert (c["name"], c["uei"], c["cage"], c["source"]) == ("Apex Federal LLC", "QX7F3K8L9MP2", "8AXM4", "rules")


def test_price_and_references_map_ixp_fields(monkeypatch):
    found = {"price": {"Price line": [{"Line number": {"value": "0001", "confidence": 0.99}, "Description": {"value": "Program management", "confidence": 0.99},
                                       "Line total": {"value": "450000 USD", "confidence": 0.99}}],
                       "Price summary": [{"Stated total": {"value": "460000 USD", "confidence": 0.97}}]},
             "pastPerformance": {"Reference": [{"Contract number": {"value": "FA8730-22-F-0141", "confidence": 0.9}, "Claimed rating": {"value": "Exceptional", "confidence": 0.9},
                                                "Contract value": {"value": "18400000 USD", "confidence": 0.9}}]}}
    monkeypatch.setattr(extraction, "ixp", lambda vol, path: found[vol])
    lines, stated, meta = extraction.price("price.pdf", "")
    assert lines == [{"clin": "0001", "description": "Program management", "amount": 450000}] and stated == 460000 and meta["source"] == "IXP"
    refs, meta = extraction.references("pp.pdf")
    assert refs[0]["contract"] == "FA8730-22-F-0141" and refs[0]["value"] == 18400000 and meta["confidence"] == 0.9


def test_ixp_off_switch(monkeypatch):
    monkeypatch.setenv("SS_IXP_OFF", "1")
    assert extraction.ixp("cover", "x.pdf") is None


# ── Certifications and CPARS ────────────────────────────────────────────────

def test_missing_district_form_is_non_compliant():
    status, notes = rules.certification_issues(SLED, {"nonCollusion": True, "debarment": False, "dataPrivacy": None})
    assert status == "Non-compliant" and notes == ["Required form not enclosed: Suspension and debarment certification."]


def test_federal_reps_not_current_is_a_responsibility_concern():
    assert rules.certification_issues(FED, {"samRepsCurrent": False})[0] == "Responsibility concern"
    assert rules.certification_issues(FED, {"samRepsCurrent": None}) == (None, [])
    ref = {"SamStatus": "Active", "Exclusion": False, "FapiisRecords": "None"}
    vols = {v: 1 for v in FED["submission"]["volumes"]}
    assert rules.screen(FED, vols, ref, {"samRepsCurrent": False})[0] == "Responsibility concern"
    assert rules.screen(FED, vols, ref, {"samRepsCurrent": True})[0] == "Compliant"


def test_cpars_check_flags_mismatches_and_missing_records():
    cpars = [{"contract": "FA8730-22-F-0141", "rating": "Satisfactory", "year": 2025}, {"contract": "HT0011-20-F-0310", "rating": "Very Good", "year": 2023}]
    refs = [{"contract": "FA8730-22-F-0141", "rating": "Exceptional"}, {"contract": "HT0011 20 F 0310", "rating": "very good"},
            {"contract": "W91QUZ-21-C-0001", "rating": "Exceptional"}]
    assert rules.cpars_check(refs, cpars) == ["Claims Exceptional on FA8730-22-F-0141; CPARS shows Satisfactory (2025).",
                                              "No CPARS assessment on file for W91QUZ-21-C-0001 (claimed Exceptional)."]
    assert rules.cpars_check(refs[2:], cpars, federal=False) == []
    # A rating given by evaluation area is compared on quality, its first area.
    assert rules.cpars_check([{"contract": "HT0011-20-F-0310", "rating": "Very Good in quality, Satisfactory in schedule"}], cpars) == []


# ── IngestProposals end to end ──────────────────────────────────────────────

@pytest.fixture
def bucket(monkeypatch):
    sol = "FA8771-27-R-0012"
    src = ROOT / "data" / "proposals" / sol
    paths = [f"{sol}/{o.name}/{p.name}" for o in sorted(src.iterdir()) if o.is_dir() for p in sorted(o.glob("*.pdf"))]
    state = {"upserts": {}}
    monkeypatch.setattr(repo, "plan", lambda s: FED)
    monkeypatch.setattr(repo, "list_files", lambda b, prefix: paths)
    monkeypatch.setattr(repo, "download", lambda b, path, dest: shutil.copy(src.parent / path, dest))
    monkeypatch.setattr(repo, "upsert", lambda entity, key, recs: state["upserts"].setdefault(entity, []).extend(recs) or (len(recs), 0))
    monkeypatch.setattr(repo, "audit", lambda *a, **k: None)
    monkeypatch.setattr(repo, "set_solicitation", lambda *a, **k: None)
    return sol, state


def test_ingest_falls_back_to_rules_without_ixp(bucket, monkeypatch):
    sol, state = bucket
    monkeypatch.setattr(extraction, "ixp", lambda vol, path: None)
    out = main.ingest_proposals(main.SolicitationInput(solicitationId=sol))
    assert out.error_type == "" and out.offerorCount == 3
    o = state["upserts"]["SSOfferor"][0]
    found = json.loads(o["ExtractionJson"])
    assert found["cover"]["source"] == "rules" and found["price"]["source"] == "rules" and found["references"] == []
    assert o["UEI"] and json.loads(o["PriceLinesJson"]) and found["intakeNotes"][0].startswith("Signed by")


def test_ingest_records_ixp_results(bucket, monkeypatch):
    sol, state = bucket
    seen = []

    def fake(vol, path):
        seen.append(vol)
        return {"cover": {"Offeror": [{"Legal name": {"value": "From IXP LLC", "confidence": 0.99}, "Vendor ID": {"value": "QX7F3K8L9MPO", "confidence": 0.9},
                                       "Signatory name": {"value": "Pat Doe", "confidence": 0.9}}]},
                "price": {"Price line": [{"Line number": {"value": "0001", "confidence": 0.99}, "Line total": {"value": "100 USD", "confidence": 0.99}}]},
                "pastPerformance": {"Reference": [{"Contract number": {"value": "FA8730-22-F-0141", "confidence": 0.9}, "Claimed rating": {"value": "Exceptional", "confidence": 0.9}}]}}[vol]
    monkeypatch.setattr(extraction, "ixp", fake)
    main.ingest_proposals(main.SolicitationInput(solicitationId=sol))
    assert sorted(set(seen)) == ["cover", "pastPerformance", "price"] and len(seen) == 9
    o = state["upserts"]["SSOfferor"][0]
    found = json.loads(o["ExtractionJson"])
    assert o["Name"] == "From IXP LLC" and o["UEI"] == "QX7F3K8L9MPO"
    assert json.loads(o["PriceLinesJson"]) == [{"clin": "0001", "description": "", "amount": 100}]
    assert found["references"][0]["contract"] == "FA8730-22-F-0141" and found["cover"]["source"] == "IXP"
