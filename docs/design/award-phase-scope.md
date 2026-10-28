# Scope: Award phase (contract award, notices, debriefings, protest file)

**Status:**
- Slice 0 (foundation) is deployed and committed (4202358). See §15.
- Slice 1 (contract award and notices) is deployed and committed (e80a2ad). See §16.
- §17 adds the administration phase: managing the contract after award. Slice A is deployed (2026-10-23; §18), and §19 is
  the clarity redesign (2026-10-27). Both are committed (e80a2ad).
- §20, the deliverable review, is deployed and committed (97442c3). §21, slice B (option exercise and the extension of
  services), is deployed as Award 1.4.0 and Contract Management web 1.0.11 (§21.4). Not committed yet.

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
5. **Close.** The protest is decided or the window closes, and the contract goes to contract administration (§17).

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

## 16. Slice 1 status (2026-10-22): contract award and notices

**Deployed 2026-10-22: Award 1.1.0 (with the AwardTaskForms action app) and Contract Award web 1.0.3. Committed as e80a2ad.**

- **Process:** Start → Open Award Phase → Prepare Award Document → Execute Contract Award (CO, Action Center) →
  Issue Notices → End "Notices issued".
- **AW_Robots:**
  - **PrepareAwardDocument** drafts the contract award as SSDecision Kind `Contract`, Outcome `Draft` (the PIID swaps
    R → C, or D for an IDIQ). It also drafts one SSCorrespondence notice per offeror with the FAR 15.207-2(b) contents,
    and never redrafts anything already signed or approved.
  - **IssueNotices** files `Contract-Award.pdf` and each notice to SS-Records `<sol>/award/` (banner: synthetic demo,
    not source selection information). It marks the notices delivered, sets each offeror's debriefing-request deadline,
    and writes `SSAward.ClocksJson` (Stage → Debriefings).
  - Letter wording lives in `letters.py` (pure functions).
- **Clock engine:**
  - `award-task-forms/src/lib/clocks.ts` and `Award/AW_Robots/clocks.py`, both run against `clock-cases.json`
    (`npm test`, pytest).
  - Calendar days that roll forward over weekends and federal holidays, including observed days, plus business days
    for DoD follow-up questions. Dates are Eastern.
- **executeAward form** (award-task-forms):
  - shows the contract award summary and CLIN table
  - one card per notice, with a live required-contents checklist (including "No other offeror named"); an edited
    notice must be approved again
  - a preview of the clocks
  - signing fills the date and `/s/ name` in every document and moves the stage to Notices
- **Web app:**
  - the Overview's Clocks timeline: met, running with days left, closed, or waiting
  - the Correspondence tab: status, deadlines, read inline, open the filed PDF through a short-lived link
  - Begin award stays off for State & Local awards
- **Action app as a solution project:** `Award/AwardTaskForms` (AppV2, CodedAction) is built by
  `npm run build:solution` in award-task-forms. `tools/sync_award_app.py` patches the action schema and client ID
  into its resource. The BPMN binds it as `solution_folder.AwardTaskForms`, and `bindings_v2.json` carries the app
  entry, which `bpmn refresh` doesn't write but keeps. It is never published on its own, so there's one registration.
- **Preview:** `tools/award_preview.py` runs the real robot steps on the preview snapshot. The committed snapshot sits
  at "Contract award" with drafts.

**To verify after deploy:** the first real run, Begin award on Army 0023, is the first test of the in-solution app
binding.

## 17. Administration phase: managing the contract after award (designed 2026-10-23)

**Status:** this is the design and the slice A plan. Nothing is built yet.

### 17.1 What this adds

Today the module stops when the award closes (§1, step 5). In practice, that is where most of the CO's and COR's work
on a contract starts. On the Army contract it means five years of work:
- option decisions
- labor-hour ceilings
- funding
- invoices
- deliverables
- performance evaluations
- then closeout and a recompete

The administration phase follows the contract through all of it, in three ways:

1. **It reads the contract into a schedule.** Every dated obligation comes from the contract's own terms: periods,
   option notice deadlines, deliverables, evaluations, closeout. So does every money limit: line-item prices,
   labor-hour ceilings, obligated funds. Nobody types dates in.
2. **It watches the contract daily.** A scheduled robot works out what's coming due and how fast money is being spent.
   It raises alerts and names the rule behind each one, for example: "Funds on line item 0002 run out Dec 9, 22 days
   before the period ends."
3. **It starts the work** (slices B to E). Each alert opens a short process: robots gather the facts, an agent drafts
   the paperwork, and a named person decides.

**Terms.** To a CO, Source Selection is pre-award, §1–16 cover the award, and this phase is contract administration
(RFO Part 42). The lifecycle becomes a loop: Source Selection → Award → Administration → a recompete that starts the
next Source Selection.

**How it fits next to what agencies already run.**
- Contract writing systems, such as the Army's ACWS, issue the modifications.
- PIEE holds invoices (WAWF), contract documents (EDA) and CPARS. It also has a closeout module that already flags
  physically complete contracts.
- This phase doesn't replace any of them. It reads from them, watches across them, and drafts what goes into them.
- In the demo, Data Fabric rows and SS-Records files stand in for those systems.

### 17.2 Name

- **The problem:** "Award Management" means SAM.gov (the System for Award Management) to federal buyers. To grants staff
  it means post-award grants management.
- **Proposed:** rename the app **Contract Management**. That's DCMA's word for post-award work. The app gets two
  sections: Award (built) and Administration (new).
- The route stays `/award`, so existing links keep working, and the teal accent stays.
- **Fallback:** keep "Contract Award" and add an Administration section.
- **Decided (2026-10-23):** Contract Management.

### 17.3 Shape: same app, same record, same solution

- **The award record becomes the contract record.** SSAward stays at one row per contract and gains the administration
  fields (§17.6). The award stages don't change. A new `Phase` field says where the contract is: Award ·
  Administration · Closeout · Closed.
- **Administration starts when the contract is signed, not when the award phase ends.** Performance and the
  transition-in begin at signature, while debriefings and any protest run alongside. A GAO stay sets PerformanceStatus
  to Suspended, and the watch takes that into account.
- **Contracts from outside Source Selection.** Most of an agency's contracts never went through this demo.
  - They come in through an import step (slice E), where IXP and an agent read the signed contract.
  - Until then, the demo's one outside contract, the incumbent's (§17.11), is seeded.
  - These rows have `Origin` set to Imported and carry their own title, agency and awardee, because there's no
    SSSolicitation row behind them.
- **BPMN throughout** (§17.7), all in the Award solution. Source Selection's solution doesn't change.

### 17.4 Rules (checked against primary text on 2026-10-23)

These were checked against:
- the RFO Part 4, 17, 32 and 42 pages on acquisition.gov
- the FAR clauses 52.217-8, 52.217-9, 52.232-7 and 52.232-22
- DFARS 217.207 (Change 5/7/2026)

