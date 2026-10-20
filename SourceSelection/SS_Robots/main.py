"""SS_Robots — deterministic tasks of the SourceSelection case, one entry point per case task.

Every entry point takes a solicitationId, reads the evaluation plan from SSSolicitation.PlanJson,
is idempotent per solicitation (BR-06), and returns errors in error_type / error_message. The case
entry point `run` turns a returned error into a job fault, except for partial results (PARTIAL_ERRORS).
"""
from __future__ import annotations

import json
import re
import tempfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from pydantic import BaseModel
from pypdf import PdfReader
from uipath.tracing import traced

import extraction
import records
import repo
import rules

EVAL_AGENT = "SS_EvaluationAssistant"
AGENT_ACTOR = "SS_EvaluationAssistant"


class SolicitationInput(BaseModel):
    solicitationId: str = ""


class Result(BaseModel):
    error_type: str = ""
    error_message: str = ""


class StepFailed(RuntimeError):
    """Raised by `run` so the job faults and Maestro opens an incident the operator can retry."""


class AgentRunsFailed(RuntimeError):
    """No agent run succeeded, so there are no drafts to hand the evaluators."""


def _fail(out: Result, exc: Exception) -> Result:
    out.error_type = type(exc).__name__
    out.error_message = str(exc)
    return out


def _rated(plan: dict) -> list[dict]:
    return sorted([f for f in plan["factors"] if not f.get("evaluatedNotRated")], key=lambda f: f.get("order", 0))


# ── 1. IngestProposals ──────────────────────────────────────────────────────

class IngestOutput(Result):
    offerorCount: int = 0
    pageCount: int = 0


def _proposal_files(sol: str) -> dict[str, dict[str, str]]:
    """{offeror code: {volume: bucket path}} for SS-Proposals/<sol>/<code>/<volume>.pdf."""
    files: dict[str, dict[str, str]] = defaultdict(dict)
    for path in repo.list_files(repo.PROPOSALS_BUCKET, sol):
        parts = path.split("/")
        if len(parts) == 3 and parts[2].lower().endswith(".pdf"):
            files[parts[1]][parts[2][:-4]] = path
    return files


@traced(name="IngestProposals", run_type="uipath")
def ingest_proposals(input: SolicitationInput) -> IngestOutput:
    out = IngestOutput()
    try:
        sol = input.solicitationId
        repo.plan(sol)  # fail fast if the solicitation is not seeded
        files = _proposal_files(sol)
        offerors, pages = [], []
        with tempfile.TemporaryDirectory() as tmp:
            text: dict[str, dict[str, list[str]]] = defaultdict(dict)
            local: dict[str, dict[str, str]] = defaultdict(dict)
            for code, volumes in sorted(files.items()):
                for vol, path in volumes.items():
                    local[code][vol] = str(Path(tmp) / f"{code}-{vol}.pdf")
                    repo.download(repo.PROPOSALS_BUCKET, path, local[code][vol])
                    text[code][vol] = [rules.clean_page(p.extract_text() or "", sol) for p in PdfReader(local[code][vol]).pages]
            # IXP reads every offeror's cover letter, price schedule and past performance volume at once.
            with ThreadPoolExecutor(max_workers=6) as pool:
                jobs = {code: {
                    "cover": pool.submit(extraction.cover, local[code].get("cover", ""), " ".join(text[code].get("cover", []))),
                    "price": pool.submit(extraction.price, local[code].get("price", ""), " ".join(text[code].get("price", []))),
                    "references": pool.submit(extraction.references, local[code].get("pastPerformance", "")),
                } for code in sorted(files)}
            for code in sorted(files):
                oid = f"{sol}-{code}"
                cover = jobs[code]["cover"].result()
                lines, stated, price_meta = jobs[code]["price"].result()
                refs, refs_meta = jobs[code]["references"].result() if "pastPerformance" in local[code] else ([], {"source": "none"})
                notes = [f"Signed by {cover['signatory']}." if cover["signatory"] else "Cover letter is not signed."]
                if stated is not None and abs(stated - sum(l["amount"] for l in lines)) > 1:
                    notes.append(f"Stated total ${stated:,.0f} does not equal the sum of CLINs.")
                found = {"cover": {k: v for k, v in cover.items() if k not in ("certified",)}, "price": {**price_meta, "statedTotal": stated, "lines": len(lines)},
                         "references": refs, "referencesMeta": refs_meta, "intakeNotes": notes}
                offerors.append({"OfferorId": oid, "SolicitationId": sol, "OfferorCode": code, "Name": cover["name"] or code,
                                 "UEI": cover["uei"], "CAGE": cover["cage"], "PriceLinesJson": json.dumps(lines),
                                 "ComplianceStatus": "Pending", "ComplianceNotes": " ".join(notes), "ExtractionJson": json.dumps(found)})
                for vol, vol_pages in text[code].items():
                    for i, t in enumerate(vol_pages, start=1):
                        pages.append({"PageId": f"{oid}-{vol}-{i}", "SolicitationId": sol, "OfferorId": oid,
                                      "Volume": vol, "PageNumber": i, "PageText": t})
        repo.upsert("SSOfferor", "OfferorId", offerors)
        repo.upsert("SSProposalPage", "PageId", pages)
        repo.audit(sol, "case", "ProposalsIngested", f"{len(offerors)} offerors, {len(pages)} pages")
        repo.set_solicitation(sol, Status="In evaluation", Stage="Proposal Intake", StartedAt=repo.now())
        out.offerorCount, out.pageCount = len(offerors), len(pages)
    except Exception as exc:
        return _fail(out, exc)
    return out


