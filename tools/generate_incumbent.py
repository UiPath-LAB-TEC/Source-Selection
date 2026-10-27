"""Seed the incumbent's contract that the Army follow-on (W52P1J-27-R-0023) replaces, so the contract watch has a
contract in its last months to show next to one just signed (scope §17.11).

W52P1J-22-C-0011, Army Logistics Data Analytics Support, with Ostrander Analytics Group Inc (fictional; no real company
by that name turned up in a web search). Firm-fixed-price with one labor-hour line item, a base year and four options,
all exercised. Dates are relative to the day it runs: the final option year ends 69 days later, so on that day the watch
finds an extension decision due soon, the labor-hour ceiling past 85% with no contractor notice, the line item's funds
running out before the period ends, an invoice due, a late transition-out plan, the final evaluation coming up, and
the contractor's SAM registration lapsing inside a possible extension.

Usage (from the repo root, signed in with `uip login`):
  .venv/bin/python tools/generate_incumbent.py                 # write the rows to Data Fabric and the contract PDF to SS-Records
  .venv/bin/python tools/generate_incumbent.py --snapshot      # add them to the Contract Award preview snapshot instead
  .venv/bin/python tools/generate_incumbent.py --today 2026-10-23
  .venv/bin/python tools/generate_incumbent.py --reset         # delete its rows and the PDF (permanent: the user runs it)
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "Award" / "AW_Robots"))

import admin  # noqa: E402
from admin import add_days, add_months, deadline  # noqa: E402

SOL = "W52P1J-22-R-0011"
CONTRACT = "W52P1J-22-C-0011"
AWARD_ID = f"{SOL}-award"
SUCCESSOR_SOL = "W52P1J-27-R-0023"
SUCCESSOR = f"{SUCCESSOR_SOL}-award"
TITLE = "Army Logistics Data Analytics Support"
AGENCY = "Department of the Army"
OFFICE = "Army Contracting Command — Rock Island"
CONTRACT_TYPE = "Firm-fixed-price with a labor-hour CLIN, 1 base year and 4 option years"
CONTRACTOR = {"name": "Ostrander Analytics Group Inc", "uei": "OAGX7Q2M4K91", "cage": "4QZT7",
              "address": "410 Riverbend Parkway, Suite 200, Bettendorf, IA 52722"}
COR = "Owen Mercer"
CO = "Dana Whitfield"
ACTOR = "Demo data"
PDF_PATH = f"{SOL}/contract/{CONTRACT}-Conformed.pdf"
ENDS_IN = 69                     # days from the run day to the end of the final option year
EXTENSION_NOTICE_DAYS = 60       # this contract's 52.217-8 fill-in
LABOR_RATE = 141.50              # blended labor-hour rate on line item 0002
CLINS = [
    {"clin": "0001", "description": "Analytics platform operations", "type": "Firm-fixed-price", "annual": 1_380_000},
    {"clin": "0002", "description": "Data engineering support", "type": "Labor-hour", "annual": 1_150_000},
    {"clin": "0003", "description": "Cybersecurity and RMF support", "type": "Firm-fixed-price", "annual": 610_000},
    {"clin": "0004", "description": "Program management", "type": "Firm-fixed-price", "annual": 340_000},
]
NAMES = ["Base", "Option 1", "Option 2", "Option 3", "Option 4"]
# Line item 0002's monthly invoices in the final year: rising effort, the last three at the recent rate.
LABOR_MONTHS = [95_000, 96_000, 98_000, 99_000, 100_000, 102_000, 105_000, 105_000, 105_000]
# Obligations on line item 0002 in the final year: at exercise, then two incremental funding modifications.
LABOR_FUNDING = [("P00008", 0, 900_000), ("P00010", 5, 150_000), ("P00011", 8, 50_000)]
SNAPSHOT = ROOT / "award-workspace" / "src" / "dev" / "snapshot.json"
IDS = json.loads((ROOT / "tools" / "schema" / "entity-ids.json").read_text())
BUCKETS = json.loads((ROOT / "tools" / "schema" / "bucket-keys.json").read_text())
BUCKET_FOLDER = "08605f4c-2b90-4971-81b7-2f4310a2b81a"   # the Source Selection folder, where SS-Records lives
KEYS = {"SSAward": "AwardId", "SSSchedule": "ScheduleId", "SSFunding": "FundingId", "SSAuditEvent": "EventId"}
SNAP_KEYS = {"SSAward": "awards", "SSSchedule": "schedule", "SSFunding": "funding", "SSAuditEvent": "audit", "SSAlert": "alerts"}


def stamp(day: str, hour: int = 15) -> str:
    """A day as a mid-morning Eastern timestamp (UTC), the way the record keeps signed dates."""
    return f"{day}T{hour:02d}:00:00+00:00"


def build(today: str) -> dict[str, list[dict]]:
    """Every row of the incumbent's contract on `today`, keyed by entity."""
    end = add_days(today, ENDS_IN)
    base = add_months(add_days(end, 1), -60)
    starts = [add_months(base, 12 * i) for i in range(5)]
    ends = [add_days(add_months(s, 12), -1) for s in starts]
    awarded = add_days(base, -21)
    annual = sum(c["annual"] for c in CLINS)
    sam_expires = add_days(end, 45)

    schedule: list[dict] = []
    for i, name in enumerate(NAMES):
        row = {"ScheduleId": f"{SOL}-period-{admin.period_code(name)}", "SolicitationId": SOL, "Kind": "Period" if i == 0 else "Option", "Name": name,
               "Period": name, "StartDay": starts[i], "EndDay": ends[i], "Amount": annual, "Status": "Exercised", "Owner": admin.CO}
        if i:
            row |= {"NoticeDay": deadline(add_days(ends[i - 1], -60)), "DueDay": deadline(ends[i - 1]), "ClauseRef": "52.217-9",
                    "ClauseText": "The Government may extend the term of this contract by written notice to the Contractor before the contract expires, "
                                  "provided that the Government gives the Contractor a preliminary written notice of its intent to extend at least 60 days "
                                  "before the contract expires. The total duration of this contract, including the exercise of any options under this "
                                  "clause and 52.217-8, shall not exceed 5 years and 6 months."}
        schedule.append(row)
    schedule.append({"ScheduleId": f"{SOL}-extension-EXT", "SolicitationId": SOL, "Kind": "Extension", "Name": "Extension of services (up to 6 months)",
                     "Period": "Extension", "StartDay": add_days(end, 1), "EndDay": add_days(add_months(add_days(end, 1), 6), -1),
                     "DueDay": deadline(add_days(end, -EXTENSION_NOTICE_DAYS)), "Status": "Planned", "Owner": admin.CO, "ClauseRef": "52.217-8",
                     "ClauseText": f"The Government may require continued performance of any services within the limits and at the rates specified in the "
                                   f"contract. The Contracting Officer may exercise the option by written notice to the Contractor at least "
                                   f"{EXTENSION_NOTICE_DAYS} days before the contract expires. The total extension of performance shall not exceed 6 months."})
    template = {"ScheduleId": f"{SOL}-deliverable-A001", "SolicitationId": SOL, "Kind": "Deliverable", "Code": "A001", "Name": "Monthly status report",
                "StartDay": starts[4], "EndDay": end, "Recurrence": "monthly:10", "Status": "Recurring", "Owner": admin.COR}
    schedule.append(template)
    for r in admin.materialize([template], today):
        if r["DueDay"] <= today:  # every report so far arrived the day before it was due and was accepted within a few days
            schedule.append({**r, "ReceivedDay": add_days(r["DueDay"], -1), "AcceptedDay": add_days(r["DueDay"], 3), "Status": "Accepted"})
    schedule.append({"ScheduleId": f"{SOL}-deliverable-A002", "SolicitationId": SOL, "Kind": "Deliverable", "Code": "A002", "Name": "Transition-out plan",
                     "Period": "Option 4", "DueDay": deadline(add_days(end, -90)), "Status": "Due", "Owner": admin.COR})
    for i, name in enumerate(NAMES):
        last = i == len(NAMES) - 1
        schedule.append({"ScheduleId": f"{SOL}-evaluation-{admin.period_code(name)}", "SolicitationId": SOL, "Kind": "Evaluation", "Period": name,
                         "Name": "Final evaluation" if last else f"Annual evaluation, {'base period' if name == 'Base' else name.lower()}",
                         "DueDay": ends[i], "Status": "Due" if last else "Done", "Owner": admin.COR, "ClauseRef": "42.1102(a)"})

    funding: list[dict] = []

    def obligation(ref: str, clin: str, period: str, amount: float, day: str) -> None:
        fy = admin.fiscal_year(day)
        funding.append({"FundingId": f"{SOL}-Obligation-{ref}-{clin}", "SolicitationId": SOL, "Kind": "Obligation", "Reference": ref, "Clin": clin,
                        "Period": period, "Amount": amount, "Status": "Obligated", "ReceivedDay": day,
                        "Appropriation": f"Operation and maintenance, Army, FY{fy}", "FundsExpireDay": f"{fy}-09-30"})

    # Earlier periods: fully funded at award or exercise; invoiced in full (labor-hour a little under its ceiling).
    for i, name in enumerate(NAMES[:4]):
        ref = "Basic award" if i == 0 else f"P{2 * i:05d}"
        for c in CLINS:
            obligation(ref, c["clin"], name, c["annual"], starts[i] if i else awarded)
            spent = round(c["annual"] * (0.94 if c["type"] == "Labor-hour" else 1), 2)
            funding.append({"FundingId": f"{SOL}-Invoice-{admin.period_code(name)}-{c['clin']}", "SolicitationId": SOL, "Kind": "Invoice",
                            "Reference": f"{name} invoices", "Clin": c["clin"], "Period": name, "Amount": spent, "ServiceStart": starts[i],
                            "ServiceEnd": ends[i], "ReceivedDay": add_days(ends[i], 6), "AcceptedDay": add_days(ends[i], 9),
                            "DueDay": add_days(ends[i], 36), "PaidDay": add_days(ends[i], 30), "Status": "Paid"} |
                           ({"Hours": round(spent / LABOR_RATE * 4) / 4} if c["type"] == "Labor-hour" else {}))
    # The final year: firm-fixed-price lines funded in full at exercise, the labor-hour line incrementally.
    month_starts = [add_months(starts[4], m) for m in range(12)]
    for c in CLINS:
        if c["type"] == "Labor-hour":
            for ref, month, amount in LABOR_FUNDING:
                obligation(ref, c["clin"], "Option 4", amount, month_starts[month])
        else:
            obligation("P00008", c["clin"], "Option 4", c["annual"], starts[4])
    for m, labor in enumerate(LABOR_MONTHS):
        s, e = month_starts[m], add_days(month_starts[m + 1], -1)
        received = add_days(today, -17) if m == len(LABOR_MONTHS) - 1 else add_days(e, 6)
        last = m == len(LABOR_MONTHS) - 1
        ref = f"OAG-{s[2:4]}{s[5:7]}"
        for c in CLINS:
            amount = labor if c["type"] == "Labor-hour" else round(c["annual"] / 12, 2)
            funding.append({"FundingId": f"{SOL}-Invoice-{ref}-{c['clin']}", "SolicitationId": SOL, "Kind": "Invoice", "Reference": ref, "Clin": c["clin"],
                            "Period": "Option 4", "Amount": amount, "ServiceStart": s, "ServiceEnd": e, "ReceivedDay": received,
                            "Status": "Received" if last else "Paid"}
                           | ({} if last else {"AcceptedDay": add_days(received, 3), "DueDay": deadline(add_days(received, 30)), "PaidDay": add_days(received, 24)})
                           | ({"Hours": round(amount / LABOR_RATE * 4) / 4} if c["type"] == "Labor-hour" else {}))

    abstract = {
        "source": f"The conformed contract, {CONTRACT} through modification P00011 (seeded for the demo)",
        "contractNumber": CONTRACT, "title": TITLE, "agency": AGENCY, "office": OFFICE, "contractType": CONTRACT_TYPE,
        "contractor": {**CONTRACTOR, "samExpires": sam_expires},
        "periods": [{"name": n, "start": s, "end": e} for n, s, e in zip(NAMES, starts, ends)],
        "clins": [{"clin": c["clin"], "description": c["description"], "type": c["type"], "byPeriod": {n: c["annual"] for n in NAMES}} for c in CLINS],
        "clauses": [{"ref": "52.217-9", "fill": {"preliminaryNoticeDays": 60, "maxDurationMonths": 66}},
                    {"ref": "52.217-8", "fill": {"noticeDaysBeforeExpiry": EXTENSION_NOTICE_DAYS, "months": 6}},
                    {"ref": "52.232-7"}],
        "deliverables": [{"code": "A001", "name": "Monthly status report", "due": "10th of each month"},
                         {"code": "A002", "name": "Transition-out plan", "due": "90 days before the contract expires"}],
    }
    award = {"AwardId": AWARD_ID, "SolicitationId": SOL, "Stage": "Closed", "Phase": "Administration", "Origin": "Imported", "Framework": "federal",
             "Title": TITLE, "Agency": AGENCY, "Office": OFFICE, "AwardeeName": CONTRACTOR["name"], "ContractType": CONTRACT_TYPE,
             "ContractNumber": CONTRACT, "ContractValue": annual * 5, "CeilingValue": annual * 5, "AwardedAt": stamp(awarded),
             "StartedAt": stamp(awarded), "ClosedAt": stamp(add_days(awarded, 14)), "PerformanceStatus": "Proceeding",
             "PeriodStart": base, "PeriodEnd": end, "CurrentPeriod": "Option 4", "CorName": COR, "SuccessorId": SUCCESSOR,
             "AbstractJson": json.dumps(abstract)}
    audit = [
        {"EventId": f"{SOL}-award-ContractAwardSigned", "SolicitationId": SOL, "EntityRef": "award", "Action": "ContractAwardSigned", "Actor": CO,
         "OccurredAt": stamp(awarded), "Detail": f"Contract {CONTRACT} to {CONTRACTOR['name']}, base year and four options, {admin.money(annual * 5)}"},
        *[{"EventId": f"{SOL}-{admin.period_code(n)}-OptionExercised", "SolicitationId": SOL, "EntityRef": admin.period_code(n), "Action": "OptionExercised",
           "Actor": CO, "OccurredAt": stamp(add_days(starts[i], -30)), "Detail": f"{n} exercised by modification P{2 * i:05d}, {admin.money(annual)}"}
          for i, n in enumerate(NAMES) if i],
        {"EventId": f"{SOL}-administration-ContractImported", "SolicitationId": SOL, "EntityRef": "administration", "Action": "ContractImported",
         "Actor": ACTOR, "OccurredAt": stamp(today, 13), "Detail": f"{CONTRACT} loaded from its conformed copy for the demo: {len(schedule)} schedule rows, "
                                                                  f"{len(funding)} funding rows. It is the contract {SUCCESSOR_SOL} replaces."},
    ]
    return {"SSAward": [award], "SSSchedule": schedule, "SSFunding": funding, "SSAuditEvent": audit}