| Rule | RFO (deviation in use) | Codified FAR / other |
|---|---|---|
| **Exercising an option.** The CO gives written notice within the period the contract sets. Before exercising, the CO confirms that: funds are available; the option fulfills an existing requirement; the contractor has no active SAM exclusion; performance is acceptable; the price is fair and reasonable; and exercise is "in the Government's best interest" | 17.204-1(b) | FAR 17.207(a), (c) |
| **Option to extend the term.** A preliminary written notice at least 60 days (unless the contract sets another number) before the contract expires. It doesn't commit the Government. The total duration is capped in (c) | 52.217-9(a), (c); prescribed at 17.203(g) | 52.217-9 |
| **Option to extend services.** Up to 6 months in total, possibly in several steps, by written notice within the period the contract sets | 52.217-8; prescribed at 17.203(f) | 52.217-8 |
| **DoD checks before exercising an option.** The SAM record is active, and the contract's UEI, CAGE code, name and address match it. The SPRS NIST SP 800-171 score is current (3 years or less). The CMMC status is current, if the contract requires one | | DFARS 217.207(c)(1)–(2) |
| **Labor-hour ceiling.** The contractor must notify the CO when payments so far, plus the next 30 days, will pass 85% of the ceiling, and give a revised estimate. The Government isn't obligated to pay above the ceiling | 52.232-7(d)–(e); prescribed at 32.111(a)(7) | 52.232-7 |
| **Limitation of funds (incrementally funded cost-type contracts).** The contractor must notify at 75% of the allotted funds, counting the next 60 days. Contracts may set 30–90 days and 75–85% | 52.232-22; 32.706-2(a)–(b); 32.704 | 52.232-22 |
| **Fiscal-year contracts conditioned on available funds** | 32.703-2(a); 52.232-18 | |
| **Paying invoices.** Payment is due on the 30th day after the later of two dates: receipt of a proper invoice, or acceptance of the work. A defective invoice must go back within 7 days, with the reasons | 32.904(b)(1); 32.905(b)(3) | 5 CFR 1315 |
| **Performance evaluations.** Required above the simplified acquisition threshold, at least once a year and when the work is completed. The contractor gets up to 14 days to comment. Disagreements are reviewed above the CO. Evaluations are in CPARS for source selection within 14 days | 42.1102(a)–(b); 42.1103(d)(2)–(3), (e)(2) | FAR 42.1502, 42.1503(d), (f) |
| **Post-award orientation conference** (a contract administration function, which the CO may keep) | 42.302(a)(3) | |
| **Closeout.** Firm-fixed-price contracts: within 6 months of evidence of physical completion. Contracts needing indirect-rate settlement: 36 months. All other contracts: 20 months | 4.308-2(b), Table 4-2 | FAR 4.804-1(a) |

**Wording that matters for the drafts.** The RFO dropped "most advantageous method" from the option determination. The
CO now finds the price fair and reasonable and the exercise in the Government's best interest (17.204-1(b)(3)(v)). The
option memo template in slice B follows the RFO wording.

**Still open:**
- whether the DFARS RFO deviation renumbers 217.207
- whether a CMMC class deviation changes (c)(2)(ii)
- acq.osd.mil was unreachable again, so check both before a DoD customer demo
- 5 CFR 1315 was read only in an older version

### 17.5 Alerts

Every alert names its rule, its deadline, its owner, and the numbers behind it. Lead times are settings, not rules; the
defaults are below.

Contract deadlines that fall on a weekend or holiday roll **back** to the prior business day, so an alert never lands
after the real deadline. The protest deadlines in §6 roll forward. That difference is deliberate: there, the rule gives
the extra day; here, the CO must act before the date.

| Alert | When it fires | Owner | Rule |
|---|---|---|---|
| Option period coming up | 120 days before the period starts ("start the option package"). Due soon 14 days before the preliminary notice day. Overdue after the exercise deadline | CO | 52.217-9(a); 17.204-1(b) |
| Extension of services decision | The final period ends within 120 days and no options remain. The alert names the follow-on contract and its protest status | CO | 52.217-8 |
| Labor-hour ceiling | Forecast to pass 85% within 30 days. Overdue if it has passed 85% and there's no contractor notice on file | CO | 52.232-7(d) |
| Funds run out | The forecast run-out day falls before the period ends | Resource Manager, CO | Obligated funds against the spending rate; 52.232-22 for cost-type contracts |
| Invoice due | A received invoice isn't approved yet: decide proper or defective within 7 days, then pay by the 30th day | COR | 32.904(b)(1); 32.905(b)(3) |
| Deliverable due or late | 7 days before each due day; late after it; not accepted 10 days after receipt | COR | The contract's delivery schedule |
| Performance evaluation | 30 days before each anniversary of the start, and at completion | COR (drafts), CO (signs) | 42.1102(a) |
| Contractor registration | The SAM registration expires before the next option or extension would be exercised | CO | DFARS 217.207(c)(1); 17.204-1(b)(3)(iii) |
| Closeout | Physical completion is recorded: 6 months for a firm-fixed-price contract | CO | 4.308-2(b) |
| Recompete | 18 months before the last period ends, if no follow-on is linked | CO | Lead time (a setting) |

**Severity is always a word, never only a color:**
- **Upcoming:** inside the lead time
- **Due soon:** 14 days or less
- **Overdue:** past the deadline

**What happens to an alert:**
- When its condition clears, the next watch run marks it **Resolved**.
- A person can **Acknowledge** it, or **Dismiss** it with a reason. Both go to the audit trail.
- A dismissed alert comes back only if it gets more severe.

Slice A builds every alert except closeout and recompete, which come in slice D.

### 17.6 Data model

Dates (days) are stored as ISO day strings (`YYYY-MM-DD`, agency time), as in ClocksJson, so a date never shifts with
the viewer's time zone. MULTILINE fields get `lengthLimit` 10000 from the start (the 200-character default faulted
slice 1).

**SSAward, added fields**

| Field | Type | Notes |
|---|---|---|
| Phase | STRING | Award · Administration · Closeout · Closed |
| Origin | STRING | Source Selection · Imported |
| Framework | STRING | Imported contracts only (contracts from Source Selection read it from the plan) |
| Title, Agency, Office, AwardeeName, ContractType | STRING | Filled for every contract when administration opens, so every contract reads the same way |
| PeriodStart, PeriodEnd, CurrentPeriod | STRING | Days; CurrentPeriod is Base, Option 1, … |
| CeilingValue, ObligatedValue, InvoicedValue | DECIMAL | Totals across all periods |
| FundsJson | MULTILINE_TEXT | Written by the watch, per line item and period: price or ceiling, obligated, invoiced, spending per day, and the run-out, 85% and 100% days |
| AbstractJson | MULTILINE_TEXT | The contract as read: line items, periods, clauses with their fill-ins, deliverables, each with its source |
| CorName, CorEmail | STRING | |
| PredecessorId, SuccessorId | STRING | AwardIds, linking an incumbent contract and its follow-on |
| WatchedAt | DATETIME_WITH_TZ | The last watch run |

**SSSchedule** (one row per dated obligation)

| Field | Type | Notes |
|---|---|---|
| ScheduleId | STRING, unique | `<sol>-<kind>-<n>` |
| SolicitationId | STRING | |
| Kind | STRING | Period · Option · Extension · Deliverable · Evaluation · Closeout |
| Name, Period, Clin | STRING | For example "Monthly status report", "Option 4", "0002" |
| StartDay, EndDay, DueDay, NoticeDay | STRING | Days. NoticeDay is the preliminary notice or exercise deadline |
| Amount | DECIMAL | The option's price |
| Status | STRING | Planned · Exercised · Not exercised · Due · Received · Accepted · Late · Done |
| ClauseRef, ClauseText | STRING, MULTILINE_TEXT | The clause and its filled-in text, as read |
| Owner | STRING | Persona task label |

**SSFunding** (one row per obligation, invoice or deobligation)

| Field | Type | Notes |
|---|---|---|
| FundingId | STRING, unique | `<sol>-<kind>-<reference>` |
| SolicitationId | STRING | |
| Kind | STRING | Obligation · Invoice · Deobligation |
| Reference | STRING | Modification number (P00004) or invoice number |
| Clin, Period | STRING | |
| Amount, Hours | DECIMAL | |
| ServiceStart, ServiceEnd, ReceivedDay, AcceptedDay, DueDay, PaidDay | STRING | Days. For invoices, DueDay is the 32.904 due date |
| Status | STRING | Obligated · Received · Approved · Defective · Paid |
| Appropriation, FundsExpireDay | STRING | For example "O&M, Army, FY2026" and the day those funds expire |

**SSAlert** (one row per alert, idempotent by rule and subject)

| Field | Type | Notes |
|---|---|---|
| AlertId | STRING, unique | `<sol>-<rule>-<subject>`, for example `W52P1J-22-R-0011-ceiling-0002-OY4` |
| SolicitationId | STRING | |
| Kind, Rule | STRING | Rule is the key of its row in §17.4 |
| Severity | STRING | Upcoming · Due soon · Overdue · Info |
| Title, Detail | STRING, MULTILINE_TEXT | Plain sentences with the numbers |
| DueDay | STRING | |
| Owner | STRING | Persona task label |
| Status | STRING | Open · Acknowledged · Dismissed · Resolved |
| EvidenceJson | MULTILINE_TEXT | The inputs behind the alert (rows and figures) |
| RaisedAt, ResolvedAt | DATETIME_WITH_TZ | |
| ActedBy, Reason | STRING | Who acknowledged or dismissed it, and why |
| ProcessInstanceId | STRING | The response process, from slice B |

