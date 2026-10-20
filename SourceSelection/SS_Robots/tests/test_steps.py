"""Entry points with the platform faked: drafting eligibility (BR-02), the fault policy, the SSDD size fixes and the
price reasonableness memo in the award record."""
import io
import json
import sys
from pathlib import Path

import pytest
from pypdf import PdfReader

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOLUTION = HERE.parents[1]
sys.path.insert(0, str(HERE.parent))

import main  # noqa: E402
import records  # noqa: E402
import repo  # noqa: E402

PLAN = json.loads((ROOT / "evaluation-plans" / "FA8771-27-R-0012.json").read_text())
SOL = PLAN["solicitationId"]
RATED = [f for f in PLAN["factors"] if not f.get("evaluatedNotRated")]
OFFERORS = [("APEX", "Apex Federal", "Compliant", False), ("NB", "NorthBridge", "Responsibility concern", False),
            ("LATE", "Late Systems", "Non-compliant", False), ("BAR", "Barred Corp", "Responsibility concern", True)]


@pytest.fixture
def platform(monkeypatch):
    """In-memory Data Fabric and buckets; agent runs succeed unless the offeror is listed in `fail`."""
    db = {
        "SSOfferor": [{"OfferorId": f"{SOL}-{c}", "SolicitationId": SOL, "OfferorCode": c, "Name": n, "UEI": c, "ComplianceStatus": s,
                       "Exclusion": x} for c, n, s, x in OFFERORS],
        "SSProposalPage": [{"PageId": f"{SOL}-{c}-{f['volume']}-1", "SolicitationId": SOL, "OfferorId": f"{SOL}-{c}",
                            "Volume": f["volume"], "PageNumber": 1, "PageText": "Proposal text."} for c, *_ in OFFERORS for f in RATED],
        "SSRefVendor": [],
    }
    state = {"db": db, "upserts": {}, "uploads": {}, "renders": [], "runs": [], "fail": set()}
    monkeypatch.setattr(repo, "plan", lambda sol: PLAN)
    monkeypatch.setattr(repo, "rows", lambda entity, sol=None: [r for r in db.get(entity, []) if sol is None or r.get("SolicitationId") == sol])
    monkeypatch.setattr(repo, "upsert", lambda entity, key, recs: state["upserts"].setdefault(entity, []).extend(recs) or (len(recs), 0))
    monkeypatch.setattr(repo, "set_solicitation", lambda sol, **fields: None)
    monkeypatch.setattr(repo, "audit", lambda *a, **k: None)
    monkeypatch.setattr(repo, "upload", lambda bucket, path, content, content_type="application/pdf": state["uploads"].__setitem__(path, content))
    monkeypatch.setattr(main.records, "render", lambda title, header, sections, sled=False: state["renders"].append((title, sections)) or b"%PDF")

    def start_agent(name, inputs):
        state["runs"].append(inputs["offerorName"])
        return f"job{len(state['runs'])}:{inputs['offerorName']}"
    monkeypatch.setattr(repo, "start_agent", start_agent)
    monkeypatch.setattr(repo, "wait_jobs", lambda keys, timeout_s=900: {
        k: ("Faulted", None) if k.split(":", 1)[1] in state["fail"] else ("Successful", {"Findings": []}) for k in keys})
    return state


def draft(**kw):
    return main.run(main.RobotInput(step="GenerateDraftFindings", solicitationId=SOL, **kw))


# ── BR-02 ───────────────────────────────────────────────────────────────────

def test_responsibility_concern_offerors_are_drafted(platform):
    out = draft()
    assert out.error_type == ""
    assert set(platform["runs"]) == {"Apex Federal", "NorthBridge"}
    assert len(platform["runs"]) == 2 * len(RATED)


def test_co_override_drafts_a_non_compliant_or_excluded_offeror(platform):
    draft(includeOfferorIds=f"{SOL}-LATE,{SOL}-BAR")
    assert {"Late Systems", "Barred Corp"} <= set(platform["runs"])


# ── Fault policy ────────────────────────────────────────────────────────────

def test_drafting_faults_when_no_agent_run_succeeds(platform):
    platform["fail"] = {"Apex Federal", "NorthBridge"}
    with pytest.raises(main.StepFailed, match="AgentRunsFailed"):
        draft()
    assert len(platform["runs"]) == 2 * 2 * len(RATED)  # every run retried once (SE-02)
    assert "SSFinding" not in platform["upserts"]  # nothing written, so a retry starts clean


def test_partial_drafting_failure_is_returned_not_raised(platform):
    platform["fail"] = {"NorthBridge"}
    out = draft()
    assert out.error_type == "DraftsUnavailable"
    assert json.loads(out.detail)["unavailableCount"] == len(RATED)
    placeholders = [f for f in platform["upserts"]["SSFinding"] if f["Kind"] == "Draft unavailable"]
    assert {f["OfferorId"] for f in placeholders} == {f"{SOL}-NB"}


def test_agent_start_failure_faults_the_job(platform, monkeypatch):
    def not_found(name, inputs):
        raise LookupError("process could not be found")
    monkeypatch.setattr(repo, "start_agent", not_found)
    with pytest.raises(main.StepFailed, match="GenerateDraftFindings failed: LookupError"):
        draft()


@pytest.mark.parametrize("step", list(main.STEPS))
def test_every_step_faults_on_error(platform, monkeypatch, step):
    def missing(sol):
        raise LookupError(f"Solicitation {sol} not found in SSSolicitation")
    monkeypatch.setattr(repo, "plan", missing)
    with pytest.raises(main.StepFailed, match=f"{step} failed: LookupError"):
        main.run(main.RobotInput(step=step, solicitationId=SOL, rationale="Requirement cancelled."))


