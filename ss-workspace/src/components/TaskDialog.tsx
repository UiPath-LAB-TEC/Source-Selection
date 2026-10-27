import { Component, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, ExternalLink, RotateCcw, SquareArrowOutUpRight } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@uipath/apollo-wind/components/ui/dialog'
import { Spinner } from '@uipath/apollo-wind/components/ui/spinner'
import type { TaskGetResponse } from '@uipath/uipath-typescript/tasks'
import { FormProvider } from '@forms/forms/common'
import { EvaluationWorksheet } from '@forms/forms/EvaluationWorksheet'
import { ConsensusBoard } from '@forms/forms/ConsensusBoard'
import { AwardDecision, ClarificationForm, PriceForm, ReleaseForm } from '@forms/forms/OfficialForms'
import type { LoadedTask, TaskData } from '@forms/lib/backend'
import type { Dataset, Plan } from '@forms/lib/types'
import { useAuth } from '../hooks/useAuth'
import { usePersona } from '../hooks/usePersona'
import { ACTION_CENTER, taskSolicitation, useData } from '../lib/data'
import { when } from '../lib/eval'
import { isClosed } from '../lib/roles'
import type { Solicitation } from '../lib/types'
import { WorkspaceBackend } from '../lib/taskBackend'
import { taskTitle, useTerms } from '@forms/lib/terms'

/** A form for each task actionType. */
export type TaskForms = Record<string, () => ReactNode>

/** The same forms Action Center renders, keyed by the task's actionType. */
const FORMS: TaskForms = {
  releaseToEvaluation: () => <ReleaseForm />,
  individualEvaluation: () => <EvaluationWorksheet />,
  consensus: () => <ConsensusBoard />,
  priceDetermination: () => <PriceForm />,
  awardDecision: () => <AwardDecision />,
  clarification: () => <ClarificationForm />,
}

class FormBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return <Problem message={`This form failed to render: ${this.state.error.message}`} onRetry={() => { this.setState({ error: undefined }); this.props.onRetry() }} />
  }
}

function Problem({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md space-y-3 rounded-2xl border border-border bg-card p-5 text-sm">
        <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-[var(--ss-critical)]" />Could not open this task</p>
        <p className="text-muted-foreground">{message}</p>
        <Button size="sm" onClick={onRetry}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Try again</Button>
      </div>
    </div>
  )
}

/** Loads the task and its record, then renders the matching form. */
function TaskForm({ backend, forms }: { backend: WorkspaceBackend; forms: TaskForms }) {
  const [task, setTask] = useState<LoadedTask>()
  const [data, setData] = useState<Dataset>()
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState('Opening the task…')
  const [attempt, setAttempt] = useState(0)
  const reload = useCallback(async () => setAttempt((n) => n + 1), [])

  useEffect(() => {
    let live = true
    const say = (m: string) => { if (live) setStatus(m) }
    ;(async () => {
      try {
        setError(undefined); setTask(undefined); setData(undefined)
        const t = await backend.getTask(say)
        if (!live) return
        setTask(t)
        const d = await backend.load(t.data.solicitationId, say)
        if (live) setData(d)
      } catch (e) { if (live) setError((e as Error).message) }
    })()
    return () => { live = false }
  }, [backend, attempt])

  const update = useCallback((patch: Partial<TaskData>) => setTask((t) => (t ? { ...t, data: { ...t.data, ...patch } } : t)), [])

  if (error) return <Problem message={error} onRetry={reload} />
  if (!task || !data) return <div className="flex h-full items-center justify-center"><Spinner label={status} showLabel /></div>
  const sol = data.solicitations[0]
  if (!sol) return <Problem message={`Solicitation ${task.data.solicitationId || '(none)'} was not found in Data Fabric.`} onRetry={reload} />
  let plan: Plan
  try { plan = JSON.parse(sol.PlanJson) as Plan } catch { return <Problem message={`The evaluation plan for ${sol.SolicitationId} could not be read.`} onRetry={reload} /> }
  const render = forms[task.data.actionType]
  if (!render) return <Problem message={`This task has no form for "${task.data.actionType || 'unknown'}".`} onRetry={reload} />
  return (
    <FormBoundary onRetry={reload}>
      <FormProvider value={{ backend, task, data, sol, plan, update, reload }}>{render()}</FormProvider>
    </FormBoundary>
  )
}

