"""AW_Robots — deterministic tasks of the Award process, one step per process task.

Same contract as SS_Robots: every step takes a solicitationId (WatchContracts takes the day to watch as of instead and
covers every contract), reads the record Source Selection built, is idempotent per solicitation, and returns errors in error_type / error_message; the process entry point `run` turns an
error into a job fault so Maestro opens an incident the operator can retry. repo.py and records.py are copies of
SS_Robots' own (tests/test_shared_copies.py fails if they drift), so both robots read and write the one record the
same way.
"""
from __future__ import annotations

import json
from datetime import date, datetime, time

from pydantic import BaseModel
from uipath.tracing import traced

import admin
import clocks
import letters
import records
import repo

AWARD = "SSAward"
LETTERS = "SSCorrespondence"
SCHEDULE, FUNDING, ALERTS = "SSSchedule", "SSFunding", "SSAlert"
AWARD_NOTICE, NOTICE = "AwardNotice", "UnsuccessfulNotice"

# The Award phase's steps, as the Award app's tracker names them (award-task-forms/src/lib/record.ts). A district's
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


# ── 2. PrepareAwardDocument ─────────────────────────────────────────────────

class AwardDocOutput(Result):
    awardDraft: str = ""


def _letter_id(sol: str, offeror: dict, kind: str) -> str:
    return f"{sol}-{offeror['OfferorCode']}-{kind}-1"


@traced(name="PrepareAwardDocument", run_type="uipath")
def prepare_award_document(input: SolicitationInput) -> AwardDocOutput:
    """Draft what the Contracting Officer signs: the contract award (an SSDecision of Kind Contract, Outcome Draft, that the
    form signs) and a notice to every offeror (SSCorrespondence drafts). Nothing the CO already signed, approved or sent is
    redrafted. Returns the award summary for the process."""
    out = AwardDocOutput()
    try:
        sol = input.solicitationId
        row = repo.solicitation(sol)
        plan = repo.plan(sol)
        if framework(plan) == "sled":
            raise ValueError("A district's notice of intent and Board approval come in a later slice; only federal awards run here")
        if row.get("Status") != "Awarded":
            raise ValueError(f"{sol} has no signed award decision yet (status {row.get('Status') or 'unknown'})")
        offerors = sorted(repo.rows("SSOfferor", sol), key=lambda o: o["Name"])
        awardee = next((o for o in offerors if o["Name"] == row.get("AwardeeName")), None)
        if awardee is None:
            raise ValueError(f"The awardee {row.get('AwardeeName')!r} is not among {sol}'s offerors")
        consensus = [r for r in repo.rows("SSRating", sol) if r.get("Level") == "Consensus"]
        decisions = {d.get("Kind"): d for d in repo.rows("SSDecision", sol)}
        summary = letters.award_summary(plan, row, awardee, decisions.get("Award"))
        if (decisions.get("Contract") or {}).get("Outcome") != "Awarded":
            repo.upsert("SSDecision", "DecisionId", [{"DecisionId": f"{sol}-contract", "SolicitationId": sol, "Kind": "Contract", "Outcome": "Draft",
                                                      "Rationale": f"Contract {summary['contractNumber']} to {awardee['Name']}, {letters.money(summary['value'])}",
                                                      "DocumentText": letters.award_document(summary)}])

        settled = {c["CorrespondenceId"] for c in repo.rows(LETTERS, sol) if c.get("Status") not in (None, "", "Draft")}
        drafts = []
        for o in offerors:
            kind = AWARD_NOTICE if o is awardee else NOTICE
            text = (letters.award_notice(plan, summary, o) if o is awardee
                    else letters.unsuccessful_notice(plan, summary, o, awardee, consensus, len(offerors)))
            cid = _letter_id(sol, o, kind)
            if cid not in settled:
                drafts.append({"CorrespondenceId": cid, "SolicitationId": sol, "OfferorId": o["OfferorId"], "Kind": kind, "Status": "Draft",
                               "Text": text, "AgentText": text, "Author": repo.ACTOR})
        repo.upsert(LETTERS, "CorrespondenceId", drafts)
        repo.upsert(AWARD, "AwardId", [{"AwardId": f"{sol}-award", "SolicitationId": sol, "ContractNumber": summary["contractNumber"],
                                        "ContractValue": summary["value"]}])
        repo.audit(sol, "award", "AwardDocumentPrepared",
                   f"Contract {summary['contractNumber']} to {awardee['Name']} drafted, with {len(drafts)} notice{'s' if len(drafts) != 1 else ''}")
        out.awardDraft = json.dumps(summary)
    except Exception as exc:
        return _fail(out, exc)
    return out


