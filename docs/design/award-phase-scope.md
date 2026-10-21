# Scope: Award phase (contract award, notices, debriefings, protest file)

**Status:** slice 0 (foundation) built and deployed on 2026-10-21; not committed. See §15.
**Sales play phase:** 4 of 4, Award. It moves the play page from "Decision built" to "Demo ready".

## 1. What this adds

Source Selection ends when the SSA signs and the award record goes to SS-Records. In real life the Contracting Officer's
work keeps going after that:

1. **Contract award.** The CO executes the award document for the selected offeror.
2. **Notices.** Within 3 days of award, every unsuccessful offeror gets a written notice.
3. **Debriefings.** An offeror that asks within 3 days gets a debriefing, ideally within 5 days of the request. DoD
   offerors can send follow-up questions (enhanced debriefing).
4. **Protest.** An offeror may protest to GAO. A protest filed early enough stays performance automatically, and the
   agency has 30 days to file its report, built from the evaluation record.
5. **Close.** The protest is decided or the window closes, and the contract goes to contract administration.

The order matters: the contract is awarded **before** the notices go out. The play page lists "contract" last, so its
Award card should read "Contract award, notices, debriefings, protest file" instead.

**Why this phase sells:** every CO who watches an AI evaluation asks, "will it survive a protest?" Here the demo
answers that with the record itself. The protest file is assembled in minutes and shows every agent draft next to the
named person who accepted, edited or rejected it. That's the TRAX v. US point the play page already makes.

## 2. Architecture: separate apps, one system

The Award phase gets its **own web app, action app and solution**, but it runs on the **same data, files, audit trail
and sign-in** as Source Selection. To a user it's one system with two front doors.

| | Source Selection (exists) | Award (new) | Shared |
|---|---|---|---|
| Web app | `ss-workspace`, route `/source-selection` | `award-workspace`, route `/award` | Same host (`uipathlabs.uipath.host`), so the same browser origin: the sign-in token copy (`ss.signin`), persona (`ss.persona`) and framework (`ss.framework`) carry across. |
| Action app | `ss-task-forms` | `award-task-forms` | Shared lib imported from source (terms, ratings, types, form shell), the same way ss-workspace imports `@forms` today. |
| Solution | `SourceSelection` (Solution2, 1.5.2) | `Award` (new deployment) | None. The solutions deploy separately. |
| Process | `SourceSelectionProcess` (BPMN) | `AwardProcess` (BPMN) | Both are BPMN. |
| Orchestrator folder | `…/Source Selection` (+ `/Solution2`) | `…/Source Selection/Award` | The subfolder inherits the Source Selection role assignments, so anyone who can use one app can use both. |
| Data Fabric | SS* entities | Reads all SS* entities; adds 3 | One record per solicitation across both apps. |
| Files | SS-Proposals, SS-Records | Reads both; writes to SS-Records under `<sol>/award/`, `<sol>/debriefings/`, `<sol>/protest/` | One file store. |
| Audit | `SSAuditEvent` | Same entity, same trail | The Audit tab in either app shows the whole lifecycle. |
| Brand | "Agentic Acquisition › Source Selection" | "Agentic Acquisition › Award" | An app switcher in both sidebars. Later phases (Requirements, Solicitation) slot in the same way. |

**Why separate:**
- **Deployment risk.** The SourceSelection2 upgrades have failed twice (the Apps-service rollbacks). A new solution
  never touches it, and the parked demo runs (0031, 0052, 014, 009) stay as they are.
- **Different users and timescale.** The Award phase is the CO and agency counsel working over weeks (GAO has 100 days
  to decide a protest). The Source Selection run ends at "Award published".
- **One kit per phase.** The four-phase play gets one demo per phase, each able to stand alone, with no hop between
  systems.

**Changes to Source Selection (web app only, no solution upgrade):**
- An app switcher in the sidebar, and **Open in Award** on awarded evaluations.
- `deleteEvaluation.ts` also cancels Award runs and deletes the new entities' rows, so Delete evaluation still removes
  everything for a number.
- Nothing else. The Audit and Decisions tabs already read every SSAuditEvent row and every SSDecision kind.

**Later (needs a SourceSelection2 upgrade, deferred):** have Publish Award Record start the Award process
automatically. In v1 the CO starts it with **Begin award** in the Award app.

