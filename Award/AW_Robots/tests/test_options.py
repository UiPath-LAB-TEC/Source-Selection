"""Slice B: the option package (admin.option_package and the writer's drafts held to it), the decision steps that file
an exercise, a preliminary notice or a decision not to exercise, and the watch starting packages on its own. The
incumbent's extension of services is the demo's own case (scope §21)."""
import json
import sys

import pytest

import admin
import letters
import main
import repo
from conftest import PLAN, ROOT, SOL
from test_admin import KEYSTONE, SIGNED, SUCCESSOR

sys.path.insert(0, str(ROOT / "tools"))
import generate_incumbent as incumbent  # noqa: E402

OLD = incumbent.SOL
EXT = f"{OLD}-extension-EXT"
FOLLOW_SCHEDULE = [{"ScheduleId": f"{SOL}-milestone-TI", "SolicitationId": SOL, "Code": "TI", "Kind": "Milestone", "DueDay": "2026-12-22"}]
# The follow-on as the record has it once signed: its contract abstract carries Keystone's competed prices.
FOLLOW_ABSTRACT = admin.build_schedule(SOL, PLAN, letters.award_summary(PLAN, {"SolicitationId": SOL}, KEYSTONE, None), "2026-10-23")[2]
FOLLOW_ON = dict(SUCCESSOR, PeriodStart="2026-10-23", AbstractJson=json.dumps(FOLLOW_ABSTRACT))


def seeded():
    return incumbent.build("2026-10-23")


def package(as_of="2026-10-27", successor=FOLLOW_ON, rows=None, vendor=True):
    rows = rows or seeded()
    contract = rows["SSAward"][0]
    row = next(r for r in rows["SSSchedule"] if r["ScheduleId"] == EXT)
    live = [{**a, "Status": "Open"} for a in admin.alerts(contract, rows["SSSchedule"], rows["SSFunding"], [], as_of, successor)[0]]
    return admin.option_package(contract, row, rows["SSSchedule"], rows["SSFunding"], [], rows["SSRefVendor"][0] if vendor else None,
                                successor, FOLLOW_SCHEDULE if successor else [], live, as_of)


def checks(pkg):
    return {c["id"]: c for c in pkg["checks"]}


# ── The package ─────────────────────────────────────────────────────────────

def test_the_incumbent_extension_package_on_demo_day():
    pkg = package()
    assert (pkg["stage"], pkg["name"], pkg["noticeBy"], pkg["daysLeft"], pkg["late"]) == ("extension", "Extension 1", "2026-10-30", 3, False)
    prop = pkg["proposal"]
    # The follow-on can be protested until Nov 2, after the Oct 30 notice day: one month, and the next notice day (Dec 2) falls after it.
    assert (prop["months"], prop["start"], prop["end"]) == (1, "2027-01-01", "2027-01-31")
    assert "Dec 2" in prop["reason"] and "protest window until Nov 2" in prop["reason"]
    assert round(prop["amount"]) == 290_000 and [x["clin"] for x in prop["lines"]] == ["0001", "0002", "0003", "0004"]
    assert pkg["modification"] == "P00012" and pkg["appropriation"] == "Operation and maintenance, Army, FY2027"
    c = checks(pkg)
    assert {k: v["status"] for k, v in c.items()} == {
        "notice": "Met", "funds": "To confirm", "requirement": "To confirm", "synopsis": "Met", "exclusion": "Met", "performance": "Met",
        "price": "To confirm", "competition": "Met", "duration": "Met", "registration": "Met", "sprs": "Met", "cmmc": "Not required"}
    assert "4% below" in c["price"]["finding"] and "Keystone" not in c["price"]["finding"]   # the follow-on is named by number in the price finding
    assert "transition-out plan (due Oct 2) not yet received" in c["performance"]["finding"]
    assert c["registration"]["finding"].startswith("Active through Feb 14, 2027")


