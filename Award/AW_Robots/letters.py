"""The contract award summary and the notices to offerors, as plain text from the evaluation record. Pure functions: no
platform calls, so every rule is tested on its own (tests/test_letters.py).

Notice contents follow FAR 15.207-2(b) under the RFO deviation (FAR 15.503(b)(1) as codified): the number of offerors
solicited and proposals received, the awardee's name and address, the items and prices awarded, and in general terms
why the offeror's proposal was not accepted, with no cost breakdown, profit or overhead rates.

The Contracting Officer signs on release: the form replaces DATE and SIGNATURE in every document it approves.
"""
from __future__ import annotations

import json
import re

DATE = "[Date sent]"
SIGNATURE = "[Contracting Officer's signature]"

DOD = re.compile(r"\b(Army|Navy|Air Force|Marine Corps|Space Force|Department of Defense|Defense Logistics|Defense Information)\b", re.I)


def is_dod(plan: dict) -> bool:
    """DoD offerors get the enhanced debriefing (DFARS 215.301-270): follow-up questions after the debriefing."""
    return bool(DOD.search(plan.get("agency", "")))


def contract_number(solicitation_id: str, contract_type: str = "") -> str:
    """The PIID's instrument-type letter goes from R (solicitation) to C (contract), or D for an indefinite-delivery contract."""
    letter = "D" if re.search(r"indefinite|IDIQ", contract_type, re.I) else "C"
    return re.sub(r"-R-", f"-{letter}-", solicitation_id, count=1) if "-R-" in solicitation_id else f"{solicitation_id}-{letter}"


def money(n: float | None) -> str:
    return "-" if n is None else f"${n:,.0f}"


def cover(offeror: dict) -> dict:
    return (json.loads(offeror.get("ExtractionJson") or "{}").get("cover") or {})


def price_lines(offeror: dict) -> list[dict]:
    return json.loads(offeror.get("PriceLinesJson") or "[]")


def award_summary(plan: dict, solicitation: dict, awardee: dict, award_decision: dict | None) -> dict:
    """What the Contracting Officer signs: the awardee, its line items and total, and the decision it rests on."""
    lines = price_lines(awardee)
    total = awardee.get("TotalEvaluatedPrice") or sum(line.get("amount") or 0 for line in lines)
    c = cover(awardee)
    return {
        "contractNumber": contract_number(solicitation["SolicitationId"], plan.get("contractType", "")),
        "solicitationId": solicitation["SolicitationId"], "title": plan.get("title", ""),
        "office": plan.get("office", ""), "agency": plan.get("agency", ""), "contractType": plan.get("contractType", ""),
        "awardee": awardee["Name"], "offerorId": awardee["OfferorId"], "address": c.get("address", ""),
        "uei": awardee.get("UEI") or c.get("uei", ""), "cage": awardee.get("CAGE") or c.get("cage", ""),
        "value": total, "clins": [{"clin": line.get("clin"), "description": line.get("description"), "amount": line.get("amount")} for line in lines],
        "decisionSignedAt": (award_decision or {}).get("DecidedAt"), "decisionSignedBy": (award_decision or {}).get("DecidedBy"),
    }


def clin_table(summary: dict) -> str:
    rows = [f"CLIN {c['clin']}  {c['description']}  {money(c['amount'])}" for c in summary["clins"]]
    return "\n".join(rows + [f"Total contract price  {money(summary['value'])}"])


def award_document(summary: dict) -> str:
    """The contract award summary filed as Contract-Award.pdf once signed (synthetic demo, not a Standard Form)."""
    return "\n\n".join([
        f"Contract number: {summary['contractNumber']}\nSolicitation: {summary['solicitationId']}, {summary['title']}",
        f"Contracting office: {summary['office']}, {summary['agency']}",
        f"Contractor: {summary['awardee']}\n{summary['address']}\nUEI {summary['uei']} · CAGE {summary['cage']}",
        f"Contract type: {summary['contractType']}",
        clin_table(summary),
        f"Basis for award: the source selection decision signed by {summary['decisionSignedBy'] or 'the Source Selection Authority'}"
        + (f" on {str(summary['decisionSignedAt'])[:10]}" if summary.get("decisionSignedAt") else "") + ", filed with the award record.",
        f"Effective date: {DATE}",
        f"{SIGNATURE}\nContracting Officer, {summary['office']}",
    ])