**Lesson carried over from the task-forms rotation:** `award-task-forms` gets one registration from day one, deployed
only into the Award folder, and that's the registration the BPMN app binding points to.

## 3. Data model

New tenant-level entities, with the SS prefix so they sit with the rest of the system's tables:

**SSAward** (one row per solicitation): the Award phase's state, kept apart from `SSSolicitation.Status` so
Source Selection's logic (where `Awarded` means closed) doesn't change.

| Field | Type | Notes |
|---|---|---|
| AwardId | STRING, unique | `<sol>-award` |
| SolicitationId | STRING | |
| Stage | STRING | Contract award · Notices · Debriefings · Protest window · Protest · Closed |
| CaseInstanceId | STRING | The AwardProcess run |
| ContractNumber, ContractValue | STRING, NUMBER | From the award document |
| AwardedAt, NoticesSentAt | DATETIME | Start the clocks |
| ClocksJson | MULTILINE_TEXT | Computed deadlines (see §6), so both apps show the same dates |
| PerformanceStatus | STRING | Proceeding · Suspended (CICA stay) · Proceeding after protest |

**SSCorrespondence** (one row per document exchanged with an offeror):

| Field | Type | Notes |
|---|---|---|
| CorrespondenceId | STRING, unique | `<sol>-<code>-<kind>-<n>` |
| SolicitationId, OfferorId | STRING | |
| Kind | STRING | AwardNotice · UnsuccessfulNotice · DebriefRequest · Debriefing · FollowUpQuestion · FollowUpAnswer |
| Status | STRING | Draft · Approved · Delivered (Received for incoming) |
| Text, AgentText | MULTILINE_TEXT | Final text and the agent's draft, kept as SSFinding keeps them |
| DisclosureCheckJson | MULTILINE_TEXT | Result of the deterministic leak check (§5) |
| ReceivedAt, DeliveredAt, DueAt | DATETIME | |
| FilePath | STRING | PDF in SS-Records |
| Author | STRING | Agent or person |

**SSProtest** (one row per protest):

| Field | Type | Notes |
|---|---|---|
| ProtestId | STRING, unique | `<sol>-P<n>` |
| SolicitationId, OfferorId | STRING | Protester |
| Forum, DocketNumber | STRING | GAO (v1) and a fictional B-number |
| FiledAt, NoticeReceivedAt | DATETIME | |
| StayRequired | BOOLEAN | Computed (§6) |
| GroundsJson | MULTILINE_TEXT | Grounds, each mapped to the record (§5) |
| Position | STRING | Defend · Corrective action |
| ReportDueAt, ReportFiledAt, DecisionDueAt | DATETIME | |
| Outcome | STRING | Denied · Sustained · Dismissed · Withdrawn · Corrective action |

**Reused:** SSDecision gets new kinds (`Contract`, `ProtestPosition`, `ProtestOutcome`), and SSAuditEvent gets new
actions (`AwardExecuted`, `NoticeDelivered`, `DebriefingDelivered`, `ProtestRecorded`, `AgencyReportFiled`, …).

## 4. Process: `AwardProcess` (BPMN)

The process inputs are `solicitationId`, `contractingOfficer`, `agencyCounsel` and `sourceSelectionAuthority`, all
emails, the same pattern as today.

```
Start ─► [R] PrepareAwardDocument ─► [H] Execute contract award (CO) ─► [R] IssueNotices
      ─► [H] Record debriefing requests (CO) ─► ◇ any requests?
            no ─────────────────────────────────────────────────────────────┐
            yes ─► [R] DraftDebriefings (fans out to the debrief writer) ─► [H] Deliver debriefings (CO)
                 ─► [R] PublishDebriefings ─► ◇ DoD enhanced debriefing?
                       yes ─► [H] Record follow-up questions (CO) ─► ◇ any questions?
                                 yes ─► [R] DraftFollowUpAnswers ─► [H] Answer follow-up questions (CO)
                                      ─► [R] PublishFollowUpAnswers ─┐
                                 no ────────────────────────────────┤
                       no ──────────────────────────────────────────┤
      ┌─────────────────────────────────────────────────────────────┘
      ▼
   [H] Protest window (CO: "Protest filed" or "Close protest window") ─► ◇
        close ─► [R] CloseAward ─► End "Award final"
        protest ─► [R] IntakeProtest ─► [R] AnalyzeProtest (fans out per ground)
               ─► [H] Agency position (Agency Counsel) ─► ◇
                     corrective action ─► [R] RecordCorrectiveAction ─► End "Corrective action"
                     defend ─► [R] AssembleAgencyReport ─► [H] Record GAO decision (CO) ─► [R] CloseAward ─► End
```

