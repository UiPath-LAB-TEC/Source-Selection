import { Archive, Check, CircleDot, Clock } from 'lucide-react'
import { dayOf } from '@award/lib/clocks'
import { periodsOf } from '../lib/award'
import type { ScheduleRow } from '../lib/award'

const short = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '')

/**
 * A contract's periods, drawn like the award tracker: the base year and each option (done, running, or ahead), then
 * closeout. An option not yet exercised shows as ahead; one the Government let go shows struck through.
 */
export function PeriodTracker({ schedule, onDark }: { schedule: ScheduleRow[]; onDark?: boolean }) {
  const today = dayOf(new Date().toISOString())
  const periods = periodsOf(schedule)
  const ext = schedule.find((r) => r.Kind === 'Extension' && r.Status === 'Exercised')
  const steps = [...periods, ...(ext ? [ext] : []), { ScheduleId: 'closeout', Name: 'Closeout', Kind: 'Closeout' } as ScheduleRow]
  const current = steps.findIndex((r) => r.Status === 'Exercised' && !!r.StartDay && !!r.EndDay && r.StartDay <= today && today <= r.EndDay)
  const index = current >= 0 ? current : steps.findIndex((r) => r.Kind === 'Closeout' ? false : (r.EndDay ?? '') >= today)
  return (
    <ol className="flex w-full min-w-0 items-start" aria-label="Contract periods">
      {steps.map((s, i) => {
        const done = index >= 0 ? i < index : s.Kind !== 'Closeout'
        const now = i === index
        const lapsed = s.Status === 'Not exercised'
        const Icon = done ? Check : s.Kind === 'Closeout' ? Archive : now ? Clock : CircleDot
        const ring = onDark
          ? done ? 'bg-white text-[var(--ss-brand-1)]' : now ? 'bg-white/25 text-white ring-2 ring-white' : 'bg-white/10 text-white/60'
          : done ? 'bg-[var(--ss-brand-2)] text-white' : now ? 'aw-step-current ring-2 ring-[var(--ss-brand-2)]' : 'bg-muted text-muted-foreground'
        const line = onDark ? (done ? 'bg-white/80' : 'bg-white/20') : done ? 'bg-[var(--ss-brand-2)]' : 'bg-border'
        return (
          <li key={s.ScheduleId} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {i > 0 && <span aria-hidden className={`absolute right-[calc(50%+1.375rem)] top-[15px] h-0.5 w-[calc(100%-2.75rem)] rounded-full ${line}`} />}
            <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${ring}`}>
              {now && <span aria-hidden className="ss-pulse" />}
              <Icon className="h-4 w-4" />
            </span>
            <span className={`mt-1.5 w-full text-balance px-1 text-[11px] leading-tight ${now ? 'font-semibold' : ''} ${lapsed ? 'line-through' : ''} ${onDark ? 'text-white/90' : now ? 'text-foreground' : 'text-muted-foreground'}`}>
              {s.Kind === 'Extension' ? 'Extension' : s.Name}
            </span>
            {s.StartDay && <span className={`hidden w-full px-1 text-[10px] leading-tight sm:block ${onDark ? 'text-white/65' : 'text-muted-foreground'}`}>{short(s.StartDay)}</span>}
          </li>
        )
      })}
    </ol>
  )
}
