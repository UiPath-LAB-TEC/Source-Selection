"""Pure source selection rules — no platform calls, so every rule is unit-testable.

Everything solicitation-specific comes from the evaluation plan JSON (BR-01).
"""
from __future__ import annotations

import json
import re

BANNER_MARK = "SYNTHETIC DEMO PROPOSAL"
UNBALANCED_THRESHOLD = 0.25  # BR-04
DISAGREEMENT_SPREAD = 2  # BR-03
AGENT_INPUT_LIMIT = 9500  # Orchestrator caps InputArguments at 10,000 characters
POINT_SHARES = [1, 0.8, 0.6, 0.4, 0]  # State & Local scoring guide: share of a criterion's points per scale step


def is_sled(plan: dict) -> bool:
    """A State & Local (K-12 district) RFP scored out of 100 points, rather than a federal FAR Part 15 source selection."""
    return plan.get("framework") == "sled"


# ── Proposal text ───────────────────────────────────────────────────────────

def clean_page(raw: str, solicitation_id: str) -> str:
    """Drop the page chrome (banner, running header, page number) and normalize whitespace."""
    keep = []
    for line in raw.splitlines():
        s = line.strip()
        if not s or BANNER_MARK in s or f"| {solicitation_id} |" in s or re.fullmatch(r"Page \d+", s):
            continue
        keep.append(s)
    return " ".join(" ".join(keep).split())


def parse_cover(text: str) -> dict:
    """Offeror identification from the cover letter (federal) or transmittal letter (State & Local: a state vendor ID
    instead of UEI and CAGE). The fallback when IXP can't be reached (extraction.cover)."""
    def grab(pattern: str) -> str:
        m = re.search(pattern, text)
        return m.group(1).strip() if m else ""
    return {
        "name": grab(r"Legal name:\s*(.+?)\s+(?:Unique Entity ID|State vendor ID)"),
        "uei": grab(r"(?:\(UEI\)|State vendor ID):\s*([A-Z0-9]{12})"),
        "cage": grab(r"(?:CAGE code|Vendor code):\s*([A-Z0-9]{5})"),
        "signatory": grab(r"Signed:\s*(.+)$"),
        "certified": "certifies that its representations and certifications" in text,
    }


def parse_price(text: str) -> tuple[list[dict], float | None]:
    """CLIN lines and stated total from the price volume schedule."""
    schedule = text.split("Total price", 1)[-1]  # skip the title block, which carries the solicitation number
    lines = [{"clin": c, "description": d.strip(), "amount": float(a.replace(",", ""))}
             for c, d, a in re.findall(r"(?<![\w-])(\d{4})\s+([^$]+?)\s+\$([\d,]+)", schedule)]
    m = re.search(r"(?:Total evaluated price|Total proposed cost)\s+\$([\d,]+)", text)
    return lines, float(m.group(1).replace(",", "")) if m else None


# ── Compliance and responsibility ───────────────────────────────────────────

CERTIFICATIONS = {"nonCollusion": "Non-collusion affidavit", "debarment": "Suspension and debarment certification",
                  "dataPrivacy": "Student data privacy agreement"}


def certification_issues(plan: dict, certs: dict | None) -> tuple[str | None, list[str]]:
    """What the cover letter's certifications (as extracted) mean for compliance: on a district RFP a missing required
    form makes the proposal non-compliant; on a federal offer, SAM representations that aren't current are a
    responsibility concern. Unknown (None) values raise nothing."""
    certs = certs or {}
    if is_sled(plan):
        missing = [label for key, label in CERTIFICATIONS.items() if certs.get(key) is False]
        return ("Non-compliant", [f"Required form not enclosed: {', '.join(missing)}."]) if missing else (None, [])
    if certs.get("samRepsCurrent") is False:
        return "Responsibility concern", ["SAM representations and certifications are not current."]
    return None, []


