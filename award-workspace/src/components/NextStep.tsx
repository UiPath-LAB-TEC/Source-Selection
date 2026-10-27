import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Bot, Hourglass, Loader2, Play } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { useTerms } from '@forms/lib/terms'
import { PersonaAvatar } from '@ss/components/Flair'
import { when } from '@ss/lib/eval'
import type { Decision, Solicitation } from '@ss/lib/types'
import { awardTitled, useAwardPersona } from '../hooks/usePersona'
import { AWARD_NEXT, AWARD_PERSONAS, AWARD_STAGES, awardStageIndex } from '../lib/award'
import type { AwardClocks } from '@award/lib/clocks'
import type { AwardRow } from '../lib/award'
import { useAwardData } from '../lib/data'
import { useBeginAward, useCanBeginAward } from '../lib/start'
import { OpenAwardTask, openAwardTasks, taskOwner } from './AwardTask'

/** What the robots are doing while no one holds the award (between Begin award and the CO's task, after signing). */
function robotWork(award: AwardRow | undefined, contract: Decision | undefined) {
  if (!award) return undefined
  if (!contract) return 'Drafting the contract award and a notice for every offeror from the record'
  if (contract.Outcome === 'Awarded' && !award.NoticesSentAt) return 'Filing the signed contract and notices, and setting the deadlines'
  return undefined
}

/**
 * Whose move it is on this award, as Source Selection's next-actions bar shows it: the person holding an open task
 * (with Open task for them), or what the robots are doing in between. While the robots work, the page checks back every
 * few seconds so the task appears the moment it's created.
 */
export function NextStep({ sol, award, contract }: { sol: Solicitation; award?: AwardRow; contract?: Decision }) {
  const { tasks, reload, preview } = useAwardData()
  const { persona } = useAwardPersona()
  const t = useTerms()
  const { starting, begin } = useBeginAward()
  const canBegin = useCanBeginAward()
  const open = openAwardTasks(tasks, sol.SolicitationId, award)
  const working = !open.length ? robotWork(award, contract) : undefined
  const index = awardStageIndex(award, t.id)
  const closed = index >= AWARD_STAGES[t.id].length

  useEffect(() => {
    if (!working || preview) return
    let polls = 0
    const id = setInterval(() => { if (++polls > 30) clearInterval(id); else void reload() }, 8000)
    return () => clearInterval(id)
  }, [working, preview, reload])

  if (closed) return null
  const co = awardTitled(AWARD_PERSONAS[0], t.id)
  const row = (key: string | number, who: typeof co, body: ReactNode, action: ReactNode) => (
    <li key={key} className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 ${who.id === persona.id ? 'border-primary/40 bg-primary/5' : 'border-border bg-background/60'}`}>
      <PersonaAvatar id={who.id} short={who.short} size={34} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{who.name}</span>
          {who.id === persona.id && <span className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">You</span>}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{who.label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{body}</span>
      </span>
      <span className="shrink-0">{action}</span>
    </li>
  )

  return (
    <section className="ss-in rounded-2xl border border-border bg-card px-4 py-3" aria-label="Next step">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Hourglass className="h-3.5 w-3.5 text-primary" />Next step</h2>
      {/* Two columns only when two people hold steps at once; a single step uses the full width. */}
      <ul className={`grid gap-2 ${open.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {open.map((task) => {
          const owner = awardTitled(taskOwner(task) ?? co, t.id)
          const mine = owner.id === persona.id
          return row(task.id, owner, <>{task.title} · open since {when(task.createdTime)}</>,
            mine ? <OpenAwardTask task={task} size="sm" /> : <span className="text-xs text-muted-foreground">Waiting on {owner.name}</span>)
        })}
        {!open.length && !award && row('begin', co, t.sled ? 'Begin the award phase: notice of intent, protest period and Board approval' : 'Begin the award phase: contract award, notices and debriefings',
          persona.id === co.id
            ? <Button size="sm" onClick={() => begin(sol.SolicitationId)} disabled={!canBegin || t.sled || !!starting}
                title={t.sled ? 'The district steps come in a later release' : canBegin ? undefined : 'Not available in the preview'}>
                {starting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}Begin award
              </Button>
            : <span className="text-xs text-muted-foreground">Waiting on {co.name}</span>)}
        {/* Between steps: no task open and no robot working. The stage says what comes next (and by when, once the clocks run). */}
        {!open.length && award && !working && (() => {
          const next = AWARD_NEXT[t.id][index + 1]
          const who = awardTitled(AWARD_PERSONAS.find((p) => p.id === next?.who[0]) ?? co, t.id)
          const clocks = (() => { try { return JSON.parse(award.ClocksJson ?? '{}') as AwardClocks } catch { return undefined } })()
          const due = Object.values(clocks?.requestDue ?? {}).sort().at(-1)
          const waitingOnRequests = t.id === 'federal' && index === 2
          return row('between', who,
            waitingOnRequests ? `Waiting for debriefing requests${due ? `, due by ${new Date(`${due}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}` : next?.label ?? 'No action pending',
            <span className="text-xs text-muted-foreground">{waitingOnRequests ? 'No task yet' : 'Task on its way'}</span>)
        })()}
        {working && (
          <li className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5">
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[var(--ss-brand-2)]/15 text-[var(--ss-brand-2)]"><Bot className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">UiPath Robot</span>
              <span className="block truncate text-xs text-muted-foreground">{working}</span>
            </span>
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="Working" />
          </li>
        )}
      </ul>
    </section>
  )
}