[R] = robot step (`AW_Robots`, one `run` entry point dispatching on `step`, as in SS_Robots). [H] = Action Center task.

- **No timer ever blocks the flow.** The demo can't wait 3 days, so deadlines are computed and shown, and the CO's task
  moves things on. Non-interrupting timer flags (like the existing SLA flags) are optional: debriefing overdue, agency
  report due in 5 days.
- **"DoD enhanced debriefing?"** reads the plan. DoD agencies use the DFARS rule (215.301-270 under the RFO
  deviation); the gateway takes a plan flag set from the agency (Air Force and Army evaluations are DoD).
- **Corrective action** records the decision and stops. A re-evaluation would start a new Source Selection run
  (out of scope).

## 5. Agents and robots

### Agents (low-code, in the Award solution)

The 10,000-character input cap still applies, so every agent works on one offeror or one protest ground, fanned out
by a robot the way GenerateDraftFindings works.

| Agent | One run covers | Input | Output |
|---|---|---|---|
| **AW_DebriefWriter** | one unsuccessful offeror | **Only** that offeror's consensus ratings, its significant weaknesses and deficiencies (evaluator-accepted, with rationale), its price; the awardee's overall ratings and total evaluated price; the ranking, if the plan ranks; the award rationale summary from the SSDD | A written debriefing in the required sections, a one-line general reason for the notice, and the questions the offeror is likely to ask |
| **AW_FollowUpAnalyst** (DoD only) | one offeror's follow-up questions | The questions, plus the same scoped record as the debriefing | For each question: answer from the record, or decline with the rule (e.g. "asks for a point-by-point comparison with the awardee's proposal") |
| **AW_ProtestGrounds** | one protest | Protest text (robot-extracted, chunked if long) | The grounds, each tagged with type (unreasonable evaluation, unequal treatment, unstated criteria, flawed tradeoff, price/realism, …) and the factor and offeror it concerns |
| **AW_ProtestResponse** | one ground | That ground, plus the record slices it concerns (findings with page cites, individual and consensus rationale, SSDD paragraphs, price memo, debriefing text) | The record evidence with citations, a risk read (strong · some exposure · gap), and a draft paragraph for the CO's statement of facts |

**Disclosure guardrail, built into the data:** the debrief writer **never receives** another offeror's findings,
proposal pages, line-item prices or evaluator names. On top of that, a deterministic **disclosure check** runs in the
robot on every draft and blocks delivery on a hit. It looks for:
- another offeror's name (other than the awardee's overall result)
- dollar amounts other than the two allowed totals
- evaluator names, or past performance reference names
- comparative phrasing about the awardee's proposal content

The CO's form shows the check as green rows. This is the main demo moment of the debriefing step: the agent can't
leak what it never received.

**Citations are validated** the way BR-05 validates finding citations: a ProtestResponse cite that doesn't resolve to
a record row or page is dropped and logged.

### Robots (`AW_Robots`, Python function)

`AW_Robots` is a new function project. It copies `repo.py` and `records.py` from SS_Robots, and a test fails if they
drift apart. Every step is idempotent per solicitation and audited (the BR-06 pattern).