def contract_pdf(rows: dict[str, list[dict]]) -> bytes:
    """The conformed contract as filed: award data, prices by period, performance periods, administration, clauses and
    deliverables, with the synthetic-demo banner."""
    import records
    award = rows["SSAward"][0]
    a = json.loads(award["AbstractJson"])
    sched = rows["SSSchedule"]
    periods = [r for r in sched if r["Kind"] in ("Period", "Option")]
    ext = next(r for r in sched if r["Kind"] == "Extension")
    prices = "\n".join(f"CLIN {c['clin']}  {c['description']} ({c['type'].lower()}{', ceiling' if c['type'] == 'Labor-hour' else ''})  "
                       f"{admin.money(c['byPeriod']['Base'])} per period" for c in a["clins"])
    sections = [
        ("Section A: Award", f"Contract number: {CONTRACT}\nContractor: {CONTRACTOR['name']}, {CONTRACTOR['address']}\nUEI {CONTRACTOR['uei']} · CAGE "
                             f"{CONTRACTOR['cage']}\nIssued by: {OFFICE}\nContracting Officer: {CO}\nType: {CONTRACT_TYPE}\n"
                             f"Total, base and all options: {admin.money(award['ContractValue'])}"),
        ("Section B: Supplies or services and prices", prices + f"\nLine item 0002 is labor-hour at a blended rate of ${LABOR_RATE:,.2f} an hour, up to its "
                                                                 f"ceiling each period (52.232-7)."),
        ("Section F: Deliveries or performance", "\n".join(f"{r['Name']}: {admin.show_day(r['StartDay'])} to {admin.show_day(r['EndDay'])}" for r in periods)),
        ("Section G: Contract administration data", f"Contracting Officer's Representative: {COR}. Invoices go monthly to the designated billing office, "
                                                     f"one line per line item, with hours for line item 0002."),
        ("Section I: Contract clauses", "\n\n".join([
            f"52.217-8 Option to Extend Services. {ext['ClauseText']}",
            f"52.217-9 Option to Extend the Term of the Contract. {periods[1]['ClauseText']}",
            "52.232-7 Payments under Time-and-Materials and Labor-Hour Contracts. Line item 0002 is paid at the hourly rate up to its ceiling. The "
            "Contractor shall notify the Contracting Officer, with a revised estimate, whenever the payments that will accrue in the next 30 days, added "
            "to those already accrued, will exceed 85 percent of the ceiling. The Government is not obligated to pay above the ceiling.",
        ])),
        ("Section J: Deliverables", "\n".join(f"{d['code']}  {d['name']}: {d['due']}" for d in a["deliverables"])),
        ("Modifications", "\n".join(
            [f"P{2 * i:05d}: {n} exercised" for i, n in enumerate(NAMES) if i]
            + ["P00010: incremental funding, line item 0002, $150,000", "P00011: incremental funding, line item 0002, $50,000"])),
    ]
    return records.render("Contract (conformed copy)", f"{AGENCY} | {CONTRACT} | {TITLE}", sections, banner=records.RELEASED_BANNER)


