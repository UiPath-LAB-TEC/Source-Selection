"""AW_Robots — deterministic tasks of the Award process, one step per process task.

Same contract as SS_Robots: every step takes a solicitationId (WatchContracts takes the day to watch as of instead and
covers every contract), reads the record Source Selection built, is idempotent per solicitation, and returns errors in error_type / error_message; the process entry point `run` turns an
error into a job fault so Maestro opens an incident the operator can retry. repo.py and records.py are copies of
SS_Robots' own (tests/test_shared_copies.py fails if they drift), so both robots read and write the one record the
same way.
"""
from __future__ import annotations

import json
import re
import tempfile
from datetime import date, datetime, time
from pathlib import Path

from pydantic import BaseModel
from pypdf import PdfReader
from uipath.tracing import traced

import admin
import clocks
import letters
import records
import repo

AWARD = "SSAward"
LETTERS = "SSCorrespondence"
SCHEDULE, FUNDING, ALERTS, MODS, VENDORS = "SSSchedule", "SSFunding", "SSAlert", "SSModification", "SSRefVendor"
REVIEW_PROCESS = "DeliverableReviewProcess"
OPTION_PROCESS = "OptionExerciseProcess"
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


# ── 5. Deliverable review: PrepareDeliverableReview, RecordDeliverableReview ─

class ReviewInput(BaseModel):
    solicitationId: str = ""
    scheduleId: str = ""


class ReviewOutput(Result):
    review: str = ""


def _schedule_row(sol: str, schedule_id: str) -> dict:
    row = next((r for r in repo.rows(SCHEDULE, sol) if r.get("ScheduleId") == schedule_id), None)
    if row is None:
        raise LookupError(f"{schedule_id} is not on {sol}'s schedule")
    return row


def _report_text(path: str) -> str:
    """The text of a filed deliverable, without the synthetic-demo banner each page carries."""
    with tempfile.TemporaryDirectory() as d:
        local = str(Path(d) / "report.pdf")
        repo.download(repo.RECORDS_BUCKET, path.removeprefix(f"{repo.RECORDS_BUCKET}/"), local)
        pages = [p.extract_text() or "" for p in PdfReader(local).pages]
    text = "\n".join(pages)
    return re.sub(r"SYNTHETIC DEMO[^\n]*NOT A[N]? (ACTUAL|REAL)[^\n]*", "", text).strip()


def _alert_id(sol: str, schedule_id: str) -> str:
    return f"{sol}-deliverable-{schedule_id.removeprefix(f'{sol}-')}"


@traced(name="PrepareDeliverableReview", run_type="uipath")
def prepare_deliverable_review(input: ReviewInput) -> ReviewOutput:
    """Read a deliverable the contractor filed and have the reviewer agent check it against what the contract requires,
    one requirement at a time, quoting the report. Quotes the report doesn't contain are dropped. If the agent fails
    twice, the COR gets the requirements to check by hand. The COR decides; this only prepares."""
    out = ReviewOutput()
    try:
        sol, sid = input.solicitationId, input.scheduleId
        row = _schedule_row(sol, sid)
        if not row.get("FilePath"):
            raise ValueError(f"No file is on record for {row.get('Name')}; record its receipt first")
        contract = next(iter(repo.rows(AWARD, sol)), {})
        text = _report_text(row["FilePath"])
        # Today's funds, so the reviewer can set reported hours against the labor-hour ceilings as they stand now.
        today = clocks.day_of(repo.now())
        period = admin.current_period(repo.rows(SCHEDULE, sol), today)
        lines = admin.forecast(json.loads(contract.get("AbstractJson") or "{}"), repo.rows(FUNDING, sol), period, today) if period else {}
        inputs = admin.review_inputs(contract, row, text, {"period": period and period["Period"], "lines": list(lines.values())})
        output = None
        for _ in range(2):  # one retry, as the evaluation agents get (SE-02)
            key = repo.start_agent(admin.REVIEWER, inputs)
            state, result = repo.wait_jobs([key], timeout_s=600)[key]
            if state == "Successful" and result:
                output = result
                break
        review = admin.checked_review(output, json.loads(inputs["requirements"]), text) | {"file": row["FilePath"], "preparedAt": repo.now()}
        history = json.loads(row.get("ReviewJson") or "{}").get("history") or []
        review["history"] = history
        repo.upsert(SCHEDULE, "ScheduleId", [{"ScheduleId": sid, "SolicitationId": sol, "Status": "Under review", "ReviewJson": json.dumps(review)}])
        met = sum(1 for x in review["requirements"] if x["status"] == "Met")
        repo.audit(sol, sid, "DeliverableReviewPrepared",
                   f"{row['Name']}: {met} of {len(review['requirements'])} requirements met"
                   + (f"; the reviewer recommends: {review['recommendation']}" if review.get("recommendation") else "")
                   + ("" if review["agent"] else "; the reviewer agent was unavailable, so it's checked by hand"), actor=admin.REVIEWER)
        out.review = json.dumps(review)[:9000]
    except Exception as exc:
        return _fail(out, exc)
    return out


