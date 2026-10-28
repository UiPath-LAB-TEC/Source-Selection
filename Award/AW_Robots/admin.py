"""Contract administration after award: the schedule a contract runs on, how fast its money goes, and the alerts the
daily contract watch raises. Pure functions over plain rows (the SSSchedule, SSFunding, SSCorrespondence and SSAward
shapes), so every rule is tested without the platform (tests/test_admin.py).

The rules and their sources are in docs/design/award-phase-scope.md §17.4, cited with the RFO deviation's numbers. Lead
times are settings, not rules (LEAD). A contract deadline that falls on a weekend or federal holiday moves back to the
business day before (clocks.prior_business_day), so an alert never lands after the real deadline.
"""
from __future__ import annotations

import calendar
import json
import math
import re
from datetime import date, timedelta

import clocks
import letters

# Who an alert goes to, by the persona's task label (the Award app's switcher).
CO, COR, RM = "contracting-officer", "cor", "resource-manager"

# Days before a deadline that an alert first shows (Upcoming); within DUE_SOON it's Due soon; after it, Overdue.
LEAD = {"option": 120, "extension": 120, "ceiling": 30, "funds": 90, "invoice": 30, "deliverable": 7, "acceptance": 10,
        "milestone": 30, "evaluation": 90, "registration": 120}
DUE_SOON = 14

PRELIMINARY_NOTICE_DAYS = 60   # 52.217-9(a), unless the contract inserts another number
EXTENSION_NOTICE_DAYS = 30     # 52.217-8 fill-in default for contracts awarded here
EXTENSION_MONTHS = 6           # 52.217-8: the total extension may not exceed 6 months
CEILING_SHARE = 0.85           # 52.232-7(d)
CEILING_LOOKAHEAD = 30         # 52.232-7(d): "in the next succeeding 30 days"
INVOICE_REVIEW_DAYS = 7        # FAR 32.905(b)(3): a defective invoice goes back within 7 days
INVOICE_PAY_DAYS = 30          # FAR 32.904(b)(1)
ACCEPT_WITHIN = 10             # setting: days to accept or reject a deliverable after it arrives
TRANSITION_IN_DAYS = 60        # the Army solicitation's transition-in requirement
ORIENTATION_DAYS = 15          # setting: post-award orientation conference after signing
TRANSITION_OUT_DAYS = 90       # setting: transition-out plan before the contract ends
BURN_MONTHS = 3                # the spending rate is the average of the last three invoiced months
MATERIALIZE_AHEAD = 45         # recurring deliverables get their next due rows this far ahead

# What each deliverable must contain, by its code in the contract's deliverables list (the Section J exhibit). A
# contract's abstract can carry its own list ("requirements"); these are the defaults for a services contract.
DELIVERABLE_REQUIREMENTS = {
    "A001": [
        "Work performed during the month, by task area",
        "Hours by labor category for each labor-hour line item, for the month and cumulative for the period",
        "Deliverables submitted during the month and their status",
        "Risks and issues, each with its mitigation",
        "Staffing changes, including any change to key personnel",
        "Work planned for the next month",
    ],
    "A002": [
        "Inventory of the work, data and systems to hand over",
        "Schedule for the transition, ending before the contract expires",
        "Knowledge-transfer sessions with the follow-on contractor",
        "Staffing through the end of the contract",
        "Return of Government property, data and access",
    ],
}
RESUBMIT_BUSINESS_DAYS = 5     # setting: a rejected deliverable is due again 5 business days later
REVIEWER = "AW_DeliverableReviewer"
REPORT_TEXT_CHARS = 6000       # keeps the reviewer's whole input under Orchestrator's 10,000-character cap

RULE = {
    "option": "52.217-9(a); FAR 17.204-1(b)",
    "extension": "52.217-8",
    "ceiling": "52.232-7(d)–(e)",
    "funds": "Obligated funds against the spending rate",
    "invoice": "FAR 32.904(b)(1); 32.905(b)(3)",
    "deliverable": "The contract's delivery schedule",
    "milestone": "Contract administration (FAR 42.302(a))",
    "evaluation": "FAR 42.1102(a)",
    "registration": "DFARS 217.207(c)(1); FAR 17.204-1(b)(3)(iii)",
}
SEVERITY_RANK = {"Info": 0, "Upcoming": 1, "Due soon": 2, "Overdue": 3}


# ── Days ────────────────────────────────────────────────────────────────────

def _d(day: str) -> date:
    return date.fromisoformat(day[:10])


def add_days(day: str, n: int) -> str:
    return (_d(day) + timedelta(days=n)).isoformat()


def add_months(day: str, n: int) -> str:
    """The same day `n` months later (the last day of the month when that month is shorter)."""
    d = _d(day)
    y, m = divmod(d.month - 1 + n, 12)
    y, m = d.year + y, m + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1])).isoformat()


def days_between(a: str, b: str) -> int:
    return (_d(b) - _d(a)).days


def deadline(day: str) -> str:
    return clocks.prior_business_day(day)


def show_day(day: str | None, as_of: str | None = None) -> str:
    """'Nov 26', or 'Nov 26, 2027' when it isn't in the as-of year."""
    if not day:
        return "—"
    d = _d(day)
    label = f"{calendar.month_abbr[d.month]} {d.day}"
    return label if as_of and d.year == _d(as_of).year else f"{label}, {d.year}"


def money(n: float | None) -> str:
    return "—" if n is None else f"${n:,.0f}"


def fiscal_year(day: str) -> int:
    d = _d(day)
    return d.year + 1 if d.month >= 10 else d.year


def severity(as_of: str, due: str, lead: int) -> str | None:
    left = days_between(as_of, due)
    if left < 0:
        return "Overdue"
    if left <= DUE_SOON:
        return "Due soon"
    if left <= lead:
        return "Upcoming"
    return None


def period_phrase(name: str | None) -> str:
    """'Base' → 'the base period', 'Option 3' → 'option 3'."""
    return "the base period" if name == "Base" else (name or "the contract").lower() if (name or "").startswith("Option") else (name or "the contract")


def period_code(name: str) -> str:
    """'Base' → 'BASE', 'Option 3' → 'OY3', 'Extension' → 'EXT'."""
    m = re.match(r"Option (\d+)", name)
    return f"OY{m.group(1)}" if m else name.upper()[:4]


# ── The schedule of a contract awarded here ─────────────────────────────────

def option_count(contract_type: str) -> int:
    m = re.search(r"(\d+)\s+option", contract_type or "", re.I)
    return int(m.group(1)) if m else 0


def period_prices(lines: list[dict], periods: int) -> dict[str, list[float]]:
    """Each line item's price by period. The price schedule carries one total per line item across all periods, so a
    transition-in line falls wholly in the base period and every other line splits evenly (cents to the last period)."""
    out: dict[str, list[float]] = {}
    for line in lines:
        total = float(line.get("amount") or 0)
        if re.search(r"transition", line.get("description") or "", re.I) or periods == 1:
            out[line["clin"]] = [total] + [0.0] * (periods - 1)
        else:
            each = math.floor(total / periods * 100) / 100
            out[line["clin"]] = [each] * (periods - 1) + [round(total - each * (periods - 1), 2)]
    return out