def _contract_key(s: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


CPARS_RATINGS = ["Exceptional", "Very Good", "Satisfactory", "Marginal", "Unsatisfactory"]


def _rating(text: str) -> str:
    """The first CPARS rating named ("Very Good in quality, Satisfactory in schedule" → "very good"): quality comes
    first, as in CPARS itself. Text with no CPARS rating is compared as written."""
    hits = [(m.start(), r) for r in CPARS_RATINGS for m in [re.search(rf"\b{r}\b", text or "", re.I)] if m]
    return min(hits)[1].casefold() if hits else (text or "").strip().casefold()


def cpars_check(references: list[dict], cpars: list[dict], federal: bool = True) -> list[str]:
    """Each claimed past performance rating against the CPARS record for that contract: a different rating, or (federal)
    a claimed contract with no assessment on file. These inform the past performance evaluators; they aren't a
    compliance finding."""
    record = {_contract_key(c.get("contract")): c for c in cpars}
    notes = []
    for r in references:
        claimed = (r.get("rating") or "").strip()
        c = record.get(_contract_key(r.get("contract")))
        if c is None:
            if federal and r.get("contract") and claimed:
                notes.append(f"No CPARS assessment on file for {r['contract']} (claimed {claimed}).")
        elif claimed and _rating(claimed) != _rating(str(c.get("rating", ""))):
            year = f" ({c['year']})" if c.get("year") else ""
            notes.append(f"Claims {claimed} on {r['contract']}; CPARS shows {c['rating']}{year}.")
    return notes


def screen(plan: dict, volumes: dict[str, int], ref: dict | None, certs: dict | None = None) -> tuple[str, list[str]]:
    """Volumes present, page limits, SAM status and exclusion, FAPIIS, and the certifications the cover letter carries.
    Returns (status, notes). State & Local: required sections and forms, page limits, state vendor registration and the
    state debarment list."""
    sled = is_sled(plan)
    reg = "state vendor registration" if sled else "SAM registration"
    notes: list[str] = []
    status = "Compliant"
    cert_status, cert_notes = certification_issues(plan, certs)
    notes += cert_notes
    if cert_status == "Non-compliant":
        status = "Non-compliant"
    missing = [v for v in plan["submission"]["volumes"] if v not in volumes]
    if missing:
        status = "Non-compliant"
        notes.append(f"Missing {'section' if sled else 'volume'}(s): {', '.join(missing)}.")
    over = [f"{v} ({volumes[v]} of {limit} pages)" for v, limit in plan["submission"].get("pageLimits", {}).items()
            if volumes.get(v, 0) > limit]
    if over:
        status = "Non-compliant"
        notes.append(f"Page limit exceeded: {', '.join(over)}.")
    if not missing and not over:
        notes.append(f"All required {'sections' if sled else 'volumes'} received; page limits met.")
    if cert_status == "Responsibility concern" and status == "Compliant":
        status = "Responsibility concern"
    if ref is None:
        notes.append(f"No {reg} found for the {'vendor ID' if sled else 'UEI'}.")
        return ("Non-compliant" if status == "Non-compliant" else "Responsibility concern"), notes
    if ref.get("Exclusion"):
        notes.append("Listed on the state debarment list." if sled else "Active SAM exclusion.")
        status = status if status == "Non-compliant" else "Responsibility concern"
    elif sled:
        notes.append("Not on the state debarment list.")
    if ref.get("SamStatus") != "Active":
        notes.append(f"{reg[:1].upper()}{reg[1:]} {str(ref.get('SamStatus') or 'missing').lower()}"
                     + (f" (expired {str(ref.get('RegistrationExpiry'))[:10]})" if ref.get("RegistrationExpiry") else "") + ".")
        status = status if status == "Non-compliant" else "Responsibility concern"
    elif sled:
        notes.append("State vendor registration active.")
    fapiis = ref.get("FapiisRecords")
    if fapiis not in (None, "", "None"):
        notes.append(f"{'Vendor performance record' if sled else 'FAPIIS'}: {fapiis}")
    return status, notes


# ── Agent drafting ──────────────────────────────────────────────────────────

def agent_pages(pages: list[dict], limit: int) -> str:
    """JSON {page, text} array for the agent, trimmed evenly so the whole input stays under the cap."""
    rows = [{"page": p["PageNumber"], "text": p["PageText"]} for p in sorted(pages, key=lambda p: p["PageNumber"])]
    out = json.dumps(rows)
    while len(out) > limit and rows:
        longest = max(rows, key=lambda r: len(r["text"]))
        longest["text"] = longest["text"][: int(len(longest["text"]) * 0.85)]
        out = json.dumps(rows)
    return out


def _norm(s: str) -> str:
    return " ".join(re.sub(r"[^\w$%.,-]+", " ", s.lower()).split())


def resolve_citation(quote: str, page: int, pages: list[dict]) -> int | None:
    """Page whose text contains the quote — the cited page first. None means the citation is invalid (BR-05)."""
    q = _norm(quote)
    if not q:
        return None
    ordered = sorted(pages, key=lambda p: (p["PageNumber"] != page, p["PageNumber"]))
    for p in ordered:
        if q in _norm(p["PageText"]):
            return p["PageNumber"]
    return None


def agent_findings(output: dict) -> list[dict]:
    """Agent output keys arrive in either case; normalize to lower-case keys."""
    def low(d):
        return {k[:1].lower() + k[1:]: v for k, v in d.items()} if isinstance(d, dict) else {}
    out = low(output)
    return [low(f) for f in out.get("findings") or []]


# ── Evaluation compilation ──────────────────────────────────────────────────

def scale_for(plan: dict, factor: dict) -> list[str]:
    return plan["scales"][factor.get("scale") or "technical"]


def spread(plan: dict, factor: dict, ratings: list[str]) -> int:
    scale = scale_for(plan, factor)
    idx = [scale.index(r) for r in ratings if r in scale]
    return max(idx) - min(idx) if len(idx) > 1 else 0


def finding_conflict(findings: list[dict]) -> bool:
    """Opposite-kind findings (strength vs weakness/deficiency) on the same page citation (BR-03)."""
    by_cite: dict[tuple, set[str]] = {}
    for f in findings:
        k = f.get("Kind", "")
        side = "+" if "Strength" in k else "-" if k in ("Weakness", "Significant Weakness", "Deficiency") else ""
        if side:
            by_cite.setdefault((f.get("CitationVolume"), f.get("CitationPage")), set()).add(side)
    return any(len(s) > 1 for s in by_cite.values())


def fit(payload: list[dict], limit: int, shrink) -> str:
    """Serialize, applying `shrink(payload, round)` until it fits the agent input budget."""
    out = json.dumps(payload, separators=(",", ":"))
    n = 0
    while len(out) > limit and n < 6:
        shrink(payload, n)
        out = json.dumps(payload, separators=(",", ":"))
        n += 1
    return out


# ── Price ───────────────────────────────────────────────────────────────────

def price_result(plan: dict, lines: list[dict]) -> dict:
    igce = plan["igce"]
    total = sum(l["amount"] for l in lines)
    item, estimate = ("Item", "estimate") if is_sled(plan) else ("CLIN", "IGCE")
    unbalanced = []
    for l in lines:
        ref = igce["lines"].get(l["clin"])
        if ref and abs(l["amount"] - ref) / ref > UNBALANCED_THRESHOLD:
            unbalanced.append(f"{item} {l['clin']} {l['description']}: ${l['amount']:,.0f} vs {estimate} ${ref:,.0f}")
    return {
        "total": total,
        "variancePct": round((total - igce["total"]) / igce["total"] * 100, 2) if igce["total"] else 0.0,
        "unbalanced": unbalanced,
    }


# ── State & Local points ────────────────────────────────────────────────────

def points_at(max_points: float, step: int) -> float:
    return round(max_points * POINT_SHARES[max(0, min(4, step))], 1)


def sled_scores(plan: dict, consensus: list[dict], offerors: list[dict]) -> list[dict]:
    """Per offeror: points per criterion from its consensus score, cost points by formula (lowest total earns them
    all, the rest lowest ÷ theirs × max), the total out of 100, and the rank (1 = highest). Mirrors ss-task-forms score.ts."""
    rated = [f for f in plan["factors"] if not f.get("evaluatedNotRated")]
    cost = next((f for f in plan["factors"] if f.get("evaluatedNotRated")), None)
    prices = [o.get("TotalEvaluatedPrice") for o in offerors if o.get("TotalEvaluatedPrice")]
    lowest = min(prices) if prices else None
    rows = []
    for o in offerors:
        by = {}
        for f in rated:
            r = next((x["Rating"] for x in consensus if x["OfferorId"] == o["OfferorId"] and x["FactorId"] == f["id"]), None)
            scale = scale_for(plan, f)
            by[f["name"]] = points_at(f.get("weight") or 0, scale.index(r)) if r in scale else None
        price = o.get("TotalEvaluatedPrice")
        cp = round((cost.get("weight") or 0) * lowest / price, 1) if cost and price and lowest else None
        total = round(sum(v for v in by.values() if v is not None) + (cp or 0), 1)
        rows.append({"offeror": o["Name"], "criteria": by, "costPoints": cp, "totalCost": price, "total": total})
    for r in rows:
        r["rank"] = 1 + sum(1 for x in rows if x["total"] > r["total"])
    return sorted(rows, key=lambda r: r["rank"])