# ── 3. IssueNotices ─────────────────────────────────────────────────────────

class IssueOutput(Result):
    recordUri: str = ""


def _end_of_day(day: str) -> str:
    """A deadline day as the last minute of that day, agency time (SSCorrespondence.DueAt)."""
    return datetime.combine(date.fromisoformat(day), time(23, 59), clocks.TIME_ZONE).isoformat()


@traced(name="IssueNotices", run_type="uipath")
def issue_notices(input: SolicitationInput) -> IssueOutput:
    """File the signed contract award and the notices the Contracting Officer approved, mark them delivered, and start the
    clocks: each unsuccessful offeror's debriefing request deadline, and the stay-of-performance window."""
    out = IssueOutput()
    try:
        sol = input.solicitationId
        plan = repo.plan(sol)
        contract = next((d for d in repo.rows("SSDecision", sol) if d.get("Kind") == "Contract"), None)
        if not contract or contract.get("Outcome") != "Awarded" or not contract.get("DocumentText"):
            raise ValueError(f"The contract award for {sol} has not been signed")
        codes = {o["OfferorId"]: o["OfferorCode"] for o in repo.rows("SSOfferor", sol)}
        notices = [c for c in repo.rows(LETTERS, sol) if c.get("Kind") in (AWARD_NOTICE, NOTICE) and c.get("Status") in ("Approved", "Delivered")]
        if not notices:
            raise ValueError(f"No approved notices for {sol}")
        header = f"{plan['agency']} | {sol} | {plan['title']}"
        repo.upload(repo.RECORDS_BUCKET, f"{sol}/award/Contract-Award.pdf", records.render("Contract Award", header, [("", contract["DocumentText"])], banner=records.RELEASED_BANNER))
        now = repo.now()
        sent = [{"offerorId": c["OfferorId"], "kind": c["Kind"], "deliveredAt": c.get("DeliveredAt") or now} for c in notices]
        clock = clocks.award_clocks(contract.get("DecidedAt"), sent)
        updates = []
        for c, s in zip(notices, sent):
            path = f"{sol}/award/{codes.get(c['OfferorId'], c['OfferorId'])}-{'Award-Notice' if c['Kind'] == AWARD_NOTICE else 'Notice'}.pdf"
            if c.get("Status") != "Delivered":  # a retry never re-sends a delivered notice
                repo.upload(repo.RECORDS_BUCKET, path, records.render("Notice of Award", header, [("", c["Text"])], banner=records.RELEASED_BANNER))
            due = clock["requestDue"].get(c["OfferorId"])
            updates.append({"CorrespondenceId": c["CorrespondenceId"], "SolicitationId": sol, "Status": "Delivered", "DeliveredAt": s["deliveredAt"],
                            "FilePath": f"{repo.RECORDS_BUCKET}/{path}", **({"DueAt": _end_of_day(due)} if due else {})})
        repo.upsert(LETTERS, "CorrespondenceId", updates)
        repo.upsert(AWARD, "AwardId", [{"AwardId": f"{sol}-award", "SolicitationId": sol, "Stage": STAGES["federal"][2], "AwardedAt": contract.get("DecidedAt"),
                                        "NoticesSentAt": now, "ClocksJson": json.dumps(clock), "PerformanceStatus": "Proceeding"}])
        firsts = sorted(clock["requestDue"].values())
        repo.audit(sol, "award", "NoticesDelivered", f"{len(updates)} notices delivered" + (f"; debriefing requests due by {firsts[-1]}" if firsts else ""))
        out.recordUri = f"{repo.RECORDS_BUCKET}/{sol}/award/"
    except Exception as exc:
        return _fail(out, exc)
    return out


# ── 4. OpenAdministration ──────────────────────────────────────────────────

class AdminOutput(Result):
    phase: str = ""


