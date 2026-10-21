"""AW_Robots — deterministic tasks of the Award process, one step per process task.

Same contract as SS_Robots: every step takes a solicitationId, reads the evaluation record Source Selection built, is
idempotent per solicitation, and returns errors in error_type / error_message; the process entry point `run` turns an
error into a job fault so Maestro opens an incident the operator can retry. repo.py and records.py are copies of
SS_Robots' own (tests/test_shared_copies.py fails if they drift), so both robots read and write the one record the
same way.
"""
from __future__ import annotations

from pydantic import BaseModel
from uipath.tracing import traced

import repo

AWARD = "SSAward"

# The Award phase's steps, as the Award app's tracker names them (award-workspace/src/lib/award.ts). A district's
# notice of intent to award opens the protest period before the Board approves the contract.
STAGES = {
    "federal": ["Contract award", "Notices", "Debriefings", "Protest window", "Closed"],
    "sled": ["Notice of intent", "Protest period", "Board approval", "Contract", "Closed"],
}


class StepFailed(RuntimeError):
    """Raised by `run` so the job faults and Maestro opens an incident the operator can retry."""


class SolicitationInput(BaseModel):
    solicitationId: str = ""


class Result(BaseModel):
    error_type: str = ""
    error_message: str = ""


def _fail(out: Result, exc: Exception) -> Result:
    out.error_type = type(exc).__name__
    out.error_message = str(exc)
    return out


def framework(plan: dict) -> str:
    return "sled" if plan.get("framework") == "sled" else "federal"


# ── 1. StartAward ───────────────────────────────────────────────────────────

class StartOutput(Result):
    stage: str = ""


@traced(name="StartAward", run_type="uipath")
def start_award(input: SolicitationInput) -> StartOutput:
    """Open the Award phase on an awarded solicitation: its SSAward row at the first step. A retry, or a second run for
    the same number, leaves an award already under way where it is."""
    out = StartOutput()
    try:
        sol = input.solicitationId
        row = repo.solicitation(sol)
        if row.get("Status") != "Awarded":
            raise ValueError(f"{sol} has no signed award decision yet (status {row.get('Status') or 'unknown'})")
        first = STAGES[framework(repo.plan(sol))][0]
        current = next(iter(repo.rows(AWARD, sol)), {})
        if current.get("Stage"):
            out.stage = current["Stage"]
            return out
        repo.upsert(AWARD, "AwardId", [{"AwardId": f"{sol}-award", "SolicitationId": sol, "Stage": first, "StartedAt": repo.now(),
                                        "AwardedAt": row.get("AwardedAt"), "PerformanceStatus": "Not started"}])
        repo.audit(sol, "award", "AwardPhaseStarted", f"Award phase opened for {row.get('AwardeeName') or 'the awardee'}: {first}")
        out.stage = first
    except Exception as exc:
        return _fail(out, exc)
    return out


# ── Process entry point ─────────────────────────────────────────────────────
# Maestro process tasks start a release at its single entry point, so the process calls one `run` entry point and
# names the operation in `step`, as SS_Robots does.

class RobotInput(BaseModel):
    step: str = ""
    solicitationId: str = ""


class RobotOutput(Result):
    """Compact process contract: `content` is the step's primary payload, `detail` its secondary one, `count` its
    headline number."""
    step: str = ""
    content: str = ""
    detail: str = ""
    count: int = 0


# step -> (function, input model, result field)
STEPS = {
    "StartAward": (start_award, SolicitationInput, "stage"),
}


@traced(name="AW_Robots", run_type="uipath")
def run(input: RobotInput) -> RobotOutput:
    if input.step not in STEPS:
        raise StepFailed(f"UnknownStep: step must be one of {', '.join(STEPS)}, not {input.step!r}")
    fn, model, result_field = STEPS[input.step]
    res = fn(model(**input.model_dump(include=set(model.model_fields)))).model_dump()
    if res["error_type"]:
        raise StepFailed(f"{input.step} failed: {res['error_type']}: {res['error_message']}")
    return RobotOutput(step=input.step, content=res[result_field])
