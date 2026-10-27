"""PrepareAwardDocument and IssueNotices on the Army award, with the platform faked (conftest.record)."""
import json

import pytest

import letters
import main
from conftest import CONSENSUS, OFFERORS, PLAN, SOL

KEYSTONE, IRONWOOD, BLUESTEM = OFFERORS


def run(step):
    return main.run(main.RobotInput(step=step, solicitationId=SOL))


def letter(record, code):
    return next(c for c in record["db"]["SSCorrespondence"] if c["OfferorId"] == f"{SOL}-{code}")


# ── Letters ─────────────────────────────────────────────────────────────────

def test_contract_number_swaps_the_solicitation_letter():
    assert letters.contract_number("W52P1J-27-R-0023") == "W52P1J-27-C-0023"
    assert letters.contract_number("FA8771-27-R-0031", "Indefinite-delivery, indefinite-quantity") == "FA8771-27-D-0031"


def test_reason_names_the_factors_and_the_price_tradeoff():
    r = letters.reason(PLAN, IRONWOOD, KEYSTONE, CONSENSUS)
    assert "higher on Technical Approach and Past Performance" in r and "worth the awardee's higher price" in r


def test_reason_without_a_rating_edge_is_about_price():
    tied = [dict(c, Rating="Good" if c["FactorId"] != "F3" else "Satisfactory Confidence") for c in CONSENSUS]
    pricier = dict(IRONWOOD, TotalEvaluatedPrice=KEYSTONE["TotalEvaluatedPrice"] + 1)
    assert letters.reason(PLAN, pricier, KEYSTONE, tied).startswith("The awardee's proposal was rated as high as yours")


def test_unsuccessful_notice_has_every_required_element():
    summary = letters.award_summary(PLAN, {"SolicitationId": SOL}, KEYSTONE, None)
    text = letters.unsuccessful_notice(PLAN, summary, IRONWOOD, KEYSTONE, CONSENSUS, received=3)
    assert "posted publicly on SAM.gov" in text                                  # (b)(1) offerors solicited
    assert "Proposals received: 3." in text                                      # (b)(2)
    assert "Keystone Ridge Analytics LLC, 1200 Arsenal Way" in text              # (b)(3) awardee name and address
    assert "CLIN 0001  Line 1  $7,900,000" in text and "Total contract price  $19,300,000" in text  # (b)(4)
    assert "Why your proposal was not selected" in text                          # (b)(5)
    assert "within 3 days after you receive this notice" in text and "DFARS 215.301-270" in text  # Army: enhanced debriefing
    assert letters.DATE in text and letters.SIGNATURE in text


def test_a_civilian_notice_has_no_dod_follow_up_questions():
    civilian = dict(PLAN, agency="Department of Veterans Affairs")
    summary = letters.award_summary(civilian, {"SolicitationId": SOL}, KEYSTONE, None)
    assert "DFARS" not in letters.unsuccessful_notice(civilian, summary, IRONWOOD, KEYSTONE, CONSENSUS, received=3)


# ── PrepareAwardDocument ────────────────────────────────────────────────────

def test_prepare_drafts_the_award_and_a_notice_for_every_offeror(record):
    out = run("PrepareAwardDocument")
    draft = json.loads(out.content)
    assert (draft["contractNumber"], draft["awardee"], draft["value"]) == ("W52P1J-27-C-0023", KEYSTONE["Name"], 19_300_000)
    contract = next(d for d in record["db"]["SSDecision"] if d["Kind"] == "Contract")
    assert (contract["Outcome"], contract["DecisionId"]) == ("Draft", f"{SOL}-contract")
    assert "Contract number: W52P1J-27-C-0023" in contract["DocumentText"] and letters.SIGNATURE in contract["DocumentText"]
    kinds = {c["OfferorId"].rsplit("-", 1)[1]: (c["Kind"], c["Status"]) for c in record["db"]["SSCorrespondence"]}
    assert kinds == {"KEYSTONE": ("AwardNotice", "Draft"), "IRONWOOD": ("UnsuccessfulNotice", "Draft"), "BLUESTEM": ("UnsuccessfulNotice", "Draft")}
    assert record["db"]["SSAward"][0]["ContractNumber"] == "W52P1J-27-C-0023"
    assert [a for a, _ in record["audit"]] == ["AwardDocumentPrepared"]


