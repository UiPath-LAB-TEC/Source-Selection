import { useEffect, useState } from 'react'
import type { UiPath } from '@uipath/uipath-typescript/core'
import { ProcessInstances } from '@uipath/uipath-typescript/maestro-processes'
import type { ProcessInstanceExecutionHistoryResponse, ProcessInstanceGetResponse } from '@uipath/uipath-typescript/maestro-processes'
import { PROCESS_FOLDER } from './data'
import { solicitationSlots } from './roles'
import type { Solicitation } from './types'

/** The BPMN process the solution deploys (SourceSelection/SourceSelectionProcess). */
export const PROCESS_PACKAGE = 'SourceSelection.Agentic.SourceSelectionProcess'
const MAESTRO = 'https://cloud.uipath.com/uipathlabs/Playground/maestro_'
/** Why a recorded run can't be shown: the user has no role on the Orchestrator folder it runs in. */
export const NO_ACCESS = 'Your account has no access to the Source Selection folder in Orchestrator, where this run and its tasks live. Ask the demo owner to add you to it.'

export type TaskKind = 'robot' | 'agent' | 'human'
export interface LiveTask { id: string; name: string; kind: TaskKind; status: string; startedTime?: string; completedTime?: string }
export interface LiveStage { id: string; name: string; status: string; secondary: boolean; tasks: LiveTask[] }
/** One run of one BPMN element, from the instance's execution history. */
export interface ElementRun {
  elementId: string
  elementType: string
  name: string
  status: string
  startedTime?: string
  completedTime?: string
  incomingFlowIds: string[]
  /** The run's Action Center task or Orchestrator job. */
  link?: string
}
export interface LiveCase {
  instanceId: string
  folderKey: string
  status: string
  startedTime?: string
  completedTime?: string
  url: string
  stages: LiveStage[]
  /** SLA escalations that fired on the evaluation and consensus phases. */
  alerts: string[]
  runs: ElementRun[]
}

/** The process as designed. Names match the case plan; each task names its element in SourceSelectionProcess.bpmn. */
export const CASE_PLAN: { name: string; secondary?: boolean; tasks: [string, TaskKind, string][] }[] = [
  { name: 'Proposal Intake', tasks: [['Ingest Proposals', 'robot', 'Task_IngestProposals'], ['Compliance and Responsibility Screen', 'robot', 'Task_ScreenCompliance'], ['Release to Evaluation', 'human', 'Task_ReleaseToEvaluation']] },
  // Generate Draft Findings is an SS_Robots step, but its work is the evaluation agent's — show it as agent work.
  { name: 'Individual Evaluation', tasks: [['Generate Draft Findings', 'agent', 'Task_GenerateDraftFindings'], ['Evaluator 1 Review', 'human', 'Task_Evaluator1Review'], ['Evaluator 2 Review', 'human', 'Task_Evaluator2Review'], ['Evaluator 3 Review', 'human', 'Task_Evaluator3Review']] },
  { name: 'Consensus', tasks: [['Compile Individual Evaluations', 'robot', 'Task_CompileEvaluations'], ['Draft Consensus', 'agent', 'Task_DraftConsensus'], ['SSEB Chair Consensus', 'human', 'Task_SsebChairConsensus']] },
  { name: 'Price Evaluation', tasks: [['Analyze Price Proposals', 'robot', 'Task_AnalyzePrice'], ['Price Determination', 'human', 'Task_PriceDetermination']] },
  { name: 'Award Decision', tasks: [['Prepare Decision Package', 'robot', 'Task_PrepareDecisionPackage'], ['Draft Source Selection Decision', 'agent', 'Task_DraftSsdd'], ['SSA Award Decision', 'human', 'Task_SsaAwardDecision'], ['Publish Award Record', 'robot', 'Task_PublishAwardRecord']] },
  { name: 'Reconvene Evaluators', secondary: true, tasks: [['Evaluator Clarification', 'human', 'Task_EvaluatorClarification']] },
  { name: 'Solicitation Cancelled', secondary: true, tasks: [['Record Cancellation', 'robot', 'Task_RecordCancellation']] },
]

/** The evaluator slot a review task belongs to (Task_Evaluator2Review → 2); NaN for every other task. */
const reviewSlot = (elementId: string) => Number(/^Task_Evaluator(\d)Review$/.exec(elementId)?.[1] ?? NaN)

/**
 * CASE_PLAN for one solicitation: an evaluator's review row only when that evaluator is on the panel, or when the
 * instance ran that review anyway (1.2.0 instances opened all three).
 */
export function casePlanFor(slots: number[] | undefined, ran: (elementId: string) => boolean = () => false) {
  if (!slots) return CASE_PLAN
  return CASE_PLAN.map((s) => ({
    ...s,
    tasks: s.tasks.filter(([, , id]) => Number.isNaN(reviewSlot(id)) || slots.includes(reviewSlot(id)) || ran(id)),
  }))
}