class RecordOutput(Result):
    decision: str = ""


@traced(name="RecordDeliverableReview", run_type="uipath")
def record_deliverable_review(input: ReviewInput) -> RecordOutput:
    """After the COR decides: an accepted deliverable clears its action item. A rejected one gets a notice to the
    contractor (filed with the record) and is due again in 5 business days, so the watch raises it again until a
    corrected copy is accepted."""
    out = RecordOutput()
    try:
        sol, sid = input.solicitationId, input.scheduleId
        row = _schedule_row(sol, sid)
        contract = next(iter(repo.rows(AWARD, sol)), {})
        now = repo.now()
        resolve = [{"AlertId": a["AlertId"], "SolicitationId": sol, "Status": "Resolved", "ResolvedAt": now}
                   for a in repo.rows(ALERTS, sol) if a.get("AlertId") == _alert_id(sol, sid) and a.get("Status") != "Resolved"]
        if row.get("Status") == "Accepted":
            repo.upsert(ALERTS, "AlertId", resolve)
            out.decision = "Accepted"
            return out
        if row.get("Status") != "Rejected":
            raise ValueError(f"{row.get('Name')} hasn't been accepted or rejected yet (status {row.get('Status')})")
        today = clocks.day_of(now)
        resubmit = clocks.add_business_days(today, admin.RESUBMIT_BUSINESS_DAYS)
        letter = admin.rejection_letter(contract, row, row.get("Reason") or "", resubmit, today)
        review = json.loads(row.get("ReviewJson") or "{}")
        n = len(review.get("history") or []) + 1
        path = f"{sol}/deliverables/{sid.removeprefix(f'{sol}-')}-Rejection-{n}.pdf"
        header = f"{contract.get('Agency') or ''} | {contract.get('ContractNumber') or sol} | {contract.get('Title') or ''}"
        repo.upload(repo.RECORDS_BUCKET, path, records.render("Deliverable not accepted", header, [("", letter)], banner=records.RELEASED_BANNER))
        repo.upsert(LETTERS, "CorrespondenceId", [{"CorrespondenceId": f"{sid}-Rejection-{n}", "SolicitationId": sol, "OfferorId": f"{sol}-CONTRACTOR",
                                                    "Kind": "DeliverableRejection", "Status": "Delivered", "Text": letter, "AgentText": letter,
                                                    "DeliveredAt": now, "FilePath": f"{repo.RECORDS_BUCKET}/{path}", "Author": row.get("ReviewedBy") or repo.ACTOR}])
        review["history"] = (review.get("history") or []) + [{"file": row.get("FilePath"), "decision": "Rejected", "reason": row.get("Reason"),
                                                              "by": row.get("ReviewedBy"), "at": row.get("ReviewedAt")}]
        repo.upsert(SCHEDULE, "ScheduleId", [{"ScheduleId": sid, "SolicitationId": sol, "Status": "Due", "DueDay": resubmit, "ReceivedDay": None,
                                              "AcceptedDay": None, "FilePath": None, "ProcessInstanceId": None, "ReviewJson": json.dumps(review)}])
        repo.upsert(ALERTS, "AlertId", resolve)
        repo.audit(sol, f"{sid}-{n}", "RejectionNoticeSent", f"{row.get('Name')} returned to the contractor; a corrected copy is due {admin.show_day(resubmit)}")
        out.decision = "Rejected"
    except Exception as exc:
        return _fail(out, exc)
    return out


def _start_review(sol: str, row: dict, cor: str) -> str:
    """Start the review process for a deliverable on record: the reviewer agent, then the COR's task."""
    job = repo.retry(lambda: repo.sdk().processes.invoke(REVIEW_PROCESS, {"solicitationId": sol, "scheduleId": row["ScheduleId"], "cor": cor},
                                                          **repo.run_folder()))
    return job.key


# ── 6. WatchContracts ───────────────────────────────────────────────────────

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


