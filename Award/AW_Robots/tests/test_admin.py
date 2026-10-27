"""The contract administration rules (admin.py) and the watch steps, on the two Army contracts: the incumbent's in its
last months (tools/generate_incumbent.py, the demo data itself) and the follow-on just signed (conftest.record)."""
import json
import sys

import pytest

import admin
import letters
import main
from conftest import OFFERORS, PLAN, ROOT, SOL

sys.path.insert(0, str(ROOT / "tools"))
import generate_incumbent as incumbent  # noqa: E402

# Keystone as the live record has it: the price schedule's real line items, transition-in last.
LINES = [("0001", "Platform build and analytics operations", 7_900_000), ("0002", "Data integration and engineering", 4_850_000),
         ("0003", "Cybersecurity and RMF support", 3_450_000), ("0004", "Program management", 2_000_000), ("0005", "Transition-in", 1_100_000)]
KEYSTONE = dict(OFFERORS[0], PriceLinesJson=json.dumps([{"clin": c, "description": d, "amount": a} for c, d, a in LINES]))
SIGNED = "2026-10-23T15:32:28+00:00"
SUCCESSOR = {"AwardId": incumbent.SUCCESSOR, "SolicitationId": SOL, "ContractNumber": "W52P1J-27-C-0023", "AwardeeName": KEYSTONE["Name"],
             "Stage": "Debriefings", "ClocksJson": json.dumps({"stayByAward": "2026-11-02"})}


def incumbent_alerts(today, as_of=None, letters_=()):
    rows = incumbent.build(today)
    return admin.alerts(rows["SSAward"][0], rows["SSSchedule"], rows["SSFunding"], list(letters_), as_of or today, SUCCESSOR)


def by_kind(alerts):
    return {a["Kind"]: a for a in alerts}


# ── The incumbent: what the demo promises (scope §17.11) ────────────────────

def test_the_incumbent_shows_its_seven_alerts_on_the_seeding_day():
    alerts, funds = incumbent_alerts("2026-10-23")
    got = {a["Kind"]: a["Severity"] for a in alerts}
    assert got == {"extension": "Due soon", "ceiling": "Overdue", "funds": "Upcoming", "invoice": "Due soon", "deliverable": "Overdue",
                   "evaluation": "Upcoming", "registration": "Upcoming"}
    k = by_kind(alerts)
    assert k["extension"]["DueDay"] == "2026-10-30"          # 60 days before Dec 31 is Sunday Nov 1: back to Friday
    assert "protest window" in k["extension"]["Detail"] and "Nov 2" in k["extension"]["Detail"]
    assert k["ceiling"]["Subject"] == "0002-OY4" and "No notice is on file" in k["ceiling"]["Detail"] and "Dec 11" in k["ceiling"]["Detail"]
    assert k["funds"]["DueDay"] == "2026-11-26" and "35 days before the period ends" in k["funds"]["Detail"]
    assert k["invoice"]["Subject"] == "OAG-2609" and k["invoice"]["DueDay"] == "2026-11-05"
    assert k["deliverable"]["Title"] == "Transition-out plan is late"
    assert k["registration"]["DueDay"] == "2027-02-14"
    assert {o for a in alerts for o in a["Owner"].split(",")} == {admin.CO, admin.COR, admin.RM}
    assert funds["period"] == "Option 4" and len(funds["lines"]) == 4


@pytest.mark.parametrize("today", ["2026-10-23", "2027-02-10", "2027-06-30", "2026-12-07"])
def test_the_incumbent_tells_the_same_story_whatever_day_it_is_seeded(today):
    """The dates move with the run day; the alerts don't (no stray funds alert from months of different lengths)."""
    alerts, _ = incumbent_alerts(today)
    assert {a["Kind"]: a["Severity"] for a in alerts} == {
        "extension": "Due soon", "ceiling": "Overdue", "funds": "Upcoming", "invoice": "Due soon", "deliverable": "Overdue",
        "evaluation": "Upcoming", "registration": "Upcoming"}
    assert [a["Subject"] for a in alerts if a["Kind"] == "funds"] == ["0002-OY4"]


