import type { ReactNode } from 'react'
import { CalendarRange, CircleAlert, CircleCheck, CircleDashed, Clock, FileClock, Repeat } from 'lucide-react'
import { Card, CardContent } from '@uipath/apollo-wind/components/ui/card'
import { Info } from '@forms/components/Bits'
import { dayOf } from '@award/lib/clocks'
import { Section } from '@ss/components/Bits'
import { money } from '@ss/lib/eval'
import { periodsOf } from '../lib/award'
import type { AlertRow, ContractAbstract, ScheduleRow } from '../lib/award'

type State = 'done' | 'current' | 'due' | 'late' | 'planned'

const ICON: Record<State, ReactNode> = {
  done: <CircleCheck className="h-4 w-4 text-[var(--ss-good)]" />, current: <Clock className="h-4 w-4 text-[var(--ss-brand-2)]" />,
  due: <Clock className="h-4 w-4 text-[var(--ss-brand-2)]" />, late: <CircleAlert className="h-4 w-4 text-[var(--ss-critical)]" />,
  planned: <CircleDashed className="h-4 w-4 text-muted-foreground" />,
}

const fmt = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')

function Row({ state, label, right, sub, cite }: { state: State; label: string; right?: string; sub?: string; cite?: { ref: string; text?: string } }) {
  return (
    <li className="relative">
      <span className="absolute -left-[33px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-card">{ICON[state]}</span>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <span className={`font-medium ${state === 'planned' ? 'text-muted-foreground' : ''}`}>{label}</span>
        {right && <span className={`text-sm tabular-nums ${state === 'late' ? 'font-medium text-[var(--ss-critical)]' : state === 'due' || state === 'current' ? 'font-medium text-[var(--ss-brand-2)]' : 'text-muted-foreground'}`}>{right}</span>}
      </div>
      {(sub || cite) && (
        <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {sub}{cite && <><span>{sub ? '·' : ''} {cite.ref}</span>{cite.text && <Info label={`Clause ${cite.ref}`}>{cite.text}</Info>}</>}
        </p>
      )}
    </li>
  )
}

/** A period or option: running, done, exercised ahead, or still to decide, with its notice and exercise deadlines. */
function periodRow(r: ScheduleRow, today: string) {
  const running = !!r.StartDay && !!r.EndDay && r.StartDay <= today && today <= r.EndDay && r.Status === 'Exercised'
  const state: State = running ? 'current' : r.Status === 'Exercised' ? 'done' : 'planned'
  const deciding = r.Kind === 'Option' && r.Status !== 'Exercised' && r.Status !== 'Not exercised'
  const sub = deciding
    ? `Preliminary notice by ${fmt(r.NoticeDay)} · exercise by ${fmt(r.DueDay)}`
    : running ? 'Running now' : r.Status === 'Exercised' ? (r.Kind === 'Option' ? 'Exercised' : 'Awarded') : r.Status
  return <Row key={r.ScheduleId} state={state} label={`${r.Name}: ${fmt(r.StartDay)} to ${fmt(r.EndDay)}`} right={money(r.Amount)} sub={sub}
    cite={r.ClauseRef ? { ref: r.ClauseRef, text: r.ClauseText } : undefined} />
}

/** A milestone, deliverable or evaluation: accepted or done, due, received and waiting on acceptance, or late. */
function dueRow(r: ScheduleRow, today: string) {
  const done = ['Accepted', 'Done', 'Waived'].includes(r.Status ?? '')
  const late = !done && !r.ReceivedDay && !!r.DueDay && r.DueDay < today
  const state: State = done ? 'done' : late ? 'late' : 'due'
  const right = done
    ? (r.AcceptedDay ? `Accepted ${fmt(r.AcceptedDay)}` : 'Done')
    : r.ReceivedDay ? `Received ${fmt(r.ReceivedDay)}, not yet accepted` : late ? `Was due ${fmt(r.DueDay)}` : `Due ${fmt(r.DueDay)}`
  return <Row key={r.ScheduleId} state={state} label={r.Name} right={right} sub={r.Code ? `${r.Code}${r.Period ? ` · ${r.Period}` : ''}` : r.Period}
    cite={r.ClauseRef ? { ref: r.ClauseRef === '42.1102(a)' ? 'FAR 42.1102(a)' : r.ClauseRef } : undefined} />
}