def _start_package(sol: str, row: dict, co: str, rm: str) -> str:
    """Start the option package for an option or the extension: the checks and drafts, then the funds and the decision."""
    job = repo.retry(lambda: repo.sdk().processes.invoke(OPTION_PROCESS, {"solicitationId": sol, "scheduleId": row["ScheduleId"],
                                                                          "contractingOfficer": co, "resourceManager": rm}, **repo.run_folder()))
    return job.key


def _watch_one(a: dict, as_of: str, now: str, schedule: list[dict], funding: list[dict], letters_: list[dict], alerts_: list[dict],
               by_id: dict[str, dict], start: bool = True) -> dict:
    """The watch for one contract: the next recurring deliverables, the rules as of `as_of`, the alerts and the funds
    forecast. With `start`, it also starts the work nobody has started: a review for a deliverable on file, and the
    package for an option or extension that needs action."""
    sol = a["SolicitationId"]
    sched = [r for r in schedule if r.get("SolicitationId") == sol]
    more = admin.materialize(sched, as_of)
    if more:
        repo.upsert(SCHEDULE, "ScheduleId", more)
        sched += more
    # A deliverable on file with no review yet (it came in some other way than Record receipt) gets one.
    reviews = []
    for r in sched if start else []:
        if (r.get("Kind") == "Deliverable" and r.get("ReceivedDay") and r.get("FilePath") and not r.get("AcceptedDay")
                and r.get("Status") == "Received" and not r.get("ProcessInstanceId") and a.get("CorEmail")):
            key = _start_review(sol, r, a["CorEmail"])
            if key:
                r["ProcessInstanceId"] = key
                repo.upsert(SCHEDULE, "ScheduleId", [{"ScheduleId": r["ScheduleId"], "SolicitationId": sol, "ProcessInstanceId": key}])
                reviews.append(r["Name"])
    money_ = [r for r in funding if r.get("SolicitationId") == sol]
    fresh, funds = admin.alerts(a, sched, money_, [c for c in letters_ if c.get("SolicitationId") == sol], as_of, by_id.get(a.get("SuccessorId") or ""))
    existing = {x["AlertId"]: x for x in alerts_ if x.get("SolicitationId") == sol}
    writes = admin.reconcile(list(existing.values()), fresh, now)
    repo.upsert(ALERTS, "AlertId", writes)
    # An option or extension that needs action and has no package running gets one, unless someone dismissed it.
    packages = []
    if start and a.get("CoEmail") and a.get("RmEmail"):
        status = {k: v.get("Status") for k, v in existing.items()} | {w["AlertId"]: w["Status"] for w in writes if w.get("Status")}
        for f in fresh:
            if f["Kind"] not in ("option", "extension") or f["Severity"] not in ("Overdue", "Due soon") or status.get(f["AlertId"]) == "Dismissed":
                continue
            sid = json.loads(f.get("EvidenceJson") or "{}").get("scheduleId")
            r = next((x for x in sched if x.get("ScheduleId") == sid), None)
            if r and not r.get("ProcessInstanceId") and r.get("Status") in ("Planned", "Notice sent"):
                key = _start_package(sol, r, a["CoEmail"], a["RmEmail"])
                if key:
                    r["ProcessInstanceId"] = key
                    repo.upsert(SCHEDULE, "ScheduleId", [{"ScheduleId": r["ScheduleId"], "SolicitationId": sol, "ProcessInstanceId": key}])
                    packages.append(r["Name"])
    net = lambda kind: sum(float(r.get("Amount") or 0) * (-1 if r.get("Kind") == "Deobligation" else 1)  # noqa: E731
                           for r in money_ if r.get("Kind") in kind)
    repo.upsert(AWARD, "AwardId", [{"AwardId": a["AwardId"], "SolicitationId": sol, "CurrentPeriod": funds.get("period"),
                                    "ObligatedValue": round(net(("Obligation", "Deobligation")), 2), "InvoicedValue": round(net(("Invoice",)), 2),
                                    "FundsJson": json.dumps(funds), "WatchedAt": now}])
    new, worse, resolved = _counts(writes, existing)
    if start and (new or worse or resolved or reviews or packages):
        titles = "; ".join(w["Title"] for w in writes if w.get("Title") and w.get("Status") == "Open")[:3000]
        repo.audit(sol, f"watch-{as_of}", "ContractWatched",
                   f"{new} new, {worse} more urgent, {resolved} resolved" + (f": {titles}" if titles else "")
                   + (f". Reviews started: {', '.join(reviews)}" if reviews else "") + (f". Packages started: {', '.join(packages)}" if packages else ""))
    return {"solicitationId": sol, "open": len(fresh), "new": new, "worse": worse, "resolved": resolved, "reviewsStarted": reviews,
            "packagesStarted": packages}


