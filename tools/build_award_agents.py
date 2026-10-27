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
- Accept: every element is Met.
- Accept with comments: every element is at least partly met and the gaps can be raised without rejecting it.
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
