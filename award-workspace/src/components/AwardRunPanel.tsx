import { useState } from 'react'
import { Network, Workflow } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { KIND_ICON, KIND_LABEL, StatusMark, duration, phase } from '@ss/components/LiveCase'
import MaestroDialog from '@ss/components/MaestroDialog'
import { latestRuns } from '@ss/lib/maestro'
import { when } from '@ss/lib/eval'
import type { TaskKind } from '@ss/lib/maestro'
import type { Solicitation } from '@ss/lib/types'
import type { AwardRow } from '../lib/award'
import { useAwardData } from '../lib/data'
import { AWARD_PLAN, useAwardRun } from '../lib/run'
import { OpenAwardTask, openAwardTasks } from './AwardTask'

/**
 * The award's Maestro process, laid out like Source Selection's live panel: each step of the Award process with who
 * does it and how far it got, and Maestro's own instance page (diagram, trail, variables, incidents) in a dialog.
 */
export function AwardRunPanel({ sol, award }: { sol: Solicitation; award?: AwardRow }) {
  const { tasks, preview } = useAwardData()
  const { live, error, running } = useAwardRun(award)
  const [open, setOpen] = useState(false)
  const runs = latestRuns(live?.runs ?? [])
  const task = openAwardTasks(tasks, sol.SolicitationId, award)[0]
  const steps = AWARD_PLAN.map((s) => ({ ...s, run: runs.get(s.id) }))
  const done = (k: TaskKind) => steps.filter((s) => s.kind === k && s.run && phase(s.run.status) === 'done').length
  const state = live ? live.status : preview ? 'Plan' : !award?.CaseInstanceId ? 'Not started' : error ? 'Unavailable' : 'Loading'
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
              ? `${sol.SolicitationId} · ${done('robot')} robot and ${done('human')} human steps done${live.startedTime ? ` · ${duration(live.startedTime, live.completedTime)}` : ''}`
              : error ? `Could not reach Maestro: ${error}` : !award ? 'No process run yet. Begin award launches it in Maestro.' : 'The award process Maestro runs: robots and people, step by step.'}
          </p>
        </div>
        {(live || preview) && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Network className="mr-1.5 h-3.5 w-3.5" />View process</Button>
        )}
      </div>

      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => {
          const p = s.run ? phase(s.run.status) : 'idle'
          const Icon = KIND_ICON[s.kind]
          return (
            <li key={s.id} className={`min-w-0 rounded-xl border p-2.5 ${p === 'active' ? 'border-primary/60 bg-primary/5' : 'border-border'}`} title={`${KIND_LABEL[s.kind]} · ${s.run?.status ?? 'Not started'}`}>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${p === 'idle' ? 'text-muted-foreground/60' : 'text-foreground/70'}`} aria-label={KIND_LABEL[s.kind]} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-balance text-xs leading-snug ${p === 'idle' ? 'text-muted-foreground' : 'font-medium'}`}>{s.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {s.who ?? KIND_LABEL[s.kind]}{s.run?.completedTime ? ` · ${when(s.run.completedTime)}` : p === 'active' && s.kind === 'human' ? ' · waiting' : ''}
                  </span>
                  {/* The person's step that is waiting can be acted on right here, as in Source Selection. */}
                  {p === 'active' && s.kind === 'human' && task && <span className="mt-1.5 block"><OpenAwardTask task={task} size="sm" /></span>}
                </span>
                <StatusMark p={p} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              </div>
            </li>
          )
        })}
      </ol>
      <MaestroDialog open={open} onOpenChange={setOpen} sol={sol} live={live} title={`Award ${sol.SolicitationId} in Maestro`}
        empty="Begin award launches the award process in Maestro." />
    </section>
  )
}