def _refresh(sol: str) -> None:
    """Re-apply the watch's rules to one contract now, so a decision just filed shows on its items at once."""
    a = next(iter(repo.rows(AWARD, sol)), None)
    if not a or a.get("Phase") != "Administration":
        return
    now = repo.now()
    _watch_one(a, clocks.day_of(now), now, repo.rows(SCHEDULE, sol), repo.rows(FUNDING, sol), repo.rows(LETTERS, sol), repo.rows(ALERTS, sol),
               {x["AwardId"]: x for x in repo.rows(AWARD)}, start=False)


@traced(name="WatchContracts", run_type="uipath")
def watch_contracts(input: WatchInput) -> WatchOutput:
    """The daily contract watch: open administration on any contract signed since the last run, then for every contract
    under administration add the next recurring deliverables, apply the rules as of `asOf` (default today, agency time),
    write new and changed alerts, resolve the ones that cleared, refresh the funds forecast, and start the reviews and
    option packages nobody has started. One contract failing doesn't stop the others; the step faults at the end so
    Maestro opens an incident."""
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
            try:
                report.append(_watch_one(a, as_of, now, schedule, funding, letters_, alerts_, by_id))
            except Exception as exc:  # one contract failing doesn't stop the others
                failed.append(f"{a['SolicitationId']}: {type(exc).__name__}: {exc}")
        out.summary = json.dumps({"asOf": as_of, "opened": opened, "contracts": report})
        if failed:
            raise RuntimeError("; ".join(failed))
    except Exception as exc:
        return _fail(out, exc)
    return out


# ── 7. Options and the extension of services: PrepareOptionPackage, IssueOptionExercise, IssuePreliminaryNotice,
#       RecordNotExercised ─────────────────────────────────────────────────────

class OptionInput(BaseModel):
    solicitationId: str = ""
    scheduleId: str = ""


class PackageOutput(Result):
    package: str = ""


def _vendor(contract: dict) -> dict | None:
    """The contractor's SAM and CPARS row (SSRefVendor, the demo's stand-in for both), by UEI."""
    uei = (json.loads(contract.get("AbstractJson") or "{}").get("contractor") or {}).get("uei")
    return next((v for v in repo.rows(VENDORS) if v.get("UEI") == uei), None) if uei else None


