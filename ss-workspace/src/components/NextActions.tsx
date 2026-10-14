import { useEffect, useState } from 'react'
import { ArrowRight, Hourglass } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Tasks, TaskType } from '@uipath/uipath-typescript/tasks'
import type { TaskGetResponse } from '@uipath/uipath-typescript/tasks'
import { PersonaAvatar } from './Flair'
import { OpenTaskButton, TaskDialog } from './TaskDialog'
import { usePersona } from '../hooks/usePersona'
import { TASK_FOLDER_ID, useData } from '../lib/data'
import { when } from '../lib/eval'
import { CASE_PLAN, latestRuns } from '../lib/maestro'
import type { LiveCase } from '../lib/maestro'
import { taskTitle, titled, useTerms } from '@forms/lib/terms'
import { PERSONAS } from '../lib/types'
import type { Persona, PersonaId } from '../lib/types'

/** Who acts on each human step of SourceSelectionProcess. */
const OWNER: Record<string, PersonaId> = {
  Task_ReleaseToEvaluation: 'co', Task_PriceDetermination: 'co',
  Task_Evaluator1Review: 'evaluator1', Task_Evaluator2Review: 'evaluator2', Task_Evaluator3Review: 'evaluator3',
  Task_EvaluatorClarification: 'evaluator1', Task_SsebChairConsensus: 'chair', Task_SsaAwardDecision: 'ssa',
}
const STEP_NAME: Record<string, string> = Object.fromEntries(CASE_PLAN.flatMap((s) => s.tasks.map(([name, , id]) => [id, name])))

export interface WaitingStep { elementId: string; name: string; taskId: number }

/** The human steps Maestro is waiting on right now, each with the Action Center task its run opened. */
export function waitingSteps(live?: LiveCase | null): WaitingStep[] {
  if (!live) return []
  return [...latestRuns(live.runs).values()]
    .filter((r) => OWNER[r.elementId] && /progress|running|pending|waiting/i.test(r.status))
    .map((r) => ({ elementId: r.elementId, name: STEP_NAME[r.elementId] ?? r.name, taskId: Number(r.link?.match(/actions_\/tasks\/(\d+)/)?.[1] ?? NaN) }))
    .filter((s) => Number.isFinite(s.taskId))
}

// Tasks fetched by id (null when the fetch failed), shared so the evaluation page and the Maestro panel fetch each once.
const fetchedTasks = new Map<number, TaskGetResponse | null>()

/**
 * The waiting steps' tasks: from the loaded task list, or fetched, since Maestro can open one after the list was
 * loaded. `ready` once every step's task is known, so a page can wait for them instead of filling in afterwards.
 */
function useStepTasks(steps: WaitingStep[]) {
  const { sdk, tasks } = useData()
  const [, bump] = useState(0)
  const missing = steps.map((s) => s.taskId).filter((id) => !tasks.some((t) => t.id === id) && !fetchedTasks.has(id))
  const key = missing.join(',')
  useEffect(() => {
    if (!key) return
    let stop = false
    const ids = key.split(',').map(Number)
    void Promise.all(ids.map((id) => new Tasks(sdk).getById(id, { taskType: TaskType.App }, TASK_FOLDER_ID)
      .then((t) => { fetchedTasks.set(id, t) }, () => { fetchedTasks.set(id, null) })))
      .then(() => { if (!stop) bump((n) => n + 1) })
    return () => { stop = true }
  }, [sdk, key])
  const taskOf = (id: number) => tasks.find((t) => t.id === id) ?? fetchedTasks.get(id) ?? undefined
  return { taskOf, ready: !missing.length }
}

function useStepTask(taskId: number) {
  return useStepTasks([{ elementId: '', name: '', taskId }]).taskOf(taskId)
}

/**
 * Everything the evaluation page's waiting-on section needs, loaded up front: each step Maestro is waiting on, its
 * task and who owns it, minus tasks already completed (Maestro can lag a moment behind a submit).
 */
export function useNextActions(live?: LiveCase | null) {
  const steps = waitingSteps(live)
  const { taskOf, ready } = useStepTasks(steps)
  const rows = steps
    .map((step) => { const task = taskOf(step.taskId); return { step, task, owner: ownerOf(step, task) } })
    .filter((r) => !r.task?.isCompleted)
  return { rows, ready, live: !!live }
}
export type NextActionsData = ReturnType<typeof useNextActions>