def build_schedule(sol: str, plan: dict, summary: dict, signed_day: str) -> tuple[list[dict], list[dict], dict]:
    """The schedule, opening obligations and contract abstract of a contract awarded through Source Selection, from the
    solicitation's terms and the signed award: the base year starts on the signing day (its first 60 days are the
    transition-in), each option is a year, and the clause defaults apply until the signed contract itself is read."""
    options = option_count(plan.get("contractType", ""))
    names = ["Base"] + [f"Option {i}" for i in range(1, options + 1)]
    prices = period_prices(summary.get("clins", []), len(names))
    labor_hour = set(plan.get("laborHourClins") or [])
    rows: list[dict] = []
    start = signed_day
    ends: list[str] = []
    for i, name in enumerate(names):
        end = add_days(add_months(start, 12), -1)
        amount = round(sum(p[i] for p in prices.values()), 2)
        row = {"ScheduleId": f"{sol}-period-{period_code(name)}", "SolicitationId": sol, "Kind": "Period" if i == 0 else "Option",
               "Name": name, "Period": name, "StartDay": start, "EndDay": end, "Amount": amount, "Owner": CO,
               "Status": "Exercised" if i == 0 else "Planned"}
        if i:
            prior_end = ends[-1]
            row |= {"NoticeDay": deadline(add_days(prior_end, -PRELIMINARY_NOTICE_DAYS)), "DueDay": deadline(prior_end), "ClauseRef": "52.217-9",
                    "ClauseText": f"The Government may extend the term of this contract by written notice to the Contractor before the contract expires, "
                                  f"provided that the Government gives the Contractor a preliminary written notice of its intent to extend at least "
                                  f"{PRELIMINARY_NOTICE_DAYS} days before the contract expires."}
        rows.append(row)
        ends.append(end)
        start = add_days(end, 1)
    final_end = ends[-1]
    rows.append({"ScheduleId": f"{sol}-extension-EXT", "SolicitationId": sol, "Kind": "Extension", "Name": "Extension of services (up to 6 months)",
                 "Period": "Extension", "StartDay": add_days(final_end, 1), "EndDay": add_days(add_months(add_days(final_end, 1), EXTENSION_MONTHS), -1),
                 "DueDay": deadline(add_days(final_end, -EXTENSION_NOTICE_DAYS)), "Status": "Planned", "Owner": CO, "ClauseRef": "52.217-8",
                 "ClauseText": f"The Contracting Officer may exercise the option by written notice to the Contractor at least {EXTENSION_NOTICE_DAYS} days "
                               f"before the contract expires. The total extension of performance shall not exceed {EXTENSION_MONTHS} months."})
    rows += [
        {"ScheduleId": f"{sol}-milestone-PAOC", "SolicitationId": sol, "Kind": "Milestone", "Code": "PAOC", "Name": "Post-award orientation conference",
         "Period": "Base", "DueDay": deadline(add_days(signed_day, ORIENTATION_DAYS)), "Status": "Due", "Owner": CO},
        {"ScheduleId": f"{sol}-milestone-TI", "SolicitationId": sol, "Kind": "Milestone", "Code": "TI", "Name": "Transition-in complete",
         "Period": "Base", "DueDay": deadline(add_days(signed_day, TRANSITION_IN_DAYS)), "Status": "Due", "Owner": COR},
        {"ScheduleId": f"{sol}-deliverable-A001", "SolicitationId": sol, "Kind": "Deliverable", "Code": "A001", "Name": "Monthly status report",
         "StartDay": signed_day, "EndDay": final_end, "Recurrence": "monthly:10", "Status": "Recurring", "Owner": COR},
        {"ScheduleId": f"{sol}-deliverable-A002", "SolicitationId": sol, "Kind": "Deliverable", "Code": "A002", "Name": "Transition-out plan",
         "Period": names[-1], "DueDay": deadline(add_days(final_end, -TRANSITION_OUT_DAYS)), "Status": "Due", "Owner": COR},
    ]
    for i, name in enumerate(names):
        last = i == len(names) - 1
        rows.append({"ScheduleId": f"{sol}-evaluation-{period_code(name)}", "SolicitationId": sol, "Kind": "Evaluation", "Period": name,
                     "Name": "Final evaluation" if last else f"Annual evaluation, {'base period' if name == 'Base' else name.lower()}",
                     "DueDay": ends[i], "Status": "Due", "Owner": COR, "ClauseRef": "42.1102(a)"})
    fy = fiscal_year(signed_day)
    funding = [{"FundingId": f"{sol}-Obligation-AWARD-{clin}", "SolicitationId": sol, "Kind": "Obligation", "Reference": "Basic award",
                "Clin": clin, "Period": "Base", "Amount": p[0], "Status": "Obligated", "ReceivedDay": signed_day,
                "Appropriation": f"Operation and maintenance, FY{fy}", "FundsExpireDay": f"{fy}-09-30"}
               for clin, p in prices.items() if p[0]]
    abstract = {
        "source": "The solicitation's terms and the signed contract award (not yet read from the signed contract itself)",
        "contractNumber": summary.get("contractNumber"), "title": plan.get("title"), "agency": plan.get("agency"), "office": plan.get("office"),
        "contractType": plan.get("contractType"),
        "contractor": {"name": summary.get("awardee"), "uei": summary.get("uei"), "cage": summary.get("cage"), "address": summary.get("address")},
        "periods": [{"name": n, "start": r["StartDay"], "end": r["EndDay"]} for n, r in zip(names, rows)],
        "clins": [{"clin": line["clin"], "description": line.get("description"), "type": "Labor-hour" if line["clin"] in labor_hour else "Firm-fixed-price",
                   "byPeriod": dict(zip(names, prices[line["clin"]]))} for line in summary.get("clins", [])],
        # The options were in the solicitation posted on SAM.gov and priced in the total evaluated price; whether the
        # 52.217-8 extension was evaluated isn't on the record, so its package asks the CO to confirm.
        "synopsized": True,
        "clauses": [{"ref": "52.217-9", "fill": {"preliminaryNoticeDays": PRELIMINARY_NOTICE_DAYS}, "evaluated": True},
                    {"ref": "52.217-8", "fill": {"noticeDaysBeforeExpiry": EXTENSION_NOTICE_DAYS, "months": EXTENSION_MONTHS}}]
                   + ([{"ref": "52.232-7"}] if labor_hour else []),
    }
    return rows, funding, abstract


def materialize(schedule: list[dict], as_of: str) -> list[dict]:
    """The next due rows of each recurring deliverable (Recurrence 'monthly:<day>'), up to MATERIALIZE_AHEAD days out
    and within the template's own dates. Returns only rows not already in the schedule."""
    have = {r["ScheduleId"] for r in schedule}
    out = []
    for t in schedule:
        m = re.fullmatch(r"monthly:(\d+)", t.get("Recurrence") or "")
        if not m or not t.get("StartDay"):
            continue
        horizon = min(add_days(as_of, MATERIALIZE_AHEAD), t.get("EndDay") or "9999-12-31")
        first = add_months(t["StartDay"][:8] + "01", 1)
        month = first
        while True:
            due = month[:8] + f"{min(int(m.group(1)), calendar.monthrange(_d(month).year, _d(month).month)[1]):02d}"
            if due > horizon:
                break
            sid = f"{t['ScheduleId']}-{month[:7]}"
            if sid not in have:
                out.append({"ScheduleId": sid, "SolicitationId": t["SolicitationId"], "Kind": "Deliverable", "Code": t.get("Code"),
                            "Name": f"{t['Name']}, {calendar.month_name[_d(add_months(month, -1)).month]}", "DueDay": deadline(due),
                            "Status": "Due", "Owner": t.get("Owner") or COR})
            month = add_months(month, 1)
    return out


# ── Money ───────────────────────────────────────────────────────────────────

def current_period(schedule: list[dict], as_of: str) -> dict | None:
    """The exercised period running on `as_of`, else the last exercised one before it (the contract may have ended)."""
    periods = sorted((r for r in schedule if r.get("Kind") in ("Period", "Option", "Extension") and r.get("Status") == "Exercised"),
                     key=lambda r: r["StartDay"])
    running = [r for r in periods if r["StartDay"] <= as_of <= r["EndDay"]]
    if running:
        return running[0]
    past = [r for r in periods if r["EndDay"] < as_of]
    return past[-1] if past else (periods[0] if periods else None)


def forecast(abstract: dict, funding: list[dict], period: dict, as_of: str) -> dict[str, dict]:
    """For each line item in a period: its price (the ceiling, for labor-hour), what is obligated and invoiced, the
    spending rate per day, and the days that rate reaches the obligated funds, 85% and 100% of the price."""
    name = period["Period"]
    out: dict[str, dict] = {}
    for clin in abstract.get("clins", []):
        c = clin["clin"]
        price = float((clin.get("byPeriod") or {}).get(name) or 0)
        if not price:
            continue
        here = [f for f in funding if f.get("Clin") == c and f.get("Period") == name]
        obligated = sum(float(f.get("Amount") or 0) for f in here if f.get("Kind") == "Obligation") \
            - sum(float(f.get("Amount") or 0) for f in here if f.get("Kind") == "Deobligation")
        lines = sorted((f for f in here if f.get("Kind") == "Invoice" and f.get("Status") != "Defective" and f.get("ServiceEnd")),
                       key=lambda f: f["ServiceEnd"])
        invoiced = sum(float(f.get("Amount") or 0) for f in lines)
        through = lines[-1]["ServiceEnd"] if lines else add_days(period["StartDay"], -1)
        recent = lines[-BURN_MONTHS:]
        if recent:
            span = days_between(recent[0].get("ServiceStart") or recent[0]["ServiceEnd"], recent[-1]["ServiceEnd"]) + 1
            per_day = sum(float(f.get("Amount") or 0) for f in recent) / max(span, 1)
        else:
            per_day = price / (days_between(period["StartDay"], period["EndDay"]) + 1)

        def reaching(amount: float) -> str | None:
            if per_day <= 0:
                return None
            return through if amount <= invoiced else add_days(through, math.ceil((amount - invoiced) / per_day))

        # A shortfall of under three days' spending is forecast noise (months differ in length), not an alert.
        accrued = invoiced + per_day * max(0, days_between(through, as_of))
        at_end = invoiced + per_day * max(0, days_between(through, period["EndDay"]))
        out[c] = {"clin": c, "description": clin.get("description"), "type": clin.get("type"), "period": name, "price": round(price, 2),
                  "obligated": round(obligated, 2), "invoiced": round(invoiced, 2), "through": through, "perDay": round(per_day, 2),
                  "accrued": round(accrued, 2), "atPeriodEnd": round(at_end, 2), "runOut": reaching(obligated) if obligated < at_end - max(0.5, 3 * per_day) else None,
                  "day85": reaching(CEILING_SHARE * price), "day100": reaching(price), "periodEnd": period["EndDay"]}
    return out


# ── Alerts ──────────────────────────────────────────────────────────────────

def _alert(sol: str, kind: str, subject: str, sev: str, title: str, detail: str, due: str | None, owner: str, evidence: dict) -> dict:
    return {"AlertId": f"{sol}-{kind}-{subject}", "SolicitationId": sol, "Kind": kind, "Rule": RULE[kind], "Subject": subject,
            "Severity": sev, "Title": title, "Detail": detail, "DueDay": due, "Owner": owner, "EvidenceJson": json.dumps(evidence)}


