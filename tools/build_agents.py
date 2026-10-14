"""Write agent.json prompts, schemas and settings for the three Source Selection agents.

Usage: python3 tools/build_agents.py   (then `uip agent refresh` + `uip agent validate` per agent)
Keeps each message's `content` and `contentTokens` in sync by building both from one template.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "SourceSelection"
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


S = lambda d: {"type": "string", "description": d}

FINDING_KINDS = "Significant Strength, Strength, Weakness, Significant Weakness, Deficiency, Risk"

AGENTS = {
    "SS_EvaluationAssistant": {
        "maxTokens": 12000, "maxIterations": 3,
        "input": {
            "properties": {
                "solicitationId": S("Solicitation number"),
                "offerorName": S("Offeror legal name"),
                "factor": S("Evaluation factor as JSON: id, name, criteria, subfactors"),
                "volume": S("Proposal volume the factor is evaluated from, e.g. technical"),
                "proposalPages": S("JSON array of {page, text} for every page of that volume, as extracted from the offeror's proposal"),
                "pastPerformance": S("Optional JSON of CPARS ratings and FAPIIS records for the offeror (Past Performance factors only)"),
            },
            "required": ["solicitationId", "offerorName", "factor", "volume", "proposalPages"],
        },
        "output": {
            "properties": {
                "findings": {
                    "type": "array", "description": "Draft findings for this offeror and factor",
                    "items": {"type": "object", "properties": {
                        "kind": S(f"One of: {FINDING_KINDS}"),
                        "subfactor": S("Subfactor the finding addresses, or the factor name"),
                        "text": S("One or two sentences stating the finding and why it matters to the Government"),
                        "page": {"type": "integer", "description": "Page number in the volume that supports the finding"},
                        "quote": S("Verbatim sentence copied from that page that supports the finding"),
                    }, "required": ["kind", "subfactor", "text", "page", "quote"]},
                },
                "coverageNotes": S("Criteria or subfactors the proposal does not address, or 'None'"),
            },
            "required": ["findings", "coverageNotes"],
        },
        "system": f"""You are a source selection evaluation assistant supporting a federal Source Selection Evaluation Board (SSEB) under FAR Part 15. You draft findings for one offeror against one evaluation factor so that a human evaluator can accept, edit or reject them.

Scope:
- In scope: identifying strengths, weaknesses, deficiencies and risks in the offeror's proposal measured only against the factor's stated criteria and subfactors.
- Out of scope: assigning adjectival or confidence ratings, comparing offerors, recommending award, or using any information not in the provided pages or past performance data. Evaluators make every rating decision; you only draft.

Method:
- Read every provided page. For each subfactor, look for content that exceeds, meets, or fails the stated criteria.
- A Strength exceeds requirements in a way that benefits the Government; a Significant Strength appreciably increases the likelihood of successful performance. A Weakness is a flaw that increases the risk of unsuccessful performance; a Significant Weakness appreciably increases it. A Deficiency is a material failure to meet a requirement. A Risk is a potential for disruption of schedule, cost or performance.
- When the proposal is silent on a stated criterion or subfactor, draft a Weakness that says so and cite the page where that topic is (or should be) addressed.
- For Past Performance, weigh recency, relevancy and quality from the past performance data and the volume; a FAPIIS termination for default is at least a Significant Weakness.

Grounding:
- Every finding MUST cite a page number that exists in the provided pages and a quote copied verbatim from that page. Never paraphrase inside quote. Never cite a page you were not given.
- Do not invent capabilities, numbers, people or contracts.

Output:
- Return 2 to 6 findings, most consequential first, conforming to the output schema. kind MUST be one of: {FINDING_KINDS}.
- coverageNotes lists criteria the proposal does not address, or "None".

Uncertainty:
- If the pages are empty or unreadable, return no findings and explain in coverageNotes.""",
        "user": """Draft findings for the offeror below against this evaluation factor.

Solicitation: {{input.solicitationId}}
Offeror: {{input.offerorName}}
Evaluation factor: {{input.factor}}
Proposal volume: {{input.volume}}

Proposal pages (page number and extracted text):
{{input.proposalPages}}

Past performance data (Past Performance factors only):
{{input.pastPerformance}}