# ── Data Fabric and storage, through the uip CLI ────────────────────────────

def uip(*args, body=None):
    cmd = ["uip", *args, "--output", "json"] + (["--body", json.dumps(body)] if body is not None else [])
    res = subprocess.run(cmd, capture_output=True, text=True)
    out = res.stdout
    if "{" not in out:
        raise RuntimeError(f"uip {' '.join(args[:3])} failed: {res.stderr[:400]}")
    return json.loads(out[out.index("{"):])


def live_rows(entity: str) -> list[dict]:
    fields = {f["Name"].lower(): f["Name"] for f in uip("df", "entities", "get", IDS[entity])["Data"]["Fields"]}
    items = uip("df", "records", "list", IDS[entity], "--limit", "1000")["Data"]["Items"]
    return [{fields.get(k.lower(), k): v for k, v in r.items()} for r in items]


def write(rows: dict[str, list[dict]]) -> None:
    for entity, recs in rows.items():
        key = KEYS[entity]
        have = {r.get(key): r["Id"] for r in live_rows(entity) if r.get(key)}
        new = [r for r in recs if r[key] not in have]
        for i in range(0, len(new), 50):
            res = uip("df", "records", "insert", IDS[entity], body=new[i:i + 50] if len(new[i:i + 50]) > 1 else new[i])
            if res.get("Result") != "Success":
                raise RuntimeError(f"{entity} insert failed: {json.dumps(res)[:400]}")
        for r in (r for r in recs if r[key] in have):
            res = uip("df", "records", "update", IDS[entity], body={**r, "Id": have[r[key]]})
            if res.get("Result") != "Success":
                raise RuntimeError(f"{entity} update failed: {json.dumps(res)[:400]}")
        print(f"{entity}: {len(new)} inserted, {len(recs) - len(new)} updated")
    # The follow-on knows what it replaces.
    succ = next((r for r in live_rows("SSAward") if r.get("AwardId") == SUCCESSOR), None)
    if succ and succ.get("PredecessorId") != AWARD_ID:
        uip("df", "records", "update", IDS["SSAward"], body={"Id": succ["Id"], "PredecessorId": AWARD_ID})
        print(f"{SUCCESSOR}: linked to {AWARD_ID}")