def test_the_writer_gets_plain_facts_for_need_ceiling_and_price():
    """What the first live run got wrong (scope §21.4), now stated as facts: why the work is needed, how close line 0002 is
    to its ceiling, and each line's price against the follow-on's."""
    c = checks(package())
    need = c["requirement"]["facts"]
    assert need["followOnInPlaceBeforeEnd"] is True and "risk that a GAO protest filed by Nov 2" in need["whyNeeded"]
    assert "set to take over on time" in c["requirement"]["finding"]
    perf = c["performance"]["facts"]
    assert perf["laborHourCeilings"] == [{"clin": "0002", "percentOfCeiling": 87, "past85": True, "overCeiling": False, "contractorNoticeOnFile": False}]
    assert "past the 85% notice point, not over the ceiling" in c["performance"]["finding"]
    assert [x["item"] for x in perf["openItems"]] == ["Line item 0002 near its ceiling: no notice from Ostrander Analytics Group Inc", "Transition-out plan is late"]
    price = c["price"]["facts"]
    assert price["notable"] == ["0002", "0004", "0001", "0003"]                               # biggest difference first
    line = {x["clin"]: x for x in price["comparison"]}
    assert (line["0002"]["direction"], line["0002"]["percent"]) == ("above", 19) and (line["0001"]["direction"], line["0001"]["percent"]) == ("below", -13)
    assert "0002 (Data engineering support) is 19% above it" in c["price"]["finding"]
    assert not checks(package("2026-11-05"))["requirement"]["facts"]["whyNeeded"].startswith("The follow-on is set")   # under way: no extension needed


def test_once_the_protest_window_closes_no_extension_is_proposed():
    pkg = package("2026-11-05")
    assert pkg["proposal"]["months"] == 0 and "No extension is needed" in pkg["proposal"]["reason"]
    assert checks(pkg)["notice"]["status"] == "Not met" and pkg["late"] is True and "bilateral" in checks(pkg)["notice"]["finding"]


def test_a_stayed_follow_on_needs_the_extension_to_cover_the_protest_and_its_transition_in():
    pkg = package(successor=dict(FOLLOW_ON, PerformanceStatus="Suspended"))
    assert pkg["proposal"]["months"] == 4 and pkg["proposal"]["end"] == "2027-04-30"   # Oct 27 + 100 + 60 days is Apr 5


def test_with_no_follow_on_the_whole_remaining_extension_is_proposed():
    pkg = package(successor=None)
    assert pkg["proposal"]["months"] == 6 and checks(pkg)["requirement"]["finding"].startswith("The requirement runs through")
    assert "No current market comparison" in checks(pkg)["price"]["finding"]
    six = checks(pkg)
    assert "expires before extension 1 would end" in six["registration"]["finding"] and "a new assessment is due during it" in six["sprs"]["finding"]


def test_without_a_sam_record_the_checks_ask_the_co_to_confirm():
    c = checks(package(vendor=False))
    assert (c["exclusion"]["status"], c["registration"]["status"], c["performance"]["status"]) == ("To confirm", "To confirm", "To confirm")


def test_the_writer_input_fits_orchestrators_cap():
    assert sum(len(v) for v in admin.writer_inputs(package()).values()) < 10_000


def test_the_writers_drafts_are_held_to_the_checks():
    pkg = package()
    output = {"Findings": [{"Element": "requirement", "Text": "The work must continue until Keystone takes over.", "Sources": ["requirement", "made-up"]},
                           {"Element": "price", "Text": "Rates are 4% below the follow-on's.", "Sources": ["price"]},
                           {"Element": "notice", "Text": "Not the writer's to draft.", "Sources": ["notice"]}],
              "Recommendation": "Extend", "RecommendedMonths": 9, "Reason": "Covers a protest.", "Summary": "Extend one month.", "Risks": ["Cost if no protest."]}
    texts, got = admin.checked_writing(output, pkg)
    assert set(texts) == {"requirement", "price"}                                        # the writer drafts three findings, no more
    assert got["drafted"]["requirement"]["sources"] == ["requirement"] and "left out" in got["drafted"]["requirement"]["note"]
    assert got["recommendation"] == "Extend" and got["recommendedMonths"] == 1           # 9 months is more than remain: the proposal's
    assert admin.checked_writing({"Recommendation": "Exercise"}, pkg)[1]["recommendation"] is None   # not an extension's choice
    assert admin.checked_writing(None, pkg)[1]["agent"] is False
    memo = admin.determination_draft(pkg, texts)
    assert "3. Existing need (FAR 17.204-1(b)(3)(i)). The work must continue until Keystone takes over." in memo
    assert f"2. Funds (FAR 17.204-1(b)(2)). {admin.FUNDS_FILL}" in memo and admin.DETERMINATION_FILL in memo
    assert "6. Performance" in memo and "CPARS ratings on this contract" in memo                        # the robot's own, where the writer gave none
    assert "Findings (FAR 17.204-1(b); DFARS 217.207(c))" in memo and memo.rstrip().endswith("Rock Island")


