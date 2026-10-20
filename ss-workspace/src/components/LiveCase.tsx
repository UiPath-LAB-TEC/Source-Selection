import { useState } from 'react'
import { AlarmClock, Bot, Check, CircleDashed, Loader2, Network, Sparkles, TriangleAlert, UserRound, Workflow } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import MaestroDialog from './MaestroDialog'
import { StepAction, waitingSteps } from './NextActions'
import type { WaitingStep } from './NextActions'
import { CASE_PLAN, NO_ACCESS, casePlanFor } from '../lib/maestro'
import { useData } from '../lib/data'
import type { LiveCase, LiveStage, LiveTask, TaskKind } from '../lib/maestro'
import { stageIndex } from '../lib/eval'
import { solicitationSlots } from '../lib/roles'
import { stageName, useTerms } from '@forms/lib/terms'
import type { Solicitation } from '../lib/types'

type Phase = 'done' | 'active' | 'faulted' | 'idle'
const phase = (status: string): Phase =>
  /fault|fail|error/i.test(status) ? 'faulted' : /complet/i.test(status) ? 'done' : /progress|running|pending|active|waiting/i.test(status) ? 'active' : 'idle'

const KIND_ICON: Record<TaskKind, typeof Bot> = { robot: Bot, agent: Sparkles, human: UserRound }
const KIND_LABEL: Record<TaskKind, string> = { robot: 'Robot', agent: 'Agent', human: 'Person' }

/** Before the process runs (or in preview), the plan as designed, with progress taken from the solicitation's stage. */
export function designedCase(sol: Solicitation): LiveStage[] {
  const at = sol.Status === 'Proposals Received' ? -1 : stageIndex(sol)
  return casePlanFor(solicitationSlots(sol)).map((s, i) => {
    const status = s.secondary ? 'NotStarted' : i < at ? 'Completed' : i === at ? 'InProgress' : 'NotStarted'
    const firstHuman = s.tasks.findIndex(([, k]) => k === 'human')
    const tasks: LiveTask[] = s.tasks.map(([name, kind, id], j) => ({
      id, name, kind,
      status: status === 'InProgress' ? (j < firstHuman ? 'Completed' : j === firstHuman ? 'InProgress' : 'NotStarted') : status,
    }))
    return { id: s.name, name: s.name, status, secondary: !!s.secondary, tasks }
  })
}

function StatusMark({ p, className = 'h-3.5 w-3.5' }: { p: Phase; className?: string }) {
  if (p === 'done') return <Check className={`${className} text-[var(--ss-lvl-0-fg)]`} />
  if (p === 'active') return <Loader2 className={`${className} animate-spin text-primary`} />
  if (p === 'faulted') return <TriangleAlert className={`${className} text-[var(--ss-lvl-4)]`} />
  return <CircleDashed className={`${className} text-muted-foreground/60`} />
}

function TaskRow({ t, waiting }: { t: LiveTask; waiting?: WaitingStep }) {
  const p = phase(t.status)
  const Icon = KIND_ICON[t.kind]
  const terms = useTerms()
  return (
    <li className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${p === 'active' ? 'bg-primary/10' : ''}`} title={`${KIND_LABEL[t.kind]} · ${t.status || 'Not started'}`}>
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${p === 'idle' ? 'text-muted-foreground/60' : 'text-foreground/70'}`} aria-label={KIND_LABEL[t.kind]} />
      <span className="min-w-0 flex-1">
        <span className={`block text-balance text-xs leading-snug ${p === 'idle' ? 'text-muted-foreground' : ''} ${p === 'active' ? 'font-medium' : ''}`}>{stageName(t.name, terms.id)}</span>
        {/* A person's step that is waiting can be acted on right here. */}
        {waiting && p === 'active' && <span className="mt-0.5 block"><StepAction step={waiting} compact /></span>}
      </span>
      <StatusMark p={p} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    </li>
  )
}

function duration(from?: string, to?: string) {
  if (!from) return ''
  const ms = (to ? Date.parse(to) : Date.now()) - Date.parse(from)
  if (!(ms > 0)) return ''
  const m = Math.round(ms / 60000)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}

