import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { UiPath } from '@uipath/uipath-typescript/core'
import { Entities } from '@uipath/uipath-typescript/entities'
import { Processes } from '@uipath/uipath-typescript/processes'
import { Tasks, TaskType } from '@uipath/uipath-typescript/tasks'
import type { TaskGetResponse } from '@uipath/uipath-typescript/tasks'
import type { Dataset, Plan, Solicitation } from './types'

/**
 * Buckets and the task-forms app live in the SourceSelection folder. Folders are referenced by key or id, never by path,
 * so they keep working when the folder is moved or renamed in Orchestrator.
 */
export const FOLDER = { folderKey: '08605f4c-2b90-4971-81b7-2f4310a2b81a' }
/**
 * The same folder's numeric id: every Action Center task the process raises lands here. Listing this one folder takes
 * under a second; listing across every folder in the shared Playground tenant took close to a minute.
 */
export const TASK_FOLDER_ID = 2212168
/** The solution deploy (Maestro process, agents, SS_Robots) lands in its own child folder, Solution2. */
export const PROCESS_FOLDER = { folderKey: '2459fe05-621d-4696-9c52-53458ca92c49' }
/** The Maestro BPMN process that runs the source selection end to end. */
export const CASE_PROCESS = 'SourceSelectionProcess'
/** Demo: every panel role is assigned to the signed-in demo user. */
export const DEMO_PANEL_EMAIL = 'anagh.bhave@uipath.com'
export const ACTION_CENTER = 'https://cloud.uipath.com/uipathlabs/Playground/actions_/tasks'

export const ENTITY = {
  solicitations: 'SSSolicitation', offerors: 'SSOfferor', pages: 'SSProposalPage', findings: 'SSFinding',
  ratings: 'SSRating', decisions: 'SSDecision', audit: 'SSAuditEvent',
} as const

/** Every list call returns one page — loop the cursor to get all rows. */
export async function all<T>(entities: Entities, name: string): Promise<T[]> {
  const out: T[] = []
  let page = await entities.getRecordsByName(name, { pageSize: 500 })
  out.push(...(page.items as T[]))
  while (page.hasNextPage && page.nextCursor) {
    page = await entities.getRecordsByName(name, { pageSize: 500, cursor: page.nextCursor })
    out.push(...(page.items as T[]))
  }
  return out
}

export async function loadDataset(sdk: UiPath): Promise<Dataset> {
  const e = new Entities(sdk)
  const keys = Object.keys(ENTITY) as (keyof typeof ENTITY)[]
  const results = await Promise.all(keys.map((k) => all(e, ENTITY[k])))
  return Object.fromEntries(keys.map((k, i) => [k, results[i]])) as unknown as Dataset
}

export function planOf(s: Solicitation): Plan {
  return JSON.parse(s.PlanJson) as Plan
}

async function listTasks(t: Tasks, folderId?: number): Promise<TaskGetResponse[]> {
  const out: TaskGetResponse[] = []
  let page = await t.getAll({ pageSize: 100, folderId })
  out.push(...page.items)
  while (page.hasNextPage && page.nextCursor) {
    page = await t.getAll({ pageSize: 100, folderId, cursor: page.nextCursor })
    out.push(...page.items)
  }
  return out
}

/** The source selection's Action Center tasks: from its own folder, or across every folder if that lookup fails. */
export async function loadTasks(sdk: UiPath): Promise<TaskGetResponse[]> {
  const t = new Tasks(sdk)
  const all = await listTasks(t, TASK_FOLDER_ID).catch(() => listTasks(t))
  return all.filter((x) => x.tags?.some((g) => g.name === 'source-selection'))
}

/**
 * Start the process for a plan. Only the evaluators on the plan's panel get an email: the process opens an Individual
 * Evaluation review for each evaluatorN that is set and skips the empty ones.
 */
/** What a task is about, which the task list leaves out: its solicitation and, for evaluators, the evaluator slot. */
interface TaskContext { solicitationId?: string; evaluatorSlot?: number; scheduleId?: string }
const TASK_CONTEXT = 'ss.taskctx'

/**
 * Give every task its solicitation (and evaluator slot) by reading each task once; a task never changes solicitation,
 * so the answer is cached in localStorage and later loads only read tasks they haven't seen.
 */