def test_an_option_package_starts_with_the_preliminary_notice():
    plan = dict(PLAN, laborHourClins=["0002", "0003"])
    schedule, funding, abstract = admin.build_schedule(SOL, plan, letters.award_summary(plan, {"SolicitationId": SOL}, KEYSTONE, None), "2026-10-23")
    contract = {"SolicitationId": SOL, "AbstractJson": json.dumps(abstract), "AwardeeName": KEYSTONE["Name"], "Agency": PLAN["agency"],
                "ContractNumber": "W52P1J-27-C-0023"}
    opt = next(r for r in schedule if r["Name"] == "Option 1")
    pkg = admin.option_package(contract, opt, schedule, funding, [], None, None, [], [], "2027-08-12", PLAN["igce"])
    assert (pkg["stage"], pkg["noticeBy"], pkg["proposal"]["amount"]) == ("preliminary", "2027-08-23", 3_640_000)
    c = checks(pkg)
    assert "IGCE" not in c["price"]["finding"] and "cost estimate" in c["price"]["finding"]
    assert c["competition"]["status"] == "Met" and c["synopsis"]["status"] == "Met" and c["cmmc"]["status"] == "To confirm"
    sent = admin.option_package(contract, dict(opt, Status="Notice sent"), schedule, funding, [], None, None, [], [], "2027-10-01")
    assert (sent["stage"], sent["noticeBy"]) == ("exercise", "2027-10-22")
    assert admin.option_package(contract, next(r for r in schedule if r["ScheduleId"].endswith("-extension-EXT")), schedule, funding, [], None, None, [], [],
                                "2027-08-12")["checks"][7]["status"] == "To confirm"   # this contract's extension wasn't evaluated at award


def test_the_next_modification_number_follows_the_contract():
    assert admin.next_modification(seeded()["SSFunding"], []) == "P00012"
    assert admin.next_modification(seeded()["SSFunding"], [{"Number": "P00012"}]) == "P00013"
    assert admin.next_modification([], []) == "P00001"


# ── The steps ───────────────────────────────────────────────────────────────

@pytest.fixture
def old(record, monkeypatch):
    """The incumbent seeded, the follow-on linked, and the writer agent faked."""
    db = record["db"]
    for entity, rows in seeded().items():
        db.setdefault(entity, []).extend(dict(r) for r in rows)
    db["SSAward"].append({**FOLLOW_ON, "Phase": "Administration"})
    db["SSSchedule"] += [dict(r) for r in FOLLOW_SCHEDULE]
    db.setdefault("SSAlert", [])
    monkeypatch.setattr(repo, "now", lambda: "2026-10-27T14:00:00+00:00")
    record["agent"] = {"state": "Successful", "output": {
        "Findings": [{"Element": "requirement", "Text": "The work must go on until Keystone takes over.", "Sources": ["requirement"]},
                     {"Element": "performance", "Text": "Acceptable, with the transition-out plan late.", "Sources": ["performance"]},
                     {"Element": "price", "Text": "4% below the follow-on's competed prices.", "Sources": ["price"]}],
        "Recommendation": "Extend", "RecommendedMonths": 1, "Reason": "Covers a protest of the follow-on.", "Summary": "Extend one month.", "Risks": []}}
    calls = []
    monkeypatch.setattr(repo, "start_agent", lambda name, inputs: calls.append((name, inputs)) or f"job-{len(calls)}")
    monkeypatch.setattr(repo, "wait_jobs", lambda keys, timeout_s=900: {k: (record["agent"]["state"], record["agent"]["output"]) for k in keys})
    record["calls"] = calls
    return record


def row(record, sid=EXT):
    return next(r for r in record["db"]["SSSchedule"] if r["ScheduleId"] == sid)


def prepare(sid=EXT):
    return json.loads(main.run(main.RobotInput(step="PrepareOptionPackage", solicitationId=OLD, scheduleId=sid)).content)


