"""AW_Robots entry points with the platform faked."""
import json
import re
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent))

import main  # noqa: E402
import repo  # noqa: E402

FEDERAL = json.loads((ROOT / "evaluation-plans" / "W52P1J-27-R-0023.json").read_text())
SLED = json.loads((ROOT / "evaluation-plans" / "WUSD-RFP-27-009.json").read_text())


@pytest.fixture
def platform(monkeypatch):
    """In-memory Data Fabric: one solicitation per plan, SSAward rows as upserted, audit events recorded."""
    state = {"sols": {}, "plans": {}, "db": {"SSAward": []}, "audit": []}

    def upsert(entity, key, recs):
        rows = state["db"].setdefault(entity, [])
        for r in recs:
            hit = next((x for x in rows if x[key] == r[key]), None)
            hit.update(r) if hit else rows.append(dict(r))
        return len(recs), 0

    monkeypatch.setattr(repo, "solicitation", lambda sol: state["sols"][sol])
    monkeypatch.setattr(repo, "plan", lambda sol: state["plans"][sol])
    monkeypatch.setattr(repo, "rows", lambda entity, sol=None: [r for r in state["db"].get(entity, []) if sol is None or r.get("SolicitationId") == sol])
    monkeypatch.setattr(repo, "upsert", upsert)
    monkeypatch.setattr(repo, "audit", lambda sol, ref, action, detail, actor=repo.ACTOR: state["audit"].append((sol, action, detail)))
    monkeypatch.setattr(repo, "now", lambda: "2026-10-21T20:00:00+00:00")

    def add(plan, status="Awarded"):
        sol = plan["solicitationId"]
        state["plans"][sol] = plan
        state["sols"][sol] = {"SolicitationId": sol, "Status": status, "AwardeeName": "Keystone Ridge Analytics LLC", "AwardedAt": "2026-10-13T20:00:02+00:00"}
        return sol
    state["add"] = add
    return state


def start(sol):
    return main.run(main.RobotInput(step="StartAward", solicitationId=sol))


def test_start_award_opens_the_award_phase_at_contract_award(platform):
    sol = platform["add"](FEDERAL)
    out = start(sol)
    assert out.content == "Contract award"
    [row] = platform["db"]["SSAward"]
    assert row == {"AwardId": f"{sol}-award", "SolicitationId": sol, "Stage": "Contract award", "StartedAt": "2026-10-21T20:00:00+00:00",
                   "AwardedAt": "2026-10-13T20:00:02+00:00", "PerformanceStatus": "Not started"}
    assert [a[1] for a in platform["audit"]] == ["AwardPhaseStarted"]


def test_a_district_award_opens_at_the_notice_of_intent(platform):
    sol = platform["add"](SLED)
    assert start(sol).content == "Notice of intent"


def test_start_award_needs_a_signed_award_decision(platform):
    sol = platform["add"](FEDERAL, status="In evaluation")
    with pytest.raises(main.StepFailed, match="no signed award decision"):
        start(sol)
    assert platform["db"]["SSAward"] == []


def test_a_retry_leaves_an_award_under_way_where_it_is(platform):
    sol = platform["add"](FEDERAL)
    start(sol)
    platform["db"]["SSAward"][0]["Stage"] = "Debriefings"
    assert start(sol).content == "Debriefings"
    assert platform["db"]["SSAward"][0]["Stage"] == "Debriefings"
    assert len(platform["audit"]) == 1


def test_stage_names_match_the_award_app():
    """The robot writes the stage names the Award app's tracker reads (AWARD_STAGES in record.ts)."""
    ts = (ROOT / "award-task-forms" / "src" / "lib" / "record.ts").read_text()
    for fw, names in main.STAGES.items():
        listed = re.search(rf"^\s*{fw}: \[(.*?)\],?$", ts, re.M)
        assert listed and re.findall(r"'([^']+)'", listed.group(1)) == names, fw


def test_unknown_step_faults():
    with pytest.raises(main.StepFailed, match="UnknownStep"):
        main.run(main.RobotInput(step="Nope", solicitationId="X"))