def _successor_note(successor: dict | None, as_of: str) -> str:
    if not successor:
        return "No follow-on contract is linked yet."
    who = f"The follow-on, {successor.get('ContractNumber') or successor.get('SolicitationId')} with {successor.get('AwardeeName') or 'the new contractor'},"
    if successor.get("PerformanceStatus") == "Suspended":
        return f"{who} is stayed by a protest, so an extension keeps the work going."
    # The same reading as the extension package's (successor_state): in its protest window until the stay deadline.
    by = json.loads(successor.get("ClocksJson") or "{}").get("stayByAward")
    if by and by >= as_of and not successor.get("ClosedAt"):
        return (f"{who} is still in its protest window (a GAO protest filed by {show_day(by, as_of)} would stay its performance). "
                f"If it's stayed, this contract needs the extension in hand.")
    return f"{who} is under way."


def alerts(contract: dict, schedule: list[dict], funding: list[dict], correspondence: list[dict], as_of: str,
           successor: dict | None = None) -> tuple[list[dict], dict]:
    """Every alert the rules raise for one contract on `as_of`, and the funds forecast behind them (SSAward.FundsJson)."""
    sol = contract["SolicitationId"]
    abstract = json.loads(contract.get("AbstractJson") or "{}")
    who = (abstract.get("contractor") or {}).get("name") or contract.get("AwardeeName") or "The contractor"
    out: list[dict] = []
    period = current_period(schedule, as_of)
    periods = sorted((r for r in schedule if r.get("Kind") in ("Period", "Option")), key=lambda r: r["StartDay"])
    final_end = term_end(schedule)
    under_way = " The option package is under way: the Resource Manager certifies the funds, then the Contracting Officer decides."

    # Options: the preliminary notice, then the exercise itself (52.217-9(a); FAR 17.204-1(b)).
    for r in (r for r in periods if r.get("Kind") == "Option" and r.get("Status") in ("Planned", "Notice sent")):
        if days_between(as_of, r["StartDay"]) > LEAD["option"]:
            continue
        noticed = r.get("Status") == "Notice sent"
        target = r["DueDay"] if noticed else r["NoticeDay"]
        sev = severity(as_of, target, 10**6)
        if not noticed and sev == "Overdue":
            detail = (f"The preliminary notice was due {show_day(target, as_of)} and none has gone out. Without it, {r['Name'].lower()} can't be "
                      f"exercised without {who}'s agreement (52.217-9(a)).")
        elif noticed:
            detail = (f"The preliminary notice has gone out. Exercise by written notice by {show_day(r['DueDay'], as_of)}, once you have confirmed that funds "
                      f"are available, the requirement still exists, {who} has no active exclusion, performance is acceptable, and the price "
                      f"({money(r.get('Amount'))}) is fair and reasonable (FAR 17.204-1(b)).")
        else:
            detail = (f"{r['Name']} starts {show_day(r['StartDay'], as_of)} ({money(r.get('Amount'))}). The preliminary notice of intent is due "
                      f"{show_day(r['NoticeDay'], as_of)}, at least {PRELIMINARY_NOTICE_DAYS} days before the current period ends (52.217-9(a)). "
                      f"Start the option package now: funds, the continuing need, performance and price (FAR 17.204-1(b)).")
        title = f"{r['Name']}: {'exercise' if noticed else 'preliminary notice'} due {show_day(target, as_of)}"
        out.append(_alert(sol, "option", period_code(r["Name"]), sev, title, detail + (under_way if r.get("ProcessInstanceId") else ""), target, CO,
                          {"scheduleId": r["ScheduleId"], "period": r["Name"], "start": r["StartDay"], "noticeDay": r.get("NoticeDay"),
                           "exerciseBy": r["DueDay"], "price": r.get("Amount")}))

    # Extension of services once no options remain (52.217-8).
    planned_options = [r for r in periods if r.get("Kind") == "Option" and r.get("Status") in ("Planned", "Notice sent")]
    for r in (r for r in schedule if is_extension_clause(r) and r.get("Status") == "Planned"):
        if planned_options or not final_end or days_between(as_of, final_end) > LEAD["extension"] or as_of > final_end:
            continue
        sev = severity(as_of, r["DueDay"], LEAD["extension"]) or "Upcoming"
        left = months_between(r["StartDay"], r["EndDay"])
        used = len(extensions_exercised(schedule))
        detail = (f"No options remain and the contract ends {show_day(final_end, as_of)}. 52.217-8 allows up to {left} more month{'s' if left != 1 else ''} "
                  f"at the contract's rates, by written notice by {show_day(r['DueDay'], as_of)}. {_successor_note(successor, as_of)}"
                  + (under_way if r.get("ProcessInstanceId") else ""))
        title = f"{'Further extension' if used else 'Extension of services'}: decide by {show_day(r['DueDay'], as_of)}"
        out.append(_alert(sol, "extension", "EXT", sev, title, detail, r["DueDay"], CO,
                          {"scheduleId": r["ScheduleId"], "contractEnds": final_end, "exerciseBy": r["DueDay"], "extensionEnds": r.get("EndDay"),
                           "monthsLeft": left, "successor": (successor or {}).get("AwardId")}))

    # Money in the current period: labor-hour ceilings (52.232-7(d)-(e)) and obligated funds.
    funds = forecast(abstract, funding, period, as_of) if period else {}
    for c, f in funds.items():
        code = f"{c}-{period_code(f['period'])}"
        if f["type"] == "Labor-hour" and f["day85"] and f["day85"] <= f["periodEnd"]:
            notice_due = add_days(f["day85"], -CEILING_LOOKAHEAD)
            on_file = [x for x in correspondence if x.get("Kind") == "ContractorNotice" and f"-{c}-" in (x.get("CorrespondenceId") or "")
                       and period_code(f["period"]) in (x.get("CorrespondenceId") or "")]
            share = f["accrued"] / f["price"]
            reaches = (f"reaches the full ceiling around {show_day(f['day100'], as_of)}, before the period ends {show_day(f['periodEnd'], as_of)}"
                       if f["day100"] and f["day100"] <= f["periodEnd"] else "stays under the full ceiling through the period")
            if on_file:
                sev = severity(as_of, f["day100"], LEAD["ceiling"]) if f["day100"] and f["day100"] <= f["periodEnd"] else None
                detail = (f"{who} sent its ceiling notice. At the recent rate line item {c} {reaches}. Raise the ceiling by modification or limit "
                          f"the work: the Government isn't obligated to pay above it (52.232-7(e)).")
                title = f"Line item {c} reaches its ceiling around {show_day(f['day100'], as_of)}"
                due = f["day100"]
            else:
                sev = severity(as_of, notice_due, LEAD["ceiling"])
                detail = (f"Line item {c} (labor-hour) has accrued about {money(f['accrued'])} of its {money(f['price'])} ceiling for "
                          f"{f['period']} ({share:.0%}). At the recent rate it passes 85% around {show_day(f['day85'], as_of)} and {reaches}. "
                          f"52.232-7(d) has {who} notify you with a revised estimate once the next 30 days would pass 85%, about "
                          f"{show_day(notice_due, as_of)}. No notice is on file. The Government isn't obligated to pay above the ceiling (52.232-7(e)).")
                title = f"Line item {c} near its ceiling: no notice from {who}" if sev == "Overdue" else f"Line item {c} nears its ceiling"
                due = notice_due
            if sev:
                out.append(_alert(sol, "ceiling", code, sev, title, detail, due, CO, f))
        if f["runOut"] and f["runOut"] < f["periodEnd"]:
            sev = severity(as_of, f["runOut"], LEAD["funds"])
            if sev:
                short = days_between(f["runOut"], f["periodEnd"])
                left = max(0.0, f["obligated"] - f["accrued"])
                detail = (f"About {money(left)} of the {money(f['obligated'])} obligated on line item {c} for {f['period']} is left. At the recent "
                          f"rate of {money(f['perDay'] * 30)} a month it runs out around {show_day(f['runOut'], as_of)}, {short} days before the period "
                          f"ends {show_day(f['periodEnd'], as_of)}. About {money(f['atPeriodEnd'] - f['obligated'])} more covers the rest of the period"
                          + (f", which would also take it past its {money(f['price'])} ceiling." if f["type"] == "Labor-hour" and f["atPeriodEnd"] > f["price"] else "."))
                out.append(_alert(sol, "funds", code, sev, f"Funds on line item {c} run out around {show_day(f['runOut'], as_of)}", detail,
                                  f["runOut"], f"{RM},{CO}", f))

    # Invoices received and not yet approved: 7 days to return a defective one, then pay by the 30th day (FAR 32.904-32.905).
    received: dict[str, list[dict]] = {}
    for f in funding:
        if f.get("Kind") == "Invoice" and f.get("Status") == "Received" and f.get("ReceivedDay"):
            received.setdefault(f["Reference"], []).append(f)
    for ref, lines in received.items():
        got = min(x["ReceivedDay"] for x in lines)
        accepted = max((x.get("AcceptedDay") or "" for x in lines), default="")
        review_by = deadline(add_days(got, INVOICE_REVIEW_DAYS))
        pay_by = deadline(add_days(max(got, accepted), INVOICE_PAY_DAYS))
        total = sum(float(x.get("Amount") or 0) for x in lines)
        if as_of <= review_by:
            target, title = review_by, f"Invoice {ref}: decide proper or defective by {show_day(review_by, as_of)}"
            detail = (f"{who}'s invoice {ref} for {money(total)} arrived {show_day(got, as_of)}. A defective invoice goes back within 7 days with the "
                      f"reasons (FAR 32.905(b)(3)); a proper one is due for payment by {show_day(pay_by, as_of)} (FAR 32.904(b)(1)).")
        else:
            target, title = pay_by, f"Invoice {ref}: approve for payment by {show_day(pay_by, as_of)}"
            detail = (f"{who}'s invoice {ref} for {money(total)} arrived {show_day(got, as_of)} and the 7-day window to return it as defective has closed. "
                      f"Payment is due by {show_day(pay_by, as_of)}, 30 days after receipt (FAR 32.904(b)(1)); after that the agency owes interest.")
        sev = severity(as_of, target, LEAD["invoice"])
        if sev:
            out.append(_alert(sol, "invoice", ref, sev, title, detail, target, COR,
                              {"reference": ref, "received": got, "reviewBy": review_by, "payBy": pay_by, "amount": total, "lines": len(lines)}))

    # Deliverables, milestones and performance evaluations on the schedule.
    for r in schedule:
        kind, status = r.get("Kind"), r.get("Status")
        if kind not in ("Deliverable", "Milestone", "Evaluation") or status in ("Recurring", "Accepted", "Done", "Waived") or not r.get("DueDay"):
            continue
        subject = r["ScheduleId"].removeprefix(f"{sol}-")
        if kind == "Deliverable" and r.get("ReceivedDay") and not r.get("AcceptedDay"):
            accept_by = deadline(add_days(r["ReceivedDay"], ACCEPT_WITHIN))
            sev = severity(as_of, accept_by, LEAD["acceptance"])
            if sev:
                cor = contract.get("CorName") or "the COR"
                out.append(_alert(sol, "deliverable", subject, sev, f"{r['Name']}: review by {show_day(accept_by, as_of)}",
                                  f"{who} delivered it {show_day(r['ReceivedDay'], as_of)}. "
                                  + (f"The review is with {cor}: the agent has checked it against the contract's requirements, and {cor} accepts it "
                                     f"or rejects it with the reasons." if r.get("ProcessInstanceId") else
                                     f"A review starts with {cor}, who accepts it or rejects it with the reasons."),
                                  accept_by, r.get("Owner") or COR, {"scheduleId": r["ScheduleId"], "received": r["ReceivedDay"]}))
            continue
        lead = LEAD["deliverable" if kind == "Deliverable" else kind.lower()]
        sev = severity(as_of, r["DueDay"], lead)
        if not sev:
            continue
        late = sev == "Overdue"
        if kind == "Deliverable":
            title = f"{r['Name']} {'is late' if late else 'due ' + show_day(r['DueDay'], as_of)}"
            detail = (f"Due from {who} {show_day(r['DueDay'], as_of)}" + (f" and not received ({-days_between(as_of, r['DueDay'])} days late)." if late else ".")
                      + (" It is the other half of the follow-on contractor's transition-in." if r.get("Code") == "A002" and successor else ""))
        elif kind == "Milestone":
            title = f"{r['Name']} {'overdue' if late else 'due ' + show_day(r['DueDay'], as_of)}"
            detail = f"Due {show_day(r['DueDay'], as_of)}, in {period_phrase(r.get('Period'))}."
        else:
            title = f"{r['Name']} {'overdue' if late else 'due ' + show_day(r['DueDay'], as_of)}"
            detail = (f"Performance evaluations are prepared at least annually and when the work is completed (FAR 42.1102(a)). This one covers "
                      f"{period_phrase(r.get('Period'))}{' and the work as a whole' if r['Name'].startswith('Final') else ''}. {who} then has 14 "
                      f"days to comment (FAR 42.1103(d)(2)).")
        out.append(_alert(sol, "deliverable" if kind == "Deliverable" else kind.lower(), subject, sev, title, detail, r["DueDay"], r.get("Owner") or COR,
                          {"scheduleId": r["ScheduleId"], "due": r["DueDay"]}))

    # The contractor's SAM registration, which must be active when an option or extension is exercised.
    expires = (abstract.get("contractor") or {}).get("samExpires")
    nxt = next((r for r in planned_options), None) or next((r for r in schedule if is_extension_clause(r) and r.get("Status") == "Planned"), None)
    if expires and nxt and expires <= nxt["EndDay"]:
        sev = severity(as_of, expires, LEAD["registration"])
        if sev:
            out.append(_alert(sol, "registration", "SAM", sev, f"{who}'s SAM registration expires {show_day(expires, as_of)}",
                              f"It expires inside {'a 6-month extension of services' if nxt['Kind'] == 'Extension' else nxt['Name'].lower()} "
                              f"(to {show_day(nxt['EndDay'], as_of)}). The registration must be active when you exercise "
                              f"(DFARS 217.207(c)(1)), so check it's renewed before relying on it.", expires, CO,
                              {"samExpires": expires, "next": nxt["Name"], "nextEnds": nxt["EndDay"]}))

    summary = {"asOf": as_of, "period": period["Period"] if period else None, "periodStart": period["StartDay"] if period else None,
               "periodEnd": period["EndDay"] if period else None, "lines": list(funds.values())}
    return out, summary