class ExtractOutput(Result):
    extraction: str = ""
    offerorCount: int = 0


@traced(name="ExtractProposals", run_type="uipath")
def extract_proposals(input: SolicitationInput) -> ExtractOutput:
    """Read-only: what IXP extracts from each offeror's cover letter, price schedule and past performance volume, and any
    IXP error, so the models can be checked against a solicitation's proposals without changing a record."""
    out = ExtractOutput()
    try:
        repo.plan(input.solicitationId)  # fail fast if the solicitation is not seeded
        files = _proposal_files(input.solicitationId)
        results: dict[str, dict] = {}
        with tempfile.TemporaryDirectory() as tmp, ThreadPoolExecutor(max_workers=6) as pool:
            jobs = {}
            for code, volumes in sorted(files.items()):
                for vol in ("cover", "price", "pastPerformance"):
                    if vol in volumes:
                        dest = str(Path(tmp) / f"{code}-{vol}.pdf")
                        repo.download(repo.PROPOSALS_BUCKET, volumes[vol], dest)
                        jobs[(code, vol, dest)] = pool.submit(extraction.ixp, vol, dest)
            for (code, vol, dest), job in jobs.items():
                found = job.result()
                results.setdefault(code, {})[vol] = found if found is not None else {"error": extraction.ERRORS.get(dest, "IXP unavailable")}
        out.extraction, out.offerorCount = json.dumps(results), len(results)
    except Exception as exc:
        return _fail(out, exc)
    return out


# ── 2. ScreenCompliance ─────────────────────────────────────────────────────

class ScreenOutput(Result):
    complianceSummary: str = ""


