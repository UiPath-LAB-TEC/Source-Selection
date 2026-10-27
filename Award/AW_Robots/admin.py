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
        "clauses": [{"ref": "52.217-9", "fill": {"preliminaryNoticeDays": PRELIMINARY_NOTICE_DAYS}},
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
    if successor.get("Stage") in ("Contract award", "Notices", "Debriefings", "Protest window") and not successor.get("ClosedAt"):
        clocks_ = json.loads(successor.get("ClocksJson") or "{}")
        by = clocks_.get("stayByAward")
        when = (f" (a GAO protest filed by {show_day(by, as_of)} would stay its performance)" if by and by >= as_of
                else " (a protest after its debriefings could still stay its performance)")
        return (f"{who} is still in its protest window{when}"
                + ". If it's stayed, this contract needs the extension in hand.")
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
    final_end = periods[-1]["EndDay"] if periods else None

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
        out.append(_alert(sol, "option", period_code(r["Name"]), sev, title, detail, target, CO,
                          {"period": r["Name"], "start": r["StartDay"], "noticeDay": r.get("NoticeDay"), "exerciseBy": r["DueDay"], "price": r.get("Amount")}))

    # Extension of services once no options remain (52.217-8).
    planned_options = [r for r in periods if r.get("Kind") == "Option" and r.get("Status") in ("Planned", "Notice sent")]
    for r in (r for r in schedule if r.get("Kind") == "Extension" and r.get("Status") == "Planned"):
        if planned_options or not final_end or days_between(as_of, final_end) > LEAD["extension"] or as_of > final_end:
            continue
        sev = severity(as_of, r["DueDay"], LEAD["extension"]) or "Upcoming"
        detail = (f"No options remain and the contract ends {show_day(final_end, as_of)}. 52.217-8 allows up to {EXTENSION_MONTHS} more months at the "
                  f"contract's rates, by written notice by {show_day(r['DueDay'], as_of)}. {_successor_note(successor, as_of)}")
        out.append(_alert(sol, "extension", "EXT", sev, f"Extension of services: decide by {show_day(r['DueDay'], as_of)}", detail, r["DueDay"], CO,
                          {"contractEnds": final_end, "exerciseBy": r["DueDay"], "extensionEnds": r.get("EndDay"),
                           "successor": (successor or {}).get("AwardId")}))

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
    nxt = next((r for r in planned_options), None) or next((r for r in schedule if r.get("Kind") == "Extension" and r.get("Status") == "Planned"), None)
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