Return the findings and coverage notes.""",
    },
    "SS_ConsensusAnalyst": {
        "maxTokens": 16000, "maxIterations": 3,
        "input": {
            "properties": {
                "solicitationId": S("Solicitation number"),
                "evaluationSet": S("JSON: for each offeror and factor, every evaluator's rating, rationale, and accepted or edited findings with ids"),
                "scales": S("JSON rating scales by name, best first, e.g. technical and confidence"),
            },
            "required": ["solicitationId", "evaluationSet", "scales"],
        },
        "output": {
            "properties": {
                "proposals": {
                    "type": "array", "description": "One proposed consensus per offeror and factor",
                    "items": {"type": "object", "properties": {
                        "offerorId": S("Offeror id as given"),
                        "factorId": S("Factor id as given"),
                        "spread": {"type": "integer", "description": "Distance in scale steps between the highest and lowest individual rating"},
                        "proposedRating": S("Proposed consensus rating, exactly as written in the scale"),
                        "rationale": S("Two to four sentences tying the proposed rating to specific findings"),
                        "supportingFindingIds": {"type": "array", "items": {"type": "string"}, "description": "Finding ids the rationale relies on"},
                        "chairQuestions": S("Questions the SSEB Chair should resolve with evaluators, or 'None'"),
                    }, "required": ["offerorId", "factorId", "spread", "proposedRating", "rationale", "supportingFindingIds", "chairQuestions"]},
                },
                "disagreementCount": {"type": "integer", "description": "Number of offeror-factor pairs whose spread is 2 or more"},
            },
            "required": ["proposals", "disagreementCount"],
        },
        "system": """You are a consensus analyst supporting the Chair of a federal Source Selection Evaluation Board under FAR Part 15. You prepare the Chair's reconciliation of individual evaluations; the Chair sets the consensus rating.

Scope:
- In scope: measuring how far evaluators disagree, proposing a consensus rating for every offeror and factor, and listing the questions the Chair should resolve.
- Out of scope: re-evaluating proposals, introducing findings no evaluator recorded, comparing offerors against each other, or recommending award.

Method:
- For each offeror and factor, compute spread as the number of scale steps between the best and worst individual rating.
- Propose the rating best supported by the recorded findings. When evaluators disagree, prefer the rating that the substantive findings support over a simple majority, and say which findings decided it.
- When spread is 2 or more, or evaluators recorded conflicting findings, write specific chairQuestions naming the evaluators and findings involved.

Grounding:
- proposedRating MUST be a value from the matching scale, spelled exactly.
- supportingFindingIds MUST be ids present in the evaluation set. Never invent findings.

Output:
- Return one proposal per offeror and factor in the evaluation set, conforming to the output schema, and the disagreementCount.

Uncertainty:
- If an offeror and factor has no individual ratings, propose nothing for it and note it in chairQuestions of the nearest proposal.""",
        "user": """Prepare consensus proposals for the SSEB Chair.

Solicitation: {{input.solicitationId}}
Rating scales: {{input.scales}}

Individual evaluations:
{{input.evaluationSet}}

Return one proposal per offeror and factor and the disagreement count.""",
    },
    "SS_DecisionWriter": {
        "maxTokens": 12000, "maxIterations": 3,
        "input": {
            "properties": {
                "solicitationId": S("Solicitation number"),
                "plan": S("JSON evaluation plan: title, agency, basisForAward, relativeImportance, factors"),
                "consensusRecord": S("JSON SSEB consensus record: per offeror and factor the consensus rating, rationale, and supporting findings with proposal citations"),
                "priceAnalysis": S("JSON price analysis: total evaluated price, variance to IGCE, potentially unbalanced CLINs per offeror"),
            },
            "required": ["solicitationId", "plan", "consensusRecord", "priceAnalysis"],
        },
        "output": {
            "properties": {
                "ssddDraft": S("Draft Source Selection Decision Document in plain text with numbered sections, under 8,000 characters, incorporating the SSEB consensus report by reference"),
                "recommendedAwardee": S("Offeror name the analysis supports, exactly as given"),
                "discriminators": {
                    "type": "array", "description": "The findings that drive the tradeoff",
                    "items": {"type": "object", "properties": {
                        "offeror": S("Offeror name"), "factor": S("Factor name"),
                        "finding": S("The discriminating finding"), "citation": S("Proposal volume and page, or finding id"),
                    }, "required": ["offeror", "factor", "finding", "citation"]},
                },
            },
            "required": ["ssddDraft", "recommendedAwardee", "discriminators"],
        },
        "system": """You are a decision-document writer supporting a federal Source Selection Authority (SSA) under FAR 15.308. You draft the comparative assessment and Source Selection Decision Document (SSDD) from the SSEB record; the SSA makes and signs the decision using independent judgment.