@traced(name="ScreenCompliance", run_type="uipath")
def screen_compliance(input: SolicitationInput) -> ScreenOutput:
    out = ScreenOutput()
    try:
        sol = input.solicitationId
        plan = repo.plan(sol)
        refs = {r.get("UEI"): r for r in repo.rows("SSRefVendor")}
        pages = repo.rows("SSProposalPage", sol)
        counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        for p in pages:
            counts[p["OfferorId"]][p["Volume"]] += 1
        updates, summary = [], []
        for o in sorted(repo.rows("SSOfferor", sol), key=lambda o: o["Name"]):
            ref = refs.get(o.get("UEI"))
            found = json.loads(o.get("ExtractionJson") or "{}")
            status, notes = rules.screen(plan, counts[o["OfferorId"]], ref, (found.get("cover") or {}).get("certifications"))
            # Intake's own notes (signature, stated total) and the claimed-vs-CPARS check, rebuilt each run so a re-screen
            # never repeats them. Offerors ingested before ExtractionJson keep their prior intake notes.
            prior = found.get("intakeNotes") or ([(o.get("ComplianceNotes") or "").strip()] if "Signed by" in (o.get("ComplianceNotes") or "") else [])
            notes += [n for n in prior if n]
            if ref and found.get("references"):
                notes += rules.cpars_check(found["references"], json.loads(ref.get("CparsSummaryJson") or "[]"), federal=not rules.is_sled(plan))
            updates.append({"OfferorId": o["OfferorId"], "SolicitationId": sol, "SamStatus": (ref or {}).get("SamStatus") or "Not found",
                            "Exclusion": bool((ref or {}).get("Exclusion")), "ComplianceStatus": status, "ComplianceNotes": " ".join(notes)})
            summary.append({"offerorId": o["OfferorId"], "offeror": o["Name"], "status": status, "notes": notes})
        repo.upsert("SSOfferor", "OfferorId", updates)
        flagged = sum(s["status"] != "Compliant" for s in summary)
        checked = ("Sections, page limits, state vendor registration and the debarment list checked" if rules.is_sled(plan)
                   else "Volumes, page limits, SAM, exclusions and FAPIIS checked")
        repo.audit(sol, "case", "ComplianceScreened", f"{checked}; {flagged} flagged")
        out.complianceSummary = json.dumps(summary)
    except Exception as exc:
        return _fail(out, exc)
    return out


# ── 3. GenerateDraftFindings ────────────────────────────────────────────────

class DraftInput(SolicitationInput):
    includeOfferorIds: str = ""  # CO override at release (BR-02), comma-separated
    agentProcess: str = EVAL_AGENT


class DraftOutput(Result):
    draftFindingCount: int = 0
    droppedFindingCount: int = 0
    unavailableCount: int = 0


def _agent_inputs(sol: str, plan: dict, o: dict, f: dict, pages: list[dict], ref: dict | None) -> dict:
    factor = {k: f[k] for k in ("id", "name", "criteria", "subfactors") if k in f}
    if rules.is_sled(plan):  # the assistant writes for a District evaluation committee (see its prompt)
        factor |= {"framework": "sled", "maxPoints": f.get("weight")}
    past = ""
    if f["volume"] == "pastPerformance" and ref:
        cpars = json.loads(ref.get("CparsSummaryJson") or "[]")
        claimed = json.loads(o.get("ExtractionJson") or "{}").get("references") or []
        past = json.dumps({"cpars": cpars, "fapiis": ref.get("FapiisRecords") or "None",
                           "claimedReferences": [{k: r[k] for k in ("contract", "customer", "rating") if r.get(k)} for r in claimed],
                           "crossCheck": rules.cpars_check(claimed, cpars, federal=not rules.is_sled(plan))})
    base = {"solicitationId": sol, "offerorName": o["Name"], "factor": json.dumps(factor), "volume": f["volume"], "pastPerformance": past}
    budget = rules.AGENT_INPUT_LIMIT - len(json.dumps(base)) - 40
    return {**base, "proposalPages": rules.agent_pages(pages, budget)}


