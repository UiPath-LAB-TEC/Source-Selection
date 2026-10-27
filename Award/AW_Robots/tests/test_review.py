"""The deliverable review: PrepareDeliverableReview (the reviewer agent, held to the report), RecordDeliverableReview
(accept clears the item; reject files a notice and sets a new due day) and the watch starting reviews on its own."""
import json
import sys

import pytest
from fpdf import FPDF

import admin
import main
import repo
from conftest import ROOT

sys.path.insert(0, str(ROOT / "tools"))
import generate_incumbent as incumbent  # noqa: E402

SOL = incumbent.SOL
SID = f"{SOL}-deliverable-A001-2026-11"   # October's report, due Nov 10
REPORT = ("Monthly Status Report, October 2026. Work performed: platform operations, data engineering and RMF support continued. "
          "Line item 0002: 742 hours this month. Deliverables: September report accepted. Risks: none identified. "
          "Staffing: no changes. Next month: continue operations and begin transition-out.")


def pdf(text: str) -> bytes:
    f = FPDF()
    f.add_page()
    f.set_font("Helvetica", size=10)
    f.multi_cell(0, 5, "SYNTHETIC DEMO DATA - NOT AN ACTUAL GOVERNMENT DOCUMENT\n" + text)
    return bytes(f.output())


@pytest.fixture
def received(record, monkeypatch):
    """The incumbent seeded, its October report on file, and the reviewer agent faked."""
    db = record["db"]
    for entity, rows in incumbent.build("2026-10-23").items():
        db.setdefault(entity, []).extend(dict(r) for r in rows)
    db["SSAward"][-1]["CorEmail"] = "cor@agency.example"
    db["SSSchedule"].append({"ScheduleId": SID, "SolicitationId": SOL, "Kind": "Deliverable", "Code": "A001", "Name": "Monthly status report, October",
                             "DueDay": "2026-11-10", "ReceivedDay": "2026-11-06", "FilePath": f"SS-Records/{SOL}/deliverables/A001-2026-10.pdf", "Status": "Received", "Owner": "cor"})
    db.setdefault("SSAlert", [])
    monkeypatch.setattr(repo, "download", lambda bucket, path, dest: open(dest, "wb").write(pdf(REPORT)))
    record["agent"] = {"state": "Successful", "output": {
        "Requirements": [
            {"Requirement": admin.DELIVERABLE_REQUIREMENTS["A001"][0], "Status": "Met", "Evidence": "platform operations, data engineering and RMF support continued", "Note": ""},
            {"Requirement": admin.DELIVERABLE_REQUIREMENTS["A001"][1], "Status": "Partly met", "Evidence": "Line item 0002: 742 hours this month", "Note": "No labor categories or cumulative hours."},
            {"Requirement": admin.DELIVERABLE_REQUIREMENTS["A001"][3], "Status": "Partly met", "Evidence": "Risks: the ceiling is fine", "Note": "Says no risks."},
        ],
        "Summary": "Mostly complete; hours are a single total.", "Recommendation": "Accept with comments", "Issues": ["Line item 0002 is past 85% of its ceiling and the report doesn't say so."]}}
    calls = []
    monkeypatch.setattr(repo, "start_agent", lambda name, inputs: calls.append((name, inputs)) or f"job-{len(calls)}")
    monkeypatch.setattr(repo, "wait_jobs", lambda keys, timeout_s=900: {k: (record["agent"]["state"], record["agent"]["output"]) for k in keys})
    record["calls"] = calls
    return record


def row(record, sid=SID):
    return next(r for r in record["db"]["SSSchedule"] if r["ScheduleId"] == sid)


def test_prepare_holds_the_review_to_the_report(received):
    out = json.loads(main.run(main.RobotInput(step="PrepareDeliverableReview", solicitationId=SOL, scheduleId=SID)).content)
    name, inputs = received["calls"][0]
    assert name == "AW_DeliverableReviewer" and "742 hours" in inputs["reportText"] and "SYNTHETIC" not in inputs["reportText"]
    assert json.loads(inputs["contractFacts"])["laborHourLines"][0]["clin"] == "0002"
    items = out["requirements"]
    assert len(items) == 6 and [x["status"] for x in items[:2]] == ["Met", "Partly met"]
    assert items[3]["evidence"] == "" and "wasn't found in the report" in items[3]["note"]   # the made-up quote is dropped
    assert items[5]["status"] == "Not checked"                                                # the agent skipped it
    assert out["recommendation"] == "Accept with comments" and out["agent"] is True
    assert row(received)["Status"] == "Under review" and json.loads(row(received)["ReviewJson"])["file"].endswith("A001-2026-10.pdf")
    assert [a for a, _ in received["audit"]] == ["DeliverableReviewPrepared"]


