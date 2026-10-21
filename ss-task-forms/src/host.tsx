import { Component, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, FlaskConical, History, Moon, RotateCcw, Sun } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Spinner } from '@uipath/apollo-wind/components/ui/spinner'
import { CodedActionAppService } from '@uipath/coded-action-app'
import { createBackend, inActionCenter } from './lib/backend'
import type { Backend, EntityKey, LoadedTask, PreviewBackend, PreviewOptions, TaskData } from './lib/backend'
import { RATING_METHODS } from './lib/ratings'
import type { Dataset, Plan } from './lib/types'
import { FormProvider } from './forms/common'

/**
 * The host every action app in the system shares: Action Center handshake, loading the record, error screens, and
 * the local preview harness. Each app passes its own forms (by actionType) and its own preview snapshot.
 */
export type FormMap = Record<string, { label: string; render: () => ReactNode }>
type Snapshot = Record<EntityKey, Record<string, unknown>[]>
/** Which form and solicitation the local preview opens on, and the form the simulated Action Center task uses. */
export interface HostDefaults { form: string; solicitationId: string; simulatedForm: string }

function setDark(on: boolean) {
  document.documentElement.classList.toggle('dark', on)
  document.documentElement.classList.toggle('light', !on)
}

/** Never a blank frame: a render error in a form shows what failed and a way back. */
class FormBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error('[ss-task-forms] form failed to render', error) }
  render() {
    if (!this.state.error) return this.props.children
    return <Problem message={`This form failed to render: ${this.state.error.message}`} onRetry={() => { this.setState({ error: undefined }); this.props.onRetry() }} />
  }
}

function Problem({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-md space-y-3 rounded-2xl border border-border bg-card p-5 text-sm">
        <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-[var(--ss-critical)]" />Could not open this task</p>
        <p className="text-muted-foreground">{message}</p>
        <Button size="sm" onClick={onRetry}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Try again</Button>
      </div>
    </div>
  )
}

function TaskHost({ backend, forms }: { backend: Backend; forms: FormMap }) {
  const [task, setTask] = useState<LoadedTask>()
  const [data, setData] = useState<Dataset>()
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState('Connecting to Action Center…')
  const [attempt, setAttempt] = useState(0)

  const reload = useCallback(async () => setAttempt((n) => n + 1), [])
  useEffect(() => {
    let live = true
    const say = (m: string) => { if (live) setStatus(m) }
    ;(async () => {
      try {
        setError(undefined); setTask(undefined); setData(undefined)
        say(backend.mode === 'action-center' ? 'Connecting to Action Center…' : 'Opening the task…')
        const t = await backend.getTask(say)
        if (!live) return
        if (backend.mode === 'action-center') setDark(t.dark)
        setTask(t)
        say('Loading the evaluation record…')
        const d = await backend.load(t.data.solicitationId, say)
        if (live) setData(d)
      } catch (e) { if (live) setError((e as Error).message) }
    })()
    return () => { live = false }
  }, [backend, attempt])

  const update = useCallback((patch: Partial<TaskData>) => {
    setTask((t) => {
      if (!t) return t
      const next = { ...t, data: { ...t.data, ...patch } }
      backend.setTaskData(next.data)
      return next
    })
  }, [backend])

  if (error) return <Problem message={error} onRetry={reload} />
  if (!task || !data) return <div className="flex min-h-screen items-center justify-center bg-background text-foreground"><Spinner label={status} showLabel /></div>
  const sol = data.solicitations[0]
  if (!sol) return <Problem message={task.data.solicitationId ? `Solicitation ${task.data.solicitationId} was not found in Data Fabric.` : 'The task arrived without a solicitation number.'} onRetry={reload} />
  let plan: Plan
  try { plan = JSON.parse(sol.PlanJson) as Plan } catch { return <Problem message={`The evaluation plan for ${sol.SolicitationId} could not be read.`} onRetry={reload} /> }
  const form = forms[task.data.actionType]
  return (
    <FormProvider value={{ backend, task, data, sol, plan, update, reload }}>
      <FormBoundary onRetry={reload}>
        {form ? form.render() : <Problem message={`Unknown task type “${task.data.actionType ?? ''}”.`} onRetry={reload} />}
      </FormBoundary>
    </FormProvider>
  )
}

