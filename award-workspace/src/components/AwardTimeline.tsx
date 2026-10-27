import { CircleCheck, CircleDashed, Clock, TimerOff } from 'lucide-react'
import { addCalendarDays, dayOf } from '@award/lib/clocks'
import type { AwardClocks, Day } from '@award/lib/clocks'
import { KIND } from '@award/lib/record'
import type { AwardRow, Correspondence } from '@award/lib/record'
import { when } from '@ss/lib/eval'
import { actorName } from '@ss/lib/types'
import type { Decision, Offeror } from '@ss/lib/types'

type State = 'done' | 'due' | 'closed' | 'pending'

interface Row { label: string; cite: string; state: State; text: string; detail?: { who: string; day: Day }[] }

const fmt = (d: Day) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const daysUntil = (d: Day, today: Day) => Math.round((Date.parse(`${d}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000)

const ICON = {
  done: <CircleCheck className="h-4 w-4 text-[var(--ss-good)]" />, due: <Clock className="h-4 w-4 text-[var(--ss-brand-2)]" />,
  closed: <TimerOff className="h-4 w-4 text-muted-foreground" />, pending: <CircleDashed className="h-4 w-4 text-muted-foreground" />,
}

/** A clock that's either met (an event happened), running (a deadline ahead), or closed (the deadline passed). */
function deadline(due: Day | undefined, today: Day, met?: string): Pick<Row, 'state' | 'text'> {
  if (met) return { state: 'done', text: when(met) }
  if (!due) return { state: 'pending', text: 'Starts when the contract is awarded' }
  const left = daysUntil(due, today)
  return left < 0 ? { state: 'closed', text: `Closed ${fmt(due)}` } : { state: 'due', text: `${fmt(due)} · ${left === 0 ? 'today' : `${left} day${left === 1 ? '' : 's'} left`}` }
}

/**
 * The award's timeline: the steps taken and the statutory deadlines ahead, from the dates the robots filed
 * (SSAward.ClocksJson, computed by the same engine the Contracting Officer's form previews). Before the contract is
 * awarded, each deadline shows when it would start.
 */
export function AwardTimeline({ award, decision, contract, offerors, letters }: {
  award?: AwardRow; decision?: Decision; contract?: Decision; offerors: Offeror[]; letters: Correspondence[]
}) {
  const today = dayOf(new Date().toISOString())
  const clocks = (() => { try { return award?.ClocksJson ? (JSON.parse(award.ClocksJson) as AwardClocks) : undefined } catch { return undefined } })()
  const awarded = contract?.Outcome === 'Awarded' ? contract : undefined
  const name = (id: string) => offerors.find((o) => o.OfferorId === id)?.Name ?? id
  const requests = Object.entries(clocks?.requestDue ?? {}).map(([id, d]) => ({ who: name(id), day: d })).sort((a, b) => a.day.localeCompare(b.day))
  const lastRequest = requests.at(-1)?.day
  const requested = letters.filter((c) => c.Kind === KIND.debriefRequest).length
  const rows: Row[] = [
    { label: 'Award decision signed', cite: 'FAR 15.205 under the RFO deviation (FAR 15.308)', ...(decision ? { state: 'done' as const, text: `${when(decision.DecidedAt)} · ${actorName(decision.DecidedBy)}` } : { state: 'pending' as const, text: 'Not signed' }) },
    { label: 'Contract awarded', cite: 'Signed by the Contracting Officer with the notices',
      ...(awarded ? { state: 'done' as const, text: `${when(awarded.DecidedAt)} · ${actorName(awarded.DecidedBy)}` } : { state: 'pending' as const, text: contract ? 'Drafted, waiting on the Contracting Officer' : 'Not drafted yet' }) },
    { label: 'Notices delivered', cite: 'Within 3 days after award · FAR 15.207-2(b)', ...deadline(clocks?.noticesDue, today, award?.NoticesSentAt) },
    { label: 'Debriefing requests due', cite: '3 days after each offeror receives its notice · FAR 15.301-1(a)(1)',
      ...(requests.length ? deadline(lastRequest, today) : deadline(undefined, today)), detail: requests,
      ...(requested ? { state: 'done' as const, text: `${requested} requested` } : {}) },
    { label: 'Protest window for a stay of performance', cite: '10 days after award, later once a debriefing is offered · 31 U.S.C. 3553(d)(4)',
      ...deadline(clocks?.stayByAward ?? (awarded ? addCalendarDays(dayOf(awarded.DecidedAt), 10) : undefined), today) },
  ]
  return (
    <ol className="relative space-y-4 border-l border-border pl-6">
      {rows.map((r) => (
        <li key={r.label} className="relative">
          <span className="absolute -left-[33px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-card">{ICON[r.state]}</span>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <span className={`font-medium ${r.state === 'pending' ? 'text-muted-foreground' : ''}`}>{r.label}</span>
            <span className={`text-sm tabular-nums ${r.state === 'due' ? 'font-medium text-[var(--ss-brand-2)]' : 'text-muted-foreground'}`}>{r.text}</span>
          </div>
          <p className="text-xs text-muted-foreground">{r.cite}</p>
          {r.detail && r.detail.length > 1 && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {r.detail.map((d) => <li key={d.who}>{d.who}: {fmt(d.day)}</li>)}
            </ul>
          )}
        </li>
      ))}
    </ol>
  )
}