| Step | Does |
|---|---|
| PrepareAwardDocument | Contract award summary (awardee, CLINs and prices from the price schedule, period, value) → SS-Records `<sol>/award/` |
| IssueNotices | Award notice to the awardee and a notice to each unsuccessful offeror with the required contents (number solicited and received, awardee name and address, items and prices or total, the general reason) → PDFs, SSCorrespondence rows, clocks |
| DraftDebriefings | Scoped package per requesting offeror → AW_DebriefWriter runs in parallel, retried once → disclosure check → drafts |
| PublishDebriefings | Approved debriefings → PDFs; records the debriefing date offered (it drives the stay clock) |
| DraftFollowUpAnswers / PublishFollowUpAnswers | The same pattern for DoD follow-up questions; the debriefing concludes on the later of delivery or the answers |
| IntakeProtest | Reads the uploaded protest PDF, computes whether the stay applies, sets PerformanceStatus, starts the report and decision clocks |
| AnalyzeProtest | AW_ProtestGrounds, then one AW_ProtestResponse run per ground |
| AssembleAgencyReport | The agency report package in SS-Records `<sol>/protest/<id>/` (§7) |
| RecordCorrectiveAction, CloseAward | Final decision rows, stage, audit |

## 6. Rules and clocks

Federal agencies on the RFO class deviations (DoD since February–March 2026) cite the new section numbers; the
codified FAR (FAC 2026-01) still has the old ones. The app keeps every citation in **one table** so both can be shown, and so the
existing app's cites (FAR 15.308, 15.404-1) can move over later.

**Checked against primary text on 2026-10-21:**
- the RFO Part 15 and Part 33 deviation guides on acquisition.gov
- the DoD class deviations for Part 15 (2026-O0048, effective 16 Mar 2026) and Part 33 (2026-O0026, effective 1 Feb 2026)
- eCFR (FAR, 4 CFR 21) and uscode.house.gov