def sign(record, outcome, months=1, sid=EXT):
    """What the Contracting Officer's form writes when Dana signs: the decision on the package, the signed determination,
    the notice and, on exercise, the modification."""
    db = record["db"]
    pkg = json.loads(row(record, sid)["ReviewJson"])
    p, ids = pkg["proposal"], pkg["ids"]
    amount = round(sum(x["monthly"] * months for x in p["lines"]), 2)
    draft = next(d for d in db["SSDecision"] if d["DecisionId"] == ids["decision"])
    draft.update(Outcome=outcome, DocumentText=draft["DocumentText"].replace(admin.FUNDS_FILL, "Certified.").replace(admin.DETERMINATION_FILL, "Exercise."),
                 DecidedBy="Contracting Officer")
    db["SSCorrespondence"].append({"CorrespondenceId": ids["letter"], "SolicitationId": OLD, "Kind": "ExtensionNotice", "Status": "Approved",
                                   "Text": "Notice ... /s/ Dana Whitfield"})
    if outcome == "Exercised":
        db.setdefault("SSModification", []).append({"ModificationId": ids["modification"], "SolicitationId": OLD, "Number": pkg["modification"],
                                                    "Status": "Signed", "Text": "Modification ...", "Amount": amount})
    pkg["decision"] = {"outcome": outcome, "period": pkg["name"], "months": months, "start": p["start"],
                       "end": admin.add_days(admin.add_months(p["start"], months), -1) if months else None, "amount": amount,
                       "decisionId": ids["decision"], "letterId": ids["letter"], "modificationId": ids["modification"], "number": pkg["modification"],
                       "appropriation": pkg["appropriation"], "by": "Dana Whitfield", "reason": "" if outcome == "Exercised" else "Not needed."}
    row(record, sid)["ReviewJson"] = json.dumps(pkg)


def test_prepare_writes_the_package_with_the_writers_findings(old):
    out = prepare()
    name, inputs = old["calls"][0]
    assert name == "AW_OptionWriter" and json.loads(inputs["decision"])["allowedActions"] == ["Extend", "Do not extend"]
    stored = json.loads(row(old)["ReviewJson"])
    assert stored == out and "facts" not in stored["checks"][0] and len(row(old)["ReviewJson"]) < 8_000   # room for the funds and the decision
    w = stored["writer"]
    assert set(w["drafted"]) == set(admin.AGENT_ELEMENTS) and (w["recommendation"], w["recommendedMonths"], stored["proposal"]["months"]) == ("Extend", 1, 1)
    assert stored["ids"] == {"decision": f"{OLD}-EXT-1", "letter": f"{OLD}-EXT-1-Notice", "modification": f"{OLD}-P00012"}
    draft = next(d for d in old["db"]["SSDecision"] if d["DecisionId"] == f"{OLD}-EXT-1")
    assert (draft["Kind"], draft["Outcome"]) == ("Extension", "Draft") and "Acceptable, with the transition-out plan late." in draft["DocumentText"]
    assert [a for a, _ in old["audit"]] == ["OptionPackagePrepared"] and "recommends: Extend, 1 month" in old["audit"][0][1]


def test_prepare_refuses_an_extension_already_decided(old):
    row(old)["Status"] = "Not exercised"
    with pytest.raises(main.StepFailed, match="not exercised, so there's nothing to decide"):
        prepare()


def test_an_exercised_extension_adds_the_period_its_money_and_the_next_decision(old):
    prepare()
    sign(old, "Exercised")
    db = old["db"]
    db["SSAlert"].append({"AlertId": f"{OLD}-extension-EXT", "SolicitationId": OLD, "Kind": "extension", "Status": "Acknowledged", "Severity": "Due soon"})
    assert main.run(main.RobotInput(step="IssueOptionExercise", solicitationId=OLD, scheduleId=EXT)).content == "Exercised"
    ext1 = row(old, f"{OLD}-extension-EXT1")
    assert (ext1["Status"], ext1["StartDay"], ext1["EndDay"], ext1["Period"]) == ("Exercised", "2027-01-01", "2027-01-31", "Extension 1")
    clause = row(old)
    assert (clause["Status"], clause["StartDay"], clause["DueDay"], clause["ProcessInstanceId"]) == ("Planned", "2027-02-01", "2026-12-02", None)
    assert json.loads(clause["ReviewJson"])["history"][0]["number"] == "P00012"
    money = [f for f in db["SSFunding"] if f["Reference"] == "P00012"]
    assert len(money) == 4 and round(sum(f["Amount"] for f in money)) == 290_000 and {f["Period"] for f in money} == {"Extension 1"}
    award = next(a for a in db["SSAward"] if a["AwardId"] == incumbent.AWARD_ID)
    assert award["PeriodEnd"] == "2027-01-31" and json.loads(award["AbstractJson"])["clins"][0]["byPeriod"]["Extension 1"] == 115_000
    assert row(old, f"{OLD}-deliverable-A001")["EndDay"] == "2027-01-31" and row(old, f"{OLD}-evaluation-OY4")["DueDay"] == "2027-01-31"
    assert next(m for m in db["SSModification"])["Status"] == "Issued" and db["SSCorrespondence"][-1]["Status"] == "Delivered"
    assert {p.rsplit("/", 1)[-1] for p in old["uploads"]} == {"P00012.pdf", "P00012-Determination.pdf", "P00012-Notice.pdf"}
    ext = next(a for a in db["SSAlert"] if a["AlertId"] == f"{OLD}-extension-EXT")
    assert ext["Status"] == "Open" and ext["Title"] == "Further extension: decide by Dec 2" and "5 more months" in ext["Detail"]
    assert "ExtensionExercised" in [a for a, _ in old["audit"]]
    # In January the watch reads the extension as the period running, at the rates it was exercised at.
    period = admin.current_period(db["SSSchedule"], "2027-01-15")
    assert period["Period"] == "Extension 1"
    lines = admin.forecast(json.loads(award["AbstractJson"]), [f for f in db["SSFunding"] if f["SolicitationId"] == OLD], period, "2027-01-15")
    assert lines["0001"]["price"] == 115_000 and lines["0001"]["obligated"] == 115_000