/** The solicitation's Maestro process: every phase and task as Maestro reports it, and Maestro's own instance page in an in-app dialog. */
export function LiveCasePanel({ sol, live, running, error }: { sol: Solicitation; live?: LiveCase | null; running: boolean; error?: string }) {
  const { preview } = useData()
  const terms = useTerms()
  const waiting = waitingSteps(live)
  const [open, setOpen] = useState(false)
  const stages = live?.stages.length ? live.stages : designedCase(sol)
  const primary = CASE_PLAN.filter((s) => !s.secondary).map((s) => stages.find((x) => x.name === s.name)).filter((s): s is LiveStage => !!s)
  const branches = stages.filter((s) => s.secondary && phase(s.status) !== 'idle')
  const all = stages.flatMap((s) => s.tasks)
  const count = (k: TaskKind) => all.filter((t) => t.kind === k && phase(t.status) === 'done').length
  const state = live ? live.status : live === null ? 'Not started' : error === NO_ACCESS ? 'No access' : 'Plan'
  const tone = live
    ? running ? 'bg-primary/15 text-primary' : /complet/i.test(live.status) ? 'bg-[var(--ss-lvl-0)] text-[var(--ss-lvl-0-fg)]' : /fault/i.test(live.status) ? 'bg-[var(--ss-lvl-4)] text-[var(--ss-lvl-4-fg)]' : 'bg-muted text-muted-foreground'
    : 'bg-muted text-muted-foreground'

  return (
    <section className="ss-in rounded-2xl border border-border bg-card px-4 py-3" aria-label="Maestro process">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Workflow className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {live ? 'Live in Maestro' : 'Maestro process'}
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-[11px] font-medium ${tone}`}>
              {running && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}{state}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {live
              ? `${sol.SolicitationId} · ${count('robot')} robot, ${count('agent')} agent and ${count('human')} human steps done${live.startedTime ? ` · ${duration(live.startedTime, live.completedTime)}` : ''}`
              : error ? (error === NO_ACCESS ? error : `Could not reach Maestro: ${error}`) : live === null ? `No process instance yet. Starting the ${terms.process} launches it in Maestro.` : 'The process Maestro runs: robots, agents and people, phase by phase.'}
          </p>
        </div>
        {(live || preview) && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Network className="mr-1.5 h-3.5 w-3.5" />View process
          </Button>
        )}
      </div>

      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {primary.map((s, i) => {
          const p = phase(s.status)
          return (
            <li key={s.id} className={`min-w-0 rounded-xl border p-2 ${p === 'active' ? 'border-primary/60 bg-primary/5' : 'border-border'}`}>
              <div className="mb-1 flex items-center gap-1.5 px-1">
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 text-balance text-xs font-semibold leading-tight">{stageName(s.name, terms.id)}</span>
                <StatusMark p={p} />
              </div>
              <ul className="space-y-0.5">{s.tasks.map((t) => <TaskRow key={t.id} t={t} waiting={waiting.find((w) => w.elementId === t.id)} />)}</ul>
            </li>
          )
        })}
      </ol>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
        {(['robot', 'agent', 'human'] as TaskKind[]).map((k) => {
          const Icon = KIND_ICON[k]
          return <span key={k} className="inline-flex items-center gap-1"><Icon className="h-3 w-3" />{KIND_LABEL[k]}</span>
        })}
        {branches.map((b) => (
          <span key={b.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--ss-lvl-3)] px-2 py-px text-[var(--ss-lvl-3-fg)]">
            <StatusMark p={phase(b.status)} className="h-3 w-3" />{stageName(b.name, terms.id)}
          </span>
        ))}
        {live?.alerts.map((a) => (
          <span key={a} className="inline-flex items-center gap-1 rounded-full bg-[var(--ss-lvl-3)] px-2 py-px text-[var(--ss-lvl-3-fg)]">
            <AlarmClock className="h-3 w-3" />{a}
          </span>
        ))}
      </div>
      <MaestroDialog open={open} onOpenChange={setOpen} sol={sol} live={live} />
    </section>
  )
}