/**
 * The contract's schedule as the watch keeps it: periods and options with their notice windows, the extension clause,
 * then milestones and deliverables (recurring reports show their latest and next), then performance evaluations.
 */
export function ScheduleTimeline({ schedule, abstract, alerts }: { schedule: ScheduleRow[]; abstract?: ContractAbstract; alerts: AlertRow[] }) {
  const today = dayOf(new Date().toISOString())
  const periods = periodsOf(schedule)
  const extension = schedule.filter((r) => r.Kind === 'Extension')
  const templates = schedule.filter((r) => r.Status === 'Recurring')
  const instances = (t: ScheduleRow) => schedule.filter((r) => r.ScheduleId.startsWith(`${t.ScheduleId}-`)).sort((a, b) => (a.DueDay ?? '').localeCompare(b.DueDay ?? ''))
  const recurring = templates.flatMap((t) => {
    const all = instances(t)
    const next = all.filter((r) => !['Accepted', 'Done'].includes(r.Status ?? ''))
    const last = all.filter((r) => ['Accepted', 'Done'].includes(r.Status ?? '')).slice(-2)
    return [...last, ...next]
  })
  const oneOff = schedule.filter((r) => (r.Kind === 'Milestone' || r.Kind === 'Deliverable') && r.Status !== 'Recurring' && !templates.some((t) => r.ScheduleId.startsWith(`${t.ScheduleId}-`)))
  const items = [...oneOff, ...recurring].sort((a, b) => (a.DueDay ?? '').localeCompare(b.DueDay ?? ''))
  const evaluations = schedule.filter((r) => r.Kind === 'Evaluation').sort((a, b) => (a.DueDay ?? '').localeCompare(b.DueDay ?? ''))
  const derived = abstract?.source?.startsWith('The solicitation')
  const live = new Set(alerts.map((a) => a.Subject))

  return (
    <div className="space-y-6">
      <Section title="Periods and options" description={derived
        ? "From the solicitation's terms and the signed award. Not yet read from the signed contract itself."
        : abstract?.source ?? 'From the signed contract.'}>
        <Card><CardContent className="p-5">
          <ol className="relative space-y-4 border-l border-border pl-6">
            {periods.map((r) => periodRow(r, today))}
            {extension.map((r) => (
              <Row key={r.ScheduleId} state={r.Status === 'Exercised' ? 'current' : live.has('EXT') ? 'due' : 'planned'}
                label={`${r.Name}: ${fmt(r.StartDay)} to ${fmt(r.EndDay)}`} right={r.Status === 'Exercised' ? 'Exercised' : `Decide by ${fmt(r.DueDay)}`}
                sub={r.Status === 'Exercised' ? undefined : 'Available once the options are used'} cite={r.ClauseRef ? { ref: r.ClauseRef, text: r.ClauseText } : undefined} />
            ))}
          </ol>
        </CardContent></Card>
      </Section>

      <Section title="Milestones and deliverables" description="What the contract requires, when, and whether it arrived and was accepted.">
        <Card><CardContent className="space-y-3 p-5">
          {templates.length > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Repeat className="h-3.5 w-3.5" />{templates.map((t) => `${t.Code ? `${t.Code} ` : ''}${t.Name}: monthly, due on the ${t.Recurrence?.split(':')[1]}th`).join(' · ')}
            </p>
          )}
          {items.length
            ? <ol className="relative space-y-4 border-l border-border pl-6">{items.map((r) => dueRow(r, today))}</ol>
            : <p className="flex items-center gap-2 text-sm text-muted-foreground"><FileClock className="h-4 w-4" />No deliverables on the schedule yet.</p>}
        </CardContent></Card>
      </Section>

      <Section title="Performance evaluations" description="At least once a year and when the work is completed, in CPARS. The contractor has 14 days to comment.">
        <Card><CardContent className="p-5">
          {evaluations.length
            ? <ol className="relative space-y-4 border-l border-border pl-6">{evaluations.map((r) => dueRow(r, today))}</ol>
            : <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarRange className="h-4 w-4" />No evaluations on the schedule.</p>}
        </CardContent></Card>
      </Section>
    </div>
  )
}