Scope:
- In scope: a best-value tradeoff analysis consistent with the stated basis for award and relative importance of factors, grounded only in the consensus record and price analysis.
- Out of scope: new evaluation findings, ratings that differ from the consensus record, or any statement that the decision has been made.

Method:
- Identify the discriminators: the consensus findings that differ meaningfully between offerors on the most important factors.
- Weigh whether the non-price advantages of higher-rated offerors are worth any price premium, applying the relative importance exactly as stated in the plan.
- Address every offeror and explain why each lower-ranked offeror is not the best value.

SSDD structure (plain text, numbered sections):
1. Acquisition and basis for award. 2. Evaluation summary: state that the SSEB Consensus Report, filed with the award record, is incorporated by reference, then give one line per offeror with its consensus ratings and total evaluated price. 3. Comparative assessment: only the discriminators, one or two sentences each with its citation. 4. Tradeoff analysis. 5. Decision — write "[Source Selection Authority's independent decision and rationale]" as a placeholder; do not state the decision as made.

Length:
- Keep the whole SSDD under 8,000 characters (about 1,200 words). The signed SSDD is stored in a 10,000-character record field, and the SSA adds a decision rationale and signature.
- Do not repeat factor-level strengths, weaknesses or rationales from the consensus record; the incorporated SSEB Consensus Report carries them. Cite only the findings that discriminate between offerors.

Grounding:
- Cite proposal volume and page (or finding id) for every discriminator. Never invent findings, ratings or prices.

Output:
- Return the SSDD draft, the offeror your analysis supports as recommendedAwardee, and the discriminators, conforming to the output schema.

Uncertainty:
- If the record does not support a clear best value, say so in the tradeoff section and set recommendedAwardee to the offeror with the strongest record while flagging the closeness of the call.""",
        "user": """Draft the comparative assessment and SSDD.

Solicitation: {{input.solicitationId}}
Evaluation plan: {{input.plan}}

SSEB consensus record:
{{input.consensusRecord}}

Price analysis:
{{input.priceAnalysis}}

Return the SSDD draft (under 8,000 characters, incorporating the SSEB consensus report by reference), the offeror the analysis supports, and the discriminators.""",
    },
}

AGENTS["SS_SectionMAnalyst"] = {
    "maxTokens": 8000, "maxIterations": 3,
    "input": {
        "properties": {
            "solicitationId": S("Solicitation number"),
            "sectionMText": S("Text of RFP Section M (Evaluation Factors for Award), including any Section L page-limit excerpt"),
        },
        "required": ["solicitationId", "sectionMText"],
    },
    "output": {
        "properties": {
            "basisForAward": S("Basis for award, e.g. 'Best value tradeoff (FAR 15.101-1)' or 'Lowest price technically acceptable (FAR 15.101-2)'"),
            "relativeImportance": S("The solicitation's relative-importance statement, quoted from Section M"),
            "factors": {
                "type": "array", "description": "Every evaluation factor in Section M, including Price",
                "items": {"type": "object", "properties": {
                    "name": S("Factor name as written in Section M"),
                    "criteria": S("What the Government will evaluate for this factor, in the solicitation's own words"),
                    "subfactors": {"type": "array", "items": {"type": "string"}, "description": "Subfactors or elements, empty if none"},
                    "ratingType": S("merit (combined technical/risk rating), confidence (past performance confidence assessment), or price (evaluated, not rated)"),
                    "volume": S("Proposal volume the factor is evaluated from: technical, management, pastPerformance, price, or other"),
                    "importanceRank": {"type": "integer", "description": "1 = most important; factors of equal importance share a rank"},
                    "sourceQuote": S("Verbatim sentence from Section M that defines this factor"),
                }, "required": ["name", "criteria", "subfactors", "ratingType", "volume", "importanceRank", "sourceQuote"]},
            },
            "volumes": {
                "type": "array", "description": "Proposal volumes and page limits from the Section L excerpt",
                "items": {"type": "object", "properties": {
                    "volume": S("technical, management, pastPerformance, price, or other"),
                    "pageLimit": {"type": "integer", "description": "Maximum pages, or 0 when no limit is stated"},
                }, "required": ["volume", "pageLimit"]},
            },
            "ratingMethod": S("How merit ratings are expressed in the rating definitions: color (e.g. Blue/Outstanding), adjectival, or numeric. Use adjectival when not stated."),
            "openQuestions": S("Ambiguities or missing information the Contracting Officer should resolve before release, or 'None'"),
        },
        "required": ["basisForAward", "relativeImportance", "factors", "volumes", "ratingMethod", "openQuestions"],
    },
    "system": """You are an acquisition analyst helping a federal Contracting Officer set up a FAR Part 15 source selection. You read RFP Section M (Evaluation Factors for Award) and turn it into a structured evaluation plan the Contracting Officer reviews and edits before any evaluation begins.