@traced(name="PrepareOptionPackage", run_type="uipath")
def prepare_option_package(input: OptionInput) -> PackageOutput:
    """Gather what the Contracting Officer needs to decide an option or the 52.217-8 extension: the proposal, and every
    check FAR 17.204-1(b) and DFARS 217.207(c) ask for, each with its source. The writer agent drafts the findings that
    need judgment (existing need, performance, price) and recommends; the robot holds its citations to the checks. The
    Resource Manager and the CO decide; this only prepares."""
    out = PackageOutput()
    try:
        sol, sid = input.solicitationId, input.scheduleId
        contract = next(iter(repo.rows(AWARD, sol)), None)
        if not contract or contract.get("Phase") != "Administration":
            raise ValueError(f"{sol} isn't under administration")
        schedule = repo.rows(SCHEDULE, sol)
        row = next((r for r in schedule if r.get("ScheduleId") == sid), None)
        if row is None:
            raise LookupError(f"{sid} is not on {sol}'s schedule")
        succ = next((a for a in repo.rows(AWARD) if a.get("AwardId") == contract.get("SuccessorId")), None) if contract.get("SuccessorId") else None
        igce = None
        if contract.get("Origin") != "Imported":
            try:
                igce = repo.plan(sol).get("igce")
            except Exception:  # an IGCE only sharpens the price check
                igce = None
        pkg = admin.option_package(contract, row, schedule, repo.rows(FUNDING, sol), repo.rows(MODS, sol), _vendor(contract), succ,
                                   repo.rows(SCHEDULE, succ["SolicitationId"]) if succ else [], repo.rows(ALERTS, sol), clocks.day_of(repo.now()), igce)
        inputs = admin.writer_inputs(pkg)
        output = None
        for _ in range(2):  # one retry, as the other agents get (SE-02)
            key = repo.start_agent(admin.WRITER, inputs)
            state, result = repo.wait_jobs([key], timeout_s=600)[key]
            if state == "Successful" and result:
                output = result
                break
        history = json.loads(row.get("ReviewJson") or "{}").get("history") or []
        texts, writer = admin.checked_writing(output, pkg)
        # One decision per package: the draft the CO edits and signs (an SSDecision, as the contract award is in slice 1).
        code = "EXT" if pkg["kind"] == "extension" else admin.period_code(row["Name"])
        did = f"{sol}-{code}-{len(history) + 1}"
        signed = next((d for d in repo.rows("SSDecision", sol) if d.get("DecisionId") == did and d.get("Outcome") not in (None, "", "Draft")), None)
        if signed:
            raise ValueError(f"{did} is already signed ({signed['Outcome']}); file it before preparing another package")
        repo.upsert("SSDecision", "DecisionId", [{"DecisionId": did, "SolicitationId": sol, "Kind": "Extension" if pkg["kind"] == "extension" else "OptionExercise",
                                                  "Outcome": "Draft", "Rationale": f"{pkg['title']}: {pkg['proposal']['reason']}"[:1000],
                                                  "DocumentText": admin.determination_draft(pkg, texts)}])
        pkg |= {"writer": writer, "ids": {"decision": did, "letter": f"{did}-Notice", "modification": f"{sol}-{pkg['modification']}"},
                "history": history, "preparedAt": repo.now()}
        stored = admin.stored_package(pkg)
        # Compact, as the forms write it back: the row keeps room for the funds and the decision under its 10,000 characters.
        repo.upsert(SCHEDULE, "ScheduleId", [{"ScheduleId": sid, "SolicitationId": sol, "ReviewJson": json.dumps(stored, separators=(",", ":"))}])
        n = lambda s: sum(1 for x in pkg["checks"] if x["status"] == s)  # noqa: E731
        rec = writer["recommendation"]
        repo.audit(sol, f"{sid}-{pkg['stage']}-{len(history) + 1}", "OptionPackagePrepared",
                   f"{pkg['title']}: {n('Met')} of {len(pkg['checks'])} checks met, {n('To confirm')} to confirm, {n('Not met')} not met"
                   + (f"; the writer recommends: {rec}" + (f", {writer['recommendedMonths']} month{'s' if writer['recommendedMonths'] != 1 else ''}"
                                                            if writer.get("recommendedMonths") else "") if rec else "")
                   + ("" if writer["agent"] else "; the writer agent was unavailable, so the findings are the checks' own"), actor=admin.WRITER)
        text = json.dumps(stored, separators=(",", ":"))
        out.package = text if len(text) <= 9000 else json.dumps({"scheduleId": sid, "stage": pkg["stage"], "title": pkg["title"]})
    except Exception as exc:
        return _fail(out, exc)
    return out


def _decided(sol: str, sid: str, outcome: str) -> tuple[dict, dict, dict, dict, dict, dict]:
    """The decision the CO signed on an option or extension: (award row, schedule row, package, decision, determination, letter)."""
    contract = next(iter(repo.rows(AWARD, sol)), None)
    if not contract:
        raise LookupError(f"{sol} has no contract record")
    row = _schedule_row(sol, sid)
    pkg = json.loads(row.get("ReviewJson") or "{}")
    dec = pkg.get("decision") or {}
    if dec.get("outcome") != outcome:
        raise ValueError(f"{row.get('Name')} has no signed decision of {outcome!r} (it shows {dec.get('outcome') or 'none'})")
    determination = next((d for d in repo.rows("SSDecision", sol) if d.get("DecisionId") == dec.get("decisionId")), None)
    if not determination or determination.get("Outcome") != outcome or not determination.get("DocumentText"):
        raise ValueError(f"The signed determination for {row.get('Name')} isn't on the record")
    letter = next((c for c in repo.rows(LETTERS, sol) if c.get("CorrespondenceId") == dec.get("letterId")), None)
    if not letter or letter.get("Status") not in ("Approved", "Delivered"):
        raise ValueError(f"The signed notice for {row.get('Name')} isn't on the record")
    return contract, row, pkg, dec, determination, letter


def _file(sol: str, contract: dict, path: str, title: str, text: str) -> str:
    header = f"{contract.get('Agency') or ''} | {contract.get('ContractNumber') or sol} | {contract.get('Title') or ''}"
    repo.upload(repo.RECORDS_BUCKET, path, records.render(title, header, [("", text)], banner=records.RELEASED_BANNER))
    return f"{repo.RECORDS_BUCKET}/{path}"