**Reused:**
- SSCorrespondence gains Kind `ContractorNotice` (the 52.232-7 notice, and others the contractor sends). Slice B adds
  `PreliminaryNotice` and `OptionNotice`.
- SSDecision gains `OptionExercise` and `Extension` (slice B).
- SSAuditEvent gains `AdministrationOpened`, `ContractWatched`, `AlertAcknowledged` and `AlertDismissed`.
- **SSModification** (number, type, effective day, text, file) comes in slice B with the first modification the system
  writes.

### 17.7 Processes (BPMN)

**ContractWatchProcess** (slice A)

```
Start (daily timer, or manual with asOf) ─► [R] WatchContracts ─► End
```

WatchContracts does the following for every contract with a signed award:
1. Runs OpenAdministration if the contract has no schedule yet. This step is idempotent.
2. Applies the rules as of `asOf`.
3. Upserts the alerts and resolves the ones that cleared.
4. Writes FundsJson and WatchedAt.
5. Writes one audit row for each contract that changed.

From slice B on, the watch also starts the response process for each new alert that needs action, and the alert keeps
the run's ID. The record can then say, for example, "Option 1 package: in progress, waiting for the Resource Manager".

**Response processes** (one each, kept short):

```
OptionExerciseProcess (B)
Start (sol, period) ─► [R] GatherOptionChecks ─► [A] AW_OptionWriter ─► [H] Certify funds (Resource Manager)
   ─► [H] Option decision (CO) ─► ◇ exercise?
         yes ─► [R] IssueOptionNotice ─► End "Option exercised"
         no ──► [R] RecordNotExercised ─► End "Not exercised"
```
- **GatherOptionChecks** collects the SAM status and exclusions, the latest evaluation, SPRS and CMMC (for DoD), and a
  price comparison against the IGCE.
- **IssueOptionNotice** writes the letter, the modification and the schedule update.
- **Extension of services (52.217-8)** runs the same process. The gateway skips the preliminary notice and holds the
  total extension to 6 months.

```
InvoiceReviewProcess (C)
Start (invoice) ─► [R] InvoiceIntake ─► [A] AW_InvoiceChecker ─► [H] Invoice decision (COR) ─► [R] RecordInvoice ─► End
```
- The COR either approves the invoice or returns it as defective within 7 days.
- **FundingActionProcess (C)** handles the Resource Manager's funding request and the CO's funding modification.
- **PerformanceEvaluationProcess (D):** [R] GatherPerformanceRecord ─► [A] AW_EvaluationWriter ─► [H] COR sets the
  ratings and edits the draft ─► [H] CO signs ─► [R] FileEvaluation. Filing starts the contractor's 14-day comment
  window.
- **CloseoutProcess (D)** covers the checklist, the final invoice, the release of claims and deobligation.
- **Recompete (D)** opens Source Selection's plan wizard, filled in from the current contract.
- **ContractImportProcess (E):** [R] ReadContract (IXP) ─► [A] AW_ContractReader ─► [H] Confirm the schedule (CO) ─►
  [R] OpenAdministration.

### 17.8 Agents and robots

**Robots** (`AW_Robots`, the same `run` entry point):

| Slice | Steps |
|---|---|
| A | OpenAdministration, WatchContracts |
| B | GatherOptionChecks, IssueOptionNotice, RecordNotExercised |
| C | InvoiceIntake, RecordInvoice |
| D | GatherPerformanceRecord, FileEvaluation, CloseoutChecklist, OpenRecompete |
| E | ReadContract |

The deterministic parts stay deterministic: deadline arithmetic, spending forecasts and the alert rules are Python
functions with golden tests, never an agent.

**Agents** follow the §5 rules: one item per run, and a named person decides.

| Agent | Slice | One run covers | Output |
|---|---|---|---|
| **AW_OptionWriter** | B | one option or extension | The preliminary notice, the 17.204-1(b) determination memo with a source for each finding (funds certification, latest evaluation, SAM check, price against the escalated IGCE), and the modification text |
| **AW_InvoiceChecker** | C | one invoice | A line-by-line check: hours × the contract's labor rates, the service period, the ceiling, and duplicates against earlier invoices. The verdict is proper or defective, with reasons |
| **AW_EvaluationWriter** | D | one evaluation | A narrative for each evaluation area, from the COR's surveillance notes, deliverable acceptances and invoice history. **No ratings:** the COR sets them, as evaluators do in Source Selection |
| **AW_ContractReader** | E | one contract | The schedule rows, with page cites, from the IXP extraction: clause fill-ins (52.217-8 and -9 notice periods, the 52.232-7 ceiling), periods, line items and deliverables. The CO confirms them before the watch uses them |

### 17.9 People

There are two new fictional personas in the Award app's switcher. They show initials until headshots are approved.
- **Owen Mercer**, Contracting Officer's Representative (task label `cor`). Owns invoices, deliverables and evaluation
  drafts.
- **Nadia Sorensen**, Resource Manager (task label `resource-manager`). Certifies funds and owns funding alerts.

Dana Whitfield stays the CO. Claire Navarro (counsel) and James Thornton (SSA) have no administration role.

### 17.10 Web app

**Sidebar:** My workspace · Contracts · Alerts · My tasks.
- Contracts is the Awards list, renamed, with Award, Administration and Closed filters.
- Alerts shows the open count.

**Home:**
- For each persona, a **Needs attention** list of their open alerts, most urgent first, above My tasks.
- New tiles:
  - Contracts in administration
  - Alerts due in 30 days
  - Funds at risk: the obligated dollars forecast to run out before their period ends

**Contract page, in Administration:**
- A period tracker under the hero (Base · Option 1 · … · Closeout), with the current period highlighted.
- Three new tabs:
  - **Schedule:** periods, notice windows, deliverables and evaluations on a timeline, like the award Timeline.
  - **Funds:** for each line item, the price or ceiling, the obligated amount and the invoiced amount. A spending chart
    shows the forecast run-out day against the period end, plus the 85% line on labor-hour items.
  - **Alerts:** open and resolved, with the rule behind each under ⓘ.
- Links between incumbent and follow-on: "Follow-on: W52P1J-27-C-0023, Keystone Ridge" / "Replaces W52P1J-22-C-0011".
- A contract awarded here keeps its award tabs. An imported contract shows only administration.

**Alerts page:**
- Every alert across contracts, filtered by owner, kind and severity.
- Acknowledge, or Dismiss with a reason.
- **Run check now** (CO) starts ContractWatchProcess.

### 17.11 Demo story: the incumbent's contract

The Army record already implies an incumbent. Keystone's proposal moves "the incumbent's open work orders" over in a
60-day transition-in. Slice A seeds that incumbent's contract, so the demo has a contract in its last months next to
one just signed.

| | Incumbent (seeded) | Follow-on (0023) |
|---|---|---|
| Contract | W52P1J-22-C-0011, Army Logistics Data Analytics Support | W52P1J-27-C-0023, Army Logistics Data Analytics Platform |
| Contractor | Ostrander Analytics Group Inc (fictional; "Ostrander Analytics" was too close to a real firm) | Keystone Ridge Analytics LLC |
| Type | Firm-fixed-price with labor-hour line items, base plus 4 options, all exercised | The same, base plus 4 options |
| Where it is | Final option year, ending about 10 weeks after seeding (Dec 31 if seeded this week) | Signed; transition-in under line item 0005 |
| Origin | Imported (seeded) | Source Selection |

The generator sets the numbers so the watch finds these on the incumbent the day it's seeded:
1. **Extension decision, due soon.**
   - No options are left. 52.217-8 allows up to 6 months, by written notice within the contract's period. The seeded
     fill-in is "at least 60 days before the contract expires", so Oct 30 when seeded on Oct 23 (Nov 1 is a Sunday).
   - The detail links the follow-on: if 0023 is protested and the stay applies, Keystone can't start, so the CO needs
     the extension in hand.