/** Source Selection's task dialog: its own forms, acting as the persona in use. */
export function TaskDialog(props: { task: TaskGetResponse; open: boolean; onOpenChange: (open: boolean) => void; onCompleted?: () => void }) {
  const { persona } = usePersona()
  return <TaskDialogView {...props} forms={FORMS} actor={persona.name} />
}

/**
 * An Action Center task opened inside an app: the real form, submitted straight to Action Center, so the user never
 * leaves the page. Action Center stays one click away for anything the dialog doesn't cover. Every app in the system
 * uses this view with its own forms (Contract Management passes the Award forms).
 */
export function TaskDialogView({ task, open, onOpenChange, onCompleted, forms, actor, record }: {
  task: TaskGetResponse; open: boolean; onOpenChange: (open: boolean) => void; onCompleted?: () => void; forms: TaskForms; actor: string
  /** What the loading screen calls the record; Source Selection's "evaluation record" by default. */
  record?: string
}) {
  const { sdk } = useAuth()
  const t = useTerms()
  const backend = useMemo(
    () => new WorkspaceBackend(sdk, task.id, task.folderId, actor, () => { onOpenChange(false); onCompleted?.() }, record),
    // A fresh backend per open, so a reopened task reloads from Action Center.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sdk, task.id, task.folderId, actor, record, open],
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[95vh] w-[98vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5 pr-12">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold">{taskTitle(task.title, t.id)}</DialogTitle>
            <DialogDescription className="truncate text-xs">Task #{task.id} · completes in Action Center when you submit</DialogDescription>
          </div>
          <Button size="sm" variant="outline" asChild>
            <a href={`${ACTION_CENTER}/${task.id}`} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open in Action Center</a>
          </Button>
        </div>
        <div className="ss-embed min-h-0 flex-1 overflow-y-auto">
          {open && <TaskForm key={`${task.id}-${String(open)}`} backend={backend} forms={forms} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** "Open" for a task: opens it in the in-app dialog and refreshes the workspace once it is submitted. */
export function OpenTaskButton({ task, label, size, variant }: {
  task: TaskGetResponse; label?: string; size?: 'sm' | 'default'; variant?: 'default' | 'outline'
}) {
  const { reload } = useData()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size={size} variant={variant ?? (task.isCompleted ? 'outline' : 'default')} onClick={() => setOpen(true)}>
        {label ?? (task.isCompleted ? 'View' : 'Open')}<SquareArrowOutUpRight className="ml-1.5 h-3.5 w-3.5" />
      </Button>
      <TaskDialog task={task} open={open} onOpenChange={setOpen} onCompleted={() => { void reload() }} />
    </>
  )
}

/** Which evaluation a task belongs to (title and solicitation number), then when it was created. */
export function TaskContextLine({ task, done }: { task: TaskGetResponse; done?: boolean }) {
  const { data } = useData()
  const sol = taskSolicitation(task, data?.solicitations)
  const id = (task.data as Record<string, unknown> | null | undefined)?.solicitationId
  return (
    <span className="block truncate text-xs text-muted-foreground">
      {sol ? <><span className="font-medium text-foreground/80">{sol.Title}</span> · {sol.SolicitationId}</> : typeof id === 'string' ? id : 'Finding its evaluation…'}
      {' '}· {done && task.completedTime ? `completed ${when(task.completedTime)}` : `created ${when(task.createdTime)}`}
    </span>
  )
}

/** The Maestro run that created a task: its source metadata names the instance (the API also sends the job key). */
export function taskRun(task: TaskGetResponse): string | undefined {
  const src = task.taskSource as (TaskGetResponse['taskSource'] & { jobId?: string }) | null | undefined
  const meta = src?.taskSourceMetadata ?? {}
  const v = meta.InstanceId ?? meta.instanceId ?? src?.jobId ?? (task as unknown as { creatorJobKey?: string }).creatorJobKey
  return typeof v === 'string' && v ? v : undefined
}

/**
 * Open tasks still worth doing. Not one left behind by an awarded or cancelled evaluation, by a deleted one (its
 * solicitation is gone), or by an earlier run of a reused solicitation number (made by a run other than the current one).
 */
export const stillOpen = (task: TaskGetResponse, sols: Solicitation[] | undefined) => {
  if (task.isCompleted) return false
  const id = (task.data as Record<string, unknown> | null | undefined)?.solicitationId
  const sol = taskSolicitation(task, sols)
  if (typeof id === 'string' && sols && !sol) return false
  const run = taskRun(task)
  if (sol?.CaseInstanceId && run && run !== sol.CaseInstanceId) return false
  return !sol || !isClosed(sol)
}
