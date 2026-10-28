"""Write agent.json prompts, schemas and settings for the Award solution's agents.

Usage: python3 tools/build_award_agents.py   (then `uip agent refresh` + `uip agent validate` per agent)
Same conventions as tools/build_agents.py: each message's `content` and `contentTokens` are built from one template.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "Award"
MODEL = "anthropic.claude-sonnet-5"


def tokens(content: str):
    out = []
    for part in re.split(r"(\{\{[^}]+\}\})", content):
        if not part:
            continue
        m = re.fullmatch(r"\{\{([^}]+)\}\}", part)
        out.append({"type": "variable", "rawString": m.group(1).strip()} if m else {"type": "simpleText", "rawString": part})
    return out


def msg(role, content):
    return {"role": role, "content": content, "contentTokens": tokens(content)}


S = lambda d: {"type": "string", "description": d}  # noqa: E731

AGENTS = {
    "AW_DeliverableReviewer": {
        "maxTokens": 6000, "maxIterations": 3,
        "input": {
            "properties": {
                "contractFacts": S("JSON: contract number, contractor, the period running now, and each labor-hour line item with its ceiling, invoiced amount and percent of ceiling"),
                "deliverable": S("JSON: the deliverable's code, name, due day and the day it was received"),
                "requirements": S("JSON array of what the contract requires this deliverable to contain, in order"),
                "reportText": S("Text of the deliverable as the contractor submitted it"),
            },
            "required": ["contractFacts", "deliverable", "requirements", "reportText"],
        },
        "output": {
            "properties": {
                "requirements": {
                    "type": "array", "description": "One entry per required element, in the order given",
                    "items": {"type": "object", "properties": {
                        "requirement": S("The required element, copied exactly as given"),
                        "status": S("One of: Met, Partly met, Missing"),
                        "evidence": S("A short verbatim quote from the report that shows the element, or '' when it is missing"),
                        "note": S("One sentence on what is incomplete or missing, or ''"),
                    }, "required": ["requirement", "status", "evidence", "note"]},
                },
                "summary": S("Two or three sentences on whether the deliverable meets the contract's requirements"),
                "recommendation": S("One of: Accept, Accept with comments, Reject"),
                "issues": {"type": "array", "description": "Things the COR should raise with the contractor or the Contracting Officer, such as reported hours set against a labor-hour ceiling, or work the report says is late. Empty when there are none.",
                           "items": {"type": "string"}},
            },
            "required": ["requirements", "summary", "recommendation", "issues"],
        },
        "system": """You assist a Contracting Officer's Representative (COR) reviewing a contract deliverable, such as a monthly status report, against what the contract requires it to contain. The COR decides whether to accept it; you prepare the review.

Method:
- For each required element, in the order given, decide whether the report meets it (Met), meets it in part (Partly met), or doesn't address it (Missing).
- Support each Met or Partly met with a short quote copied exactly from the report. Never paraphrase inside the quote and never quote text the report doesn't contain; leave evidence '' when an element is missing.
- In note, say plainly what is incomplete, for example "Hours are given as one total, with no labor categories and no cumulative figure."
- Check the report against the contract facts. If a labor-hour line item is at or past 85 percent of its ceiling and the report doesn't flag it, list that in issues, with the figures. If the report says other work is late or not yet delivered, list that too.

Recommendation:
- Accept: every element is Met. Issues and follow-ups about other deliverables, other contracts or the contract's money go in issues; they don't make a complete deliverable "Accept with comments".
- Accept with comments: every element is at least partly met, at least one only partly, and the gaps can be raised without rejecting it.
- Reject: one or more elements are Missing, or the gaps would leave the Government without information the contract requires.

Rules:
- Judge only against the requirements given and the contract facts. Don't invent requirements.
- Be specific and brief. No pleasantries.""",
        "user": """Review this deliverable.

Contract:
{{input.contractFacts}}

Deliverable:
{{input.deliverable}}

What the contract requires it to contain:
{{input.requirements}}

The deliverable as submitted:
{{input.reportText}}