def _contract_summary(sol: str) -> tuple[dict, dict, dict, dict]:
    """The signed contract award and what it says: (solicitation, plan, award summary, contract decision)."""
    row = repo.solicitation(sol)
    plan = repo.plan(sol)
    contract = next((d for d in repo.rows("SSDecision", sol) if d.get("Kind") == "Contract"), None)
    if not contract or contract.get("Outcome") != "Awarded":
        raise ValueError(f"The contract award for {sol} has not been signed")
    offerors = repo.rows("SSOfferor", sol)
    awardee = next((o for o in offerors if o["Name"] == row.get("AwardeeName")), None)
    if awardee is None:
        raise ValueError(f"The awardee {row.get('AwardeeName')!r} is not among {sol}'s offerors")
    decision = next((d for d in repo.rows("SSDecision", sol) if d.get("Kind") == "Award"), None)
    return row, plan, letters.award_summary(plan, row, awardee, decision), contract


@traced(name="OpenAdministration", run_type="uipath")
def open_administration(input: SolicitationInput) -> AdminOutput:
    """Start administering a contract signed here: its schedule (periods, options, the extension clause, milestones,
    deliverables, evaluations), the base period's obligations and the contract abstract, from the solicitation's terms
    and the signed award. Rows already written are never rewritten, so a retry keeps any status a person changed."""
    out = AdminOutput()
    try:
        sol = input.solicitationId
        current = next(iter(repo.rows(AWARD, sol)), {})
        if current.get("Phase") in ("Administration", "Closeout", "Closed"):
            out.phase = current["Phase"]
            return out
        row, plan, summary, contract = _contract_summary(sol)
        if framework(plan) == "sled":
            raise ValueError("A district's contract administration comes in a later slice; only federal contracts run here")
        schedule, funding, abstract = admin.build_schedule(sol, plan, summary, clocks.day_of(contract["DecidedAt"]))
        have = {r["ScheduleId"] for r in repo.rows(SCHEDULE, sol)}
        repo.upsert(SCHEDULE, "ScheduleId", [r for r in schedule if r["ScheduleId"] not in have])
        have = {r["FundingId"] for r in repo.rows(FUNDING, sol)}
        repo.upsert(FUNDING, "FundingId", [r for r in funding if r["FundingId"] not in have])
        periods = [r for r in schedule if r["Kind"] in ("Period", "Option")]
        repo.upsert(AWARD, "AwardId", [{"AwardId": f"{sol}-award", "SolicitationId": sol, "Phase": "Administration", "Origin": "Source Selection",
                                        "Title": plan.get("title"), "Agency": plan.get("agency"), "Office": plan.get("office"),
                                        "AwardeeName": summary["awardee"], "ContractType": plan.get("contractType"),
                                        "ContractNumber": summary["contractNumber"], "ContractValue": summary["value"],
                                        "PeriodStart": periods[0]["StartDay"], "PeriodEnd": periods[-1]["EndDay"], "CurrentPeriod": "Base",
                                        "CeilingValue": round(sum(r["Amount"] for r in periods), 2), "AbstractJson": json.dumps(abstract)}])
        repo.audit(sol, "administration", "AdministrationOpened",
                   f"Contract {summary['contractNumber']} under administration: base period {admin.show_day(periods[0]['StartDay'])} to "
                   f"{admin.show_day(periods[0]['EndDay'])}, {len(periods) - 1} option{'s' if len(periods) != 2 else ''}, "
                   f"{sum(1 for r in schedule if r['Kind'] in ('Milestone', 'Deliverable'))} milestones and deliverables on the schedule")
        out.phase = "Administration"
    except Exception as exc:
        return _fail(out, exc)
    return out


# ── 5. WatchContracts ───────────────────────────────────────────────────────

class WatchInput(BaseModel):
    asOf: str = ""


class WatchOutput(Result):
    summary: str = ""


def _counts(writes: list[dict], existing: dict[str, dict]) -> tuple[int, int, int]:
    new = sum(1 for w in writes if w.get("Status") == "Open" and (w["AlertId"] not in existing or existing[w["AlertId"]].get("Status") == "Resolved"))
    worse = sum(1 for w in writes if w["AlertId"] in existing and w.get("Severity") and existing[w["AlertId"]].get("Status") != "Resolved"
                and admin.SEVERITY_RANK.get(w["Severity"], 0) > admin.SEVERITY_RANK.get(existing[w["AlertId"]].get("Severity"), 0))
    resolved = sum(1 for w in writes if w.get("Status") == "Resolved")
    return new, worse, resolved