# ── Deliverable review ──────────────────────────────────────────────────────

def requirements_for(abstract: dict, code: str | None) -> list[str]:
    own = next((d.get("requirements") for d in abstract.get("deliverables") or [] if d.get("code") == code and d.get("requirements")), None)
    return list(own or DELIVERABLE_REQUIREMENTS.get(code or "", []))


def review_inputs(contract: dict, row: dict, report_text: str, funds: dict | None) -> dict:
    """What the deliverable reviewer sees: the contract's facts, what the deliverable must contain, and the report's text.
    Labor-hour lines come with their ceiling and spending, so the reviewer can check reported hours against them."""
    abstract = json.loads(contract.get("AbstractJson") or "{}")
    labor = [{"clin": f["clin"], "description": f.get("description"), "ceiling": f["price"], "invoicedThisPeriod": f["invoiced"],
              "percentOfCeiling": round(100 * f["accrued"] / f["price"]) if f.get("price") else None}
             for f in (funds or {}).get("lines", []) if f.get("type") == "Labor-hour"]
    facts = {"contractNumber": contract.get("ContractNumber"), "contractor": (abstract.get("contractor") or {}).get("name") or contract.get("AwardeeName"),
             "period": (funds or {}).get("period") or contract.get("CurrentPeriod"), "laborHourLines": labor}
    return {"contractFacts": json.dumps(facts), "deliverable": json.dumps({"code": row.get("Code"), "name": row.get("Name"), "dueDay": row.get("DueDay"),
                                                                                "receivedDay": row.get("ReceivedDay")}),
            "requirements": json.dumps(requirements_for(abstract, row.get("Code"))), "reportText": report_text[:REPORT_TEXT_CHARS]}


def _norm(s: str) -> str:
    return " ".join(re.sub(r"[^\w$%.,-]+", " ", (s or "").lower()).split())


def checked_review(output: dict | None, requirements: list[str], report_text: str) -> dict:
    """The reviewer's output, held to the report: each requirement keeps its status and note, but a quote that isn't in
    the report's text is dropped (and said so), so the COR never reads evidence the report doesn't contain."""
    low = lambda d: {k[:1].lower() + k[1:]: v for k, v in d.items()} if isinstance(d, dict) else {}  # noqa: E731
    out = low(output or {})
    given = [low(x) for x in out.get("requirements") or [] if isinstance(x, dict)]
    by_requirement = {_norm(x.get("requirement", "")): x for x in given}
    text = _norm(report_text)
    items = []
    for i, req in enumerate(requirements):
        # Matched by the requirement's wording, else by position (the reviewer is asked to keep the order).
        got = by_requirement.get(_norm(req)) or (given[i] if i < len(given) else {})
        status = got.get("status") if got.get("status") in ("Met", "Partly met", "Missing") else "Not checked"
        quote = str(got.get("evidence") or "").strip()
        note = str(got.get("note") or "").strip()
        if quote and _norm(quote) not in text:
            quote, note = "", (note + " " if note else "") + "(The quote given wasn't found in the report, so it was left out.)"
        items.append({"requirement": req, "status": status, "evidence": quote[:300], "note": note[:500]})
    rec = out.get("recommendation") if out.get("recommendation") in ("Accept", "Accept with comments", "Reject") else None
    return {"requirements": items, "summary": str(out.get("summary") or "")[:1200], "recommendation": rec,
            "issues": [str(x)[:400] for x in out.get("issues") or []][:6], "agent": bool(output)}


def rejection_letter(contract: dict, row: dict, reason: str, resubmit_by: str, as_of: str) -> str:
    abstract = json.loads(contract.get("AbstractJson") or "{}")
    who = (abstract.get("contractor") or {}).get("name") or contract.get("AwardeeName") or "Contractor"
    return (f"{show_day(as_of)}\n\nTo: {who}\nContract: {contract.get('ContractNumber')}\nSubject: {row.get('Code') or ''} {row.get('Name')} not accepted\n\n"
            f"The Government has reviewed the {row.get('Name')} received {show_day(row.get('ReceivedDay'), as_of)} and does not accept it, "
            f"for these reasons:\n\n{reason.strip()}\n\nPlease submit a corrected deliverable by {show_day(resubmit_by)}.\n\n"
            f"Contracting Officer's Representative\n{contract.get('CorName') or ''}")