@traced(name="GenerateDraftFindings", run_type="uipath")
def generate_draft_findings(input: DraftInput) -> DraftOutput:
    out = DraftOutput()
    try:
        sol = input.solicitationId
        plan = repo.plan(sol)
        override = {x.strip() for x in input.includeOfferorIds.split(",") if x.strip()}
        # BR-02: responsibility (FAR Part 9) is determined apart from the technical evaluation, so a
        # "Responsibility concern" offeror is still drafted. Non-compliant offerors are left out, and so
        # are offerors with an active SAM exclusion, whose offers are not evaluated (FAR 9.405(d)(4)).
        offerors = [o for o in repo.rows("SSOfferor", sol)
                    if (o.get("ComplianceStatus") != "Non-compliant" and not o.get("Exclusion")) or o["OfferorId"] in override]
        pages = repo.rows("SSProposalPage", sol)
        refs = {r.get("UEI"): r for r in repo.rows("SSRefVendor")}
        work = []
        for o in offerors:
            for f in _rated(plan):
                vol_pages = [p for p in pages if p["OfferorId"] == o["OfferorId"] and p["Volume"] == f["volume"]]
                work.append({"o": o, "f": f, "pages": vol_pages, "in": _agent_inputs(sol, plan, o, f, vol_pages, refs.get(o.get("UEI")))})

        # Start every offeror × factor run at once, then retry faulted runs once (SE-02).
        results: dict[int, dict | None] = {}
        pending = list(range(len(work)))
        for attempt in range(2):
            keys = {i: repo.start_agent(input.agentProcess, work[i]["in"]) for i in pending}
            states = repo.wait_jobs(list(keys.values()))
            pending = []
            for i, k in keys.items():
                state, output = states[k]
                found = rules.agent_findings(output) if output else None
                if state == "Successful" and found is not None:
                    results[i] = output
                else:
                    pending.append(i)
            if not pending:
                break
        if work and not results:  # write nothing, so the incident retry starts clean
            raise AgentRunsFailed(f"All {len(work)} {input.agentProcess} runs failed twice; no draft findings were written")

        findings, events = [], []
        for i, w in enumerate(work):
            o, f = w["o"], w["f"]
            prefix = f"{o['OfferorId']}-{f['id']}"
            if i not in results:  # BE-03
                fid = f"{prefix}-A0"
                findings.append({"FindingId": fid, "SolicitationId": sol, "OfferorId": o["OfferorId"], "FactorId": f["id"],
                                 "Kind": "Draft unavailable", "FindingText": "Draft unavailable — evaluate manually.", "AgentText": "",
                                 "CitationVolume": f["volume"], "CitationPage": 1, "CitationQuote": "", "Author": AGENT_ACTOR,
                                 "Origin": "Agent", "Status": "Draft", "EvaluatorSlot": 0, "Revision": 1})
                events.append(repo.audit_row(sol, fid, "DraftUnavailable", f"{o['Name']} · {f['name']}: agent run failed twice", AGENT_ACTOR))
                out.unavailableCount += 1
                continue
            n = 0
            for x in rules.agent_findings(results[i]):
                page = rules.resolve_citation(str(x.get("quote", "")), int(x.get("page") or 0), w["pages"])
                if page is None or x.get("kind") not in plan["findingKinds"]:  # BR-05
                    events.append(repo.audit_row(sol, f"{prefix}-X{len(events)}", "FindingDropped",
                                                 f"Invalid citation or kind: {str(x.get('text', ''))[:300]}", AGENT_ACTOR))
                    out.droppedFindingCount += 1
                    continue
                n += 1
                fid = f"{prefix}-A{n}"
                text = str(x.get("text", "")).strip()
                findings.append({"FindingId": fid, "SolicitationId": sol, "OfferorId": o["OfferorId"], "FactorId": f["id"],
                                 "Kind": x["kind"], "FindingText": text, "AgentText": text, "CitationVolume": f["volume"],
                                 "CitationPage": page, "CitationQuote": str(x.get("quote", "")), "Author": AGENT_ACTOR,
                                 "Origin": "Agent", "Status": "Draft", "EvaluatorSlot": 0, "Revision": 1})
                events.append(repo.audit_row(sol, fid, "FindingDrafted", f"{x['kind']}: {text[:300]}", AGENT_ACTOR))
        repo.upsert("SSFinding", "FindingId", findings)
        repo.upsert("SSAuditEvent", "EventId", events)
        repo.set_solicitation(sol, Stage="Individual Evaluation")
        out.draftFindingCount = sum(1 for x in findings if x["Kind"] != "Draft unavailable")
        if out.unavailableCount:  # partial: placeholders let the evaluation go on
            out.error_type = "DraftsUnavailable"
            out.error_message = (f"{out.unavailableCount} of {len(work)} offeror × factor drafts are unavailable after a retry; "
                                 "placeholder findings ask the evaluators to evaluate them manually")
    except Exception as exc:
        return _fail(out, exc)
    return out


# ── 4. CompileEvaluations ───────────────────────────────────────────────────

class CompileOutput(Result):
    evaluationSet: str = ""
    scales: str = ""
    disagreementCount: int = 0