2. **Labor-hour ceiling, overdue.** Line item 0002 is at 88% of its ceiling, and Ostrander hasn't sent its
   52.232-7(d) notice.
3. **Funds run out early.** At the last three months' spending rate, the option year's obligated funds run out about
   five weeks before the period ends (Nov 26 against Dec 31 when seeded on Oct 23).
4. **Invoice due.** September's invoice arrived in October. The COR hasn't approved it, and the 32.904 due date is two
   weeks away.
5. **Deliverable late.** The transition-out plan was due 90 days before expiry and hasn't arrived. It is the other half
   of Keystone's transition-in.
6. **Final evaluation upcoming.** It falls due when the work completes (42.1102(a)).
7. **Registration.** Ostrander's SAM registration lapses inside a 6-month extension.

**On 0023 itself,** the watch shows a fresh schedule:
- transition-in due
- the post-award orientation conference
- the COR appointment
- the first monthly report
- option 1's notice day, about a year out

**The talk track crosses all three apps.** This contract's recompete became solicitation 0023 in Source Selection.
Contract Award signed Keystone. Administration now bridges the incumbent and brings the follow-on on board.

Slice B then answers alert 1 end to end (§17.7):
1. The checks are gathered.
2. The memo and notice are drafted.
3. Nadia certifies the funds.
4. Dana signs.
5. The modification is filed.

The generator works relative to the day it runs and has `--reset`, so the demo doesn't go stale.

### 17.12 Build plan

| Slice | Delivers | Size |
|---|---|---|
| A. Watch and alerts | §17.13 | about slice 1 |
| B. Option exercise and extension | OptionExerciseProcess, AW_OptionWriter plus evals, the Resource Manager and CO forms, SSModification, the preliminary notice and option letters | about slice 2 |
| C. Funds and invoices | InvoiceReviewProcess with AW_InvoiceChecker, FundingActionProcess, the COR's invoice form, invoice PDFs in the generator | about slice 2 |
| D. Evaluations, closeout, recompete | PerformanceEvaluationProcess with AW_EvaluationWriter, CloseoutProcess, the recompete hand-off into Source Selection's plan wizard | about slice 2 |
| E. Import any contract | An IXP "Contract" project (line items, periods, clauses with fill-ins, deliverables), AW_ContractReader, ContractImportProcess with the CO's confirm form | about the IXP proposal work |

**On ordering:**
- E is what proves the point to buyers, because it works on the contracts they already have. It can move ahead of C
  or D.
- The debriefing and protest slices (§13, slices 2 and 3) don't depend on these.
- The protest slice pairs well with B: a protest on 0023 is what makes the incumbent's extension urgent.

### 17.13 Slice A plan: watch and alerts

**Goal:**
- Both Army contracts show a schedule, money and alerts, kept current by a daily Maestro process.
- The CO, COR and Resource Manager each see their own alerts.
- No response processes yet.

**1. Data Fabric** (I run these)
- Add the §17.6 fields to SSAward.
- Create SSSchedule, SSFunding and SSAlert from `tools/schema/`, and add their IDs to `entity-ids.json`.
- `AWARD_ENTITY` (ss-workspace `lib/apps.ts`) and ss-task-forms `ENTITY` gain `schedule`, `funding` and `alerts`.
- `deleteEvaluation.ts` deletes their rows too.

**2. Rules engine** (`Award/AW_Robots/admin.py`, pure functions)
- **`build_schedule(plan, summary, signed_at)`**, for a contract awarded here:
  - **Periods** come from the plan's base-plus-options structure. The base year starts on the first of the month after
    the 60-day transition-in.
  - **Option notice days** use the clause default (52.217-9: 60 days).
  - **Deliverables** use a default list for a services contract (settings in `admin.py`) until import (slice E) reads
    the real ones:
    - post-award orientation within 15 days
    - COR appointment before performance
    - transition-in complete at 60 days
    - a monthly status report on the 10th
    - a transition-out plan 90 days before the end
  - **Prices per period:** Keystone's price lines carry one total per line item across all five periods. So the base
    year takes all of transition-in (0005), and the rest splits evenly across the periods. Future generated plans
    should carry a price for each period.
- **`forecast(funding, period)`** uses the average spending per day over the last three invoiced months. It gives the
  run-out day for obligated funds, and the 85% and 100% days for labor-hour ceilings.
- **`alerts(contract, schedule, funding, correspondence, as_of)`** applies the §17.5 rules (all but closeout and
  recompete). Each rule returns the AlertId, severity, due day, owner, rule key, detail and evidence.
- `clocks.py` and `clocks.ts` gain `prior_business_day`, with new shared cases in `clock-cases.json`.

**3. Robot steps** (`main.py`)
- **`OpenAdministration`** (solicitationId) acts on a signed contract (SSDecision Kind Contract, Outcome Awarded) that
  has no schedule. It writes the schedule and the SSAward administration fields, and sets Phase to Administration. It
  is idempotent.
- **`WatchContracts`** (`asOf`, optional) covers every contract in Administration or with a signed award:
  - It runs OpenAdministration if needed, then the rules.
  - It upserts alerts by AlertId and resolves the cleared ones. It never reopens a dismissed alert unless the alert got
    more severe.
  - It writes FundsJson and WatchedAt, and one audit row for each contract that changed.
- `RobotInput` gains `asOf`.

**4. ContractWatchProcess** (in the Award solution)
- Start (manual, with input asOf) → Task_WatchContracts (AW_Robots `run`, step WatchContracts) → End.
- A daily timer start (Intsvc.TimerTrigger, P1D) sits beside the manual start, if it validates, packs and runs without
  an Integration Service connection. If it doesn't, an Orchestrator time trigger on the process does the same job.
  Check this first in the slice.
- Run `uip maestro bpmn validate`; `bpmn refresh` keeps the bindings.

**5. Demo data** (`tools/generate_incumbent.py`)
- It writes the incumbent (§17.11):
  - SSAward, with Origin Imported, Framework federal, and the follow-on link to 0023's award row and back
  - the schedule
  - funding: obligations by option-year modification, and monthly invoices
  - the missing contractor notice
  - the signed contract PDF (with the synthetic banner) to SS-Records `W52P1J-22-R-0011/contract/`
- Dates are relative to the day it runs. `--reset` removes its rows and files.
- It follows the synthetic-demo-data skill. The contractor name is checked against SAM and a web search first.
- `export_snapshot.py --only` picks it up, and `award_preview.py` runs WatchContracts on the snapshot, so `?preview`
  shows real alerts.

**6. Web app** (award-workspace and the shared lib)
- **`lib/contract.ts`** gives a contract header that works with or without an SSSolicitation row (title, agency,
  awardee, type, origin), plus Phase helpers and the alert kinds, labels and severity order.
  - The pages and panels that take a `Solicitation` today switch to it: the Award page, AwardRunPanel and NextStep.
  - This is the biggest change in the slice.
- **`lib/data.tsx`** loads the three new entities, and its scoping keeps imported contracts by their own Framework.
- **New files:**
  - `pages/Alerts.tsx`
  - `components/AlertList.tsx`
  - `components/ScheduleTimeline.tsx`
  - `components/FundsPanel.tsx`: the spending chart, built with the dataviz skill
  - `components/PeriodTracker.tsx`
- **Changed:**
  - Sidebar: Contracts, and Alerts with a count
  - Home: Needs attention, and the administration tiles
  - Award page: the period tracker; the Schedule, Funds and Alerts tabs; the incumbent and follow-on links
  - Awards list: the phase filter
  - `lib/award.ts`: the COR and Resource Manager personas
  - `lib/apps.ts`: the name, if the rename is confirmed
- **Writes:**
  - Acknowledge and Dismiss write SSAlert and an audit row.
  - Run check now starts ContractWatchProcess the same way Begin award starts AwardProcess.

**7. Checks**
- pytest, with AW_Robots run on its own:
  - building the schedule from 0023's plan
  - the forecasts
  - each alert rule at its edges: one day inside and outside each lead time, and the weekend and holiday roll-back
  - idempotency: a second watch run changes nothing
  - resolve-on-clear, and a dismissed alert stays dismissed