def reconcile(existing: list[dict], fresh: list[dict], now: str) -> list[dict]:
    """What to write: new alerts, changed ones, and resolutions, keeping each person's Acknowledge or Dismiss. A dismissed
    or acknowledged alert reopens only when it gets more severe; one whose condition cleared is marked Resolved."""
    have = {a["AlertId"]: a for a in existing}
    writes: list[dict] = []
    seen = set()
    fields = ("Kind", "Rule", "Subject", "Severity", "Title", "Detail", "DueDay", "Owner", "EvidenceJson")
    for a in fresh:
        seen.add(a["AlertId"])
        old = have.get(a["AlertId"])
        if not old or old.get("Status") == "Resolved":
            writes.append({**a, "Status": "Open", "RaisedAt": now, "ResolvedAt": None, "ActedBy": None, "ActedAt": None, "Reason": None})
            continue
        status = old.get("Status") or "Open"
        if status in ("Acknowledged", "Dismissed") and SEVERITY_RANK.get(a["Severity"], 0) > SEVERITY_RANK.get(old.get("Severity"), 0):
            status = "Open"
        row = {**a, "Status": status}
        if any(str(old.get(k) or "") != str(row.get(k) or "") for k in fields + ("Status",)):
            writes.append(row)
    for a in existing:
        if a["AlertId"] not in seen and a.get("Status") in ("Open", "Acknowledged"):
            writes.append({"AlertId": a["AlertId"], "SolicitationId": a["SolicitationId"], "Status": "Resolved", "ResolvedAt": now})
    return writes


# ── Options and the extension of services (slice B, scope §21) ─────────────
# Before exercising an option the CO gives written notice within the contract's period, confirms funds, and determines
# the elements of FAR 17.204-1(b)(3) (RFO); DoD adds DFARS 217.207(c). The package gathers each as a check with its
# facts and source. The writer agent drafts the three findings that need judgment; the CO decides and signs.

WRITER = "AW_OptionWriter"
GAO_DECISION_DAYS = 100        # 31 U.S.C. 3554(a)(1): GAO decides a protest within 100 days of filing
SPRS_YEARS = 3                 # DFARS 217.207(c)(2): the SPRS assessment is no more than 3 years old
RATINGS = ["Unsatisfactory", "Marginal", "Satisfactory", "Very Good", "Exceptional"]
CHECK_STATUSES = ("Met", "Not met", "To confirm", "Not required")
AGENT_ELEMENTS = ("requirement", "performance", "price")   # drafted by the writer; the robot writes the rest
ACTIONS = {"extension": ("Extend", "Do not extend"), "preliminary": ("Send preliminary notice", "Do not exercise"),
           "exercise": ("Exercise", "Do not exercise")}
WRITER_INPUT_CHARS = 9500      # Orchestrator's 10,000-character cap on a job's input


def is_extension_clause(r: dict) -> bool:
    """The 52.217-8 clause's own row (what remains of it); the periods exercised under it are Extension 1, 2, ..."""
    return r.get("Kind") == "Extension" and str(r.get("ScheduleId", "")).endswith("-extension-EXT")


def extensions_exercised(schedule: list[dict]) -> list[dict]:
    return sorted((r for r in schedule if r.get("Kind") == "Extension" and not is_extension_clause(r) and r.get("Status") == "Exercised"),
                  key=lambda r: r["StartDay"])


def term_end(schedule: list[dict]) -> str | None:
    """The day the contract ends as it stands: its last period not let go, or the last extension exercised."""
    ends = [r["EndDay"] for r in schedule if r.get("EndDay") and (
        (r.get("Kind") in ("Period", "Option") and r.get("Status") != "Not exercised") or r in extensions_exercised(schedule))]
    return max(ends) if ends else None


def months_between(start: str, end: str) -> int:
    """Whole months from `start` through `end` (Jan 1 to Jun 30 is 6)."""
    n = 0
    while add_months(start, n + 1) <= add_days(end, 1):
        n += 1
    return n


def clause_of(abstract: dict, ref: str) -> dict:
    return next((c for c in abstract.get("clauses") or [] if c.get("ref") == ref), {})


def next_modification(funding: list[dict], modifications: list[dict]) -> str:
    """The next modification number: one past the highest P-number on the contract's money and modifications."""
    nums = [int(m.group(1)) for x in [*(f.get("Reference") or "" for f in funding), *(m.get("Number") or "" for m in modifications)]
            for m in [re.fullmatch(r"P(\d{5})", x)] if m]
    return f"P{(max(nums) + 1) if nums else 1:05d}"


def successor_state(successor: dict | None, successor_schedule: list[dict], as_of: str) -> dict | None:
    """Where the follow-on contract stands: stayed by a protest, in its protest window, or under way."""
    if not successor:
        return None
    stay_by = json.loads(successor.get("ClocksJson") or "{}").get("stayByAward")
    ti = next((r.get("DueDay") for r in successor_schedule if r.get("Code") == "TI"), None)
    state = ("stayed" if successor.get("PerformanceStatus") == "Suspended"
             else "protest window" if stay_by and stay_by >= as_of else "under way")
    return {"contract": successor.get("ContractNumber") or successor.get("SolicitationId"), "contractor": successor.get("AwardeeName"),
            "state": state, "stayBy": stay_by, "transitionInDone": ti, "start": successor.get("PeriodStart")}


def extension_proposal(clause: dict, end: str, notice_days: int, succ: dict | None, as_of: str) -> tuple[int, str]:
    """How long to extend, and why: the shortest extension that covers the risk the follow-on carries."""
    remaining = months_between(clause["StartDay"], clause["EndDay"])
    if remaining <= 0:
        return 0, "The extension's months are used up."
    inc_end = lambda n: add_days(add_months(clause["StartDay"], n), -1)  # noqa: E731
    next_notice = lambda n: deadline(add_days(inc_end(n), -notice_days))  # noqa: E731
    cover = lambda day: next((n for n in range(1, remaining + 1) if inc_end(n) >= day), remaining)  # noqa: E731
    plural = lambda n: f"{n} month{'s' if n != 1 else ''}"  # noqa: E731
    if not succ:
        return remaining, f"No follow-on contract is linked, so the proposal is the whole remaining extension, {plural(remaining)}."
    who = f"The follow-on, {succ['contract']}"
    if succ["state"] == "stayed":
        through = add_days(as_of, GAO_DECISION_DAYS + TRANSITION_IN_DAYS)
        n = cover(through)
        return n, (f"{who}, is stayed by a protest. GAO decides within {GAO_DECISION_DAYS} days and the follow-on then needs its "
                   f"{TRANSITION_IN_DAYS}-day transition-in, so {plural(n)} runs to {show_day(inc_end(n), as_of)}.")
    if succ["state"] == "protest window":
        n = next((n for n in range(1, remaining + 1) if next_notice(n) > succ["stayBy"]), remaining)
        return n, (f"{who}, is in its protest window until {show_day(succ['stayBy'], as_of)}. {plural(n).capitalize()}, to "
                   f"{show_day(inc_end(n), as_of)}, keeps the work going if it's protested and stayed, and the next notice day, "
                   f"{show_day(next_notice(n), as_of)}, comes after the window closes, so the rest can be decided then (52.217-8 may be "
                   f"exercised more than once).")
    ti = succ.get("transitionInDone")
    if not ti or ti <= end:
        return 0, (f"{who}, is under way" + (f" and its transition-in completes {show_day(ti, as_of)}" if ti else "")
                   + f", before this contract ends {show_day(end, as_of)}. No extension is needed.")
    n = cover(ti)
    return n, f"{who}'s transition-in completes {show_day(ti, as_of)}, after this contract ends {show_day(end, as_of)}; {plural(n)} covers it."


def period_lines(abstract: dict, period_name: str) -> list[dict]:
    return [{"clin": c["clin"], "description": c.get("description"), "type": c.get("type"),
             "amount": round(float((c.get("byPeriod") or {}).get(period_name) or 0), 2)}
            for c in abstract.get("clins") or [] if (c.get("byPeriod") or {}).get(period_name)]


def _rating_ok(r: str | None) -> bool:
    return r in RATINGS and RATINGS.index(r) >= RATINGS.index("Satisfactory")


# Each check's heading in the determination and findings, in the order the memo takes them.
SHORT = {"notice": "Notice", "funds": "Funds", "requirement": "Existing need", "synopsis": "Synopsis", "exclusion": "Exclusion",
         "performance": "Performance", "price": "Price and best interest", "competition": "Competition", "duration": "Duration",
         "registration": "SAM registration", "sprs": "SPRS", "cmmc": "CMMC"}
FUNDS_FILL = "[Funds certification]"        # the CO's form fills these two from the Resource Manager's step and the decision
DETERMINATION_FILL = "[Determination]"


def _check(cid: str, label: str, rule: str, status: str, finding: str, source: str, facts: dict | None = None) -> dict:
    return {"id": cid, "label": label, "rule": rule, "status": status, "finding": finding, "source": source, "facts": facts or {}}