function ownerOf(step: WaitingStep, task?: TaskGetResponse): Persona {
  // A clarification goes back to whichever evaluator the chair asked; its title names the slot.
  const slot = step.elementId === 'Task_EvaluatorClarification' ? /evaluator\s*(\d)\b/i.exec(task?.title ?? '')?.[1] : undefined
  const id: PersonaId = slot ? (`evaluator${slot}` as PersonaId) : OWNER[step.elementId]
  return PERSONAS.find((p) => p.id === id)!
}

/**
 * Act on a waiting step from the evaluation itself: its owner gets an Open task button; anyone else just sees who
 * it's waiting on, as in a real system. `compact` is the inline form used inside the Maestro panel.
 */
export function StepAction({ step, compact }: { step: WaitingStep; compact?: boolean }) {
  const { persona } = usePersona()
  const { reload } = useData()
  const task = useStepTask(step.taskId)
  const owner = ownerOf(step, task)
  const [open, setOpen] = useState(false)
  const mine = owner.id === persona.id
  if (!mine) return null
  if (compact) {
    if (!task) return null
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline">Open task<ArrowRight className="h-3 w-3" /></button>
        <TaskDialog task={task} open={open} onOpenChange={setOpen} onCompleted={() => { void reload() }} />
      </>
    )
  }
  return task ? <OpenTaskButton task={task} size="sm" label="Open task" /> : <Button size="sm" disabled>Loading…</Button>
}

/** What the open steps have in common, for the section's title, or a general title when they differ. */
const STEP_KIND: Record<string, string> = {
  Task_Evaluator1Review: 'Evaluations remaining', Task_Evaluator2Review: 'Evaluations remaining', Task_Evaluator3Review: 'Evaluations remaining',
  Task_EvaluatorClarification: 'Clarification requested', Task_ReleaseToEvaluation: 'Ready to release to the SSEB',
  Task_SsebChairConsensus: 'Consensus in progress', Task_PriceDetermination: 'Price reasonableness pending',
  Task_SsaAwardDecision: 'Award decision pending',
}
/** The same, in a District RFP's words. */
const SLED_STEP_KIND: Record<string, string> = {
  'Ready to release to the SSEB': 'Ready to release to the committee', 'Price reasonableness pending': 'Cost evaluation pending',
  'Award decision pending': 'Recommendation of award pending', 'Evaluations remaining': 'Scoring in progress',
}

function titleOf(rows: NextActionsData['rows'], panelSize: number, sled = false) {
  const kinds = new Set(rows.map((r) => STEP_KIND[r.step.elementId] ?? 'Waiting on the team'))
  const kind = kinds.size === 1 ? [...kinds][0] : 'Waiting on the team'
  const evaluating = kind === 'Evaluations remaining'
  const title = sled ? SLED_STEP_KIND[kind] ?? kind : kind
  const note = evaluating
    ? `${rows.length} of ${panelSize} evaluator${panelSize === 1 ? '' : 's'} still ${sled ? 'scoring' : 'evaluating'}`
    : rows.length === 1 ? `Waiting on ${rows[0].owner.name}` : `${rows.length} open tasks`
  return { title, note }
}

function StepRow({ row }: { row: NextActionsData['rows'][number] }) {
  const { persona } = usePersona()
  const t = useTerms()
  const { step, task, owner } = row
  const mine = owner.id === persona.id
  return (
    <li className={`flex items-center gap-3 rounded-xl border p-2.5 ${mine ? 'border-primary/60 bg-primary/5' : 'border-border'}`}>
      <PersonaAvatar id={owner.id} short={owner.short} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{owner.name}</span>
          {mine && <span className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">You</span>}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{titled(owner, t.id).label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{task?.title ? taskTitle(task.title, t.id) : step.name}{task?.createdTime ? ` · open since ${when(task.createdTime)}` : ''}</span>
      </span>
      <span className="shrink-0"><StepAction step={step} /></span>
    </li>
  )
}

/**
 * Top of an evaluation: every human step Maestro is waiting on, with a way to act on it without leaving the record.
 * The title says what kind of work is open (evaluations, consensus, the award decision…).
 */
export function NextActions({ next, panelSize }: { next: NextActionsData; panelSize: number }) {
  const t = useTerms()
  if (!next.rows.length) return null
  const { title, note } = titleOf(next.rows, panelSize, t.sled)
  return (
    <section className="ss-in rounded-2xl border border-border bg-card px-4 py-3" aria-label={title}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Hourglass className="h-3.5 w-3.5 text-primary" />{title}</h2>
        <span className="text-[11px] text-muted-foreground">{note}</span>
      </div>
      <ul className="grid gap-2 lg:grid-cols-2">{next.rows.map((r) => <StepRow key={r.step.elementId} row={r} />)}</ul>
    </section>
  )
}