@traced(name="CompileEvaluations", run_type="uipath")
def compile_evaluations(input: SolicitationInput) -> CompileOutput:
    out = CompileOutput()
    try:
        sol = input.solicitationId
        plan = repo.plan(sol)
        ratings = [r for r in repo.rows("SSRating", sol) if r["Level"] == "Individual"]
        findings = [f for f in repo.rows("SSFinding", sol) if f["Origin"] == "Evaluator" and f.get("Status") != "Rejected"]
        codes = {o["OfferorId"]: o["OfferorCode"] for o in repo.rows("SSOfferor", sol)}
        payload, disagreements = [], 0
        for oid, code in sorted(codes.items()):
            for f in _rated(plan):
                rs = sorted([r for r in ratings if r["OfferorId"] == oid and r["FactorId"] == f["id"]], key=lambda r: r["EvaluatorSlot"])
                fs = [x for x in findings if x["OfferorId"] == oid and x["FactorId"] == f["id"]]
                if not rs:
                    continue
                spread = rules.spread(plan, f, [r["Rating"] for r in rs])
                flag = spread >= rules.DISAGREEMENT_SPREAD or rules.finding_conflict(fs)
                disagreements += flag
                payload.append({"o": oid, "f": f["id"], "spread": spread, "flag": flag, "ev": [
                    {"by": f"E{r['EvaluatorSlot']}", "r": r["Rating"], "why": r.get("Rationale") or "",
                     "fi": [{"id": x["FindingId"], "k": x["Kind"], "t": x["FindingText"]} for x in fs if x["EvaluatorSlot"] == r["EvaluatorSlot"]]}
                    for r in rs]})

        def shrink(p, n):  # keep the analyst input under the 10k cap
            for cell in p:
                for e in cell["ev"]:
                    if n == 0:
                        e["why"] = e["why"][:120]
                    for x in e["fi"]:
                        x["t"] = x["t"][: max(60, 220 - n * 40)]
        # A District RFP scores criteria in points; the analyst reads that from the scales it is given (see its prompt).
        out.scales = json.dumps(plan["scales"] | ({"framework": "sled", "maxPoints": {f["id"]: f.get("weight") for f in _rated(plan)}}
                                                  if rules.is_sled(plan) else {}))
        out.evaluationSet = rules.fit(payload, rules.AGENT_INPUT_LIMIT - len(out.scales) - 200, shrink)
        out.disagreementCount = disagreements
        repo.set_solicitation(sol, Stage="Consensus")
    except Exception as exc:
        return _fail(out, exc)
    return out


# ── 5. AnalyzePrice ─────────────────────────────────────────────────────────

class PriceOutput(Result):
    priceAnalysis: str = ""


@traced(name="AnalyzePrice", run_type="uipath")
def analyze_price(input: SolicitationInput) -> PriceOutput:
    out = PriceOutput()
    try:
        sol = input.solicitationId
        plan = repo.plan(sol)
        rows, analysis = [], []
        for o in sorted(repo.rows("SSOfferor", sol), key=lambda o: o["Name"]):
            res = rules.price_result(plan, json.loads(o.get("PriceLinesJson") or "[]"))
            rows.append({"OfferorId": o["OfferorId"], "SolicitationId": sol, "TotalEvaluatedPrice": res["total"], "IgceVariancePct": res["variancePct"]})
            # Shape read by the Contracting Officer's price form (ss-task-forms PriceRow) and the decision writer.
            analysis.append({"offerorId": o["OfferorId"], "name": o["Name"], "total": res["total"], "igceVariancePct": res["variancePct"],
                             "unbalanced": res["unbalanced"]})
        repo.upsert("SSOfferor", "OfferorId", rows)
        estimate = "the District cost estimate" if rules.is_sled(plan) else "IGCE"
        repo.audit(sol, "case", "PriceAnalyzed", f"{len(rows)} {'proposers' if rules.is_sled(plan) else 'offerors'} priced against {estimate} ${plan['igce']['total']:,.0f}")
        repo.set_solicitation(sol, Stage="Price Evaluation")
        out.priceAnalysis = json.dumps(analysis)
    except Exception as exc:
        return _fail(out, exc)
    return out


# ── 6. PrepareDecisionPackage ───────────────────────────────────────────────

class DecisionPackageOutput(Result):
    plan: str = ""
    consensusRecord: str = ""