def option_package(contract: dict, row: dict, schedule: list[dict], funding: list[dict], modifications: list[dict], vendor: dict | None,
                   successor: dict | None, successor_schedule: list[dict], live_alerts: list[dict], as_of: str, igce: dict | None = None) -> dict:
    """What the CO decides on an option or the 52.217-8 extension, and every check FAR 17.204-1(b) and DFARS 217.207(c)
    ask for before exercising, each with its facts and source. Pure: the robot loads the rows, the agent drafts from this."""
    abstract = json.loads(contract.get("AbstractJson") or "{}")
    party = abstract.get("contractor") or {}
    who = party.get("name") or contract.get("AwardeeName") or "The contractor"
    agency = contract.get("Agency") or abstract.get("agency") or ""
    dod = bool(re.search(r"\b(Army|Navy|Air Force|Marine Corps|Space Force|Defense)\b", agency))
    end = term_end(schedule) or contract.get("PeriodEnd")
    period = current_period(schedule, as_of)
    succ = successor_state(successor, successor_schedule, as_of)
    number = contract.get("ContractNumber") or contract["SolicitationId"]
    first_start = min((r["StartDay"] for r in schedule if r.get("Kind") in ("Period", "Option") and r.get("StartDay")), default=None)
    out: dict = {"scheduleId": row["ScheduleId"], "asOf": as_of}

    if is_extension_clause(row):
        if row.get("Status") != "Planned":
            raise ValueError(f"The extension of services on {number} is {str(row.get('Status')).lower()}, so there's nothing to decide")
        fill = clause_of(abstract, "52.217-8")
        notice_days = int((fill.get("fill") or {}).get("noticeDaysBeforeExpiry") or EXTENSION_NOTICE_DAYS)
        cap = int((fill.get("fill") or {}).get("months") or EXTENSION_MONTHS)
        done = extensions_exercised(schedule)
        used = sum(months_between(r["StartDay"], r["EndDay"]) for r in done)
        remaining = months_between(row["StartDay"], row["EndDay"])
        months, reason = extension_proposal(row, end, notice_days, succ, as_of)
        base = period or {"Period": "", "StartDay": as_of, "EndDay": as_of}
        per = max(1, months_between(base["StartDay"], base["EndDay"]))
        lines = [{**x, "monthly": round(x["amount"] / per, 2)} for x in period_lines(abstract, base["Period"])]
        lines = [{**x, "amount": round(x["monthly"] * months, 2)} for x in lines]
        out |= {"kind": "extension", "stage": "extension", "title": "Extension of services", "name": f"Extension {len(done) + 1}",
                "clause": "52.217-8", "clauseText": row.get("ClauseText"), "noticeBy": row["DueDay"], "noticeDays": notice_days,
                "extension": {"remaining": remaining, "used": used, "cap": cap, "ratesFrom": base["Period"]},
                "proposal": {"months": months, "start": row["StartDay"], "end": add_days(add_months(row["StartDay"], months), -1) if months else None,
                             "amount": round(sum(x["amount"] for x in lines), 2), "reason": reason, "lines": lines}}
        what = "the extension"
    elif row.get("Kind") == "Option" and row.get("Status") in ("Planned", "Notice sent"):
        stage = "exercise" if row.get("Status") == "Notice sent" else "preliminary"
        lines = period_lines(abstract, row["Period"])
        months = months_between(row["StartDay"], row["EndDay"])
        lines = [{**x, "monthly": round(x["amount"] / max(months, 1), 2)} for x in lines]
        out |= {"kind": "option", "stage": stage, "title": row["Name"], "name": row["Name"], "clause": "52.217-9", "clauseText": row.get("ClauseText"),
                "noticeBy": row["DueDay"] if stage == "exercise" else row["NoticeDay"], "exerciseBy": row["DueDay"],
                "proposal": {"months": months, "start": row["StartDay"], "end": row["EndDay"], "amount": round(float(row.get("Amount") or 0), 2),
                             "reason": f"{row['Name']} runs {show_day(row['StartDay'], as_of)} to {show_day(row['EndDay'], as_of)} at the prices in the contract.",
                             "lines": lines}}
        what = row["Name"].lower()
    else:
        raise ValueError(f"{row.get('Name') or row.get('ScheduleId')} isn't an option or extension waiting for a decision (status {row.get('Status')})")

    prop = out["proposal"]
    late = as_of > out["noticeBy"]
    out |= {"daysLeft": days_between(as_of, out["noticeBy"]), "late": late, "modification": next_modification(funding, modifications),
            "appropriation": f"Operation and maintenance, {'Army, ' if 'Army' in agency else ''}FY{fiscal_year(prop['start'])}",
            "successor": succ,
            "contract": {"number": number, "contractor": who, "address": party.get("address"), "uei": party.get("uei"), "cage": party.get("cage"),
                         "title": contract.get("Title") or abstract.get("title"), "agency": agency, "office": contract.get("Office") or abstract.get("office"),
                         "end": end, "currentPeriod": period["Period"] if period else None, "dod": dod}}
    checks: list[dict] = []

    # (b)(1) Written notice within the contract's period.
    if out["stage"] == "preliminary":
        window = f"at least {(clause_of(abstract, '52.217-9').get('fill') or {}).get('preliminaryNoticeDays') or PRELIMINARY_NOTICE_DAYS} days before the contract expires (52.217-9(a))"
    elif out["stage"] == "exercise":
        window = "before the current period ends (52.217-9(a))"
    else:
        window = f"at least {out['noticeDays']} days before the contract expires (52.217-8, as filled in)"
    if late:
        checks.append(_check("notice", "Written notice within the contract's period", "FAR 17.204-1(b)(1)", "Not met",
                             f"The notice window closed {show_day(out['noticeBy'], as_of)}. A unilateral exercise is no longer available: it needs "
                             f"{who}'s agreement in a bilateral modification, and counsel should check whether part 6 then applies.",
                             f"{out['clause']} in {number}", {"window": window, "noticeBy": out["noticeBy"]}))
    else:
        checks.append(_check("notice", "Written notice within the contract's period", "FAR 17.204-1(b)(1)", "Met",
                             f"The contract's period for written notice runs to {show_day(out['noticeBy'])}: {window}.", f"{out['clause']} in {number}",
                             {"window": window, "noticeBy": out["noticeBy"], "daysLeft": out["daysLeft"]}))

    # (b)(2) Funds: the Resource Manager's step comes next.
    checks.append(_check("funds", "Funds are available", "FAR 17.204-1(b)(2)", "To confirm",
                         (f"A preliminary notice doesn't commit funds, but they should be planned: {money(prop['amount'])} for {out['name'].lower()}. "
                          if out["stage"] == "preliminary" else
                          f"{money(prop['amount'])} for {out['name'].lower()}" + (f", {show_day(prop['start'], as_of)} to {show_day(prop['end'], as_of)}. " if prop.get("end") else ". "))
                         + "The Resource Manager certifies them next.", "The Resource Manager's certification", {"amount": prop["amount"]}))

    # (b)(3)(i) An existing need.
    invoiced = sorted((f.get("ServiceEnd") or "" for f in funding if f.get("Kind") == "Invoice"), reverse=True)
    # Why the work still needs doing, stated plainly, so the writer argues from the record rather than from a date.
    in_place = None
    if succ:
        ti = succ.get("transitionInDone")
        in_place = bool(ti and end and ti <= end and succ["state"] != "stayed")
        if succ["state"] == "stayed":
            why = (f"The follow-on is stayed by a protest, so it can't take over until GAO decides and its transition-in is done. The work has to "
                   f"continue past {show_day(end, as_of)}, when this contract ends.")
        elif succ["state"] == "protest window":
            why = ((f"The follow-on is set to take over on time: its transition-in completes {show_day(ti, as_of)}, before this contract ends "
                    f"{show_day(end, as_of)}. " if in_place else "")
                   + f"The need is the risk that a GAO protest filed by {show_day(succ['stayBy'], as_of)} stays the follow-on's performance; this "
                   f"contract's notice deadline, {show_day(out['noticeBy'], as_of)}, comes before that window closes. Without an extension the work "
                   f"would stop after {show_day(end, as_of)} if that happens.")
        elif in_place:
            why = (f"The follow-on is under way and its transition-in completes {show_day(ti, as_of)}, before this contract ends {show_day(end, as_of)}, "
                   f"so it takes over on time and no work is left for an extension.")
        else:
            why = (f"The follow-on's transition-in completes {show_day(ti, as_of) if ti else 'on a day not on the record'}, after this contract ends "
                   f"{show_day(end, as_of)}, so the work has to continue until then.")
        req = f"The work continues until the follow-on, {succ['contract']} with {succ['contractor']}, takes over. {why}"
    else:
        why = (f"The requirement runs through {number}'s option years" + (f"; the work is invoiced monthly, most recently through {show_day(invoiced[0], as_of)}" if invoiced else "") + ".")
        req = why
    checks.append(_check("requirement", "The option fulfills an existing need", "FAR 17.204-1(b)(3)(i)", "To confirm", req,
                         "The follow-on contract's record; this contract's invoices" if succ else "The contract's schedule and invoices",
                         {"whyNeeded": why, "followOnInPlaceBeforeEnd": in_place, "successor": succ,
                          "lastInvoicedThrough": invoiced[0] if invoiced else None, "contractEnds": end}))

    # (b)(3)(ii) Synopsis.
    checks.append(_check("synopsis", "Synopsized, or exempt", "FAR 17.204-1(b)(3)(ii)", "Met" if abstract.get("synopsized") else "To confirm",
                         "The options were in the original solicitation, posted on SAM.gov, so exercising one needs no new synopsis (part 5)."
                         if abstract.get("synopsized") else "The record doesn't show the options in a synopsized solicitation. Check part 5 before exercising.",
                         "The contract as awarded"))

    # (b)(3)(iii) No active exclusion in SAM.
    src = f"SAM.gov entity record (demo data), as of {show_day(as_of)}"
    if not vendor:
        checks.append(_check("exclusion", "No active exclusion in SAM", "FAR 17.204-1(b)(3)(iii)", "To confirm",
                             f"No SAM record for {who} is on file. Check SAM.gov for an active exclusion.", src))
    else:
        bad = bool(vendor.get("Exclusion"))
        checks.append(_check("exclusion", "No active exclusion in SAM", "FAR 17.204-1(b)(3)(iii)", "Not met" if bad else "Met",
                             f"SAM {'shows an active exclusion' if bad else 'shows no active exclusion'} for {who} (UEI {vendor.get('UEI')}).", src))

    # (b)(3)(iv) Acceptable performance on this contract.
    cpars = [x for x in json.loads((vendor or {}).get("CparsSummaryJson") or "[]") if x.get("contract") == number]
    pstart = (period or {}).get("StartDay") or as_of
    mine = [r for r in schedule if r.get("Kind") == "Deliverable" and r.get("DueDay") and pstart <= r["DueDay"] <= as_of]
    accepted = [r for r in mine if r.get("Status") == "Accepted"]
    late_items = [r for r in mine if not r.get("ReceivedDay") and r.get("Status") == "Due" and r["DueDay"] < as_of]
    returned = [r for r in schedule if r.get("Kind") == "Deliverable" and json.loads(r.get("ReviewJson") or "{}").get("history")]
    # Only what counts against performance: a ceiling passed without notice, and deliverables or milestones overdue. A
    # deliverable not yet due isn't late.
    live = [a for a in live_alerts if a.get("Status") in ("Open", "Acknowledged")]
    issues = [{"item": a["Title"], "severity": a.get("Severity")} for a in live
              if a.get("Kind") == "ceiling" or (a.get("Kind") in ("deliverable", "milestone") and a.get("Severity") == "Overdue")]
    # Each labor-hour line against its ceiling, as plain facts: past 85% is 52.232-7's notice point, not the ceiling itself.
    ceilings = []
    for f in (forecast(abstract, funding, period, as_of) if period else {}).values():
        if f.get("type") != "Labor-hour" or not f.get("price"):
            continue
        pct = round(100 * f["accrued"] / f["price"])
        alert = next((a for a in live if a.get("Kind") == "ceiling" and str(a.get("Subject") or "").startswith(f"{f['clin']}-")), None)
        notice = None if not alert else "no notice" not in alert.get("Title", "")
        ceilings.append({"clin": f["clin"], "percentOfCeiling": pct, "past85": pct >= 85, "overCeiling": pct > 100, "contractorNoticeOnFile": notice})
    ratings = ", ".join(f"{x['rating']} ({period_phrase(x.get('period')).removeprefix('the ')})" for x in cpars)
    if not cpars:
        pstatus = "To confirm"
    else:
        pstatus = "Met" if all(_rating_ok(x.get("rating")) for x in cpars[-2:]) else "Not met"
    perf = (f"CPARS ratings on this contract: {ratings}." if cpars else "No CPARS ratings for this contract are on file.") + ((
        f" This period: {len(accepted)} deliverable{'s' if len(accepted) != 1 else ''} accepted"
        + (f"; {', '.join(r['Name'].lower() + ' (due ' + show_day(r['DueDay'], as_of) + ')' for r in late_items)} not yet received" if late_items else "")
        + (f"; {len(returned)} returned for correction" if returned else "") + ".") if mine else " No deliverables have come due this period.") + "".join(
        f" Line item {c['clin']} has accrued about {c['percentOfCeiling']}% of its labor-hour ceiling ("
        + ("over it" if c["overCeiling"] else "past the 85% notice point, not over the ceiling") + ")"
        + (f" with no notice from {who} (52.232-7(d))." if c["contractorNoticeOnFile"] is False else ".") for c in ceilings if c["past85"])
    checks.append(_check("performance", "Performance on this contract has been acceptable", "FAR 17.204-1(b)(3)(iv)", pstatus, perf,
                         "CPARS (demo data); this contract's deliverables and open action items",
                         {"cpars": cpars, "accepted": len(accepted), "late": [{"name": r["Name"], "due": r["DueDay"]} for r in late_items],
                          "returned": [r["Name"] for r in returned], "openItems": issues[:6], "laborHourCeilings": ceilings}))

    # (b)(3)(v) Price fair and reasonable on current market conditions; exercise in the Government's best interest.
    monthly = round(sum(x["monthly"] for x in prop["lines"]), 2)
    compare: list[dict] = []
    basis = None
    s_abs = json.loads((successor or {}).get("AbstractJson") or "{}")
    if s_abs.get("clins"):
        first = (s_abs.get("periods") or [None])[0]
        s_period, s_months = (first["name"], max(1, months_between(first["start"], first["end"]))) if first else ("Base", 12)
        theirs = {c["clin"]: float((c.get("byPeriod") or {}).get(s_period) or 0) / s_months for c in s_abs["clins"]}
        basis = f"the follow-on's competed prices ({succ['contract'] if succ else 'the follow-on'}, awarded {show_day((successor or {}).get('PeriodStart'), as_of)})"
        compare = [{"clin": x["clin"], "description": x["description"], "monthly": x["monthly"], "market": round(theirs[x["clin"]], 2)}
                   for x in prop["lines"] if theirs.get(x["clin"])]
    elif igce and igce.get("lines"):
        periods_n = max(1, sum(1 for r in schedule if r.get("Kind") in ("Period", "Option")))
        basis = "the independent Government cost estimate, by period"
        compare = [{"clin": x["clin"], "description": x["description"], "monthly": x["monthly"],
                    "market": round(float(igce["lines"].get(x["clin"]) or 0) / periods_n / 12, 2)} for x in prop["lines"] if igce["lines"].get(x["clin"])]
    # Each line's difference, with its direction, so no comparison is left to the writer's arithmetic.
    for c in compare:
        d = c["monthly"] - c["market"]
        c |= {"differencePerMonth": round(d, 2), "percent": round(100 * d / c["market"]) if c["market"] else None,
              "direction": "below" if d < -0.005 else "above" if d > 0.005 else "the same as"}
    notable = sorted((c for c in compare if c["percent"] is not None and abs(c["percent"]) >= 10), key=lambda c: -abs(c["percent"]))
    ours, market = sum(c["monthly"] for c in compare), sum(c["market"] for c in compare)
    if compare and market:
        diff = (ours - market) / market
        price = (f"At the contract's rates {what} costs {money(monthly)} a month" + (f" ({money(prop['amount'])} for {prop['months']} months). " if prop["months"] > 1 else ". ")
                 + f"For the same line items, {basis}: {money(market)} a month. These rates are {abs(diff):.0%} {'below' if diff < 0 else 'above'} that."
                 + (" By line item: " + "; ".join(f"{c['clin']} ({c['description']}) is {abs(c['percent'])}% {c['direction']} it" for c in notable) + "." if notable else ""))
    else:
        price = f"At the contract's rates {what} costs {money(monthly)} a month ({money(prop['amount'])} in all). No current market comparison is on the record."
    checks.append(_check("price", "Price fair and reasonable; exercise in the Government's best interest", "FAR 17.204-1(b)(3)(v)", "To confirm", price,
                         f"The contract's prices; {basis}" if basis else "The contract's prices",
                         {"monthly": monthly, "market": round(market, 2) if compare else None, "comparison": compare, "basis": basis,
                          "notable": [c["clin"] for c in notable]}))

    # (b)(3)(vi) Part 6: evaluated in the initial competition, at a price the contract sets.
    evaluated = clause_of(abstract, out["clause"]).get("evaluated")
    checks.append(_check("competition", "Evaluated at award, at a price the contract sets", "FAR 17.204-1(b)(3)(vi)", "Met" if evaluated else "To confirm",
                         (f"The {'extension' if out['kind'] == 'extension' else 'option'} was evaluated in the initial competition, and its price is set by the "
                          f"contract: {'the rates of ' + period_phrase(out['extension']['ratesFrom']) if out['kind'] == 'extension' else 'the prices for ' + out['name'].lower()}.")
                         if evaluated else ("The record doesn't show that the extension was evaluated at award. If it wasn't, exercising it needs a justification "
                                            "under part 6."), "The contract as awarded"))

    # The clauses' own limits: 6 months under 52.217-8, and any total duration in 52.217-9(c).
    cap_months = (clause_of(abstract, "52.217-9").get("fill") or {}).get("maxDurationMonths")
    total = months_between(first_start, prop["end"]) if first_start and prop.get("end") else None
    if out["kind"] == "extension":
        within = out["extension"]["used"] + prop["months"] <= out["extension"]["cap"] and (not cap_months or not total or total <= cap_months)
        ext = out["extension"]
        text = (f"{ext['used']} of the {ext['cap']} months 52.217-8 allows {'is' if ext['used'] == 1 else 'are'} used, so up to {ext['remaining']} more stay within it"
                + (f" and within the {cap_months}-month total in 52.217-9(c)" if cap_months else "") + ".")
    else:
        within = not cap_months or not total or total <= cap_months
        text = f"With {out['name'].lower()} the contract runs {total} months" + (f", within the {cap_months}-month limit in 52.217-9(c)." if cap_months else ".")
    checks.append(_check("duration", "Within the clauses' limits", "52.217-8; 52.217-9(c)", "Met" if within else "Not met", text, f"{number}, Section I"))

    # DoD: DFARS 217.207(c). The SAM registration matches and is active; SPRS is current; CMMC, if the contract needs it.
    if dod:
        if not vendor:
            checks.append(_check("registration", "SAM registration active and matching the contract", "DFARS 217.207(c)(1)", "To confirm",
                                 f"No SAM record for {who} is on file. Check that its registration is active and matches the contract.", src))
        else:
            active = vendor.get("SamStatus") == "Active" and (vendor.get("RegistrationExpiry") or "") >= as_of
            match = vendor.get("UEI") == party.get("uei") and _norm(vendor.get("LegalName") or "") == _norm(who)
            exp = vendor.get("RegistrationExpiry")
            lapse = exp and prop.get("end") and exp < prop["end"]
            checks.append(_check("registration", "SAM registration active and matching the contract", "DFARS 217.207(c)(1)",
                                 "Met" if active and match else "Not met",
                                 (f"Active through {show_day(exp, as_of)}; the UEI and name match the contract." if active else f"The registration isn't active (expired {show_day(exp, as_of)}).")
                                 + ("" if match else " The UEI or name doesn't match the contract.")
                                 + (f" It expires before {out['name'].lower()} would end ({show_day(prop['end'], as_of)}), so ask {who} to renew it." if active and lapse else ""),
                                 src, {"expires": exp}))
        sprs = party.get("sprs") or {}
        if sprs.get("assessed"):
            good_to = add_months(sprs["assessed"], 12 * SPRS_YEARS)
            checks.append(_check("sprs", "SPRS assessment current (3 years or less)", "DFARS 217.207(c)(2)", "Met" if good_to >= as_of else "Not met",
                                 f"{sprs.get('type') or 'Assessment'} of {show_day(sprs['assessed'], as_of)}, score {sprs.get('score')}: current until {show_day(good_to, as_of)}"
                                 + (f", before {out['name'].lower()} would end, so a new assessment is due during it." if prop.get("end") and good_to < prop["end"] else "."),
                                 "SPRS (demo data in the contract record)", {"assessed": sprs["assessed"], "currentUntil": good_to}))
        else:
            checks.append(_check("sprs", "SPRS assessment current (3 years or less)", "DFARS 217.207(c)(2)", "To confirm",
                                 "No SPRS assessment is on the record. Check SPRS before exercising.", "SPRS"))
        cmmc = abstract.get("cmmc")
        if cmmc and cmmc.get("required") is False:
            checks.append(_check("cmmc", "CMMC status current, if required", "DFARS 217.207(c)(2)", "Not required", "The contract has no CMMC requirement.", "The contract as awarded"))
        elif cmmc and cmmc.get("status"):
            checks.append(_check("cmmc", "CMMC status current, if required", "DFARS 217.207(c)(2)", "Met" if cmmc.get("status") == "Current" else "Not met",
                                 f"{cmmc.get('required')}: {cmmc.get('status')}.", "SPRS"))
        else:
            checks.append(_check("cmmc", "CMMC status current, if required", "DFARS 217.207(c)(2)", "To confirm",
                                 "The record doesn't say whether the contract requires a CMMC level. If it does, check the status in SPRS.", "SPRS"))
    out["checks"] = checks
    return out