def test_issuing_twice_files_once(old):
    prepare()
    sign(old, "Exercised")
    main.run(main.RobotInput(step="IssueOptionExercise", solicitationId=OLD, scheduleId=EXT))
    uploads = dict(old["uploads"])
    old["uploads"].clear()
    row(old)["ReviewJson"] = json.dumps({**json.loads(row(old)["ReviewJson"]), "decision": json.loads(row(old)["ReviewJson"]).get("decision")})
    with pytest.raises(main.StepFailed, match="no signed decision"):
        main.run(main.RobotInput(step="IssueOptionExercise", solicitationId=OLD, scheduleId=EXT))   # the decision was filed and cleared
    assert old["uploads"] == {} and uploads


def test_a_declined_extension_closes_the_clause(old):
    prepare()
    sign(old, "Not exercised", months=0)
    assert main.run(main.RobotInput(step="RecordNotExercised", solicitationId=OLD, scheduleId=EXT)).content == "Not exercised"
    assert row(old)["Status"] == "Not exercised"
    assert not [a for a in old["db"]["SSAlert"] if a["AlertId"] == f"{OLD}-extension-EXT" and a["Status"] != "Resolved"]
    assert any(p.endswith("EXT-Not-Exercised-Notice.pdf") for p in old["uploads"])


def test_issue_refuses_a_decision_nobody_signed(old):
    prepare()
    with pytest.raises(main.StepFailed, match="no signed decision of 'Exercised'"):
        main.run(main.RobotInput(step="IssueOptionExercise", solicitationId=OLD, scheduleId=EXT))


# ── Options on the follow-on: the preliminary notice, then letting one go ───

@pytest.fixture
def follow(record):
    db = record["db"]
    plan = dict(PLAN, laborHourClins=["0002", "0003"])
    db["SSSolicitation"][0]["PlanJson"] = json.dumps(plan)
    db["SSDecision"].append({"DecisionId": f"{SOL}-contract", "SolicitationId": SOL, "Kind": "Contract", "Outcome": "Awarded", "DecidedAt": SIGNED})
    db["SSOfferor"][0].update(PriceLinesJson=KEYSTONE["PriceLinesJson"])
    db["SSAward"].append({"AwardId": f"{SOL}-award", "SolicitationId": SOL, "Stage": "Debriefings", "ContractNumber": "W52P1J-27-C-0023"})
    db["SSSchedule"], db["SSFunding"], db["SSAlert"] = [], [], []
    main.run(main.RobotInput(step="OpenAdministration", solicitationId=SOL))
    return record


def decide_option(record, name, outcome):
    sid = f"{SOL}-period-{admin.period_code(name)}"
    r = row(record, sid)
    pkg = {"kind": "option", "stage": "preliminary" if r["Status"] == "Planned" else "exercise", "name": name, "proposal": {"lines": []},
           "decision": {"outcome": outcome, "decisionId": f"{sid}-d", "letterId": f"{sid}-l", "by": "Dana Whitfield", "reason": "The need ends."}}
    r["ReviewJson"] = json.dumps(pkg)
    record["db"]["SSDecision"].append({"DecisionId": f"{sid}-d", "SolicitationId": SOL, "Outcome": outcome, "DocumentText": "Findings ..."})
    record["db"]["SSCorrespondence"].append({"CorrespondenceId": f"{sid}-l", "SolicitationId": SOL, "Status": "Approved", "Text": "Notice ..."})
    return sid