def test_prepare_never_redrafts_an_approved_notice(record):
    run("PrepareAwardDocument")
    letter(record, "IRONWOOD").update(Status="Approved", Text="Edited by the CO")
    run("PrepareAwardDocument")
    assert letter(record, "IRONWOOD")["Text"] == "Edited by the CO"
    assert letter(record, "BLUESTEM")["Status"] == "Draft"


def test_prepare_needs_a_signed_award_decision(record):
    record["db"]["SSSolicitation"][0]["Status"] = "In evaluation"
    with pytest.raises(main.StepFailed, match="no signed award decision"):
        run("PrepareAwardDocument")


def test_prepare_leaves_state_and_local_for_a_later_slice(record):
    record["db"]["SSSolicitation"][0]["PlanJson"] = json.dumps(dict(PLAN, framework="sled"))
    with pytest.raises(main.StepFailed, match="later slice"):
        run("PrepareAwardDocument")


# ── IssueNotices ────────────────────────────────────────────────────────────

def sign(record):
    """What the executeAward form writes when the CO signs: the contract decision and the approved notices."""
    run("PrepareAwardDocument")
    next(d for d in record["db"]["SSDecision"] if d["Kind"] == "Contract").update(
        Outcome="Awarded", DecidedBy="Contracting Officer", DecidedAt="2026-10-22T15:00:00+00:00", DocumentText="Signed award")
    for c in record["db"]["SSCorrespondence"]:
        c["Status"] = "Approved"


def test_issue_needs_the_signed_contract_award(record):
    run("PrepareAwardDocument")
    with pytest.raises(main.StepFailed, match="has not been signed"):
        run("IssueNotices")


def test_issue_files_everything_and_starts_the_clocks(record):
    sign(record)
    out = run("IssueNotices")
    assert out.content == f"SS-Records/{SOL}/award/"
    assert set(record["uploads"]) == {f"{SOL}/award/{n}.pdf" for n in ["Contract-Award", "KEYSTONE-Award-Notice", "IRONWOOD-Notice", "BLUESTEM-Notice"]}
    ironwood = letter(record, "IRONWOOD")
    assert (ironwood["Status"], ironwood["DeliveredAt"], ironwood["DueAt"][:10]) == ("Delivered", "2026-10-22T16:00:00+00:00", "2026-10-26")
    assert "DueAt" not in letter(record, "KEYSTONE")  # the awardee has no debriefing to request
    award = record["db"]["SSAward"][0]
    assert award["Stage"] == "Debriefings" and award["AwardedAt"] == "2026-10-22T15:00:00+00:00"
    assert json.loads(award["ClocksJson"]) == {"noticesDue": "2026-10-26", "stayByAward": "2026-11-02",
                                               "requestDue": {f"{SOL}-IRONWOOD": "2026-10-26", f"{SOL}-BLUESTEM": "2026-10-26"}}


def test_a_retry_never_resends_a_delivered_notice(record):
    sign(record)
    run("IssueNotices")
    record["uploads"].clear()
    run("IssueNotices")
    assert set(record["uploads"]) == {f"{SOL}/award/Contract-Award.pdf"}
    assert letter(record, "IRONWOOD")["DeliveredAt"] == "2026-10-22T16:00:00+00:00"


def test_prepare_never_redrafts_a_signed_contract(record):
    sign(record)
    run("PrepareAwardDocument")
    assert next(d for d in record["db"]["SSDecision"] if d["Kind"] == "Contract")["DocumentText"] == "Signed award"