- `npm test` in award-task-forms (the shared clock cases), and `tsc -b` plus builds for award-workspace and
  ss-workspace.
- `?preview` screenshots at desktop and phone width, as Dana, Owen and Nadia.
- The award stages on 0023 still render and run in preview, before and after the contract-header change.

**8. Deploy**, after task #20708266 is signed so its open action app isn't upgraded under it:
- I make the Data Fabric changes.
- You publish and deploy-upgrade Award 1.2.0, using upgrade key ad64a913-f04b-40c5-a735-62a9f830b90c. It adds
  ContractWatchProcess and the new AW_Robots steps, and also carries the staged AwardTaskForms 1.1.1.
- You deploy award-workspace 1.0.8 and ss-workspace 1.0.73 (the delete coverage and the switcher name).
- I seed the incumbent and run ContractWatch once.

**Done when:**
- The live Alerts page matches `?preview`: the incumbent's alerts from §17.11 with the right rules and days, and 0023's
  fresh schedule once its award is signed.
- A dismissal survives a reload and shows in the Audit tab.
- A second Run check now adds nothing.
- The daily trigger shows its next run in Orchestrator.
- Dana, Owen and Nadia each see only their own alerts on Home.

**Not in slice A:**
- response processes, agents, letters and modifications
- IXP import
- SAM lookups (registration dates are seeded)
- closeout and recompete alerts

**Risks:**
- The timer start hasn't been proven in this tenant. The fallback is an Orchestrator trigger.
- The contract-header change touches every Award page component, and the award flow on 0023 has to keep working.
- 0023's schedule comes from defaults until import reads the real contract. The Schedule tab says so: "From the
  solicitation's terms; not yet read from the signed contract."

### 17.14 Decisions

- **Name:** Contract Management (decided 2026-10-23).
- **Personas:** Owen Mercer (COR) and Nadia Sorensen (Resource Manager), both fictional. Headshots need your OK.
- **Incumbent contractor:** Ostrander Analytics Group Inc (no real company by that name in a web search).
- **Lead-time defaults:** as in §17.5.
- **Slice order after A:** E could move up.