@traced(name="PrepareDecisionPackage", run_type="uipath")
def prepare_decision_package(input: SolicitationInput) -> DecisionPackageOutput:
    """Consensus record for SS_DecisionWriter: per offeror and factor, the consensus rating and its cited findings."""
    out = DecisionPackageOutput()
    try:
        sol = input.solicitationId
        plan = repo.plan(sol)
        names = {o["OfferorId"]: o["Name"] for o in repo.rows("SSOfferor", sol)}
        consensus = [r for r in repo.rows("SSRating", sol) if r["Level"] == "Consensus"]
        # Agent drafts accepted or edited by an evaluator carry the citations into the record.
        support = [f for f in repo.rows("SSFinding", sol) if f["Origin"] == "Evaluator" and f.get("Status") in ("Accepted", "Edited", "Added")]
        factors = {f["id"]: f for f in plan["factors"]}
        payload = []
        for r in sorted(consensus, key=lambda r: (names.get(r["OfferorId"], ""), factors.get(r["FactorId"], {}).get("order", 0))):
            seen, fs = set(), []
            for x in support:
                if x["OfferorId"] == r["OfferorId"] and x["FactorId"] == r["FactorId"] and x["FindingText"] not in seen:
                    seen.add(x["FindingText"])
                    fs.append({"id": x["FindingId"], "kind": x["Kind"], "text": x["FindingText"], "citation": f"{x['CitationVolume']} p.{x['CitationPage']}"})
            payload.append({"offeror": names.get(r["OfferorId"], r["OfferorId"]), "factor": factors.get(r["FactorId"], {}).get("name", r["FactorId"]),
                            "consensusRating": r["Rating"], "rationale": r.get("Rationale") or "", "supportingFindings": fs})
        sled = rules.is_sled(plan)
        out.plan = json.dumps({k: plan[k] for k in ("title", "agency", "basisForAward", "relativeImportance") if k in plan}
                              | {"factors": [{"id": f["id"], "name": f["name"], "order": f.get("order"), **({"maxPoints": f.get("weight")} if sled else {})} for f in plan["factors"]]}
                              # A District RFP is decided on points: the writer gets the totals rather than computing them.
                              | ({"framework": "sled", "scores": rules.sled_scores(plan, consensus, repo.rows("SSOfferor", sol))} if sled else {}))

        def shrink(p, n):
            for c in p:
                c["rationale"] = c["rationale"][:160]
                for x in c["supportingFindings"]:
                    x["text"] = x["text"][: max(80, 260 - n * 45)]
        out.consensusRecord = rules.fit(payload, rules.AGENT_INPUT_LIMIT - len(out.plan) - 2500, shrink)
        repo.set_solicitation(sol, Stage="Award Decision")
    except Exception as exc:
        return _fail(out, exc)
    return out


# ── 7. PublishAwardRecord ───────────────────────────────────────────────────

class AwardInput(SolicitationInput):
    ssddText: str = ""
    awardee: str = ""
    signedBy: str = ""


class RecordOutput(Result):
    recordUri: str = ""


def _audit_section(sol: str) -> tuple[str, str]:
    events = sorted(repo.rows("SSAuditEvent", sol), key=lambda e: str(e["OccurredAt"]))
    return ("Audit trail", "\n\n".join(f"{str(e['OccurredAt'])[:19].replace('T', ' ')}  {e['Actor']}  {e['Action']}  {e.get('Detail') or ''}" for e in events))


