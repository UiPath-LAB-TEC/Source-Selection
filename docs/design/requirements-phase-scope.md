# Scope: Requirements phase (define the need, build the requirements package)

**Status:** slice 0 built and walked through in the dev preview (2026-11-10); not committed. See §11.
Requirements solution 1.0.0 is deployed to `AMER Presales/Public Sector/Procurement/Requirements` (folder key
7d0d7fb8-708b-4019-b848-7956ad3c67a9, set as `REQUIREMENTS_FOLDER` in `requirements-workspace/src/lib/agents.ts`).
Live at https://uipathlabs.uipath.host/requirements: solution 1.0.4 and web app 1.0.4. Web 1.0.3 was checked end to end on
2026-11-12 (tablets example, test record RQ-27-0003). In 1.0.4 RQ_RequirementsAnalyst returns the read and the
questions and RQ_SpecWriter returns the structured requirement; the app runs them side by side. Both return typed
fields, with each list declared `anyOf` list or text, because Claude on the agent runtime sometimes sends a list as
JSON text or '' and the runtime's output check rejects that; the app parses the text. (1.0.3's single JSON text field
broke in 3 of 7 runs; 1.0.4 passed 12 of 12 debug runs.) Web 1.0.4 adds requester profiles and Settings (§4.1),
checked live. The app also
cleans tool-call markup the model sometimes leaks into a text field. The prompts use current IT PSC codes (7A20–7K20
products, DA01–DK10 services; the 70xx and D3xx IT codes were end-dated 30 Oct 2020, PSC Manual revision V1.5).

**Sales play phase:** 1 of 4, Requirements. It moves the hub's Requirements card from "Planned" to "Demo ready".

## 1. What this adds

Every acquisition starts before the contracting office sees it. Someone in the program office (the requiring
activity) needs a good or a service, and has to turn that need into a **requirements package** the Contracting
Officer can accept:

1. **The need.** What, how many or how much, where, by when, and why.
2. **Market research.** Who sells it, on which vehicles, whether it's commercial, whether small businesses can do it.
3. **The requirements document.** A purchase description with salient characteristics for a product; a performance
   work statement (PWS), statement of work or statement of objectives for a service, with a quality assurance
   surveillance plan (QASP).
4. **The cost estimate.** An independent government cost estimate (IGCE) with its basis.
5. **The strategy.** Contract type, vehicle, competition, set-aside recommendation.
6. **Funds and reviews.** The resource manager certifies funds on the purchase request; the small business
   professional reviews the set-aside; justifications go to their approvers when they apply.
7. **Hand-off.** The Contracting Officer accepts the package. The statutory PALT (FY2019 NDAA §878) runs from the
   solicitation to the award, so none of this time counts in it. OFPP only encourages agencies to track from receipt of
   a complete package (memo of Jan 14, 2021).

**The user's ask (2026-11-10):** "a solution where a procurement officer or someone within the program office can come
in and start building out a requirement for a specific good or service that they need for their organization."

**Why this phase sells:** most packages come back. A vague PWS, an IGCE that doesn't match it, a brand name with no
justification, or missing market research sends the package back to the program office, and that time is invisible in
PALT, which starts at the solicitation. An agent that asks the questions a Contracting Officer would ask, before the package is submitted, is the pitch.
It also opens the AFMC SCMW "Turbo PR/PK" opportunity (purchase request packages) on the play page.

## 2. Architecture: separate app, one system

Same pattern as Contract Management (award-phase-scope.md §2).

| | Requirements (new) | Shared with Source Selection and Contract Management |
|---|---|---|
| Web app | `requirements-workspace`, route `/requirements`, dev port 5177 | Same host and origin: sign-in token copy (`ss.signin`), persona (`ss.persona`), framework (`ss.framework`). Imports `@ss` and `@forms` from source. |
| Action app | `requirements-task-forms`, dev port 5178 (slice 2) | Runs on `ss-task-forms/src/host.tsx`, like award-task-forms. |
| Solution | `Requirements/` (new deployment, folder `…/Procurement/Requirements`) | None. Deploys on its own, so SourceSelection2 and Award are never touched. |
| Process | `RequirementsProcess` (BPMN, slice 2) | BPMN, like the others. |
| Data Fabric | Adds `SSRequirement` and `SSRequirementDoc` | `SSAuditEvent` (one audit trail, keyed by the requirement number until a solicitation exists), `SSRefVendor` (the SAM stand-in, used by market research). |
| Files | SS-Records under `<requirement id>/package/` (slice 2) | One file store. |
| Brand | "Agentic Acquisition › Requirements" | The app switcher lists it first: the phases run Requirements → Solicitation → Evaluation → Award. |