def _deliver(sol: str, contract: dict, letter: dict, path: str, title: str, now: str) -> None:
    """File a signed letter and mark it delivered; a retry never re-sends one already delivered."""
    if letter.get("Status") != "Delivered":
        repo.upsert(LETTERS, "CorrespondenceId", [{"CorrespondenceId": letter["CorrespondenceId"], "SolicitationId": sol, "Status": "Delivered",
                                                    "DeliveredAt": now, "FilePath": _file(sol, contract, path, title, letter["Text"])}])


def _resolve(sol: str, row: dict, now: str) -> None:
    """Clear the option's or extension's item; the refresh raises the next one, if there is one."""
    aid = f"{sol}-extension-EXT" if admin.is_extension_clause(row) else f"{sol}-option-{admin.period_code(row['Name'])}"
    repo.upsert(ALERTS, "AlertId", [{"AlertId": a["AlertId"], "SolicitationId": sol, "Status": "Resolved", "ResolvedAt": now}
                                    for a in repo.rows(ALERTS, sol) if a.get("AlertId") == aid and a.get("Status") != "Resolved"])


def _history(pkg: dict, dec: dict) -> str:
    """What stays on the row once a decision is filed: the decisions so far, so the next package starts fresh."""
    # The last two only: each decision's full record is its SSDecision and audit row, and the row has 10,000 characters.
    keep = {k: dec.get(k) for k in ("outcome", "period", "months", "start", "end", "amount", "number", "by", "at")} | {"reason": (dec.get("reason") or "")[:120]}
    return json.dumps({"history": ((pkg.get("history") or []) + [{"stage": pkg.get("stage"), **keep}])[-2:]}, separators=(",", ":"))


@traced(name="IssueOptionExercise", run_type="uipath")
def issue_option_exercise(input: OptionInput) -> RecordOutput:
    """After the CO signs an exercise: file the determination, the notice and the modification, obligate the funds by
    line item, and put the new period on the schedule. An extension adds Extension 1, 2, ... and moves the clause on to
    what remains; the monthly report and the final evaluation move to the new end."""
    out = RecordOutput()
    try:
        sol, sid = input.solicitationId, input.scheduleId
        contract, row, pkg, dec, determination, letter = _decided(sol, sid, "Exercised")
        mod = next((m for m in repo.rows(MODS, sol) if m.get("ModificationId") == dec.get("modificationId")), None)
        if not mod or mod.get("Status") not in ("Signed", "Issued"):
            raise ValueError(f"Modification {dec.get('number')} for {row.get('Name')} isn't signed")
        now = repo.now()
        today = clocks.day_of(now)
        number = mod["Number"]
        base = f"{sol}/modifications/{number}"
        if mod.get("Status") != "Issued":
            _file(sol, contract, f"{base}-Determination.pdf", "Determination and Findings", determination["DocumentText"])
            repo.upsert(MODS, "ModificationId", [{"ModificationId": mod["ModificationId"], "SolicitationId": sol, "Status": "Issued",
                                                  "FilePath": _file(sol, contract, f"{base}.pdf", f"Modification {number}", mod["Text"])}])
        _deliver(sol, contract, letter, f"{base}-Notice.pdf", "Notice of option exercise", now)
        fy = admin.fiscal_year(dec["start"])
        lines = admin.decided_lines(pkg, dec)
        repo.upsert(FUNDING, "FundingId", [{"FundingId": f"{sol}-Obligation-{number}-{x['clin']}", "SolicitationId": sol, "Kind": "Obligation",
                                            "Reference": number, "Clin": x["clin"], "Period": dec["period"], "Amount": x["amount"], "Status": "Obligated",
                                            "ReceivedDay": today, "Appropriation": dec.get("appropriation") or pkg.get("appropriation"),
                                            "FundsExpireDay": f"{fy}-09-30"} for x in lines if x.get("amount")])
        schedule = repo.rows(SCHEDULE, sol)
        abstract = json.loads(contract.get("AbstractJson") or "{}")
        award = {"AwardId": contract["AwardId"], "SolicitationId": sol}
        if pkg.get("kind") == "extension":
            n = int(str(dec["period"]).split()[-1])
            old_end = admin.term_end(schedule)
            after = admin.add_days(dec["end"], 1)
            left = admin.months_between(after, row["EndDay"]) if after <= row["EndDay"] else 0
            writes = [{"ScheduleId": f"{sol}-extension-EXT{n}", "SolicitationId": sol, "Kind": "Extension", "Name": dec["period"], "Period": dec["period"],
                       "StartDay": dec["start"], "EndDay": dec["end"], "Amount": dec["amount"], "Status": "Exercised", "Owner": admin.CO, "ClauseRef": "52.217-8"},
                      {"ScheduleId": sid, "SolicitationId": sol, "StartDay": after, "DueDay": admin.deadline(admin.add_days(dec["end"], -int(pkg.get("noticeDays") or 0))),
                       "Status": "Planned" if left else "Used", "ProcessInstanceId": None, "ReviewJson": _history(pkg, dec)}]
            # The monthly report runs to the new end, and the final evaluation comes due at it.
            writes += [{"ScheduleId": r["ScheduleId"], "SolicitationId": sol, "EndDay": dec["end"]} for r in schedule if r.get("Recurrence") and r.get("EndDay") == old_end]
            writes += [{"ScheduleId": r["ScheduleId"], "SolicitationId": sol, "DueDay": dec["end"]} for r in schedule
                       if r.get("Kind") == "Evaluation" and str(r.get("Name")).startswith("Final") and r.get("Status") == "Due"]
            abstract["periods"] = (abstract.get("periods") or []) + [{"name": dec["period"], "start": dec["start"], "end": dec["end"]}]
            amounts = {x["clin"]: x["amount"] for x in lines}
            for c in abstract.get("clins") or []:
                if c["clin"] in amounts:
                    c.setdefault("byPeriod", {})[dec["period"]] = amounts[c["clin"]]
            award |= {"PeriodEnd": dec["end"], "AbstractJson": json.dumps(abstract)}
        else:
            writes = [{"ScheduleId": sid, "SolicitationId": sol, "Status": "Exercised", "ProcessInstanceId": None, "ReviewJson": _history(pkg, dec)}]
        repo.upsert(SCHEDULE, "ScheduleId", writes)
        repo.upsert(AWARD, "AwardId", [award])
        _resolve(sol, row, now)
        repo.audit(sol, f"{sid}-{number}", "ExtensionExercised" if pkg.get("kind") == "extension" else "OptionExercised",
                   f"{dec['period']} exercised by modification {number}: {admin.show_day(dec['start'])} to {admin.show_day(dec['end'])}, "
                   f"{admin.money(dec.get('amount'))} obligated", actor=dec.get("by") or repo.ACTOR)
        _refresh(sol)
        out.decision = "Exercised"
    except Exception as exc:
        return _fail(out, exc)
    return out