def test_a_contractor_ceiling_notice_on_file_quiets_the_ceiling_alert():
    notice = {"CorrespondenceId": f"{incumbent.SOL}-ContractorNotice-0002-OY4-1", "Kind": "ContractorNotice", "SolicitationId": incumbent.SOL}
    alerts, _ = incumbent_alerts("2026-10-23", letters_=[notice])
    assert "ceiling" not in by_kind(alerts)
    later, _ = incumbent_alerts("2026-10-23", as_of="2026-11-20", letters_=[notice])
    assert by_kind(later)["ceiling"]["Title"] == "Line item 0002 reaches its ceiling around Dec 11"


def test_the_extension_alert_goes_once_the_contract_ends():
    alerts, _ = incumbent_alerts("2026-10-23", as_of="2027-01-04")
    assert "extension" not in by_kind(alerts)


def test_the_incumbent_pdf_carries_the_banner_and_the_clause_fill_ins():
    import records
    seen = {}
    real = records.render
    records.render = lambda title, header, sections, sled=False, banner=None: seen.update(sections=sections, banner=banner) or b"%PDF"
    try:
        incumbent.contract_pdf(incumbent.build("2026-10-23"))
    finally:
        records.render = real
    text = "\n".join(body for _, body in seen["sections"])
    assert seen["banner"] == records.RELEASED_BANNER
    assert "at least 60 days before the contract expires" in text and "exceed 85 percent of the ceiling" in text and "A002" in text


# ── The follow-on just signed: its schedule from the solicitation's terms ───

@pytest.fixture
def follow_on():
    plan = dict(PLAN, laborHourClins=["0002", "0003"])
    summary = letters.award_summary(plan, {"SolicitationId": SOL}, KEYSTONE, None)
    return admin.build_schedule(SOL, plan, summary, "2026-10-23")


def test_the_follow_on_runs_a_base_year_from_signing_and_four_options(follow_on):
    schedule, funding, abstract = follow_on
    periods = [r for r in schedule if r["Kind"] in ("Period", "Option")]
    assert [(r["Name"], r["StartDay"], r["EndDay"]) for r in periods[:2]] == [("Base", "2026-10-23", "2027-10-22"), ("Option 1", "2027-10-23", "2028-10-22")]
    assert len(periods) == 5 and periods[-1]["EndDay"] == "2031-10-22"
    assert (periods[1]["NoticeDay"], periods[1]["DueDay"]) == ("2027-08-23", "2027-10-22")   # 60 days before the base year ends
    assert periods[0]["Amount"] == 4_740_000 and periods[1]["Amount"] == 3_640_000          # transition-in falls in the base year
    assert round(sum(r["Amount"] for r in periods), 2) == 19_300_000
    assert round(sum(f["Amount"] for f in funding), 2) == 4_740_000 and {f["Period"] for f in funding} == {"Base"}
    assert [c["type"] for c in abstract["clins"]] == ["Firm-fixed-price", "Labor-hour", "Labor-hour", "Firm-fixed-price", "Firm-fixed-price"]
    milestones = {r["Code"]: r["DueDay"] for r in schedule if r["Kind"] == "Milestone"}
    assert milestones == {"PAOC": "2026-11-06", "TI": "2026-12-22"}                          # Nov 7 is a Saturday


def test_the_follow_on_on_its_first_day_needs_only_the_orientation_conference(follow_on):
    schedule, funding, abstract = follow_on
    contract = {"SolicitationId": SOL, "AbstractJson": json.dumps(abstract), "AwardeeName": KEYSTONE["Name"]}
    alerts, funds = admin.alerts(contract, schedule + admin.materialize(schedule, "2026-10-23"), funding, [], "2026-10-23")
    assert [(a["Kind"], a["Severity"], a["Title"]) for a in alerts] == [("milestone", "Due soon", "Post-award orientation conference due Nov 6")]
    assert funds["period"] == "Base" and all(line["runOut"] is None for line in funds["lines"])