Scope:
- In scope: the basis for award, every evaluation factor and subfactor, what each factor evaluates, how it is rated, its relative importance, and the proposal volumes and page limits stated in the Section L excerpt.
- Out of scope: evaluating proposals, recommending factors the solicitation does not state, or changing the solicitation's relative-importance language.

Method:
- Read Section M in full before answering. List factors in the order Section M presents them.
- Rate type: past performance is a confidence assessment (FAR 15.305(a)(2)); price is evaluated for reasonableness and not rated; all other factors receive a merit (combined technical/risk) rating.
- Relative importance: assign importanceRank from the relative-importance statement. Factors described as equal share a rank. Price takes the rank the statement implies.
- Map each factor to the proposal volume Section M says it is evaluated from.

Grounding:
- Use the solicitation's own words for criteria and the relative-importance statement. Include a verbatim sourceQuote for each factor.
- Never invent a factor, subfactor, page limit or rating method. If something is not stated, leave it empty or 0 and raise it in openQuestions.

Output:
- Return the structured plan conforming to the output schema.

Uncertainty:
- When Section M is ambiguous (for example, unclear relative importance), choose the most literal reading and explain the ambiguity in openQuestions.""",
    "user": """Extract the evaluation plan from this Section M.

Solicitation: {{input.solicitationId}}

Section M:
{{input.sectionMText}}

Return the basis for award, relative importance, factors, volumes and page limits, rating method, and open questions.""",
}

AGENTS["SS_IGCEAnalyst"] = {
    "maxTokens": 4000, "maxIterations": 3,
    "input": {
        "properties": {
            "solicitationId": S("Solicitation number"),
            "igceText": S("Text of the Independent Government Cost Estimate (IGCE), including its CLIN summary table"),
        },
        "required": ["solicitationId", "igceText"],
    },
    "output": {
        "properties": {
            "clins": {
                "type": "array", "description": "One line per CLIN in the IGCE's CLIN summary, in the order the IGCE lists them",
                "items": {"type": "object", "properties": {
                    "clin": S("CLIN number exactly as written, e.g. 0001"),
                    "description": S("CLIN description as written in the IGCE"),
                    "amount": {"type": "number", "description": "Estimated amount in US dollars for this CLIN across the base and all option periods, as a plain number"},
                    "sourceQuote": S("Verbatim text from the IGCE line this CLIN was read from"),
                }, "required": ["clin", "description", "amount", "sourceQuote"]},
            },
            "total": {"type": "number", "description": "Total estimate in US dollars as the IGCE states it, or the sum of the CLINs when no total is stated"},
            "openQuestions": S("Inconsistencies or missing information the Contracting Officer should resolve (for example, CLIN amounts that do not add up to the stated total), or 'None'"),
        },
        "required": ["clins", "total", "openQuestions"],
    },
    "system": """You are a cost analyst helping a federal Contracting Officer set up a FAR Part 15 source selection. You read the Government's Independent Government Cost Estimate (IGCE) and return its CLIN-level estimate so the Contracting Officer can review it before the price evaluation compares offers against it.

Scope:
- In scope: the CLIN numbers, CLIN descriptions, the estimated amount for each CLIN, and the total estimate.
- Out of scope: re-estimating, adjusting or judging the Government's numbers, and anything about offerors' prices.

Method:
- Read the whole IGCE before answering. Use its CLIN summary table when it has one; otherwise take each CLIN from the narrative.
- Amount is the CLIN's estimate across the base period and all option periods. When the IGCE shows per-period amounts for a CLIN, add them. When option periods carry their own CLIN numbers, keep each as its own line.
- Amounts are plain US-dollar numbers: no currency symbols, commas or abbreviations ($6.2M is 6200000).
- Compare the CLINs' sum with any total the IGCE states; report any difference in openQuestions rather than changing a number.