def writer_inputs(pkg: dict) -> dict:
    """What the writer agent sees: the contract, the decision and the checks with their facts, as JSON strings."""
    c = pkg["contract"]
    facts = {"contractNumber": c["number"], "contractor": c["contractor"], "currentPeriod": c["currentPeriod"], "contractEnds": c["end"], "dod": c["dod"],
             "lines": [{k: x.get(k) for k in ("clin", "description", "type", "monthly")} for x in pkg["proposal"]["lines"]]}
    decision = {"stage": pkg["stage"], "what": pkg["title"], "clause": pkg["clause"], "noticeBy": pkg["noticeBy"], "daysLeft": pkg["daysLeft"],
                "late": pkg["late"], "allowedActions": list(ACTIONS[pkg["stage"]]),
                "proposal": {k: pkg["proposal"].get(k) for k in ("months", "start", "end", "amount", "reason")},
                "monthsRemaining": (pkg.get("extension") or {}).get("remaining"), "successor": pkg.get("successor")}
    checks = [{k: x[k] for k in ("id", "label", "rule", "status", "finding", "facts")} for x in pkg["checks"]]
    out = {"contractFacts": json.dumps(facts), "decision": json.dumps(decision), "checks": json.dumps(checks)}
    if sum(len(v) for v in out.values()) > WRITER_INPUT_CHARS:  # facts are the first to go; findings carry the gist
        out["checks"] = json.dumps([{k: x[k] for k in ("id", "label", "rule", "status", "finding")} for x in pkg["checks"]])
    return out