/** Local-only harness: pick a form and persona, render it over a Data Fabric snapshot. */
function PreviewHarness({ snapshot, forms, defaults }: { snapshot: Snapshot; forms: FormMap; defaults: HostDefaults }) {
  const sols = snapshot.solicitations.map((s) => s.SolicitationId as string)
  const [opts, setOpts] = useState<PreviewOptions>(() => {
    const q = new URLSearchParams(location.search)
    return { actionType: q.get('form') ?? defaults.form, solicitationId: q.get('sol') ?? defaults.solicitationId, slot: Number(q.get('slot') ?? 1), fresh: q.get('fresh') !== '0', method: q.get('method') ?? '', absence: q.get('absence') === '1' }
  })
  const [dark, setDarkState] = useState(() => new URLSearchParams(location.search).get('theme') !== 'light')
  const [run, setRun] = useState(0)
  const [, tick] = useState(0)
  const [showLog, setShowLog] = useState(false)
  const backend = useMemo(() => {
    const b = createBackend(snapshot, opts) as PreviewBackend
    b.onChange = () => tick((n) => n + 1)
    return b
  }, [snapshot, opts, run])

  useEffect(() => { setDark(dark) }, [dark, backend])
  useEffect(() => {
    const q = new URLSearchParams({ form: opts.actionType, sol: opts.solicitationId, slot: String(opts.slot), fresh: opts.fresh ? '1' : '0', ...(opts.method ? { method: opts.method } : {}), ...(opts.absence ? { absence: '1' } : {}) })
    history.replaceState(null, '', `?${q}`)
  }, [opts])

  const sel = 'rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-white outline-none [&>option]:text-black'
  return (
    <>
      <div className="sticky top-0 z-50 flex flex-wrap items-center gap-2 bg-[#0b1220] px-3 py-2 text-xs text-white">
        <span className="flex items-center gap-1.5 font-semibold text-amber-300"><FlaskConical className="h-3.5 w-3.5" />Local preview</span>
        <span className="hidden text-white/60 md:inline">Not Action Center — writes stay in memory</span>
        <select className={sel} value={opts.actionType} onChange={(e) => setOpts({ ...opts, actionType: e.target.value })}>
          {Object.entries(forms).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
        </select>
        <select className={sel} value={opts.solicitationId} onChange={(e) => setOpts({ ...opts, solicitationId: e.target.value })}>
          {sols.map((s) => <option key={s}>{s}</option>)}
        </select>
        {(opts.actionType === 'individualEvaluation' || opts.actionType === 'clarification') && (
          <select className={sel} value={opts.slot} onChange={(e) => setOpts({ ...opts, slot: Number(e.target.value) })}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>Evaluator {n}</option>)}
          </select>
        )}
        <select className={sel} value={opts.method} onChange={(e) => setOpts({ ...opts, method: e.target.value })} aria-label="Rating display">
          <option value="">Plan's rating method</option>
          {RATING_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label} ratings</option>)}
        </select>
        <label className="flex items-center gap-1"><input type="checkbox" checked={opts.fresh} onChange={(e) => setOpts({ ...opts, fresh: e.target.checked })} />Start fresh</label>
        <button className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10" onClick={() => setRun((n) => n + 1)}><RotateCcw className="h-3.5 w-3.5" />Reset</button>
        <button className="rounded-md p-1 hover:bg-white/10" onClick={() => setDarkState(!dark)} aria-label="Toggle theme">{dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}</button>
        <button className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10" onClick={() => setShowLog(!showLog)}>
          <History className="h-3.5 w-3.5" />Activity ({backend.log.length})
        </button>
      </div>
      {showLog && (
        <div className="fixed right-3 top-12 z-50 max-h-[60vh] w-80 overflow-y-auto rounded-xl border border-border bg-card p-3 text-xs shadow-xl">
          {backend.log.length ? backend.log.map((l, i) => <div key={i} className="border-b border-border py-1.5 last:border-0"><span className="text-muted-foreground">{l.at}</span> — {l.what}</div>)
            : <p className="text-muted-foreground">Nothing saved yet. Complete the form to see the writes it would make.</p>}
        </div>
      )}
      <TaskHost key={`${run}-${JSON.stringify(opts)}`} backend={backend} forms={forms} />
    </>
  )
}

/** Dev only: inside src/dev/ac-host.html, take the task over the real Action Center handshake and serve data from the snapshot. */
function SimulatedTask({ snapshot, forms, defaults }: { snapshot: Snapshot; forms: FormMap; defaults: HostDefaults }) {
  const backend = useMemo(() => {
    const q = new URLSearchParams(location.search)
    const b = createBackend(snapshot, { actionType: q.get('form') ?? defaults.simulatedForm, solicitationId: q.get('sol') ?? defaults.solicitationId, slot: 1, fresh: true }) as PreviewBackend
    b.handshake = new CodedActionAppService()
    return b
  }, [snapshot, defaults])
  return <TaskHost backend={backend} forms={forms} />
}

/** An action app: its forms, the snapshot its local preview renders on (dev only), and where that preview opens. */
export function TaskApp({ forms, loadSnapshot, defaults }: { forms: FormMap; loadSnapshot: () => Promise<{ default: unknown }>; defaults: HostDefaults }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const simulated = import.meta.env.DEV && inActionCenter() && new URLSearchParams(location.search).has('acsim')
  const preview = import.meta.env.DEV && (!inActionCenter() || simulated)
  // One backend for the app's lifetime, so a re-render never re-runs the Action Center handshake.
  const [backend] = useState(() => (preview ? null : createBackend(null, null)))
  useEffect(() => {
    if (preview) loadSnapshot().then((m) => setSnapshot(m.default as Snapshot))
  }, [preview, loadSnapshot])
  if (simulated) return snapshot ? <SimulatedTask snapshot={snapshot} forms={forms} defaults={defaults} /> : null
  if (preview) return snapshot ? <PreviewHarness snapshot={snapshot} forms={forms} defaults={defaults} /> : null
  return <FormBoundary onRetry={() => location.reload()}><TaskHost backend={backend!} forms={forms} /></FormBoundary>
}
