import { Check, FileSignature, Gavel, Landmark, Mail, MessagesSquare, ShieldAlert, Vote } from 'lucide-react'
import { useTerms } from '@forms/lib/terms'
import { AWARD_STAGES } from '../lib/award'

const ICONS = { federal: [FileSignature, Mail, MessagesSquare, ShieldAlert, Gavel], sled: [Mail, ShieldAlert, Vote, FileSignature, Landmark] }

/**
 * The Award phase's five steps, drawn like Source Selection's stage tracker: done / current / upcoming, the current
 * circle pulsing. Index -1 means the Award phase hasn't started.
 */
export function AwardTracker({ index, onDark }: { index: number; onDark?: boolean }) {
  const t = useTerms()
  const stages = AWARD_STAGES[t.id]
  return (
    <ol className="flex w-full min-w-0 items-start" aria-label="Award steps">
      {stages.map((s, i) => {
        const done = i < index
        const current = i === index
        const Icon = done ? Check : ICONS[t.id][i]
        // On a card the steps take the app's own accent (--ss-brand-2), not the shared button blue.
        const ring = onDark
          ? done ? 'bg-white text-[var(--ss-brand-1)]' : current ? 'bg-white/25 text-white ring-2 ring-white' : 'bg-white/10 text-white/60'
          : done ? 'bg-[var(--ss-brand-2)] text-white' : current ? 'aw-step-current ring-2 ring-[var(--ss-brand-2)]' : 'bg-muted text-muted-foreground'
        const line = onDark ? (done ? 'bg-white/80' : 'bg-white/20') : done ? 'bg-[var(--ss-brand-2)]' : 'bg-border'
        return (
          <li key={s} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {i > 0 && <span aria-hidden className={`absolute right-[calc(50%+1.375rem)] top-[15px] h-0.5 w-[calc(100%-2.75rem)] rounded-full ${line}`} />}
            <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${ring}`}>
              {current && <span aria-hidden className="ss-pulse" />}
              <Icon className="h-4 w-4" />
            </span>
            <span className={`mt-1.5 w-full text-balance px-1 text-[11px] leading-tight ${current ? 'font-semibold' : ''} ${onDark ? 'text-white/90' : current ? 'text-foreground' : 'text-muted-foreground'}`}>{s}</span>
          </li>
        )
      })}
    </ol>
  )
}