def _rank(plan: dict, factor: dict, rating: str | None) -> int | None:
    scale = plan["scales"][factor.get("scale") or "technical"]
    return scale.index(rating) if rating in scale else None


def _join(names: list[str]) -> str:
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def reason(plan: dict, offeror: dict, awardee: dict, consensus: list[dict]) -> str:
    """Why the offeror's proposal was not accepted, in general terms: which factors rated the awardee higher, and price."""
    rated = sorted([f for f in plan["factors"] if not f.get("evaluatedNotRated")], key=lambda f: f.get("order", 0))
    rating = {(r["OfferorId"], r["FactorId"]): r["Rating"] for r in consensus}
    higher = []
    for f in rated:
        a, o = (_rank(plan, f, rating.get((x["OfferorId"], f["id"]))) for x in (awardee, offeror))
        if a is not None and o is not None and a < o:  # 0 is the scale's best rating
            higher.append(f["name"])
    mine, theirs = offeror.get("TotalEvaluatedPrice"), awardee.get("TotalEvaluatedPrice")
    cheaper = mine is not None and theirs is not None and mine < theirs
    if higher and cheaper:
        return (f"The Government rated the awardee's proposal higher on {_join(higher)}. The Source Selection Authority determined "
                "that those advantages were worth the awardee's higher price.")
    if higher:
        return f"The Government rated the awardee's proposal higher on {_join(higher)}, at a lower total price."
    if mine is not None and theirs is not None and mine > theirs:
        return "The awardee's proposal was rated as high as yours on every factor and offered a lower total price."
    return "The Source Selection Authority determined that the awardee's proposal offered the best value under the stated evaluation criteria."


def _letterhead(summary: dict, to: dict) -> str:
    return "\n\n".join([f"{summary['office']}\n{summary['agency']}", DATE, f"{to['Name']}\n{cover(to).get('address', '')}"])


def unsuccessful_notice(plan: dict, summary: dict, offeror: dict, awardee: dict, consensus: list[dict], received: int) -> str:
    debrief = ("To request a debriefing, write to the Contracting Officer within 3 days after you receive this notice "
               "(FAR 15.301-1(a)(1) under the RFO deviation; FAR 15.506(a)(1)).")
    if is_dod(plan):
        debrief += (" After the debriefing you may submit additional written questions within 2 business days, and the "
                    "Government will answer them in writing within 5 business days (DFARS 215.301-270).")
    return "\n\n".join([
        _letterhead(summary, offeror),
        f"Subject: Notice of award, solicitation {summary['solicitationId']}, {summary['title']}",
        f"The Government has awarded contract {summary['contractNumber']} under this solicitation. This notice is provided "
        "under FAR 15.207-2 (RFO deviation; FAR 15.503(b)).",
        "1. Offerors solicited: the solicitation was posted publicly on SAM.gov.",
        f"2. Proposals received: {received}.",
        f"3. Awardee: {awardee['Name']}, {cover(awardee).get('address', '')}.",
        "4. Items and prices awarded:\n" + clin_table(summary),
        f"5. Why your proposal was not selected: {reason(plan, offeror, awardee, consensus)}",
        debrief,
        f"{SIGNATURE}\nContracting Officer, {summary['office']}",
    ])


def award_notice(plan: dict, summary: dict, awardee: dict) -> str:
    return "\n\n".join([
        _letterhead(summary, awardee),
        f"Subject: Notice of award, contract {summary['contractNumber']}",
        f"Your proposal under solicitation {summary['solicitationId']}, {summary['title']}, has been selected for award. "
        f"Contract {summary['contractNumber']}, a {summary['contractType'][:1].lower() + summary['contractType'][1:]} contract "
        f"with a total price of {money(summary['value'])}, is enclosed.",
        "The Contracting Officer will contact you to schedule the post-award conference. Unsuccessful offerors are being "
        "notified at the same time and may request debriefings; if a protest is filed, you will be told whether performance "
        "is suspended.",
        f"{SIGNATURE}\nContracting Officer, {summary['office']}",
    ])