| Rule | RFO (deviation in use) | Codified FAR / other |
|---|---|---|
| Notice to unsuccessful offerors within 3 days after award, with required contents: number solicited and received, awardee name and address, items and unit prices (total price only if unit prices are impracticable), general reason; no cost breakdown, profit or overhead | FAR 15.207-2(b)(1)–(5) | FAR 15.503(b)(1) |
| Preaward notice of exclusion; preaward debriefing requested within 3 days. No timely request means no pre- or postaward debriefing | FAR 15.206-1(a), 15.206-2(a)(1), (a)(3) | FAR 15.503(a), 15.505(a)(1) |
| Postaward debriefing requested within 3 days of the notice; held within 5 days of the request "to the maximum extent practicable" | FAR 15.301-1(a)(1)–(2) | FAR 15.506(a) |
| Required contents: significant weaknesses and deficiencies; overall evaluated price and technical rating of the awardee and the offeror; the offeror's past performance information; ranking (if developed); award rationale; make and model of a commercial product; answers to relevant questions | FAR 15.301-1(c)(1)(i)–(vi) | FAR 15.506(d) |
| Redacted source selection decision document in the debriefing above a contract value (FAR: $10M / $100M; DoD: $15M / $150M) | FAR 15.301-1(c)(1)(vii)–(viii); DFARS 215.301-170 | DFARS 215.506-70 (codified) |
| Prohibited: point-by-point comparisons; trade secrets, confidential commercial and financial information (cost breakdowns, profit, indirect rates); names of past performance references | FAR 15.301-1(d)(1)–(4) | FAR 15.506(e) |
| DoD: written follow-up questions within 2 business days; answers within 5 business days; the debriefing concludes on the later of the two | DFARS 215.301-270(a)–(c); provision 252.215-7996 | DFARS 215.506-70 |
| Source selection decision | FAR 15.205 | FAR 15.308 |
| Stay of performance if GAO's notice arrives by the later of 10 days after award, or 5 days after the debriefing date offered (required debriefing). **DoD:** the 5 days run from delivery of the written answers to follow-up questions | FAR 33.105-3(b)(1); DFARS 233.105-370 | 31 U.S.C. 3553(d)(4)(A)–(B); FAR 33.104(c)(1) |
| Protests to GAO generally (RFO 33.104 is now protests to the agency) | FAR 33.105, 33.105-1 | FAR 33.104 |
| Agency report within 30 days of GAO's notice; documents responsive to a protester's request at least 5 days before it (moves to the prior business day) | FAR 33.105-4(a) (compile only) | 4 CFR 21.3(c) |
| Report contents: CO statement of facts (with a best estimate of contract value), memorandum of law, and the relevant documents | | 4 CFR 21.3(d) (the RFO dropped the FAR's own list) |
| Protest after a required debriefing: not before the debriefing date offered, and within 10 days after it is held | | 4 CFR 21.2(a)(2) |
| GAO decision within 100 days of filing | | 31 U.S.C. 3554(a)(1); 4 CFR 21.9(a) |
| Days are calendar days; a period ending on a weekend or holiday runs to the next business day | FAR 33.102(a) | 4 CFR 21.0(d) |

**Known wrinkles:**
- The Batch 2 proposed rule (FAR Case 2026-003, 18 Sep 2026) collapses debriefings into one section, 15.301, with
  request (c), contents (e) and nondisclosure (f). The table follows the deviation, which is what agencies use today.
- Inside the DoD deviation, the provision cites 215.301-170 while DFARS 233.105-370(d) cites "215.301-2". Cite the
  section text, not the cross-references.
- I couldn't reach acq.osd.mil, so the DoD memos were read from acquisition.gov copies. Check for a later revision
  before a DoD customer demo.

The clock engine is pure functions in the shared TS lib, mirrored in `AW_Robots` and tested on both sides, like
`score.ts` and `rules.sled_scores`.

## 7. The protest file

`AssembleAgencyReport` builds a tabbed package:

1. Index (tab numbers, document titles, dates)
2. CO statement of facts, drafted from the AW_ProtestResponse paragraphs and edited by counsel in their task
3. The protest
4. The protester's proposal and the awardee's proposal (from SS-Proposals)
5. The solicitation and evaluation plan (Section M as used)
6. Evaluation documents: individual evaluator worksheets, the SSEB consensus report, the price reasonableness
   determination, and the SSDD (already in SS-Records)
7. Abstract of offers
8. Notices and debriefing (from SSCorrespondence)
9. **How AI was used in this evaluation**, an appendix built from the data that already exists:
   - per factor, how many findings the agent drafted and how many each evaluator accepted, edited (with before and
     after, from `AgentText` and `FindingText`), rejected or added
   - that consensus ratings were set by the Chair and the decision was signed by the SSA
   - the audit trail of every agent and robot step

Item 9 is the TRAX point made concrete. The appendix is a strength because the data already separates agent drafts
from human decisions. A protected and redacted pair (GAO protective order) is a later addition.

## 8. Task forms (`award-task-forms`)

| actionType | Persona | Form |
|---|---|---|
| executeAward | Contracting Officer | Award summary (awardee, CLINs, value), sign |
| recordDebriefRequests | Contracting Officer | One row per unsuccessful offeror: requested? when received? Shows the 3-day deadline per offeror |
| deliverDebriefings | Contracting Officer | One tab per offeror: draft (editable), disclosure check rows, required-contents checklist, approve and deliver |
| followUpQuestions | Contracting Officer | Paste or record questions (within 2 business days); then per question: drafted answer or decline-with-rule; approve |
| protestWindow | Contracting Officer | Protest filed (upload PDF, docket, dates) or close the window; shows the stay result live |
| agencyPosition | **Agency Counsel** (new persona) | Ground-by-ground map with evidence, risk and draft paragraph; edit the statement of facts; Defend or Corrective action |
| recordDecision | Contracting Officer | GAO outcome; lift the stay |

**Personas:** Dana Whitfield (CO) does most of the work. James Thornton (SSA) is read-only here. A new fictional
**Agency Counsel** gets an Unsplash headshot and appears only in the Award app's persona switcher.

## 9. Web app (`award-workspace`)

- **Home:** awarded evaluations, each with an Award-phase tracker (Contract award · Notices · Debriefings ·
  Protest window · Closed) and the next statutory deadline ("Debriefing request due Oct 24", "Agency report due
  Nov 20"). In progress and Completed filters. My tasks. Live activity.
- **Award page:** tabs
  - **Overview:** a timeline with every clock
  - **Correspondence:** per offeror, notice → request → debriefing → questions and answers
  - **Protest:** grounds map, report index with links to the filed PDFs
  - **Record:** links back to the Source Selection evaluation record
  - **Audit:** the whole lifecycle
- **Begin award** on an awarded evaluation that hasn't started its Award phase.
- Same shell, sign-in, persona switcher, theme and rules as ss-workspace (no Studio names in the UI, named people,
  ⓘ for long explanations).

## 10. State & Local (second slice)

The district sequence is different: **Notice of Intent to Award → protest window (5–15 days, set in the plan) →
Board approval → contract**. Debriefings happen only on request and are lighter. Same entities and robots, with
terms.ts words and a different gateway order chosen by `plan.framework`. Recommended after the federal flow works,
using WUSD-RFP-27-009 once its recommendation is signed.

## 11. Demo script (federal, about 10 minutes)

The demo record is **Army W52P1J-27-R-0023**, already awarded to Keystone Ridge Analytics with its record in
SS-Records. It's DoD, so it gets the enhanced debriefing.

1. **In Source Selection,** the Army evaluation shows "Awarded to Keystone Ridge". Click **Open in Award**: same
   sign-in, same persona.
2. **Contract award (Dana):** the robot drafted the award summary from Keystone's price schedule. Dana signs. The
   clocks start.
3. **Notices:** notices to Ironwood and Bluestem, each with the required contents and a one-line reason. Delivered and
   filed.
4. **Request:** Ironwood's debriefing request arrives and Dana records it. The tracker shows the 5-day target.
5. **Debriefing:** the agent drafted Ironwood's written debriefing from Ironwood's own record. Open the disclosure
   check: it received only Ironwood's findings and Keystone's overall ratings and price. Dana edits one line and
   delivers.
6. **Follow-up questions:** Ironwood sends four. The agent answers three from the record and declines one (it asks
   about Keystone's technical approach) with the rule. Dana approves. The debriefing concludes, and because this is
   DoD the stay clock starts from the delivered answers: "protest within 5 days to stay performance".
7. **Protest:** Ironwood files at GAO. Dana uploads it. The stay applies and performance shows **Suspended**.
8. **Grounds (Agency Counsel):** three grounds, each mapped to the record with page cites. Two are well supported. One
   shows **some exposure**: the SSDD's tradeoff is thin on Ironwood's lower price. Counsel chooses Defend and
   tightens that paragraph in the statement of facts.
9. **Agency report:** assembled in about a minute: the index, every document, and the "How AI was used" appendix.
   Talk track: the agency has 30 days to file this report. Collecting the documents now takes a minute, so counsel's
   time goes to the argument, and every agent draft is shown beside the person who decided.
10. **Close:** record "Denied". Performance proceeds. Back in Source Selection, the Audit tab shows the whole story.

## 12. Demo data to generate

`tools/generate_award_sample.py` will write synthetic PDFs with the synthetic-demo banner:
- Ironwood's debriefing request letter
- four DoD follow-up questions, one of them out of bounds on purpose
- a GAO protest filing from Ironwood with three grounds, written against the actual 0023 record so the analysis lands
  as in steps 8–9

The docket number and all parties are fictional. Keystone and Bluestem don't protest.

## 13. Build plan

Sizes are relative to stages already built.

| Slice | Delivers | Size |
|---|---|---|
| 0. Foundation | Folders, aliases, `award-workspace` shell with sign-in on `/award`, the 3 DF entities, `Award` solution skeleton and folder, app switcher plus Open in Award in ss-workspace, delete-evaluation coverage | about Proposal Intake |
| 1. Contract award and notices | PrepareAwardDocument, IssueNotices, executeAward form, clock engine plus tests, Overview and Correspondence tabs | small |
| 2. Debriefings | AW_DebriefWriter plus evals, DraftDebriefings fan-out, disclosure check plus leak tests, deliverDebriefings form, DoD follow-up loop (AW_FollowUpAnalyst) | about Individual Evaluation |
| 3. Protest | IntakeProtest, the two protest agents plus evals, agencyPosition form, AssembleAgencyReport plus the AI appendix, recordDecision | the largest; about Consensus plus Award Decision |
| 4. Demo ready | Sample generator, an end-to-end run on 0023, demo script rehearsal, play page Award card to "Demo ready" | small |
| 5. Later | State & Local flow, auto-start from Publish Award Record (SourceSelection2 upgrade), redacted protective-order version, an offeror-side view, a combined "My tasks" across both apps | |

**Tests:**
- pytest for AW_Robots: clocks, notice contents, and above all the disclosure check: golden debriefings that must
  fail it, and agent drafts from the eval set that must pass it.
- Agent eval sets: the debrief writer never leaks; out-of-bounds follow-up questions are declined; protest citations
  resolve.
- `uip maestro bpmn validate`.
- One full run on 0023.

## 14. Decisions and dependencies

- **Federal first, State & Local second** (recommended).
- **Sign-in on a new route.** The shared OAuth app (UiPathLabs-ExternalApp-SDKforUsers-04) may need
  `https://uipathlabs.uipath.host/award` added as a redirect URI. Who administers that app is unknown. Arriving from
  Source Selection should reuse the shared token (same origin), but a fresh sign-in on `/award` needs the redirect.
  Confirm in slice 0.
- **Agency Counsel persona name.** Fictional; pick one.
- **Demo record.** Army 0023 (recommended: already awarded, and DoD). HHS 0052 would be the civilian variant once its
  SSA task is signed, but it's parked on purpose.
- **The classifier still blocks** solution publish and deploy and codedapp publish for me. The same handoff applies:
  I give the exact commands and you run them.

Sources for §6:
- [RFO Part 15 guide](https://www.acquisition.gov/far-overhaul/far-part-deviation-guide/far-overhaul-part-15)
- [RFO Part 33 guide](https://www.acquisition.gov/far-overhaul/far-part-deviation-guide/far-overhaul-part-33)
- [DoD RFO deviation, Part 15](https://www.acquisition.gov/sites/default/files/page_file_uploads/DoD_RFO_Deviation_Part-15.pdf)
- [DoD RFO deviation, Part 33](https://www.acquisition.gov/sites/default/files/page_file_uploads/DoD_RFO_Deviation_Part-33.pdf)
- [eCFR FAR 15.503](https://www.ecfr.gov/current/title-48/section-15.503)
- [eCFR 4 CFR Part 21](https://www.ecfr.gov/current/title-4/chapter-I/subchapter-B/part-21)
- [31 U.S.C. 3553](https://uscode.house.gov/us/usc/119-121/t31/s3553/)
- [RFO Batch 2 proposed rule](https://www.federalregister.gov/documents/2026/09/18/2026-19162/federal-acquisition-regulation-revolutionary-far-overhaul-parts-8-12-13-15-38-44-and-51)

## 15. Slice 0 status (2026-10-21)

**Built**
- Data Fabric: SSAward, SSCorrespondence and SSProtest, created in the tenant. Schemas are in `tools/schema/`, IDs in
  `entity-ids.json`.
- `award-workspace` (dev port 5175):
  - the sign-in screen, the Awards list (In progress and Completed, plus evaluations still at the award decision),
    the Award page (tracker, offerors, key dates, correspondence, protest and audit tabs) and My tasks
  - **Begin award** (CO), which stays disabled until the Award process is deployed
  - `?preview` renders on `src/dev/snapshot.json` (`tools/export_snapshot.py --only …`)
- `award-task-forms` (dev port 5176): runs on the host moved out of `ss-task-forms/src/App.tsx` into
  `ss-task-forms/src/host.tsx`. It has no forms yet.
- `Award/` solution: `AwardProcess` runs Start → Open Award Phase (`AW_Robots` StartAward) → End. It validates and
  packs as `Award_1.0.0.zip`.
- `AW_Robots`: 8 pytest tests, including a check that `repo.py` and `records.py` still match SS_Robots and that stage
  names match the app.
- Source Selection:
  - the app switcher (`ss-workspace/src/components/AppSwitcher.tsx`, `lib/apps.ts`)
  - **Open in Award** on awarded evaluations
  - Delete evaluation also removes the three new entities' rows and cancels Award runs
  - `PersonaId` gains `counsel`

**Deployed (2026-10-21)**
- The Award solution 1.0.0 is in `AMER Presales/Public Sector/Source Selection/Award`, and both web app constants
  point at it.
- `award-workspace` 1.0.0 is at https://uipathlabs.uipath.host/award, and `ss-workspace` is at 1.0.70.
- **Verified live:**
  - The robot runs and refuses a non-awarded evaluation.
  - The Award app reuses the Source Selection sign-in.
  - Open in Award and the app switcher link correctly.
  - Begin award is enabled on Army 0023 and hasn't been clicked.
- **Open:** a fresh sign-in on `/award` from a browser with no UiPath session (§14).