@traced(name="WatchContracts", run_type="uipath")
def watch_contracts(input: WatchInput) -> WatchOutput:
    """The daily contract watch: open administration on any contract signed since the last run, then for every contract
    under administration add the next recurring deliverables, apply the rules as of `asOf` (default today, agency time),
    write new and changed alerts, resolve the ones that cleared, and refresh the funds forecast. One contract failing
    doesn't stop the others; the step faults at the end so Maestro opens an incident."""
    out = WatchOutput()
    try:
        as_of = input.asOf or clocks.day_of(repo.now())
        now = repo.now()
        failed: list[str] = []
        signed = {d["SolicitationId"] for d in repo.rows("SSDecision") if d.get("Kind") == "Contract" and d.get("Outcome") == "Awarded"}
        opened = []
        for a in repo.rows(AWARD):
            if not a.get("Phase") and a["SolicitationId"] in signed:
                res = open_administration(SolicitationInput(solicitationId=a["SolicitationId"]))
                (failed.append(f"{a['SolicitationId']}: {res.error_message}") if res.error_type else opened.append(a["SolicitationId"]))
        awards = repo.rows(AWARD)
        by_id = {a["AwardId"]: a for a in awards}
        schedule, funding, letters_, alerts_ = repo.rows(SCHEDULE), repo.rows(FUNDING), repo.rows(LETTERS), repo.rows(ALERTS)
        report = []
        for a in (a for a in awards if a.get("Phase") == "Administration"):
            sol = a["SolicitationId"]
            try:
                sched = [r for r in schedule if r.get("SolicitationId") == sol]
                more = admin.materialize(sched, as_of)
                if more:
                    repo.upsert(SCHEDULE, "ScheduleId", more)
                    sched += more
                money_ = [r for r in funding if r.get("SolicitationId") == sol]
                fresh, funds = admin.alerts(a, sched, money_, [c for c in letters_ if c.get("SolicitationId") == sol], as_of, by_id.get(a.get("SuccessorId") or ""))
                existing = {x["AlertId"]: x for x in alerts_ if x.get("SolicitationId") == sol}
                writes = admin.reconcile(list(existing.values()), fresh, now)
                repo.upsert(ALERTS, "AlertId", writes)
                net = lambda kind: sum(float(r.get("Amount") or 0) * (-1 if r.get("Kind") == "Deobligation" else 1)  # noqa: E731
                                       for r in money_ if r.get("Kind") in kind)
                repo.upsert(AWARD, "AwardId", [{"AwardId": a["AwardId"], "SolicitationId": sol, "CurrentPeriod": funds.get("period"),
                                                "ObligatedValue": round(net(("Obligation", "Deobligation")), 2), "InvoicedValue": round(net(("Invoice",)), 2),
                                                "FundsJson": json.dumps(funds), "WatchedAt": now}])
                new, worse, resolved = _counts(writes, existing)
                if new or worse or resolved:
                    titles = "; ".join(w["Title"] for w in writes if w.get("Title") and w.get("Status") == "Open")[:3000]
                    repo.audit(sol, f"watch-{as_of}", "ContractWatched",
                               f"{new} new, {worse} more urgent, {resolved} resolved" + (f": {titles}" if titles else ""))
                report.append({"solicitationId": sol, "open": sum(1 for x in fresh), "new": new, "worse": worse, "resolved": resolved})
            except Exception as exc:  # one contract failing doesn't stop the others
                failed.append(f"{sol}: {type(exc).__name__}: {exc}")
        out.summary = json.dumps({"asOf": as_of, "opened": opened, "contracts": report})
        if failed:
            raise RuntimeError("; ".join(failed))
    except Exception as exc:
        return _fail(out, exc)
    return out


# ── Process entry point ─────────────────────────────────────────────────────
# Maestro process tasks start a release at its single entry point, so the process calls one `run` entry point and
# names the operation in `step`, as SS_Robots does.

class RobotInput(BaseModel):
    step: str = ""
    solicitationId: str = ""
    asOf: str = ""


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
    "PrepareAwardDocument": (prepare_award_document, SolicitationInput, "awardDraft"),
    "IssueNotices": (issue_notices, SolicitationInput, "recordUri"),
    "OpenAdministration": (open_administration, SolicitationInput, "phase"),
    "WatchContracts": (watch_contracts, WatchInput, "summary"),
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