def test_option_alerts_step_from_upcoming_to_overdue(follow_on):
    schedule, funding, abstract = follow_on
    contract = {"SolicitationId": SOL, "AbstractJson": json.dumps(abstract), "AwardeeName": KEYSTONE["Name"]}

    def option(as_of, sched=schedule):
        return by_kind(admin.alerts(contract, sched, funding, [], as_of)[0]).get("option")

    assert option("2027-06-01") is None                          # more than 120 days before option 1 starts
    assert option("2027-07-01")["Severity"] == "Upcoming"
    assert option("2027-08-12")["Severity"] == "Due soon"         # 11 days before the preliminary notice day
    late = option("2027-08-24")
    assert late["Severity"] == "Overdue" and "can't be exercised without" in late["Detail"]
    sent = [dict(r, Status="Notice sent") if r["Name"] == "Option 1" else r for r in schedule]
    assert option("2027-08-24", sent)["Title"] == "Option 1: exercise due Oct 22"


def test_recurring_reports_get_their_next_due_rows():
    template = {"ScheduleId": f"{SOL}-deliverable-A001", "SolicitationId": SOL, "Kind": "Deliverable", "Code": "A001", "Name": "Monthly status report",
                "StartDay": "2026-10-23", "EndDay": "2031-10-22", "Recurrence": "monthly:10", "Status": "Recurring"}
    rows = admin.materialize([template], "2026-10-23")
    assert [(r["ScheduleId"], r["Name"], r["DueDay"]) for r in rows] == [(f"{SOL}-deliverable-A001-2026-11", "Monthly status report, October", "2026-11-10")]
    assert admin.materialize([template, *rows], "2026-10-23") == []
    assert [r["DueDay"] for r in admin.materialize([template], "2027-01-01")] == ["2026-11-10", "2026-12-10", "2027-01-08", "2027-02-10"]


# ── Keeping what people did with an alert ───────────────────────────────────

def alert(sev="Upcoming", **kw):
    return {"AlertId": "X-funds-0002", "SolicitationId": "X", "Kind": "funds", "Rule": "r", "Subject": "0002", "Severity": sev, "Title": "t",
            "Detail": "d", "DueDay": "2026-11-26", "Owner": admin.RM, "EvidenceJson": "{}", **kw}


def test_reconcile_opens_keeps_reopens_and_resolves():
    now = "2026-10-23T12:00:00+00:00"
    [new] = admin.reconcile([], [alert()], now)
    assert (new["Status"], new["RaisedAt"]) == ("Open", now)
    assert admin.reconcile([alert(Status="Open")], [alert()], now) == []                              # nothing changed
    assert admin.reconcile([alert(Status="Dismissed")], [alert()], now) == []                         # stays dismissed
    assert admin.reconcile([alert(Status="Dismissed")], [alert("Due soon")], now)[0]["Status"] == "Open"   # got worse
    assert admin.reconcile([alert(Status="Acknowledged")], [alert(Detail="new figures")], now)[0]["Status"] == "Acknowledged"
    [gone] = admin.reconcile([alert(Status="Open")], [], now)
    assert (gone["Status"], gone["ResolvedAt"]) == ("Resolved", now)
    assert admin.reconcile([alert(Status="Dismissed")], [], now) == []
    assert admin.reconcile([alert(Status="Resolved")], [alert()], now)[0]["Status"] == "Open"         # back again


# ── The robot steps ─────────────────────────────────────────────────────────