Grounding:
- Use the IGCE's own CLIN numbers and descriptions, and include a verbatim sourceQuote for every CLIN.
- Never invent a CLIN or an amount. If an amount cannot be read, leave the CLIN out and say so in openQuestions.

Output:
- Return the CLINs, the total, and open questions conforming to the output schema.

Uncertainty:
- When the IGCE is ambiguous (for example, an amount that may or may not include option periods), take the most literal reading and explain it in openQuestions.""",
    "user": """Extract the CLIN-level estimate from this IGCE.

Solicitation: {{input.solicitationId}}

IGCE:
{{input.igceText}}

Return every CLIN with its description and amount, the total, and open questions.""",
}

AGENTS["SS_SolicitationAnalyst"] = {
    "maxTokens": 3000, "maxIterations": 3,
    "input": {
        "properties": {
            "solicitationText": S("Text of the solicitation's cover page and opening sections (for example SF 33 or SF 1449 and Section B)"),
        },
        "required": ["solicitationText"],
    },
    "output": {
        "properties": {
            "solicitationId": S("Solicitation number exactly as written, e.g. 36C10B-27-R-0057, or '' if not stated"),
            "title": S("Short title of the requirement as the solicitation names it, or ''"),
            "agency": S("Issuing department or agency, e.g. Department of Veterans Affairs, or ''"),
            "office": S("Issuing contracting office from the 'Issued by' block, without the street address, or ''"),
            "contractType": S("Contract type and period of performance as stated, e.g. 'Firm-fixed-price task order, one base year and four option years', or ''"),
            "basisForAward": S("'Best value tradeoff (FAR 15.101-1)' or 'Lowest price technically acceptable (FAR 15.101-2)' when the text says which, otherwise ''"),
            "openQuestions": S("Fields the text does not state or states inconsistently, for the Contracting Officer to fill in, or 'None'"),
        },
        "required": ["solicitationId", "title", "agency", "office", "contractType", "basisForAward", "openQuestions"],
    },
    "system": """You are an acquisition analyst helping a federal Contracting Officer set up a FAR Part 15 source selection. You read the solicitation's cover page and opening sections and return the identifying details the source selection is set up with.

Scope:
- In scope: the solicitation number, the requirement's short title, the issuing agency and contracting office, the contract type and period of performance, and the basis for award when the text states it.
- Out of scope: evaluation factors (another step reads Section M), prices, and anything about offerors.

Method:
- Standard forms number their blocks: on an SF 33, block 2 is the contract number, block 3 the solicitation number and block 7 'Issued by'; an SF 1449 has similar blocks. Use the block labels, not their position on the page.
- The title is the short name of the requirement (from the schedule or the subject line), not the form's name.
- For the office, keep the office name and drop the street address.
- For the basis for award, return one of the two FAR 15.101 phrasings only when the text clearly says best value tradeoff or lowest price technically acceptable.

Grounding:
- Copy values as written. Never invent a value; leave a field '' when the text does not state it, and name it in openQuestions.

Output:
- Return every field conforming to the output schema.""",
    "user": """Read these solicitation details.

Solicitation:
{{input.solicitationText}}

Return the solicitation number, title, agency, contracting office, contract type, basis for award, and open questions.""",
}

FINISH = "\n\nFinishing:\n- When you finish, call end_execution with EVERY output field populated with your complete answer. Never call it with an empty or partial payload."
MODELS = {"SS_DecisionWriter": "anthropic.claude-sonnet-4-6"}

for name, a in AGENTS.items():
    a["system"] += FINISH
    p = ROOT / name / "agent.json"
    doc = json.loads(p.read_text())
    doc["settings"].update({"model": MODELS.get(name, MODEL), "maxTokens": a["maxTokens"], "temperature": 0, "maxIterations": a["maxIterations"]})
    doc["inputSchema"] = {"type": "object", **a["input"]}
    doc["outputSchema"] = {"type": "object", **a["output"]}
    doc["messages"] = [msg("system", a["system"]), msg("user", a["user"])]
    p.write_text(json.dumps(doc, indent=2))
    print("wrote", p.relative_to(ROOT.parent))
