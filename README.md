# Agentic Acquisition: Source Selection on UiPath

An end-to-end proposal evaluation workspace for public-sector buyers, built on the UiPath platform. One process
covers two procurement frameworks, chosen at sign-in:

- **Federal**: a FAR Part 15 best-value source selection (Contracting Officer, SSEB, Source Selection Authority,
  adjectival or DoD color ratings, Source Selection Decision Document).
- **State & Local**: a K-12 district RFP scored out of 100 points (Procurement Officer, evaluation committee,
  Award Authority, cost points by formula, Recommendation of Award for Board approval).

## How it works

A Maestro BPMN process runs five stages. Agents and robots do the reading and arithmetic, and people make every
decision in Action Center:

1. **Proposal intake**: robots ingest every proposal volume, extract price schedules and screen responsiveness
   and vendor responsibility (SAM/FAPIIS, or state vendor registration and debarment). The officer releases the
   proposals to the evaluators.
2. **Individual evaluation**: an evaluation agent drafts strengths, weaknesses and risks, each cited to a
   proposal page. Each evaluator accepts, edits or rejects the drafts and rates (or scores) their assigned factors
   independently.
3. **Consensus**: a consensus agent surfaces where evaluators disagree and proposes consensus language. The
   Chair sets the consensus ratings.
4. **Price / cost evaluation**: robots total each offer, compare it with the government or district estimate and
   flag unbalanced line items. The officer makes the determination.
5. **Award**: a decision-writer agent drafts the tradeoff analysis or recommendation from the record. The
   decision authority edits and signs it, and the award record (decision document, consensus report and audit
   trail) is filed as PDFs.

Every rating traces back through the evaluators and findings to the proposal page, and every action is in the
audit trail.

A setup wizard builds the evaluation plan from the solicitation documents. Agents read the cover page, the cost
estimate and the evaluation criteria (Section M, or a district's points table) and fill in the plan for the
officer to review.

## Repository

| Path | What it is |
|---|---|
| `ss-workspace/` | React + TypeScript coded web app: the workspace, setup wizard, evaluation pages and in-app task dialog |
| `ss-task-forms/` | Action Center coded action app: release, evaluation worksheet, consensus board, price/cost and award forms. Also hosts the shared terms, ratings and scoring logic |
| `SourceSelection/` | UiPath solution: the Maestro BPMN process, six low-code agents and the `SS_Robots` Python function (with tests) |
| `award-workspace/` | Award web app (contract award, notices, debriefings, protests): same sign-in, record and look as the workspace, which it imports from source (`@ss`) |
| `award-task-forms/` | Award action app: its forms run on the task host shared with `ss-task-forms` (`@forms/host`) |
| `Award/` | Award solution: the `AwardProcess` BPMN process and the `AW_Robots` Python function (with tests). Scope in `docs/design/award-phase-scope.md` |
| `tools/` | Data Fabric seeding, synthetic proposal and solicitation generators, and helper scripts |
| `evaluation-plans/`, `samples/` | Evaluation plans and ready-to-upload demo packages (federal VA and K-12 district) |
| `docs/design/` | Solution design documents |

## Built with

UiPath Maestro (BPMN), low-code agents, coded functions (Python), Action Center coded action apps, coded web apps,
Data Fabric, Orchestrator storage buckets, and the `@uipath/uipath-typescript` SDK.

## Demo data

All agencies, districts, offerors, people and contract numbers are fictional and synthetic. Every generated
document carries a "synthetic demo" banner.