def checked_writing(output: dict | None, pkg: dict) -> tuple[dict, dict]:
    """The writer's drafts, held to the checks: (its finding texts by check, the writer summary kept on the package). Only
    the three judgment findings are taken; each keeps only citations of checks that exist (the rest are dropped, and said
    so). An action outside the stage's choices is left out, and an extension's length outside what remains falls back to
    the proposal's."""
    low = lambda d: {k[:1].lower() + k[1:]: v for k, v in d.items()} if isinstance(d, dict) else {}  # noqa: E731
    out = low(output or {})
    ids = {x["id"] for x in pkg["checks"]}
    given = {str(f.get("element") or "").strip().lower(): f for f in (low(x) for x in out.get("findings") or [])}
    texts, drafted = {}, {}
    for e in AGENT_ELEMENTS:
        g = given.get(e) or {}
        text = str(g.get("text") or "").strip()
        if not text:
            continue
        cited = [str(s) for s in g.get("sources") or []]
        kept = [s for s in cited if s in ids]
        texts[e] = text[:900]
        drafted[e] = {"sources": kept or [e], **({"note": "A citation of a check that isn't in the package was left out."} if len(kept) < len(cited) else {})}
    action = out.get("recommendation") if out.get("recommendation") in ACTIONS[pkg["stage"]] else None
    months = None
    if pkg["stage"] == "extension" and action == "Extend":
        try:
            months = int(out.get("recommendedMonths") or 0)
        except (TypeError, ValueError):
            months = 0
        if not 1 <= months <= pkg["extension"]["remaining"]:
            months = pkg["proposal"]["months"] or 1
    writer = {"recommendation": action, "recommendedMonths": months, "reason": str(out.get("reason") or "")[:300],
              "summary": str(out.get("summary") or "")[:450], "risks": [str(r)[:160] for r in out.get("risks") or []][:3],
              "drafted": drafted, "agent": bool(output)}
    return texts, writer


def determination_draft(pkg: dict, texts: dict) -> str:
    """The determination and findings the CO signs: one finding per check, the writer's text for the three that need
    judgment and the check's own for the rest. The funds finding and the determination are filled in by the CO's form."""
    c = pkg["contract"]
    what = {"extension": "Exercise of the option to extend services (FAR 52.217-8)",
            "preliminary": f"{pkg['name']}: preliminary notice of intent to extend (FAR 52.217-9(a))",
            "exercise": f"Exercise of {pkg['name'].lower()} (FAR 52.217-9)"}[pkg["stage"]]
    findings = []
    for i, x in enumerate(pkg["checks"], 1):
        text = FUNDS_FILL if x["id"] == "funds" else texts.get(x["id"]) or x["finding"]
        findings.append(f"{i}. {SHORT.get(x['id'], x['label'])} ({x['rule']}). {text}")
    rules = "FAR 17.204-1(b)" + ("; DFARS 217.207(c)" if c.get("dod") else "")
    return "\n\n".join([
        "DETERMINATION AND FINDINGS", what, f"Contract {c['number']}, {c['contractor']}\n{c.get('title') or ''}, {c.get('office') or ''}",
        f"Findings ({rules})", *findings, "Determination", DETERMINATION_FILL,
        f"{letters.DATE}\n{letters.SIGNATURE}\nContracting Officer, {c.get('office') or ''}"])


def stored_package(pkg: dict) -> dict:
    """The package as kept on the schedule row (ReviewJson, 10,000 characters, with room for the Resource Manager's
    certification and the CO's decision): the checks without the agent's facts, and without the clause's wording, which
    the row itself carries (ClauseText)."""
    return {**{k: v for k, v in pkg.items() if k != "clauseText"},
            "checks": [{k: (v[:700] if k == "finding" else v) for k, v in x.items() if k != "facts"} for x in pkg["checks"]]}


def decided_lines(pkg: dict, dec: dict) -> list[dict]:
    """Each line item's amount for what the CO decided: an option at its prices, an extension at the monthly rates times
    the months chosen (the CO's form shows the same figures, award-task-forms src/lib/options.ts)."""
    if pkg.get("kind") == "extension":
        return [{**x, "amount": round(x["monthly"] * int(dec.get("months") or 0), 2)} for x in pkg["proposal"]["lines"]]
    return [dict(x) for x in pkg["proposal"]["lines"]]