def test_a_preliminary_notice_turns_the_option_to_its_exercise(follow, monkeypatch):
    monkeypatch.setattr(repo, "now", lambda: "2027-08-12T14:00:00+00:00")
    sid = decide_option(follow, "Option 1", "Notice sent")
    assert main.run(main.RobotInput(step="IssuePreliminaryNotice", solicitationId=SOL, scheduleId=sid)).content == "Notice sent"
    assert row(follow, sid)["Status"] == "Notice sent"
    opt = next(a for a in follow["db"]["SSAlert"] if a["AlertId"] == f"{SOL}-option-OY1")
    assert opt["Status"] == "Open" and opt["Title"] == "Option 1: exercise due Oct 22"


def test_letting_an_option_go_ends_the_contract_with_the_last_period_kept(follow, monkeypatch):
    monkeypatch.setattr(repo, "now", lambda: "2029-08-01T14:00:00+00:00")
    db = follow["db"]
    for r in db["SSSchedule"]:
        if r["Name"] in ("Option 1", "Option 2"):
            r["Status"] = "Exercised"
    sid = decide_option(follow, "Option 3", "Not exercised")
    assert main.run(main.RobotInput(step="RecordNotExercised", solicitationId=SOL, scheduleId=sid)).content == "Not exercised"
    assert {r["Name"]: r["Status"] for r in db["SSSchedule"] if r["Kind"] == "Option"} == {
        "Option 1": "Exercised", "Option 2": "Exercised", "Option 3": "Not exercised", "Option 4": "Not exercised"}
    assert admin.term_end(db["SSSchedule"]) == "2029-10-22"
    clause = row(follow, f"{SOL}-extension-EXT")
    assert (clause["StartDay"], clause["EndDay"], clause["DueDay"]) == ("2029-10-23", "2030-04-22", "2029-09-21")   # 30 days before, back to a Friday
    assert row(follow, f"{SOL}-deliverable-A002")["DueDay"] == "2029-07-24" and row(follow, f"{SOL}-evaluation-OY2")["Name"] == "Final evaluation"
    assert {row(follow, f"{SOL}-evaluation-OY3")["Status"], row(follow, f"{SOL}-evaluation-OY4")["Status"]} == {"Waived"}
    assert next(a for a in db["SSAward"] if a["SolicitationId"] == SOL)["PeriodEnd"] == "2029-10-22"


# ── The watch starts packages on its own ────────────────────────────────────

@pytest.fixture
def emails(old):
    award = next(a for a in old["db"]["SSAward"] if a["AwardId"] == incumbent.AWARD_ID)
    award.update(CoEmail="co@agency.example", RmEmail="rm@agency.example")
    return old


def test_the_watch_starts_the_extension_package_once(emails, monkeypatch):
    started = []
    monkeypatch.setattr(main, "_start_package", lambda sol, r, co, rm: started.append((sol, r["ScheduleId"], co, rm)) or "instance-9")
    main.run(main.RobotInput(step="WatchContracts", asOf="2026-10-27"))
    assert started == [(OLD, EXT, "co@agency.example", "rm@agency.example")] and row(emails)["ProcessInstanceId"] == "instance-9"
    main.run(main.RobotInput(step="WatchContracts", asOf="2026-10-27"))
    assert len(started) == 1
    ext = next(a for a in emails["db"]["SSAlert"] if a["AlertId"] == f"{OLD}-extension-EXT")
    assert "The option package is under way" in ext["Detail"]


def test_the_watch_leaves_a_dismissed_extension_alone(emails, monkeypatch):
    emails["db"]["SSAlert"].append({"AlertId": f"{OLD}-extension-EXT", "SolicitationId": OLD, "Kind": "extension", "Severity": "Due soon", "Status": "Dismissed",
                                    "Title": "Extension of services: decide by Oct 30"})
    started = []
    monkeypatch.setattr(main, "_start_package", lambda *a: started.append(a) or "x")
    main.run(main.RobotInput(step="WatchContracts", asOf="2026-10-27"))
    assert started == []