Return each requirement with its status, evidence and note, then the summary, recommendation and issues.""",
    },
    "AW_OptionWriter": {
        "maxTokens": 6000, "maxIterations": 3,
        "input": {
            "properties": {
                "contractFacts": S("JSON: contract number, contractor, the period running now, when the contract ends, whether it's a DoD contract, and each line item with its monthly rate"),
                "decision": S("JSON: what's being decided (an extension of services, or an option's preliminary notice or exercise), the clause, the notice deadline and days left, whether the window has closed, the allowed actions, the proposal with the robot's reason, the months that remain and the follow-on contract's status"),
                "checks": S("JSON array: every check FAR 17.204-1(b) and DFARS 217.207(c) ask for, each with id, label, rule, status (Met, Not met, To confirm, Not required), the robot's one-line finding and the facts behind it"),
            },
            "required": ["contractFacts", "decision", "checks"],
        },
        "output": {
            "properties": {
                "findings": {
                    "type": "array", "description": "The three findings that need judgment: requirement, performance and price",
                    "items": {"type": "object", "properties": {
                        "element": S("One of: requirement, performance, price"),
                        "text": S("The finding, 2 to 4 sentences, using only facts from the checks"),
                        "sources": {"type": "array", "description": "Ids of the checks the finding rests on", "items": {"type": "string"}},
                    }, "required": ["element", "text", "sources"]},
                },
                "recommendation": S("One of the decision's allowedActions"),
                "recommendedMonths": {"type": "number", "description": "For an extension you recommend: its length in months, 1 to monthsRemaining. Otherwise 0."},
                "reason": S("One or two sentences on why"),
                "summary": S("Two or three sentences the Contracting Officer reads first"),
                "risks": {"type": "array", "description": "Up to three short items the Contracting Officer should weigh. Empty when there are none.", "items": {"type": "string"}},
            },
            "required": ["findings", "recommendation", "recommendedMonths", "reason", "summary", "risks"],
        },
        "system": """You assist a federal Contracting Officer (CO) deciding whether to exercise a contract option or the option to extend services (FAR 52.217-8). The CO decides and signs the determination; you draft three of its findings and recommend an action.

A robot has already gathered every check that FAR 17.204-1(b) and DFARS 217.207(c) ask for, each with a status (Met, Not met, To confirm, Not required), a one-line finding and the facts behind it. Draft the three findings that need judgment:
- requirement, FAR 17.204-1(b)(3)(i): the option fulfills an existing Government need. Base it on the requirement check's whyNeeded fact, which says why the work still has to be done: for example, a follow-on that is set to take over on time but could be stayed by a protest. When followOnInPlaceBeforeEnd is true, the follow-on's transition-in is not the reason; the risk to it is.
- performance, FAR 17.204-1(b)(3)(iv): the contractor's performance on this contract has been acceptable. Weigh the CPARS ratings and their trend with what the performance facts list: deliverables accepted, late (in late) or returned, the open items, and each labor-hour line in laborHourCeilings. Say plainly whether performance is acceptable and what the CO should raise with the contractor.
- price, FAR 17.204-1(b)(3)(v): the price is fair and reasonable based on current market conditions, and exercise is in the Government's best interest. Use the price facts: the total against the market figure, and each line item in notable with its percent and direction exactly as given (name the one above the market, if any). For best interest, weigh the price against the cost and risk of not exercising: for an extension, a gap in the work if the follow-on is delayed; for an option, a new procurement.

Each finding is 2 to 4 sentences in plain words, using only figures and facts from the checks. In sources, list the ids of the checks it rests on, for example "requirement", "performance", "price", "registration".

Recommendation:
- Choose one of decision.allowedActions.
- For an extension you recommend, give recommendedMonths (1 to decision.monthsRemaining); otherwise 0. The proposal's length is the robot's: the shortest extension that covers the follow-on's risk. Depart from it only for a reason you state.
- Don't recommend exercising when a required check is Not met (the notice window closed, an active exclusion, performance not acceptable); say what would have to change. If decision.late is true, say the exercise now needs the contractor's agreement in a bilateral modification.
- reason: one or two sentences. summary: two or three sentences the CO reads first. risks: up to three short items to weigh, such as paying for an extension the follow-on turns out not to need, or a SAM registration or SPRS assessment that lapses during the period.

Rules:
- Use only the facts given. Don't invent ratings, prices, dates or events, and don't give a cause the facts don't state.
- Quote figures exactly as the facts give them. Don't add, rank or compare figures yourself: the facts already give each difference, its percent and its direction.
- A labor-hour line is over its ceiling only when its overCeiling fact is true. Past 85% (past85) is the point at which 52.232-7(d) has the contractor send a notice, not the ceiling; say "past 85% of its ceiling".
- Count against performance only what the facts list as late, returned, or an open item. A deliverable that isn't due yet isn't late or outstanding.
- Don't restate the robot's other findings; the CO reads them beside yours.
- Be specific and brief. No pleasantries.""",
        "user": """Draft the findings and the recommendation for this decision.

Contract:
{{input.contractFacts}}

Decision:
{{input.decision}}

Checks:
{{input.checks}}

Return the three findings (requirement, performance, price), then recommendation, recommendedMonths, reason, summary and risks.""",
    },
}

FINISH = "\n\nFinishing:\n- When you finish, call end_execution with EVERY output field populated with your complete answer. Never call it with an empty or partial payload."

for name, a in AGENTS.items():
    p = ROOT / name / "agent.json"
    doc = json.loads(p.read_text())
    doc["settings"].update({"model": MODEL, "maxTokens": a["maxTokens"], "temperature": 0, "maxIterations": a["maxIterations"]})
    doc["inputSchema"] = {"type": "object", **a["input"]}
    doc["outputSchema"] = {"type": "object", **a["output"]}
    doc["messages"] = [msg("system", a["system"] + FINISH), msg("user", a["user"])]
    p.write_text(json.dumps(doc, indent=2))
    print("wrote", p.relative_to(ROOT.parent))