@pytest.fixture
def both(record):
    """The follow-on signed today with its award phase at Debriefings, and the incumbent seeded alongside it."""
    db = record["db"]
    db["SSSolicitation"][0]["PlanJson"] = json.dumps(dict(PLAN, laborHourClins=["0002", "0003"]))
    db["SSDecision"].append({"DecisionId": f"{SOL}-contract", "SolicitationId": SOL, "Kind": "Contract", "Outcome": "Awarded", "DecidedAt": SIGNED})
    db["SSAward"].append({"AwardId": f"{SOL}-award", "SolicitationId": SOL, "Stage": "Debriefings", "PredecessorId": incumbent.AWARD_ID,
                          "ClocksJson": json.dumps({"stayByAward": "2026-11-02"}), "ContractNumber": "W52P1J-27-C-0023"})
    db["SSOfferor"][0].update(PriceLinesJson=KEYSTONE["PriceLinesJson"])
    for entity, rows in incumbent.build("2026-10-23").items():
        db.setdefault(entity, []).extend(dict(r) for r in rows)
    db.setdefault("SSAlert", [])
    return record


def watch(as_of="2026-10-23"):
    return json.loads(main.run(main.RobotInput(step="WatchContracts", asOf=as_of)).content)


def test_the_watch_opens_the_follow_on_and_alerts_on_both(both):
    db = both["db"]
    out = watch()
    assert out["opened"] == [SOL]
    follow = next(a for a in db["SSAward"] if a["SolicitationId"] == SOL)
    assert (follow["Phase"], follow["Origin"], follow["CurrentPeriod"], follow["PeriodStart"]) == ("Administration", "Source Selection", "Base", "2026-10-23")
    assert follow["Stage"] == "Debriefings"                                   # the award phase carries on alongside
    kinds = {(a["SolicitationId"], a["Kind"]) for a in db["SSAlert"]}
    assert (SOL, "milestone") in kinds and (incumbent.SOL, "extension") in kinds and len([k for k in kinds if k[0] == incumbent.SOL]) == 7
    assert all(a["Status"] == "Open" for a in db["SSAlert"])
    assert any(r["ScheduleId"] == f"{incumbent.SOL}-deliverable-A001-2026-11" for r in db["SSSchedule"])   # November's report, added
    old = next(a for a in db["SSAward"] if a["SolicitationId"] == incumbent.SOL)
    assert json.loads(old["FundsJson"])["period"] == "Option 4" and old["ObligatedValue"] == 3_480_000 * 4 + 1_380_000 + 1_100_000 + 610_000 + 340_000
    assert [a for a, _ in both["audit"]].count("ContractWatched") == 2 and "AdministrationOpened" in [a for a, _ in both["audit"]]


def test_a_second_watch_the_same_day_changes_nothing(both):
    watch()
    before = json.dumps(both["db"]["SSAlert"], sort_keys=True)
    audits = len(both["audit"])
    out = watch()
    assert out["opened"] == [] and json.dumps(both["db"]["SSAlert"], sort_keys=True) == before
    assert len(both["audit"]) == audits


def test_a_dismissed_alert_stays_dismissed_and_a_cleared_one_resolves(both):
    db = both["db"]
    watch()
    funds = next(a for a in db["SSAlert"] if a["Kind"] == "funds")
    funds.update(Status="Dismissed", Reason="Funding modification P00012 in routing", ActedBy="Nadia Sorensen")
    plan_ = next(r for r in db["SSSchedule"] if r["ScheduleId"] == f"{incumbent.SOL}-deliverable-A002")
    plan_.update(ReceivedDay="2026-10-24", AcceptedDay="2026-10-26", Status="Accepted")
    watch("2026-10-27")
    assert funds["Status"] == "Dismissed"
    assert next(a for a in db["SSAlert"] if a["AlertId"] == f"{incumbent.SOL}-deliverable-deliverable-A002")["Status"] == "Resolved"


def test_the_watch_reports_a_failing_contract_after_doing_the_rest(both):
    next(a for a in both["db"]["SSAward"] if a["SolicitationId"] == incumbent.SOL)["AbstractJson"] = "not json"
    with pytest.raises(main.StepFailed, match=incumbent.SOL):
        watch()
    assert any(a["SolicitationId"] == SOL for a in both["db"]["SSAlert"])