@traced(name="PublishAwardRecord", run_type="uipath")
def publish_award_record(input: AwardInput) -> RecordOutput:
    out = RecordOutput()
    try:
        sol = input.solicitationId
        plan = repo.plan(sol)
        decisions = {d["Kind"]: d for d in repo.rows("SSDecision", sol)}
        award = decisions.get("Award", {})
        sled = rules.is_sled(plan)
        ssdd = input.ssddText or award.get("DocumentText") or ""
        # The award form records "Award to X as the best value." (federal) or "Recommend award to X, N of 100 points." (State & Local).
        m = re.match(r"(?:Recommend award to|Award to)\s+(.+?)(?:,\s*[\d.]+ of 100 points| as |\.?$)", award.get("Rationale") or "")
        awardee = input.awardee or (m.group(1).strip() if m else "")
        if not ssdd or not awardee:
            raise ValueError("Signed decision text and awardee are required (inputs or the SSDecision Award record)")
        header = f"{plan['agency']} | {sol} | {plan['title']}"
        prefix = f"{sol}/"
        signer = input.signedBy or award.get("DecidedBy") or ("Award Authority" if sled else "Source Selection Authority")
        doc, doc_file = ("Recommendation of Award", "Recommendation-of-Award.pdf") if sled else ("Source Selection Decision Document", "SSDD.pdf")
        repo.upload(repo.RECORDS_BUCKET, prefix + doc_file, records.render(doc, header, [("", ssdd), ("Signature", f"Signed by {signer} on {repo.now()[:10]}")], sled))

        names = {o["OfferorId"]: o["Name"] for o in repo.rows("SSOfferor", sol)}
        by_id = {f["id"]: f for f in plan["factors"]}
        cons = sorted([r for r in repo.rows("SSRating", sol) if r["Level"] == "Consensus"], key=lambda r: (names.get(r["OfferorId"], ""), r["FactorId"]))

        def scored(r: dict) -> str:  # "Good" federal; "Good (28 of 35 points)" for a District RFP
            f = by_id.get(r["FactorId"], {})
            scale = rules.scale_for(plan, f) if f else []
            if sled and f.get("weight") and r["Rating"] in scale:
                return f"{r['Rating']} ({rules.points_at(f['weight'], scale.index(r['Rating'])):g} of {f['weight']} points)"
            return r["Rating"]
        report = [(f"{names.get(r['OfferorId'], r['OfferorId'])} — {by_id.get(r['FactorId'], {}).get('name', r['FactorId'])}: {scored(r)}", r.get("Rationale") or "") for r in cons]
        if sled:
            totals = rules.sled_scores(plan, cons, repo.rows("SSOfferor", sol))
            report.insert(0, ("Final scores", "\n\n".join(f"{t['rank']}. {t['offeror']}: {t['total']:g} of 100 points (cost points {t['costPoints'] if t['costPoints'] is not None else '-'})" for t in totals)))
        report_title, report_file = ("Evaluation Committee Report", "Evaluation-Committee-Report.pdf") if sled else ("SSEB Consensus Report", "SSEB-Consensus-Report.pdf")
        repo.upload(repo.RECORDS_BUCKET, prefix + report_file, records.render(report_title, header, report, sled))
        repo.upload(repo.RECORDS_BUCKET, prefix + "Audit-Trail.pdf", records.render("RFP Evaluation Audit Trail" if sled else "Source Selection Audit Trail", header, [_audit_section(sol)], sled))

        repo.set_solicitation(sol, Status="Awarded", Stage="Awarded", AwardeeName=awardee, AwardedAt=repo.now())
        filed = "Recommendation of award, evaluation committee report" if sled else "SSDD, SSEB report"
        repo.audit(sol, "case", "AwardRecordPublished", f"{filed} and audit trail filed for award to {awardee}")
        out.recordUri = f"{repo.RECORDS_BUCKET}/{prefix}"
    except Exception as exc:
        return _fail(out, exc)
    return out


# ── 8. RecordCancellation ───────────────────────────────────────────────────

class CancelInput(SolicitationInput):
    rationale: str = ""
    cancelledBy: str = ""


@traced(name="RecordCancellation", run_type="uipath")
def record_cancellation(input: CancelInput) -> RecordOutput:
    out = RecordOutput()
    try:
        sol = input.solicitationId
        plan = repo.plan(sol)
        if not input.rationale.strip():
            raise ValueError("A cancellation rationale is required")
        header = f"{plan['agency']} | {sol} | {plan['title']}"
        path = f"{sol}/Cancellation-Memo.pdf"
        sled = rules.is_sled(plan)
        officer = "Procurement Officer" if sled else "Contracting Officer"
        repo.upload(repo.RECORDS_BUCKET, path, records.render(
            "Memorandum for Record — Cancellation of RFP" if sled else "Memorandum for Record — Cancellation of Solicitation", header,
            [("Rationale", input.rationale), (officer, f"{input.cancelledBy or officer}, {repo.now()[:10]}")], sled))
        repo.upsert("SSDecision", "DecisionId", [{"DecisionId": f"{sol}-cancel", "SolicitationId": sol, "Kind": "Cancellation", "Outcome": "Cancel",
                                                  "Rationale": input.rationale, "DecidedBy": input.cancelledBy, "DecidedAt": repo.now()}])
        repo.set_solicitation(sol, Status="Cancelled", Stage="Cancelled")
        repo.audit(sol, "case", "SolicitationCancelled", input.rationale[:500])
        out.recordUri = f"{repo.RECORDS_BUCKET}/{path}"
    except Exception as exc:
        return _fail(out, exc)
    return out