@traced(name="IssuePreliminaryNotice", run_type="uipath")
def issue_preliminary_notice(input: OptionInput) -> RecordOutput:
    """After the CO signs a preliminary notice of intent (52.217-9(a)): file it and the findings, and mark the option
    Notice sent, so its item turns to the exercise deadline. The notice doesn't commit the Government."""
    out = RecordOutput()
    try:
        sol, sid = input.solicitationId, input.scheduleId
        contract, row, pkg, dec, determination, letter = _decided(sol, sid, "Notice sent")
        now = repo.now()
        base = f"{sol}/options/{admin.period_code(row['Name'])}-Preliminary"
        if letter.get("Status") != "Delivered":
            _file(sol, contract, f"{base}-Findings.pdf", "Option findings (preliminary notice)", determination["DocumentText"])
        _deliver(sol, contract, letter, f"{base}-Notice.pdf", "Preliminary notice of intent to extend", now)
        repo.upsert(SCHEDULE, "ScheduleId", [{"ScheduleId": sid, "SolicitationId": sol, "Status": "Notice sent", "ProcessInstanceId": None,
                                              "ReviewJson": _history(pkg, dec)}])
        _resolve(sol, row, now)
        repo.audit(sol, f"{sid}-preliminary", "PreliminaryNoticeSent", f"Preliminary notice of intent to exercise {row['Name'].lower()} sent; "
                   f"the exercise is due by {admin.show_day(row.get('DueDay'))}", actor=dec.get("by") or repo.ACTOR)
        _refresh(sol)
        out.decision = "Notice sent"
    except Exception as exc:
        return _fail(out, exc)
    return out


