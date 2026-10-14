# Build Issues — SourceSelection

**Case file:** SourceSelection/SourceSelection/caseplan.json | **Build started:** 2026-10-12

<!--build-issues:summary:start-->
| Category | Errors | Warnings | Skipped |
|---|---|---|---|
| bindings | 0 | 2 | 0 |
| io-binding | 0 | 2 | 0 |
| action | 0 | 1 | 0 |
| recipients | 0 | 1 | 0 |
| **Total** | **0** | **6** | **0** |

Closing validate: `uip maestro case validate caseplan.json --strict --sdd ../../docs/design/source-selection-sdd.md` returned **Valid**, profile **strict**, with 0 errors and 97 `STRICT_INPUT_UNBOUND` warnings. All 97 are the deliberate `""` slots described in the io-binding rows below.

Re-validate after the 1.1.2 fixes (2026-10-12): **Valid**, profile **strict**, 0 errors, 98 `STRICT_INPUT_UNBOUND` warnings. The extra warning is Publish Award Record's `ssddText`, now a deliberate `""` (see the run rows below).
<!--build-issues:summary:end-->

## Journal

Appended at each section boundary as the build proceeds. Chronological, not grouped.

| Sev | Step | Plugin | Message |
|---|---|---|---|
| WARNING | 9 | bindings | The case registry does not index Function processes, so SS_Robots could not be resolved as a tenant resource. All 9 robot tasks bind to it as an in-solution sibling (`solution_folder.SS_Robots`). The tasks resolve only when the case deploys inside the SourceSelection solution. |
| WARNING | 9 | bindings | The four agents (SS_EvaluationAssistant, SS_ConsensusAnalyst, SS_DecisionWriter, and SS_SectionMAnalyst, which the web app calls) also bind as in-solution siblings rather than the tenant copies from the v1.0.0 deploy. That way a solution upgrade moves the agents and the case together. |
| WARNING | 9.8 | io-binding | SS_Robots has one entry point, `run`, that dispatches on `step`. Every robot task sends the full RobotInput contract (9 fields) and leaves the fields its step does not read as `""`. Those empty slots produce most of the `STRICT_INPUT_UNBOUND` warnings and are intended. |
| WARNING | 9.8 | io-binding | Every human task uses the one generic action-schema contract (inputs actionType…chairQuestions; outputs decision/notes/payload/awardee). Inputs a form does not use are `""`. The `actionType` value picks which form ss-task-forms renders. |
| WARNING | 9 | action | The `hitlTask` body was left out of the action-task outputs. The output is still declared as `jsonSchema` but has no inline body. The platform fills in the task envelope at runtime. |
| WARNING | 1 | recipients | A user-directory search for recipients returned nothing (the deployer's platform-observed user id `0495433d-7446-45c4-b224-03c58e2cdf1b` is recorded in recipients-resolved.json). Every action task is assigned through `{Type: 3, Value: "=vars.<role>"}`, and the `evaluator*`, `ssebChair`, `contractingOfficer` and `sourceSelectionAuthority` In-args default to the demo user's email. The web app passes these emails at case start, and the intake wizard's panel assignments can override them. |
| WARNING | 9.8 | io-binding | Task input values were bound when each task was written, rather than in a separate Phase 3 pass. Cross-task references use `=vars.<outputId>`, and the reassigned outputs (e.g. `content8` → `cancellationRecordUri`) carry `originalVar`. |
| ERROR | run | ss-robots | Live run 1 (instance ca5d759b, v1.1.0): Generate Draft Findings could not start SS_EvaluationAssistant. StartJobs returned 404 "process could not be found" because Function jobs get UIPATH_FOLDER_KEY but no UIPATH_FOLDER_PATH, so the robot fell back to the parent SourceSelection folder. Fixed in 1.1.1: `repo.run_folder()` prefers the job's folder key and otherwise falls back to SourceSelection/Solution. Instance cancelled and the run restarted. |
| WARNING | run | case | A robot step that returns `error_type` still completes its case task, so the case moves on without draft findings. **Resolved in 1.1.2** (SE-04 below). |
| FIXED | 1.1.2 | ss-robots | SE-04: `main.run` raises `StepFailed` whenever a step returns `error_type`, so the job faults and Maestro opens an incident that can be retried. This applies to all eight steps. Each step's output feeds the next task (complianceSummary to the CO release form, evaluationSet to the consensus analyst, priceAnalysis and consensusRecord to the decision writer) or is the official record (ingest rows, award record, cancellation memo), and each step is idempotent (BR-06), so a retry is safe. GenerateDraftFindings faults with `AgentRunsFailed` when no SS_EvaluationAssistant run succeeds, and writes nothing so the retry starts clean. It also faults when an agent cannot be started, as in run 1. A partial drafting failure is still returned, not raised: placeholders are written (BE-03), `error_type` is `DraftsUnavailable`, and the case continues. An unknown `step` also faults. Not verified live: that Maestro shows the faulted rpa task as a retryable incident. |
| FIXED | 1.1.2 | io-binding | SSDD size. In run 75b248fd, SS_DecisionWriter drafted an 18,456-character SSDD. SSDecision.DocumentText caps at 10,000 characters and job InputArguments at about 10k, and the SSA had to trim the draft to sign. (a) `tools/build_agents.py` now tells the decision writer to keep the SSDD under 8,000 characters and to incorporate the SSEB Consensus Report by reference rather than repeat factor-level findings; SS_DecisionWriter was regenerated, then `uip agent refresh` and `validate` returned Valid. (b) Publish Award Record (tPa4kS9dE) passes `ssddText` `""`, so the robot reads the signed SSDD from SSDecision.DocumentText, which the SSA form writes when it signs. The case SDD Task 5.4 Inputs row was updated to match (SDD v1.2). (c) Tests in `SS_Robots/tests/test_steps.py`. Still open: a length guard in the SSA form (ss-task-forms). |
| FIXED | 1.1.2 | ss-robots | BR-02. GenerateDraftFindings drafted only `ComplianceStatus == "Compliant"`, so NorthBridge ("Responsibility concern", SAM registration expired) got no agent drafts. Responsibility (FAR Part 9) is decided separately from the technical evaluation, so responsibility-concern offerors are now drafted. Non-compliant offerors stay excluded unless the CO includes them at release. Offerors with an active SAM exclusion also stay excluded, because FAR 9.405(d)(4) bars evaluating their offers; no synthetic offeror has an exclusion. ss-robots-sdd.md BR-02 was updated (v1.2). |