def upload(pdf: bytes) -> None:
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(pdf)
    uip("or", "bucket-files", "upload", BUCKETS["SS-Records"], PDF_PATH, "--folder-key", BUCKET_FOLDER, "--file", f.name, "--content-type", "application/pdf")
    print(f"SS-Records/{PDF_PATH}: {len(pdf):,} bytes")


def reset() -> None:
    """Delete the incumbent's rows (and its alerts) and unlink the follow-on. Permanent."""
    for entity in ("SSAlert", "SSSchedule", "SSFunding", "SSAuditEvent", "SSAward"):
        ids = [r["Id"] for r in live_rows(entity) if r.get("SolicitationId") == SOL]
        for i in range(0, len(ids), 50):
            uip("df", "records", "delete", IDS[entity], *ids[i:i + 50], "-y")
        print(f"{entity}: {len(ids)} deleted")
    succ = next((r for r in live_rows("SSAward") if r.get("AwardId") == SUCCESSOR), None)
    if succ and succ.get("PredecessorId"):
        uip("df", "records", "update", IDS["SSAward"], body={"Id": succ["Id"], "PredecessorId": None})
    uip("or", "bucket-files", "delete", BUCKETS["SS-Records"], PDF_PATH, "--folder-key", BUCKET_FOLDER)


def snapshot(rows: dict[str, list[dict]]) -> None:
    """Add the rows to the Contract Award preview snapshot (replacing an earlier copy), linked to the follow-on."""
    snap = json.loads(SNAPSHOT.read_text())
    for entity, recs in rows.items():
        table = [r for r in snap.get(SNAP_KEYS[entity], []) if r.get("SolicitationId") != SOL]
        snap[SNAP_KEYS[entity]] = table + [{"Id": f"preview-{KEYS[entity]}-{r[KEYS[entity]]}", **r} for r in recs]
    for a in snap.get("awards", []):
        if a.get("AwardId") == SUCCESSOR:
            a["PredecessorId"] = AWARD_ID
    SNAPSHOT.write_text(json.dumps(snap, indent=1))
    print(f"{SNAPSHOT.relative_to(ROOT)}: {sum(len(v) for v in rows.values())} incumbent rows")


if __name__ == "__main__":
    args = sys.argv[1:]
    today = args[args.index("--today") + 1] if "--today" in args else date.today().isoformat()
    if "--reset" in args:
        reset()
    else:
        built = build(today)
        if "--snapshot" in args:
            snapshot(built)
        else:
            write(built)
            upload(contract_pdf(built))