# ── Case entry point ────────────────────────────────────────────────────────
# Maestro process tasks start a release at its single entry point, so the case calls one `run`
# entry point and names the operation in `step`. The operations above stay callable directly.

class RobotInput(BaseModel):
    step: str = ""
    solicitationId: str = ""
    includeOfferorIds: str = ""
    agentProcess: str = EVAL_AGENT
    ssddText: str = ""
    awardee: str = ""
    signedBy: str = ""
    rationale: str = ""
    cancelledBy: str = ""


class RobotOutput(Result):
    """Compact case contract. `content` is the step's primary payload, `detail` its secondary payload,
    `count` its headline number — see RESULT_FIELDS for what each step puts where. (Not `result`:
    `=result` is a reserved case-expression prefix.)"""
    step: str = ""
    content: str = ""
    detail: str = ""
    count: int = 0


# step -> (result field, detail field or extra-stats fields, count field) on the step's own output model
RESULT_FIELDS = {
    "IngestProposals": (None, ["pageCount"], "offerorCount"),
    "ExtractProposals": ("extraction", None, "offerorCount"),
    "ScreenCompliance": ("complianceSummary", None, None),
    "GenerateDraftFindings": (None, ["droppedFindingCount", "unavailableCount"], "draftFindingCount"),
    "CompileEvaluations": ("evaluationSet", "scales", "disagreementCount"),
    "AnalyzePrice": ("priceAnalysis", None, None),
    "PrepareDecisionPackage": ("consensusRecord", "plan", None),
    "PublishAwardRecord": ("recordUri", None, None),
    "RecordCancellation": ("recordUri", None, None),
}


STEPS = {
    "IngestProposals": (ingest_proposals, SolicitationInput),
    "ExtractProposals": (extract_proposals, SolicitationInput),
    "ScreenCompliance": (screen_compliance, SolicitationInput),
    "GenerateDraftFindings": (generate_draft_findings, DraftInput),
    "CompileEvaluations": (compile_evaluations, SolicitationInput),
    "AnalyzePrice": (analyze_price, SolicitationInput),
    "PrepareDecisionPackage": (prepare_decision_package, SolicitationInput),
    "PublishAwardRecord": (publish_award_record, AwardInput),
    "RecordCancellation": (record_cancellation, CancelInput),
}


# A returned error_type does not stop the case: the task completes and the next one starts on missing
# data. So `run` faults the job instead, and Maestro opens an incident the operator can retry. Every
# step's output feeds the next task or is the official record, and every step is idempotent (BR-06),
# so retrying is safe. Only these partial results are returned, and the case goes on with them.
PARTIAL_ERRORS = {"DraftsUnavailable"}  # some offeror × factor drafts replaced by placeholders (BE-03)


@traced(name="SS_Robots", run_type="uipath")
def run(input: RobotInput) -> RobotOutput:
    if input.step not in STEPS:
        raise StepFailed(f"UnknownStep: step must be one of {', '.join(STEPS)}, not {input.step!r}")
    fn, model = STEPS[input.step]
    res = fn(model(**input.model_dump(include=set(model.model_fields)))).model_dump()
    if res["error_type"] and res["error_type"] not in PARTIAL_ERRORS:
        raise StepFailed(f"{input.step} failed: {res['error_type']}: {res['error_message']}")
    result_field, detail_field, count_field = RESULT_FIELDS[input.step]
    detail = json.dumps({k: res[k] for k in detail_field}) if isinstance(detail_field, list) else (res[detail_field] if detail_field else "")
    return RobotOutput(step=input.step, error_type=res["error_type"], error_message=res["error_message"],
                       content=res[result_field] if result_field else "", detail=detail, count=res[count_field] if count_field else 0)