@traced(name="RecordNotExercised", run_type="uipath")
def record_not_exercised(input: OptionInput) -> RecordOutput:
    """After the CO decides not to exercise: file the decision and the letter. An option lapses with every later one, and
    the contract ends with the last period kept, so the extension clause, the monthly report, the transition-out plan
    and the final evaluation move to that end. A declined extension closes the clause."""
    out = RecordOutput()
    try:
        sol, sid = input.solicitationId, input.scheduleId
        contract, row, pkg, dec, determination, letter = _decided(sol, sid, "Not exercised")
        now = repo.now()
        code = "EXT" if admin.is_extension_clause(row) else admin.period_code(row["Name"])
        base = f"{sol}/options/{code}-Not-Exercised"
        if letter.get("Status") != "Delivered":
            _file(sol, contract, f"{base}-Decision.pdf", "Decision not to exercise", determination["DocumentText"])
        _deliver(sol, contract, letter, f"{base}-Notice.pdf", "Notice: option not exercised", now)
        schedule = repo.rows(SCHEDULE, sol)
        if admin.is_extension_clause(row):
            writes = [{"ScheduleId": sid, "SolicitationId": sol, "Status": "Not exercised", "ProcessInstanceId": None, "ReviewJson": _history(pkg, dec)}]
            award = {}
        else:
            lapsed = [r for r in schedule if r.get("Kind") == "Option" and r.get("Status") in ("Planned", "Notice sent") and r["StartDay"] >= row["StartDay"]]
            names = {r["Period"] for r in lapsed}
            writes = [{"ScheduleId": r["ScheduleId"], "SolicitationId": sol, "Status": "Not exercised", "ProcessInstanceId": None,
                       **({"ReviewJson": _history(pkg, dec)} if r["ScheduleId"] == sid else {})} for r in lapsed]
            kept = [r for r in schedule if r.get("Kind") in ("Period", "Option") and r["ScheduleId"] not in {x["ScheduleId"] for x in lapsed}]
            end = max(r["EndDay"] for r in kept)
            old_end = max(r["EndDay"] for r in schedule if r.get("Kind") in ("Period", "Option"))
            last = max(kept, key=lambda r: r["EndDay"])["Period"]
            abstract = json.loads(contract.get("AbstractJson") or "{}")
            notice_days = int((admin.clause_of(abstract, "52.217-8").get("fill") or {}).get("noticeDaysBeforeExpiry") or admin.EXTENSION_NOTICE_DAYS)
            for r in schedule:
                if admin.is_extension_clause(r) and r.get("Status") == "Planned":
                    after = admin.add_days(end, 1)
                    writes.append({"ScheduleId": r["ScheduleId"], "SolicitationId": sol, "StartDay": after,
                                   "EndDay": admin.add_days(admin.add_months(after, admin.months_between(r["StartDay"], r["EndDay"])), -1),
                                   "DueDay": admin.deadline(admin.add_days(end, -notice_days))})
                elif r.get("Recurrence") and r.get("EndDay") == old_end:
                    writes.append({"ScheduleId": r["ScheduleId"], "SolicitationId": sol, "EndDay": end})
                elif r.get("Kind") == "Deliverable" and r.get("Code") == "A002" and r.get("Status") == "Due":
                    writes.append({"ScheduleId": r["ScheduleId"], "SolicitationId": sol, "DueDay": admin.deadline(admin.add_days(end, -admin.TRANSITION_OUT_DAYS)),
                                   "Period": last})
                elif r.get("Kind") == "Evaluation" and r.get("Period") in names:
                    writes.append({"ScheduleId": r["ScheduleId"], "SolicitationId": sol, "Status": "Waived"})
                elif r.get("Kind") == "Evaluation" and r.get("Period") == last:
                    writes.append({"ScheduleId": r["ScheduleId"], "SolicitationId": sol, "Name": "Final evaluation"})
            award = {"PeriodEnd": end}
        repo.upsert(SCHEDULE, "ScheduleId", writes)
        if award:
            repo.upsert(AWARD, "AwardId", [{"AwardId": contract["AwardId"], "SolicitationId": sol, **award}])
        _resolve(sol, row, now)
        repo.audit(sol, f"{sid}-not-exercised", "ExtensionNotExercised" if admin.is_extension_clause(row) else "OptionNotExercised",
                   f"{'The extension of services' if admin.is_extension_clause(row) else row['Name']} not exercised" + (f": {dec['reason']}" if dec.get("reason") else ""),
                   actor=dec.get("by") or repo.ACTOR)
        _refresh(sol)
        out.decision = "Not exercised"
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
    scheduleId: str = ""


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
    "PrepareDeliverableReview": (prepare_deliverable_review, ReviewInput, "review"),
    "RecordDeliverableReview": (record_deliverable_review, ReviewInput, "decision"),
    "PrepareOptionPackage": (prepare_option_package, OptionInput, "package"),
    "IssueOptionExercise": (issue_option_exercise, OptionInput, "decision"),
    "IssuePreliminaryNotice": (issue_preliminary_notice, OptionInput, "decision"),
    "RecordNotExercised": (record_not_exercised, OptionInput, "decision"),
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