def test_prepare_leaves_the_review_to_the_cor_when_the_agent_fails(received):
    received["agent"] = {"state": "Faulted", "output": None}
    out = json.loads(main.run(main.RobotInput(step="PrepareDeliverableReview", solicitationId=SOL, scheduleId=SID)).content)
    assert len(received["calls"]) == 2 and out["agent"] is False and {x["status"] for x in out["requirements"]} == {"Not checked"}


def test_an_accepted_report_clears_its_action_item(received):
    received["db"]["SSAlert"].append({"AlertId": main._alert_id(SOL, SID), "SolicitationId": SOL, "Status": "Open"})
    row(received).update(Status="Accepted", AcceptedDay="2026-11-07", ReviewedBy="Owen Mercer")
    assert main.run(main.RobotInput(step="RecordDeliverableReview", solicitationId=SOL, scheduleId=SID)).content == "Accepted"
    assert received["db"]["SSAlert"][0]["Status"] == "Resolved"


def test_a_rejected_report_goes_back_with_a_notice_and_a_new_due_day(received):
    received["db"]["SSAlert"].append({"AlertId": main._alert_id(SOL, SID), "SolicitationId": SOL, "Status": "Acknowledged"})
    row(received).update(Status="Rejected", Reason="Hours by labor category are missing.", ReviewedBy="Owen Mercer", ReviewedAt="2026-11-07T15:00:00+00:00")
    assert main.run(main.RobotInput(step="RecordDeliverableReview", solicitationId=SOL, scheduleId=SID)).content == "Rejected"
    r = row(received)
    assert (r["Status"], r["DueDay"], r["ReceivedDay"], r["FilePath"], r["ProcessInstanceId"]) == ("Due", "2026-10-29", None, None, None)  # 5 business days after Oct 22 (the fixture's "now")
    assert json.loads(r["ReviewJson"])["history"][0]["reason"] == "Hours by labor category are missing."
    letter = next(c for c in received["db"]["SSCorrespondence"] if c["Kind"] == "DeliverableRejection")
    assert "Hours by labor category are missing." in letter["Text"] and letter["FilePath"].endswith("-Rejection-1.pdf")
    assert received["db"]["SSAlert"][0]["Status"] == "Resolved"


def test_record_refuses_an_undecided_review(received):
    with pytest.raises(main.StepFailed, match="hasn't been accepted or rejected"):
        main.run(main.RobotInput(step="RecordDeliverableReview", solicitationId=SOL, scheduleId=SID))


def test_the_watch_starts_a_review_for_a_report_on_file_once(received, monkeypatch):
    started = []
    monkeypatch.setattr(main, "_start_review", lambda sol, r, cor: started.append((sol, r["ScheduleId"], cor)) or "instance-1")
    main.run(main.RobotInput(step="WatchContracts", asOf="2026-11-06"))
    assert started == [(SOL, SID, "cor@agency.example")] and row(received)["ProcessInstanceId"] == "instance-1"
    main.run(main.RobotInput(step="WatchContracts", asOf="2026-11-06"))
    assert len(started) == 1
    alert = next(a for a in received["db"]["SSAlert"] if a["AlertId"] == main._alert_id(SOL, SID))
    assert alert["Title"].startswith("Monthly status report, October: review by") and "The review is with Owen Mercer" in alert["Detail"]


def test_the_watch_waits_for_a_cor_email_before_starting_reviews(received, monkeypatch):
    received["db"]["SSAward"][-1]["CorEmail"] = None
    started = []
    monkeypatch.setattr(main, "_start_review", lambda sol, r, cor: started.append(r) or "x")
    main.run(main.RobotInput(step="WatchContracts", asOf="2026-11-06"))
    assert started == []