export async function withTaskContext(sdk: UiPath, tasks: TaskGetResponse[]): Promise<TaskGetResponse[]> {
  let cache: Record<string, TaskContext> = {}
  try { cache = JSON.parse(localStorage.getItem(TASK_CONTEXT) ?? '{}') } catch { /* start fresh */ }
  const api = new Tasks(sdk)
  const missing = tasks.filter((t) => !cache[t.id])
  for (let i = 0; i < missing.length; i += 6) {
    await Promise.all(missing.slice(i, i + 6).map(async (t) => {
      try {
        const d = ((await api.getById(t.id, { taskType: TaskType.App }, t.folderId ?? TASK_FOLDER_ID)).data ?? {}) as Record<string, unknown>
        cache[t.id] = {
          ...(typeof d.solicitationId === 'string' && d.solicitationId ? { solicitationId: d.solicitationId } : {}),
          ...(typeof d.evaluatorSlot === 'number' ? { evaluatorSlot: d.evaluatorSlot } : {}),
          // Contract Management: the schedule row a task is about (a deliverable under review).
          ...(typeof d.scheduleId === 'string' && d.scheduleId ? { scheduleId: d.scheduleId } : {}),
        }
      } catch { /* unreadable now; try again on the next load */ }
    }))
  }
  try { localStorage.setItem(TASK_CONTEXT, JSON.stringify(cache)) } catch { /* cache is a convenience */ }
  return tasks.map((t) => (cache[t.id] ? { ...t, data: { ...((t.data as Record<string, unknown> | null) ?? {}), ...cache[t.id] } } : t))
}

/** The solicitation a task belongs to, once its context is known. */
export const taskSolicitation = (t: TaskGetResponse, sols: Solicitation[] | undefined) => {
  const id = (t.data as Record<string, unknown> | null | undefined)?.solicitationId
  return typeof id === 'string' ? sols?.find((s) => s.SolicitationId === id) : undefined
}

export async function startCase(sdk: UiPath, plan: Plan, panelEmail: string) {
  const { solicitationId } = plan
  const slots = plan.panel.evaluators.map((e) => e.slot)
  // The reconvene clarification goes to Evaluator 1, so the panel must include slot 1.
  if (!slots.includes(1)) throw new Error(`${solicitationId} has no Evaluator 1 on its evaluation board. Edit the board so Evaluator 1 rates at least one factor.`)
  const evaluator = (n: number) => (slots.includes(n) ? panelEmail : '')
  const args = {
    solicitationId,
    evaluator1: evaluator(1), evaluator2: evaluator(2), evaluator3: evaluator(3),
    ssebChair: panelEmail, contractingOfficer: panelEmail, sourceSelectionAuthority: panelEmail,
  }
  const started = await new Processes(sdk).start({ name: CASE_PROCESS }, { ...PROCESS_FOLDER, inputArguments: JSON.stringify(args) })
  // A Maestro process job's key is its instance id — record it so the workspace finds the live instance directly.
  const key = started[0]?.key
  if (key) {
    const sols = await all<Solicitation>(new Entities(sdk), ENTITY.solicitations).catch(() => [])
    const row = sols.find((s) => s.SolicitationId === solicitationId)
    if (row) await new Entities(sdk).updateRecord({ name: ENTITY.solicitations }, row.Id, { CaseInstanceId: key }).catch(() => undefined)
  }
  return started
}

interface Ctx {
  sdk: UiPath
  /** Dev-only snapshot mode: no sign-in, writes stay in memory. */
  preview: boolean
  /** Preview mode: merge a solicitation into the in-memory dataset. */
  putLocal: (s: Solicitation) => void
  data?: Dataset
  tasks: TaskGetResponse[]
  error?: string
  loading: boolean
  reload: () => Promise<void>
}

const DataCtx = createContext<Ctx | undefined>(undefined)

export function DataProvider({ sdk, children, preview }: { sdk: UiPath; children: ReactNode; preview?: boolean }) {
  const [data, setData] = useState<Dataset>()
  const [tasks, setTasks] = useState<TaskGetResponse[]>([])
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      // Dev-only preview: render on the exported Data Fabric snapshot, no sign-in.
      const [d, t] = preview && import.meta.env.DEV
        ? [(await import('../dev/snapshot.json')).default as unknown as Dataset, []]
        : await Promise.all([loadDataset(sdk), loadTasks(sdk).catch(() => [])])
      setData(d)
      setTasks(t)
      setError(undefined)
      // Labels each task with its evaluation; cached, so this only reads tasks the browser hasn't seen before.
      if (t.length) void withTaskContext(sdk, t).then(setTasks, () => undefined)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [sdk, preview])

  useEffect(() => { reload() }, [reload])

  const putLocal = useCallback((s: Solicitation) => setData((d) => d && {
    ...d, solicitations: [...d.solicitations.filter((x) => x.SolicitationId !== s.SolicitationId), s],
  }), [])

  return <DataCtx.Provider value={{ sdk, preview: !!preview && import.meta.env.DEV, putLocal, data, tasks, error, loading, reload }}>{children}</DataCtx.Provider>
}

export function useData() {
  const c = useContext(DataCtx)
  if (!c) throw new Error('useData must be used within DataProvider')
  return c
}