def test_unknown_step_faults():
    with pytest.raises(main.StepFailed, match="UnknownStep"):
        main.run(main.RobotInput(step="Nope", solicitationId=SOL))


# ── SSDD size ───────────────────────────────────────────────────────────────

def test_publish_award_record_reads_the_signed_ssdd_from_the_decision_record(platform):
    ssdd = "SOURCE SELECTION DECISION DOCUMENT\n\n" + "x" * 9500  # over the ~10k job-input cap once wrapped
    platform["db"]["SSDecision"] = [{"DecisionId": f"{SOL}-award", "SolicitationId": SOL, "Kind": "Award", "DocumentText": ssdd,
                                     "Rationale": "Award to Apex Federal as the best value.", "DecidedBy": "ssa@example.gov"}]
    platform["db"]["SSRating"] = []
    platform["db"]["SSAuditEvent"] = []
    out = main.run(main.RobotInput(step="PublishAwardRecord", solicitationId=SOL, ssddText="", signedBy="ssa@example.gov"))
    assert out.error_type == "" and out.content == f"{repo.RECORDS_BUCKET}/{SOL}/"
    title, sections = platform["renders"][0]
    assert title == "Source Selection Decision Document" and sections[0] == ("", ssdd)
    assert f"{SOL}/SSDD.pdf" in platform["uploads"]


# ── Price reasonableness memorandum ─────────────────────────────────────────

MEMO = "MEMORANDUM FOR RECORD\n\nSUBJECT: Price Reasonableness Determination\n   Apex Federal: $4,812,000 · −4.2% vs IGCE · fair and reasonable"
SLED_PLAN = json.loads((ROOT / "evaluation-plans" / "WUSD-RFP-27-014.json").read_text())


def publish(platform, monkeypatch, plan, memo):
    """Publish the award record with the CO's price decision on file, and return the audit detail."""
    sol, audits = plan["solicitationId"], []
    monkeypatch.setattr(repo, "plan", lambda s: plan)
    monkeypatch.setattr(repo, "audit", lambda sol, actor, action, detail: audits.append(detail))
    platform["db"]["SSDecision"] = [
        {"DecisionId": f"{sol}-award", "SolicitationId": sol, "Kind": "Award", "DocumentText": "DECISION", "DecidedBy": "ssa@example.gov",
         "Rationale": "Recommend award to Apex Federal, 87 of 100 points." if plan is SLED_PLAN else "Award to Apex Federal as the best value."},
        {"DecisionId": f"{sol}-price", "SolicitationId": sol, "Kind": "Price", "Outcome": "Proceed", "DocumentText": memo, "DecidedBy": "co@example.gov"}]
    platform["db"]["SSRating"] = []
    platform["db"]["SSAuditEvent"] = []
    out = main.run(main.RobotInput(step="PublishAwardRecord", solicitationId=sol))
    assert out.error_type == "" and out.content == f"{repo.RECORDS_BUCKET}/{sol}/"
    return audits[0]


def test_publish_award_record_files_the_price_reasonableness_memo(platform, monkeypatch):
    detail = publish(platform, monkeypatch, PLAN, MEMO)
    assert ("Price Reasonableness Determination", [("", MEMO)]) in platform["renders"]
    assert {f"{SOL}/{f}" for f in ("SSDD.pdf", "Price-Reasonableness-Determination.pdf", "SSEB-Consensus-Report.pdf", "Audit-Trail.pdf")} == set(platform["uploads"])
    assert "price reasonableness determination" in detail


@pytest.mark.parametrize("plan, memo", [(PLAN, ""), (SLED_PLAN, MEMO)], ids=["older-federal-evaluation", "state-and-local"])
def test_publish_award_record_skips_the_price_memo_when_there_is_none(platform, monkeypatch, plan, memo):
    detail = publish(platform, monkeypatch, plan, memo)
    assert all(title != "Price Reasonableness Determination" for title, _ in platform["renders"])
    assert not any(p.endswith("Price-Reasonableness-Determination.pdf") for p in platform["uploads"])
    assert "price reasonableness" not in detail


def test_price_memo_pdf_keeps_its_minus_signs():
    pdf = records.render("Price Reasonableness Determination", "Agency | Sol | Title", [("", MEMO)])
    text = PdfReader(io.BytesIO(pdf)).pages[0].extract_text()
    assert "-4.2% vs IGCE" in text and "?" not in text


def test_case_does_not_pass_the_ssdd_as_a_job_input():
    plan = json.loads((SOLUTION / "SourceSelection" / "caseplan.json").read_text())
    tasks = [t for n in plan["nodes"] for lane in n.get("data", {}).get("tasks", []) for t in lane]
    publish = next(t for t in tasks if t["id"] == "tPa4kS9dE")
    assert publish["displayName"] == "Publish Award Record"
    assert next(i for i in publish["data"]["inputs"] if i["name"] == "ssddText")["value"] == ""


def test_decision_writer_keeps_the_ssdd_short():
    agent = json.loads((SOLUTION / "SS_DecisionWriter" / "agent.json").read_text())
    system = next(m["content"] for m in agent["messages"] if m["role"] == "system")
    assert "under 8,000 characters" in system
    assert "incorporated by reference" in system
    assert "8,000 characters" in agent["outputSchema"]["properties"]["ssddDraft"]["description"]