Sources for §17:
- [RFO Part 17](https://www.acquisition.gov/far-overhaul/far-part-deviation-guide/far-overhaul-part-17)
- [RFO Part 32](https://www.acquisition.gov/far-overhaul/far-part-deviation-guide/far-overhaul-part-32)
- [RFO Part 42](https://www.acquisition.gov/far-overhaul/far-part-deviation-guide/far-overhaul-part-42)
- [RFO Part 4](https://www.acquisition.gov/far-overhaul/far-part-deviation-guide/far-overhaul-part-4)
- [FAR 52.217-8](https://www.acquisition.gov/far/52.217-8), [52.217-9](https://www.acquisition.gov/far/52.217-9),
  [52.232-7](https://www.acquisition.gov/far/52.232-7), [52.232-22](https://www.law.cornell.edu/cfr/text/48/52.232-22)
- [DFARS 217.207](https://www.acquisition.gov/dfars/217.207-exercise-options.)
- [PIEE modules (DLA)](https://www.dla.mil/Portals/104/Documents/InformationOperations/FedMall/PIEE%20Module%20Overview%20(Sep%202021)%20v4.pdf)
- [Army ACWS](https://www.army.mil/article/290157/army_retires_standard_procurement_system_launches_modern_contracting_platform)

## 18. Slice A status (2026-10-23): watch and alerts

**Built and packed as Award 1.2.0, Contract Management web 1.0.8 and Source Selection web 1.0.73. The deploy is the
user's to run. Committed as e80a2ad.**

**Data Fabric (live):**
- SSSchedule e41ad3eb-04cf-f111-bf5b-000d3a66d571, SSFunding 2a6be5f1-04cf-f111-bf5b-000d3a66d571 and SSAlert
  486be5f1-04cf-f111-bf5b-000d3a66d571 are created, with every MULTILINE field at 10,000.
- SSAward has the §17.6 fields.
- 0023's plan has `laborHourClins` (0002, 0003). The repo copy in `evaluation-plans/` has it too.
- The incumbent is seeded (`tools/generate_incumbent.py`):
  - 1 award, 22 schedule rows, 74 funding rows and 6 audit rows
  - the conformed contract at SS-Records `W52P1J-22-R-0011/contract/W52P1J-22-C-0011-Conformed.pdf`
  - 0023's award row now has PredecessorId

**AW_Robots:**
- `admin.py` holds the rules: schedule, materialize, forecast, alerts and reconcile.
- `OpenAdministration` and `WatchContracts` are the new steps, and `asOf` is on the entry point.
- `clocks.prior_business_day` is mirrored in `clocks.ts`, with 5 new shared cases.
- 56 pytest tests pass (`tests/test_admin.py` runs the generator's own rows), and `npm test` passes in
  award-task-forms.

**ContractWatchProcess** is a manual start → Watch Contracts (AW_Robots) → End.
- `bindings_v2.json` and the resource's runtime dependency on AW_Robots were added by hand, the same way AwardProcess
  carries them; `bpmn refresh` keeps them.
- `bpmn validate` passes, with the same harmless `<type>` warning AwardProcess has.

**Web app:**
- New: lib/alerts.ts (actions, Run check now, per-persona alerts), AlertList, ScheduleTimeline, FundsPanel (spending
  chart, line-item table, invoices, obligations), PeriodTracker, and the Alerts page.
- Changed: the contract page (both trackers, Alerts, Schedule and Funds tabs, linked contracts, signed contract PDF for
  imported contracts), the Contracts list, Home (Needs attention, COR and Resource Manager tiles) and the sidebar.
- Personas: Owen Mercer (`cor`) and Nadia Sorensen (`rm`), shown with initials.
- Checked in `?preview` for:
  - Dana, Owen and Nadia
  - desktop and phone widths, with no horizontal scroll
  - light and dark themes

**Preview:**
- The snapshot was re-exported from the tenant, with 0023 signed and the incumbent seeded; findings and pages are
  dropped.
- `award_preview.py WatchContracts --as-of 2026-10-23` wrote the 8 alerts: the incumbent's 7, plus 0023's post-award
  orientation conference.

**Changes from the §17.13 plan:**
- **Imported contracts get a header in the data layer** (`withContractHeaders`, `importedHeader` in lib/award.ts and
  lib/data.tsx). They don't get a page refactor: the pages read the header like any solicitation, and `Imported` hides
  the award-phase parts.
- **The base year starts on the signing day.** Its first 60 days are the transition-in, so the follow-on overlaps the
  incumbent's last two months.
- **No COR appointment milestone.** It would be overdue the day the contract is signed.
- **Evaluation alerts start 90 days ahead,** so the incumbent's final evaluation shows now.
- **The funds rule ignores a shortfall of under three days' spending.** That's forecast noise from months of different
  lengths.
- **ss-task-forms `ENTITY` is unchanged.** Its backend loads every entity on each task, so the new ones wait for slice B,
  when forms need them.
- **The daily run is an Orchestrator time trigger, not a BPMN timer start.** The Integration Service timer may need a
  connection.

**Deployed 2026-10-23:**
- Award 1.2.0 is live. ContractWatchProcess, AW_Robots and AwardProcess are all at 1.2.0, and ContractWatchProcess's
  release key is 2853D3E0-81C2-4CD2-BA21-F7051F1A0785. The next upgrade uses record key
  d6838550-4b60-4eb5-9839-236a3b22a267.
- The Orchestrator time trigger "Daily contract watch" (f4527f6b-6f81-4fee-984f-c7f0fbbced43) runs at 6:00 AM Eastern
  with `asOf` empty, and its runtime is ProcessOrchestration. `--time-zone` needs a Windows ID ("Eastern Standard Time");
  an IANA ID gets HTTP 400. The CLI takes `--runtime-type Unattended`, and Orchestrator stores ProcessOrchestration.
- **First run (jobs 2f1fa55d and robot 82b87d37):**
  - 0023 is opened for administration: 16 schedule rows, a base period from Oct 23, 2026, and $4,740,000 obligated.
    Its award stage is still Debriefings.
  - It raised the same 8 alerts as the preview.
- **A second run** raised nothing new, made nothing more urgent and resolved nothing, as designed.
- **Contract Management web 1.0.8 (deployed and verified live 2026-10-23, index-DV56y49g.js):**
  - The home page and the Alerts page show the 8 live alerts, most urgent first.
  - An acknowledgement on 0023's orientation alert survived a reload and shows in the Audit tab as "Alert
    Acknowledged · Dana Whitfield". It was then reopened, which left two audit rows on 0023.
  - Run check now started the watch, and the page refreshed itself when the run finished.
  - In a hidden browser pane the fade-in animations pause, so pages can look blank until the pane is shown.
- **Source Selection web 1.0.73** (switcher name, delete coverage) is deployed and verified live (index-sbY5hKks.js). The
  switcher lists Contract Management.

## 19. Clarity redesign (2026-10-27): awards apart from contracts, action items in three groups

**Why:** the user found the app confusing.
- **Acknowledged items were still alerts.** They showed red or amber, counted in "10 alerts" everywhere, and filled
  Live activity.
- **A signed contract looked like an unfinished award.** 0023, signed Oct 23, still led with the award tracker at
  "Debriefings" and a stale "waiting for debriefing requests, due Oct 26". It showed two trackers, and the incumbent's
  card was built the same way as 0023's.

**What changed (web only; robots, process and data unchanged). Deployed 2026-10-27 as Contract Management 1.0.9 (index-DDRjQwIA.js):**
- **One status per record** (`lib/status.ts`, `statusOf`): Awaiting decision · Ready to award · Award in progress ·
  Active · Closed. A record is an award until its contract award is signed (SSDecision Contract, Awarded), and a
  contract from then on.
- **Separate lists and cards.**
  - **Awards** (`/awards`): award cards with the step tracker, a dashed teal outline and a gavel chip, plus the
    decisions awaiting the SSA in Source Selection and the ones signed recently.
  - **Contracts** (`/contracts`): contract cards with no tracker. Each has a green edge and an "Active · <period>" chip,
    and shows how far it is through its period, what's invoiced against what's obligated, and the next item.
- **Post-award line.** A signed contract awarded here shows its debriefing and protest windows as one line
  ("No debriefing requests by Oct 26 · Protest window for a stay closes Nov 2"). Its award history (notices, timeline,
  letters, protest, the Maestro run) moves to an Award record tab.
- **Action items** (`/actions`; `/alerts` redirects there) come in three groups (`lib/alerts.ts`, `groupOf`):
  - **Needs action:** open, and overdue or due within 14 days. Only this group counts on badges, tiles and the greeting.
  - **In hand:** acknowledged, folded away and grey, with who's on it and the due date.
  - **Coming up:** open, more than 14 days out, folded away.
  - The button reads "I'm on it", and an item's numbers and rule sit under Details.
- **Quieter pages.**
  - The home page has Needs action, Awards in progress (CO, counsel, SSA only), Active contracts and My tasks (shown
    only when there are tasks).
  - The aside is "Milestones": the record's milestones without the daily watch runs or acknowledgements.
  - A contract page has one tracker (periods) and four tiles: contractor, period, invoiced this period, needs action.
  - "That's you" shows only to an item's owner.
- **Checked in `?preview`** on a fresh export of the tenant (2026-10-27): Dana and Owen; desktop and phone widths, with
  no horizontal scroll on any page; light and dark themes.

## 20. Deliverable review (2026-10-27): the work done in the app, started on its own

**Why:** "I'm on it" only claimed an action item. The work happened elsewhere, and nothing in the app could record it as
done, so a claimed item never cleared. The user also wanted alerts to run on their own.

**Alerts already run on their own.**
- The "Daily contract watch" trigger has run at 6:00 AM Eastern since Oct 24.
- On Oct 27 it raised both October status reports by itself, once they came within 14 days.
- **Not built: email or chat notices.** The tenant has no Outlook, Teams or Slack connection, only the user's
  personal Google Drive, Sheets and Docs. Emailing a daily digest of new needs-action items would need a Microsoft
  Outlook 365 connection, which the user creates by signing in.
- Work that needs a person now arrives as an assigned Action Center task.

**The flow** (Award 1.3.0, web 1.0.10):
1. **Record receipt.** On a deliverable's action item, the COR or CO uploads the PDF the contractor sent.
   - It's filed at SS-Records `<sol>/deliverables/<code>-<month>.pdf`, and the schedule row is marked Received.
   - The item moves to In hand.
   - DeliverableReviewProcess starts.
2. **PrepareDeliverableReview** (AW_Robots):
   - Reads the PDF with pypdf and strips the demo banner.
   - Has **AW_DeliverableReviewer** (a low-code agent) check it against what the contract requires, one element at a
     time, quoting the report.
   - Recomputes today's labor-hour funds, so the agent can set reported hours against the ceilings.
   - `admin.checked_review` drops any quote that isn't in the report's text and says so. If the agent fails twice, the
     COR checks by hand.
3. **Review the Deliverable** (an Action Center task, assigned to the COR by email, labels "award, cor").
   - The reviewDeliverable form shows the report, the checklist with quotes, what to raise, and the agent's suggestion.
   - The COR accepts, or rejects with reasons (pre-filled from the gaps). There's no source selection conflict gate:
     FormShell has `certify={false}`.
   - The item's "Review report" button opens the same form in the app.
4. **RecordDeliverableReview** (AW_Robots):
   - **Accepted:** the action item is resolved.
   - **Rejected:** a notice to the contractor goes to SS-Records and SSCorrespondence (Kind DeliverableRejection). The
     deliverable is due again 5 business days later, with the history kept in ReviewJson, so the watch raises it
     again.
5. **Backstop:** each morning the watch starts a review for any deliverable on file (Received, with a file) that has no
   review run, if the contract has a CorEmail.

**Requirements:** `admin.DELIVERABLE_REQUIREMENTS`.
- A001, the monthly status report, needs six elements: work by task area; hours by labor category for each labor-hour
  line item, for the month and cumulative; deliverables; risks with their mitigation; staffing changes; next month.
- A002, the transition-out plan, needs five.
- A contract's abstract can carry its own list.

**Data:**
- SSSchedule gained FilePath, ReviewJson, ReviewedBy, ReviewedAt, Reason and ProcessInstanceId.
- Both live awards now have CorEmail.
- ss-task-forms `ENTITY` now includes schedule and alerts.
- `withContractHeader` gives a contract awarded elsewhere a header in both form hosts, so the incumbent's tasks open.

**Demo files:**
- `samples/<sol>/deliverables/`, from `tools/generate_status_reports.py`, with `samples/deliverables-README.md`.
  - **Ostrander's October report:** hours as one total, the ceiling not mentioned, the transition-out plan put off.
  - **Keystone's October report:** complete.
- The agent's 5 eval cases come from `tools/build_award_evals.py`, which uses the exact inputs the robot sends.
  `uip agent review` gives PASS, A+.

**Tests:** 63 AW_Robots pytest, including `tests/test_review.py`. Checked in the preview: the item buttons (Record
receipt, Review starting) and the review form on the incumbent's contract.

**Deployed 2026-10-27:**
- Award 1.3.0 is live. All five releases are at 1.3.0: AW_DeliverableReviewer 0D1AB775-DF15-42C4-91FB-DFA4BE4DBA5A and
  DeliverableReviewProcess 45B40A68-006E-4FE4-92AC-B1BB3A0BEC83 are new.
- The daily trigger survived the upgrade, because ContractWatchProcess kept the same release.
- The next upgrade uses record key d8650c27-d397-4c67-a650-63f241912939.
- **The live agent, run on both sample reports** (jobs 5db418c8, d9495069):
  - **Ostrander:** hours partly met, and risks partly met because the report doesn't flag the ceiling. It raised line
    item 0002 at 90% of its ceiling and the late transition-out plan, and recommended accept with comments, as the
    README expects.
  - **Keystone:** every element met, but it recommended accept with comments rather than accept, because it listed
    two follow-ups (confirming acceptance of the transition-in plan, and the incumbent's plan).
  - **To tighten in the next upgrade:** follow-ups and issues about other contracts or deliverables shouldn't downgrade
    a deliverable whose every element is met.
- Contract Management web 1.0.10 deployed 2026-10-27 (index-BE7cXQhg.js). The live UI wasn't re-checked, because the browser pane's sign-in had expired.

## 21. Slice B (2026-10-27): option exercise and the extension of services

**Goal:** the incumbent's extension decision (52.217-8, the notice due Oct 30) is finished in the app: the checks are
gathered, the determination is drafted, Nadia certifies the funds, Dana signs, and the notice and the modification are
filed, with the new period, its obligations and its schedule in place. The same process runs 52.217-9 options: first
the preliminary notice, then the exercise.

**Checked against primary text on 2026-10-27:** RFO 17.204-1(b) (acquisition.gov, FAR overhaul Part 17). The CO may
exercise an option only after (1) written notice within the contract's period, (2) confirming funds are available,
and (3) determining that (i) the option fulfills an existing need, (ii) it was synopsized unless exempt, (iii) the
contractor has no active SAM exclusion, (iv) performance on this contract has been acceptable, (v) the price is fair
and reasonable based on current market conditions and exercise is in the Government's best interest, and (vi) it
complies with part 6: evaluated in the initial competition, at a price set by or determinable from the contract.
17.203(f) and (g) prescribe 52.217-8 and 52.217-9. DFARS 217.207(c) adds the SAM registration match, SPRS and CMMC.

### 21.1 Process: `OptionExerciseProcess` (BPMN, Award solution)

```
Start (solicitationId, scheduleId, contractingOfficer, resourceManager)
 ─► [R] PrepareOptionPackage ─► [H] Certify Funds (Resource Manager) ─► [H] Option Decision (CO) ─► ◇ decision
       Exercised ─► [R] IssueOptionExercise ─► End "Exercised"
       Notice sent ─► [R] IssuePreliminaryNotice ─► End "Preliminary notice sent"
       (default) ─► [R] RecordNotExercised ─► End "Not exercised"
```

- **Started** by Start package on the item (CO), or by the daily watch when an option or extension item reaches
  needs action (due within 14 days, or overdue) with no package running and the contract has CoEmail and RmEmail.
- **PrepareOptionPackage** (robot, with AW_OptionWriter): works out what's being decided and gathers the checks.
  - Stage: an extension (52.217-8), an option's preliminary notice (52.217-9(a), while the option is Planned), or its
    exercise (once the notice is sent).
  - The proposal: the period, each line item's price (an extension runs at the current period's rates, by the month),
    and for an extension the proposed length. The length is the shortest that covers the risk: while the follow-on's
    protest window is open, the shortest increment whose next notice day falls after that window closes (52.217-8 may
    be exercised more than once), so the CO decides the rest once the window has closed. A follow-on that's under way
    and in place before the contract ends means no extension; no follow-on means the whole remaining extension.
  - The checks, one per element above, each Met, Not met, To confirm or Not required, with the facts and their source:
    notice window, funds (the Resource Manager's step), existing need (the follow-on's status), synopsis, SAM exclusion
    and registration (SSRefVendor, the demo's SAM and CPARS source), performance (CPARS ratings for this contract, this
    period's deliverables, open items), price (the contract's rates against the follow-on's competed prices, or the
    IGCE), part 6 (evaluated at award), the duration limits (52.217-8's 6 months, 52.217-9(c)), SPRS and CMMC.
  - The agent drafts the three findings that need judgment (existing need, performance, price and best interest) from
    those checks, citing them by ID, and recommends an action. The robot drops any citation of a check that doesn't
    exist. The other findings are written by the robot from the checks.
- **Certify Funds** (Nadia, `certifyFunds`): certifies funds for the proposal (or another length), marks them planned
  but not yet available (enough for a preliminary notice), or not available. She gives the funding document and the
  appropriation. The certification goes on the package.
- **Option Decision** (Dana, `optionDecision`): the checks, the funds, the determination and findings (editable), the
  agent's recommendation, and the choice. Exercise needs certified funds; the preliminary notice needs funds at least
  planned. Not exercising needs a reason. She signs, and the form writes the signed determination (SSDecision, Kind
  OptionExercise or Extension), the notice (SSCorrespondence) and, on exercise, the modification (SSModification).
  - **Late:** past the notice window, a unilateral exercise isn't available. The form says so, and an exercise becomes
    a bilateral modification that needs the contractor's agreement; counsel should check whether part 6 then applies.
- **The issue steps** file the PDFs to SS-Records `<sol>/modifications/`, mark the letter delivered and the modification
  issued, and update the record:
  - **Exercised:** the option row is Exercised, or a new extension period row (Extension 1, 2, ...) is added and the
    clause row moves on to what remains. Obligations are added per line item, the abstract gains the new period's
    prices, PeriodEnd moves, and the monthly report and final evaluation move to the new end.
  - **Preliminary notice:** the option is Notice sent, so its item turns to the exercise deadline.
  - **Not exercised:** the option and any later options, or the extension clause, are Not exercised.
  - Each re-runs the watch's rules for that contract, so the item clears (or the next one appears) at once.

### 21.2 Data

- **SSModification** (new): ModificationId `<sol>-<number>`, SolicitationId, Number (P00012), Kind (Option exercise ·
  Extension of services), Authority, Bilateral, ScheduleId, EffectiveDay, Amount, Status (Signed · Issued), Text
  (10,000), FilePath, SignedBy, SignedAt. The number follows the highest P-number on the contract's funding rows and
  modifications.
- **SSAward:** CoEmail and RmEmail, for the watch to start packages (CorEmail exists).
- **SSSchedule:** the package lives in ReviewJson on the option or extension row, with ProcessInstanceId while it runs.
- **SSRefVendor:** the generator adds Ostrander's row (active, no exclusion, registration to Feb 14, CPARS for this
  contract: Very Good, Very Good, Satisfactory, Satisfactory). The incumbent's abstract gains its SPRS assessment and
  `evaluated` on its option clauses.
- Reused: SSDecision Kinds OptionExercise and Extension; SSCorrespondence Kinds PreliminaryNotice, OptionNotice,
  ExtensionNotice and OptionNotExercised; SSFunding obligations by the modification.

### 21.3 Apps

- **award-task-forms:** `certifyFunds` and `optionDecision`, with the letter, modification and memo templates in
  `src/lib/options.ts` (tested with `npm test`). The action schema gains `packageDraft`.
- **Contract Management web:** Start package on option and extension items (CO); while it runs, the item shows whose
  turn it is and opens the task (Certify funds for Nadia, Decide for Dana). Contract pages show the exercised
  extension periods and a Modifications list on the Funds tab.
- **Source Selection web:** Delete evaluation also deletes SSModification rows.
- **Also in this upgrade:** the deliverable reviewer's instructions say follow-ups about other contracts or
  deliverables don't downgrade a deliverable whose every element is met (§20).

### 21.4 Status (2026-10-28): built; Award 1.4.0 deployed

**Deployed 2026-10-28: Award 1.4.0.** The upgrade from 1.3.0 succeeded and the deployment is active.
- All seven releases are at 1.4.0: OptionExerciseProcess 95D0BEEC-CF4E-441C-9017-72B4C38D5E01 and AW_OptionWriter
  0D07A1C6-FB2D-4099-A5ED-6D37069CB953 are new.
- The daily watch trigger kept its release.
- The next upgrade uses record key 1ab38c97-4d9b-4e4d-ac46-8f252d61b0c6.

**Web deployed 2026-10-28; both live bundles match local:**
- Contract Management web 1.0.11 (index-wP_CF09P.js)
- Source Selection web 1.0.74 (index-BbN5h6C4.js)

**Live data already changed (no deploy needed):**
- SSModification created (99169e7e-3cd2-f111-bf5b-000d3a66d571, in entity-ids.json). SSAward has CoEmail and
  RmEmail, both set on the two live contracts.
- Ostrander's SSRefVendor row is in, and the incumbent's abstract has its SPRS assessment, `synopsized` and
  `evaluated` on both option clauses. The generator writes all of it on a fresh seed.

**Changes from the plan in §21.1–21.3:**
- **The determination is an SSDecision draft** (`<sol>-EXT-1`, `<sol>-OY1-1`, ...), written by PrepareOptionPackage
  with the writer's three findings and the robot's own for the rest, and two blanks (`[Funds certification]`,
  `[Determination]`) the CO's form fills. The package on the schedule row keeps the checks, the proposal and the
  writer's recommendation (about 7,000 characters), with room for the funds and the decision.
- **The notice, the modification and the determination paragraph are written by the CO's form**
  (`award-task-forms/src/lib/options.ts`), because the length the CO picks changes all three. The robot files what was
  signed and works out each line's amount the same way (`admin.decided_lines`).
- **One join before one end:** the gateway's three branches meet at "Filed" before End "Decision filed", which
  returns the outcome (a public output needs a single completion event).
- **The watch starts a package once its item needs action** (due within 14 days, or overdue), unless the item was
  dismissed. Start package on the item works at any time.
- **Exercised extensions are their own periods** (Extension 1, 2, ...): `current_period` and the funds forecast read
  them, the abstract gains their prices, and the clause row keeps only what remains (Planned, Used, Not exercised).
- **The late case:** the notice check is Not met, and an exercise becomes a bilateral modification with the
  contractor's signature line.

**Checked:**
- 82 AW_Robots tests pass (19 new in `tests/test_options.py`), plus `npm test` in award-task-forms (the option
  templates) and type checks in all four apps.
- Both agents pass `uip agent review` (100, A+). AW_OptionWriter has 5 eval cases:
  - the demo day (extend 1 month)
  - the window closed with the follow-on under way (don't extend)
  - the follow-on stayed (extend 4 months)
  - Marginal performance (don't extend)
  - the follow-on's option 1 preliminary notice
- OptionExerciseProcess validates.
- **In the local preview,** on a fresh export of the tenant:
  - The incumbent's extension item shows Start package.
  - Nadia's certifyFunds and Dana's optionDecision forms render at desktop and phone widths, in both themes. Signing
    writes the determination, the notice, the modification, the decision and the audit row.
  - After the robot filed a simulated exercise, the contract page showed Ext. 1 in the period tracker, Extension 1 and
    "Further extension: up to 5 months, decide by Dec 2" on the Schedule tab, and P00012 with its notice under
    Modifications and letters.

**The demo, once deployed:** the incumbent's notice is due Oct 30.
- Dana starts the package from the item, or the 6:00 AM watch starts it on Oct 29.
- The agent recommends one month, because Keystone can be protested until Nov 2.
- A second decision for the rest of the extension is then due Dec 2.

**First live run (2026-10-28):** Start package on Ostrander's extension started OptionExerciseProcess instance
a0147084-bfa1-44a1-9c88-7e04b6c0e769.
- PrepareOptionPackage (job 9be41b56) and AW_OptionWriter (job e691ec29, 18 seconds) wrote the package (7,623
  characters) and the draft determination W52P1J-22-R-0011-EXT-1.
- The checks match the preview: 8 Met, 3 to confirm, CMMC not required.
- The writer recommended one month to Jan 31, 2027, as the robot proposed.
- Nadia's task #20781454, "Certify funds for an option or extension", is pending in the Award folder.
- **The writer's three findings have factual slips, to fix in the next upgrade:**
  - **Existing need:** it says the work must continue because Keystone's transition-in ends Dec 22. That date is
    before Dec 31; the real reason is a protest stay until Nov 2.
  - **Performance:** it calls line item 0002 "past its labor-hour ceiling" and a "ceiling overrun". The line is past
    85% of its ceiling with no notice from Ostrander, not over it.
  - **Price:** it singles out line item 0001, with a comparison the figures don't support, and misses that 0002 is
    about 19% above the follow-on's price.
  - **The fix:**
    - The robot gives the price check each line's difference, with direction and percent.
    - The ceiling item gets a plain fact (past 85%, not over 100%).
    - The requirement check states whether the follow-on is in place before the contract ends.
    - The prompt says to use only those facts.

**The writer fix, Award 1.4.1, deployed 2026-10-28.** All seven releases are at 1.4.1 and the trigger is kept. The next upgrade uses
record key 06b366a6-7de2-48a9-a6b4-75d007c562dc. Web 1.0.12 is deployed, and its live bundle (index-DE2XO1my.js) matches.
- **Existing need:** the requirement check states why the work is needed (`whyNeeded`) and whether the follow-on is in
  place before the contract ends (`followOnInPlaceBeforeEnd`). On the demo day it reads: the follow-on is set to take
  over on time, so the need is the risk that a protest filed by Nov 2 stays it.
- **Ceiling:** the performance check lists each labor-hour line against its ceiling (`laborHourCeilings`: percent,
  past 85%, over the ceiling, contractor notice on file). The robot's own finding says it plainly: 0002 is at about 87%,
  past the 85% notice point, not over the ceiling, with no notice. The open items now count only a ceiling item, or
  deliverables and milestones that are overdue.
- **Price:** the price check gives each line's difference, percent and direction, and the lines that differ by 10% or
  more, largest first (`notable`). The finding names them: 0002 is 19% above, and 0004, 0001 and 0003 are 15%, 13% and
  12% below.
- **Writer rules:**
  - Argue the need from `whyNeeded`.
  - Quote figures exactly, and don't add, rank or compare them.
  - A line is over its ceiling only when `overCeiling` is true.
  - Only listed late, returned or open items count against performance.
  - Name the `notable` lines.
- **Room on the row:**
  - The package is stored compact, without the clause text (the row has ClauseText).
  - The writer's summary is capped at 450 characters and the reason at 300; history keeps the last two decisions.
  - The forms cap the CO's reason and the RM's note.
  - The worst case with every field full is under 10,000 characters.
- 83 tests pass. The agent review gives 100, A+, and its eval cases expect the corrected readings.
- The run waiting on Nadia (a0147084) keeps its 1.4.0 draft; Dana corrects the three sentences in the form before
  signing. After the upgrade, its remaining robot steps run on the 1.4.1 robot, which reads the 1.4.0 package the
  same way.

**The Resource Manager sees her funds step (web 1.0.13, deployed 2026-10-28; the live bundle index-PoXY1XFz.js matches):** an option or extension
item belongs to the CO, so Nadia never saw it, and her funds task was only under My tasks. Now, while a package waits on
her certification (running, prepared, no funds yet), her action items show the item under Needs action, with Nadia on it
and the Certify funds button. It counts on her badge. She gets no "I'm on it", dismiss or reopen there: the item stays
the CO's (`waitingOnFunds` and `alertsFor` in award-workspace `lib/alerts.ts`). Checked in the preview as Nadia and as
Dana.

**First live run, end to end (2026-10-28):** instance a0147084 completed at 14:35 UTC.
- **Funds:** Nadia certified $289,999.99 for one month (O&M Army FY2027, PR 2938293); task #20781454.
- **Decision:** Dana signed the extension; task #20782303.
- **Filing:** IssueOptionExercise (job 9926bb85) filed P00012.pdf, P00012-Notice.pdf and P00012-Determination.pdf to
  SS-Records `W52P1J-22-R-0011/modifications/`. Modification P00012 is Issued and the notice is Delivered.
- **The record:**
  - Extension 1 runs Jan 1–31, 2027, with four obligations totalling $289,999.99.
  - PeriodEnd and the abstract move to Jan 31; the monthly report and the final evaluation move with them.
  - The clause row now covers Feb 1 to Jun 30, with the next notice due Dec 2. The item now reads "Further extension:
    decide by Dec 2" (Upcoming).
- **The signed determination kept the 1.4.0 writer's three slips** (need, ceiling, price; see above), because they
  weren't edited before signing. A signed record isn't rewritten. A clean demo run needs a fresh seed of the incumbent
  (`tools/generate_incumbent.py --reset`, then a seed; the user runs the reset), after which packages get the 1.4.1
  writer.