/** The non-interrupting SLA timers' flag tasks, and what each means. */
const SLA_FLAGS: Record<string, string> = {
  Task_IndEvalAtRisk: 'Individual Evaluation SLA at risk',
  Task_IndEvalBreached: 'Individual Evaluation SLA breached',
  Task_ConsensusAtRisk: 'Consensus SLA at risk',
  Task_ConsensusBreached: 'Consensus SLA breached',
}

export function maestroUrl(i: Pick<ProcessInstanceGetResponse, 'processKey' | 'instanceId' | 'folderKey'>) {
  return `${MAESTRO}/processes/${i.processKey}/instances/${i.instanceId}?folderKey=${i.folderKey}`
}

/** The newest process instance for a solicitation: the recorded instance id first, then the solicitationId variable. */
async function findInstance(sdk: UiPath, sol: Solicitation): Promise<ProcessInstanceGetResponse | undefined> {
  const pi = new ProcessInstances(sdk)
  const all: ProcessInstanceGetResponse[] = []
  let page = await pi.getAll({ packageId: PROCESS_PACKAGE, pageSize: 50 })
  all.push(...page.items)
  while (page.hasNextPage && page.nextCursor && all.length < 200) {
    page = await pi.getAll({ packageId: PROCESS_PACKAGE, pageSize: 50, cursor: page.nextCursor })
    all.push(...page.items)
  }
  const newest = all.sort((a, b) => (b.startedTime ?? '').localeCompare(a.startedTime ?? ''))
  if (sol.CaseInstanceId) {
    const hit = newest.find((x) => x.instanceId === sol.CaseInstanceId)
    if (hit) return hit
    // The listing only covers folders the signed-in user can open: a recorded run missing from it is usually out of reach.
    const direct = await pi.getById(sol.CaseInstanceId, PROCESS_FOLDER.folderKey).catch(() => undefined)
    if (direct) return direct
    if (!newest.length) throw new Error(NO_ACCESS)
  }
  for (const x of newest.slice(0, 8)) {
    const vars = await pi.getVariables(x.instanceId, x.folderKey).catch(() => undefined)
    if (vars?.globalVariables.some((v) => v.name === 'solicitationId' && String(v.value) === sol.SolicitationId)) return x
  }
  return undefined
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** A history entry is a trace span; its Attributes JSON carries the element id, type, status and links. */
function toRun(h: ProcessInstanceExecutionHistoryResponse): ElementRun | undefined {
  let a: Record<string, unknown>
  try { a = h.attributes ? JSON.parse(h.attributes) : {} } catch { return undefined }
  const elementId = str(a.elementId)
  if (!elementId) return undefined
  return {
    elementId,
    elementType: str(a.elementType),
    name: h.name,
    status: str(a.status) || (h.endTime ? 'Completed' : 'InProgress'),
    startedTime: h.startedTime || undefined,
    completedTime: h.endTime || undefined,
    incomingFlowIds: Array.isArray(a.incomingFlowIds) ? a.incomingFlowIds.filter((f): f is string => typeof f === 'string') : [],
    link: str(a.actionCenterTaskLink) || str(a.orchestratorJobLink) || undefined,
  }
}

/** The execution history as element runs, oldest first. */
export function toRuns(history: ProcessInstanceExecutionHistoryResponse[]): ElementRun[] {
  return history.map(toRun).filter((r): r is ElementRun => !!r).sort((a, b) => (a.startedTime ?? '').localeCompare(b.startedTime ?? ''))
}

/** Each element's latest run: a reconvened consensus re-runs its tasks, and the newest run is the one that counts. */
export function latestRuns(runs: ElementRun[]) {
  const out = new Map<string, ElementRun>()
  for (const r of runs) {
    const prev = out.get(r.elementId)
    if (!prev || (r.startedTime ?? '') >= (prev.startedTime ?? '')) out.set(r.elementId, r)
  }
  return out
}

function stageStatus(tasks: LiveTask[]) {
  if (tasks.some((t) => /fault|fail|error/i.test(t.status))) return 'Faulted'
  if (tasks.length && tasks.every((t) => /complet/i.test(t.status))) return 'Completed'
  if (tasks.some((t) => /progress|complet/i.test(t.status))) return 'InProgress'
  return 'NotStarted'
}

/** The case plan's phases and task rows, filled from the BPMN element runs. Reviews outside the panel are left out. */
export function toStages(runs: ElementRun[], slots?: number[]): LiveStage[] {
  const last = latestRuns(runs)
  return casePlanFor(slots, (id) => last.has(id)).map((s) => {
    const tasks = s.tasks.map(([name, kind, elementId]) => {
      const r = last.get(elementId)
      return { id: elementId, name, kind, status: r?.status ?? 'NotStarted', startedTime: r?.startedTime, completedTime: r?.completedTime }
    })
    return { id: s.name, name: s.name, status: stageStatus(tasks), secondary: !!s.secondary, tasks }
  })
}

type Raw = Record<string, unknown>
const field = (o: Raw | undefined, ...keys: string[]) => { for (const k of keys) if (o && o[k] != null) return o[k]; return undefined }
const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

/**
 * Maestro's instance store (PIMS), read through the SDK's own authenticated request. ProcessInstances.getExecutionHistory
 * fetches these same element executions, then discards them for trace spans, which need the Traces.Api scope that the
 * shared OAuth app doesn't grant (401). The element executions need only PIMS.
 */
class InstanceStore extends ProcessInstances {
  async elementExecutions(instanceId: string, folderKey: string): Promise<Raw[]> {
    const res = await this.get<Raw>(`pims_/api/v1/instances/${instanceId}/element-executions`, { headers: { 'X-UIPATH-FolderKey': folderKey } })
    const list = field(res.data, 'elementExecutions', 'ElementExecutions')
    return Array.isArray(list) ? (list as Raw[]) : []
  }
}

/** Element runs from the instance store: one per element run, oldest first. */
async function pimsRuns(sdk: UiPath, inst: Pick<ProcessInstanceGetResponse, 'instanceId' | 'folderKey'>): Promise<ElementRun[]> {
  const out: ElementRun[] = []
  for (const e of await new InstanceStore(sdk).elementExecutions(inst.instanceId, inst.folderKey)) {
    const elementId = text(field(e, 'elementId', 'ElementId'))
    if (!elementId) continue
    const runs = field(e, 'elementRuns', 'ElementRuns')
    const each = (Array.isArray(runs) && runs.length ? runs : [e]) as Raw[]
    for (const r of each) {
      const flows = field(r, 'incomingFlowIds', 'IncomingFlowIds')
      out.push({
        elementId,
        elementType: text(field(e, 'elementType', 'ElementType')) ?? '',
        name: text(field(e, 'elementName', 'ElementName')) ?? elementId,
        status: text(field(r, 'status', 'Status')) ?? text(field(e, 'status', 'Status')) ?? 'InProgress',
        startedTime: text(field(r, 'startedTimeUtc', 'StartedTimeUtc', 'startedTime')),
        completedTime: text(field(r, 'completedTimeUtc', 'CompletedTimeUtc', 'completedTime')),
        incomingFlowIds: Array.isArray(flows) ? flows.filter((f): f is string => typeof f === 'string') : [],
        link: text(field(r, 'externalLink', 'ExternalLink')) ?? text(field(e, 'externalLink', 'ExternalLink')),
      })
    }
  }
  return out.sort((a, b) => (a.startedTime ?? '').localeCompare(b.startedTime ?? ''))
}

/** The instance's element runs: the instance store first, traces as the fallback. */
async function loadRuns(sdk: UiPath, inst: Pick<ProcessInstanceGetResponse, 'instanceId' | 'folderKey'>): Promise<ElementRun[]> {
  try {
    const runs = await pimsRuns(sdk, inst)
    if (runs.length) return runs
  } catch { /* fall through to traces */ }
  return toRuns(await new ProcessInstances(sdk).getExecutionHistory(inst.instanceId, inst.folderKey))
}

export async function loadLiveCase(sdk: UiPath, sol: Solicitation): Promise<LiveCase | undefined> {
  const inst = await findInstance(sdk, sol)
  if (!inst) return undefined
  const runs = await loadRuns(sdk, inst)
  const fired = new Set(runs.filter((r) => r.elementId in SLA_FLAGS).map((r) => r.elementId))
  return {
    instanceId: inst.instanceId,
    folderKey: inst.folderKey,
    status: inst.latestRunStatus,
    startedTime: inst.startedTime,
    completedTime: inst.completedTime || undefined,
    url: maestroUrl(inst),
    stages: toStages(runs, solicitationSlots(sol)),
    alerts: Object.keys(SLA_FLAGS).filter((id) => fired.has(id)).map((id) => SLA_FLAGS[id]),
    runs,
  }
}

export const RUNNING = new Set(['Running', 'Pending', 'Pausing', 'Resuming', 'Retrying', 'Upgrading', 'Canceling'])

/**
 * Live Maestro view of one solicitation's process instance; polls while it is running. The result is tagged with its
 * solicitation, so moving to another evaluation never shows the previous one's run. `settled` is true once the first
 * answer (an instance, none, or an error) is in, so a page can wait for it instead of filling in afterwards.
 */
export function useLiveCase(sdk: UiPath | undefined, sol: Solicitation | undefined, enabled: boolean) {
  const [state, setState] = useState<{ solId?: string; live?: LiveCase | null; error?: string }>({})
  const solId = sol?.SolicitationId
  const knownId = sol?.CaseInstanceId
  useEffect(() => {
    if (!enabled || !sdk || !sol) return
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const c = await loadLiveCase(sdk, sol)
        if (stop) return
        setState({ solId, live: c ?? null })
        if (c && RUNNING.has(c.status)) timer = setTimeout(tick, 15000)
      } catch (e) {
        if (!stop) setState((s) => ({ solId, live: s.solId === solId ? s.live : undefined, error: (e as Error).message }))
      }
    }
    void tick()
    return () => { stop = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sdk, solId, knownId])
  const mine = state.solId === solId
  const live = mine ? state.live : undefined
  const error = mine ? state.error : undefined
  const settled = !enabled || !sdk || !sol || live !== undefined || !!error
  return { live, error, running: !!live && RUNNING.has(live.status), settled }
}