The web app writes the record itself in slice 0 (as Source Selection's wizard writes its draft). From slice 2, the
process writes the reviewed package.

## 3. Color

**Crimson, not alarm red.** Every app keeps one accent so nobody confuses them: Source Selection blue, Contract
Management teal. A pure red (#dc2626) would collide with the shared status colors: `--ss-critical` (#d03b3b), the
Unacceptable rating (#b91c1c), destructive buttons and error alerts. A deep crimson reads as a brand and stays apart
from them:

```css
:root { --ss-brand-1: #4c0519; --ss-brand-2: #be123c; --ss-brand-3: #fb923c; --ss-glow: rgba(190, 18, 60, 0.14); }
```

- `--ss-brand-2` #be123c on white text is 6.3:1.
- `--ss-brand-3` warms the gradient toward orange (UiPath's Robotic Orange family) instead of a second red.
- Buttons, ratings and status colors stay shared (one system). Errors never use the brand color.

## 4. Personas

One signed-in user plays every role, as in the other apps.

| Persona | Id | Name (fictional) | Does |
|---|---|---|---|
| Program Manager (requiring activity) | `pm` | Any requester profile (Grace Lindqvist and four more, §4.1) | Starts the requirement, answers the agent, owns the requirements document. |
| Contracting Officer | `co` | Dana Whitfield (exists) | Can also start one; advises on strategy; accepts or returns the package. |
| Resource Manager | `rm` | Nadia Sorensen (exists) | Certifies funds on the purchase request (slice 2). |
| Small Business Professional | `sbp` | Hector Alvarez | Reviews the set-aside recommendation; DoD coordination record (slice 2). |
| COR nominee | `cor` | Owen Mercer (exists) | Reviews the QASP he will run after award (slice 2). |
| System Admin | `admin` | Jordan Ellis (exists) | Keeps the requester profiles (Settings); deletes demo requirements. |

New faces get initials only until the user OKs headshots.

### 4.1 Requester profiles (live 2026-11-12, web app 1.0.4)

The program office people are profiles, not fixed personas: `SSRequesterProfile` in Data Fabric (ProfileId, Name,
Title, Agency, Department, Office, Location, ContractingOffice, Framework, Active, UpdatedAt), seeded by
`tools/seed_requirements.py --profiles`. Each one plays the Program Manager role.

- **Seeded (fictional people, real agencies):** Grace Lindqvist (Department of the Air Force, ProfileId `pm`, so
  rows saved before profiles stay hers), Leah Okonkwo (Army), Samuel Brandt (VA), Teresa Vu (CBP, under DHS) and
  Ruth Halvorsen (National Park Service, under Interior).
- **Settings** (`/settings`, in the sidebar for the System Admin): add or edit a requester, set their workspace
  (federal or State & Local), and mark them inactive to take them out of the switcher.
- **Sign-in and the switcher** list the active requesters for the workspace under Program offices, then the
  acquisition team, then the admin. Sign-in reads the list this browser loaded last; nothing can be read before
  sign-in. With no profiles for a workspace, Grace stands in.
- **A new requirement** a requester starts is filled in from their profile: agency, requiring office, contracting
  office (a new field on the Need step), and the location as the delivery place and place of performance. A note
  says so, and every field stays editable. The agents keep a filled-in location, because the person's values win.
- **Ownership:** `SSRequirement.RequestedBy` holds the ProfileId. "My workspace" counts and "that's you" cover only
  the requester's own requirements; cards show the requester as the owner.
- **Rules:** the package rules read the agency, so a VA or CBP requirement gets no DD 2579 and an Army one does.

## 5. The record

**`SSRequirement`**, one row per requirement:

| Field | Type | Notes |
|---|---|---|
| RequirementId | STRING, unique | `RQ-27-0001`: fiscal year, then a sequence. |
| Title | STRING | Short title, from the agent. |
| Kind | STRING | Product, Service, Product and service. |
| Framework | STRING | federal, sled. |
| Status | STRING | Draft, Submitted, Returned, Accepted, Cancelled. |
| Stage | STRING | Need, Clarify, Requirement, Package, Review, Accepted. |
| Agency, Office | STRING | Requiring agency and office. |
| ContractingOffice | STRING | Where the package goes. |
| Need | MULTILINE 10,000 | The plain-language need, as the person wrote it. |
| NeedBy | STRING | Date the good or service is needed (yyyy-mm-dd). |
| Budget | DECIMAL | The program office's rough budget, if any. |
| EstimatedValue | DECIMAL | The IGCE total, or the agent's range midpoint until there is one. |
| Psc, Naics | STRING | Codes the agent suggests and the person confirms. |
| RequirementJson | MULTILINE 10,000 | The structured requirement (§6.3). |
| AnalysisJson | MULTILINE 10,000 | The agent's latest classification, flags and questions with answers. |
| StrategyJson | MULTILINE 10,000 | Contract type, vehicle, competition, set-aside (slice 1). |
| SolicitationId | STRING | Set when the requirement becomes a solicitation, linking to Source Selection. |
| OwnerPersona | STRING | Who started it (the role). |
| RequestedBy | STRING | The requester profile that owns it (§4.1). Empty on older rows: Grace. |
| CreatedAt, UpdatedAt | DATETIME_WITH_TZ | |

**`SSRequirementDoc`**, one row per document in the package:

| Field | Type | Notes |
|---|---|---|
| DocId | STRING, unique | `<requirement id>-<kind>`. |
| RequirementId | STRING | |
| Kind | STRING | pws, sow, soo, purchaseDescription, qasp, marketResearch, igce, acquisitionStrategy, brandName, ja, section508. |
| Title | STRING | |
| Status | STRING | Agent draft, Edited, Final. |
| Text | MULTILINE 10,000 | The document body. |
| DataJson | MULTILINE 10,000 | Structured parts: IGCE lines, market research sources, QASP standards. |
| DraftedBy | STRING | The agent, or the person who wrote it. |
| EditedBy | STRING | (UpdatedBy is reserved by Data Fabric.) |
| UpdatedAt | DATETIME_WITH_TZ | |

Every save writes an `SSAuditEvent` row (SolicitationId = the requirement number, EntityRef = the requirement or
document id), so agent drafts and the person's edits sit side by side in the trail, as in Source Selection.

## 6. The builder

The home page's main action is **Start a requirement**. The builder is a four-step wizard with a Cancel button that
returns where you came from (save-or-leave prompt on unsaved changes).

### 6.1 Describe the need

- One large text box: "What do you need, and why?" Example chips fill it ("Rugged tablets for flight line
  maintainers", "Help desk support for 2,000 users at three bases").
- Labeled fields: agency, requiring office, contracting office, needed by, rough budget (optional). A requester's
  profile fills in the first three (§4.1).
- **Ask the agent** sends it to `RQ_RequirementsAnalyst` and `RQ_SpecWriter`, side by side.

### 6.2 Clarify

The agent returns:
- **What it is:** product or service, a short title, a suggested PSC and NAICS (with the size standard), whether it is
  likely a commercial product or service, and a value range with its basis.
- **What applies:** flags, each with a short reason and an ⓘ cite: brand name named (justification needed),
  information technology (Section 508), CUI or classified work (security requirements), on-base services (access),
  value above the simplified acquisition threshold (written plan, small business coordination), and so on.
- **What it needs to know:** up to six questions, each with "why it matters" and suggested answers as chips. The
  person answers in plain words or picks a chip.

**Ask again** sends the need, the answers so far and the current draft back; the agent narrows the questions and
updates the draft. The agent is stateless: every call carries the whole draft. The person can skip questions; the
skipped ones stay listed as open in the package.

### 6.3 Requirement

The structured requirement, every field editable with a visible label:

- **Product:** items (name, quantity, unit), salient characteristics per item (performance terms, not brand names),
  standards (MIL-STD-810H, Section 508, TAA), delivery (place, date, FOB), warranty, packaging and marking, inspection
  and acceptance, training and support.
- **Service:** objective, background, scope, tasks, deliverables (name, due, format), performance standards (each with
  an acceptable quality level and how it's checked), place and period of performance, security (clearance, CUI),
  government-furnished property, key personnel (if any).

### 6.4 Package

A checklist built from the requirement and the flags (§7): each document with its status (Not started, Agent draft,
Edited, Final), **Draft with agent** (`RQ_Drafter`), and an editor. Slice 0 drafts the requirements document (purchase
description, or PWS) and the QASP. Slice 1 adds market research, the IGCE and the acquisition strategy.

**Save draft** keeps everything on the record at any step. **Submit to contracting** (slice 2) starts the process.

## 7. What the package needs (rules)

Rules live in one place (`requirements-workspace/src/lib/package.ts` in slice 0; the robot reads the same table from
slice 2). Thresholds are named constants, checked against the current FAR (§12).

| Document | When |
|---|---|
| Purchase description | Product. |
| PWS (or SOW / SOO) | Service. PWS is the default (performance-based preference). |
| QASP | Service. |
| Market research report | Always; the depth scales with value. |
| IGCE | Always above the micro-purchase threshold. |
| Acquisition strategy / plan | Above the simplified acquisition threshold. DoD needs a written plan for services of $50M or more in total or $25M in a year. |
| Small business coordination | DoD, above the micro-purchase threshold, unless a total small business set-aside under the SAT (DD 2579). |
| Brand-name justification | A brand name is named. |
| Justification for other than full and open competition | Sole source above the simplified acquisition threshold. |
| Section 508 determination | Information and communication technology. |
| Funds certification | Always (the purchase request). |

## 8. Agents

Low-code agents in the Requirements solution, called from the web app as Orchestrator jobs (as Source Selection's
intake agents are), with the same guardrails as the SourceSelection 1.5.4 agents.

| Agent | Slice | In | Out |
|---|---|---|---|
| `RQ_RequirementsAnalyst` | 0 | need, context (agency, office, needed by, budget), answers, current draft | kind, title, summary, PSC, NAICS, commercial, value range, flags, questions (≤6) |
| `RQ_SpecWriter` | 0 | the same four inputs | the structured requirement (product and service fields) |
| `RQ_Drafter` | 0 | requirement, analysis, document kind | title, sections (heading + text), open questions |
| `RQ_MarketResearcher` | 1 | requirement, vendor and vehicle pool (synthetic), prior awards (synthetic) | sources, vehicles, small business capability, commercial availability, conclusions |
| `RQ_CostEstimator` | 1 | requirement, prior prices (synthetic) | lines (item, qty, unit price, basis), total, assumptions |
| `RQ_PackageReviewer` | 2 | the whole package | findings a Contracting Officer would return the package for |

The UI calls every one of them "UiPath Agent". No Studio names on screen.

## 9. Process (slice 2)

`RequirementsProcess` (BPMN): Submit → robot assembles the package and renders PDFs → `RQ_PackageReviewer` → funds
certification (RM) and small business review (SBP) in parallel → Contracting Officer accepts or returns → robot files
the package and sets Accepted (or Returned, with the CO's comments, for the PM to fix and resubmit).

## 10. Hand-off to the next phases

- An accepted requirement keeps its number. When the solicitation is issued, `SolicitationId` links the two.
- The Source Selection wizard can later start **from a requirement**: title, agency, office, contract type and the IGCE
  lines come from the record instead of an upload (slice 3, or with the Solicitation phase).
- The demo history: FA8771-27-R-0031 (Enterprise IT Modernization Services, Air Force, in evaluation) gets an accepted
  requirement, so the switcher's one-record story runs from the need to the evaluation.

## 11. Slices

| Slice | What | State |
|---|---|---|
| 0 | Scope; entities; web app (sign-in, home, list, builder steps 1–4 with the analyst and drafter); app switcher entry in all three apps; Requirements solution with the three agents | Live (solution 1.0.4, web 1.0.4 with requester profiles and Settings) |
| 1 | Market research, IGCE and acquisition strategy (agents, synthetic vendor and price data) | |
| 2 | Submit → RequirementsProcess, task forms (RM, SBP, CO), package PDFs, returns | |
| 3 | Start a Source Selection from an accepted requirement; State & Local mode (requisition, procurement method by threshold) | |

Federal first, State & Local later, as with Contract Management. Until slice 3 the app opens federal; the sign-in's
framework switch shows State & Local as the same app with federal rules noted.

## 12. Citations

Checked against the RFO model deviation text and the DoD RFO class deviations on 2026-11-10. The UI shows them only
behind ⓘ tooltips (`cite` in package.ts). There is no RFO final rule yet: the codified 48 CFR is still the legacy text,
applied through deviations, so recheck before a customer demo if a final rule publishes.

| Topic | Current cite (RFO / DoD) | Legacy | Rule | Threshold |
|---|---|---|---|---|
| Market research | FAR 10.001(b), (e), (f); 10.002. DFARS 210.001(b)(i)(B), PGI 210.001(e) (dev. 2026-O0021) | FAR 10.001–10.003 | Before new requirements documents and acquisitions above the SAT; documented to suit size and complexity; commercial and nondevelopmental availability checked in priority order, starting with existing governmentwide contracts. DoD uses it for the set-aside decision. | > SAT |
| Describing needs | FAR 11.102(a)(2), 11.204; 37.101-1, 37.102-1 (PWS/SOO); 46.401(a) (QASP). DFARS 206.103-170(d) | FAR 11.002, 11.104, 11.105; 37.6 | Functions, performance or essential characteristics; performance-based to the maximum extent practicable. Brand-name-only needs a J&A posted with the solicitation; brand name or equal needs none except at DoD. | Posting > $25K |
| Acquisition planning | FAR 7.102(a), (d); 7.103(a); 7.104. DFARS 207.103-70(a) (dev. 2026-O0020 Rev 1) | FAR 7.103–7.105 | Every acquisition is planned. Written plan for cost-reimbursement and other high-risk types; otherwise agency thresholds. The 7.105 contents list is removed. | DoD: development ≥ $10M; production or services ≥ $50M total or ≥ $25M in a year |
| Small business | FAR 19.104-1(a)–(b). PGI 219.102(g)(1), DD Form 2579 (dev. 2026-O0037 Rev 1) | FAR 19.502-2; DFARS 219.201(c)(10) | Set aside when two or more responsible small businesses are reasonably expected to offer at fair market prices. DoD's small business specialist reviews and records it on DD 2579 before the solicitation. | Rule of two > MPT; DD 2579 > MPT except sub-SAT total set-asides |
| J&A | FAR 6.104-1, 6.104-2 Table 6-1, 6.301. DFARS 206.104-71 Table 206-1 (dev. 2026-O0017 Rev 2) | FAR 6.303–6.305 | Twelve elements, including the authority, market research and the CO's certification; posted within 14 days after award (30 for urgency). | Civilian: CO ≤ $900K, advocate ≤ $20M, HCA ≤ $90M, SPE above. DoD: CO ≤ $10M, advocate ≤ $100M, HCA ≤ $500M, SPE above |
| Funds | FAR 32.702, 32.703-2, 32.706-1. PGI 204.202-74(b); DFARS 208.7005 (MIPR) | FAR 32.702–32.705 | Written assurance from the fiscal authority that funds are available before award; otherwise subject to availability only in the listed cases. DoD calls it the purchase request. The certification's own FMR cite is unconfirmed. | — |
| IGCE | FAR 36.101-6, 36.102-3; 15.404-1(b)(5) | FAR 36.203 | Required only for construction and A-E. For supplies and services, agency policy. | Construction, A-E > SAT |
| Section 508 | FAR 11.102(f); 39.104-1 to -5; 39.201 | FAR 11.002(f); 39.2 | Requirements documents identify the needs of users with disabilities and the 36 CFR 1194.1 standards, and document any exception or exemption. | — |
| Thresholds | FAR 2.101 (FAC 2025-06, 90 FR 41872, effective Oct 1, 2025) | | MPT $15,000; SAT $350,000; commercial simplified procedures $9M ($15M under 12.001(c)). | |
| PALT | 41 U.S.C. 1122 note (FY2019 NDAA §878); OFPP memo Jan 14, 2021; GAO-24-106528 | | From the initial (or final, after drafts) solicitation to award. OFPP encourages tracking from receipt of a complete package. GAO treated requirements and market research as pre-PALT and found DoD's PALT data unreliable. | Reported > SAT |

Don't copy cross-references from the RFO text itself; several are stale (11.204 cites 6.302-1 and 13.106-1(b), which
no longer exist; 11.102(f) cites 7.105(b)(5)(iv), now reserved).

## 13. Demo data

- Synthetic only: fictional people, offices and vendors.
- Seeded: the accepted requirement behind FA8771-27-R-0031 (service), and one product requirement left at Clarify so the
  list isn't empty. The live demo builds a new one from a chip.
- `tools/seed_requirements.py` writes them; `--reset` deletes them (a permanent delete, so the user runs it).

## 14. Open questions for the user

- Personas' names and whether the Program Manager is military (rank) or civilian. Default: civilian.
- Whether Solicitation (phase 2) should be its own app or a stage of this one. Default: its own app, later.
