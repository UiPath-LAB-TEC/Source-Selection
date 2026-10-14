import { BadgeDollarSign, Check, ClipboardCheck, Gavel, Inbox, Users } from 'lucide-react'
import robot from '../assets/uipath-robot.png'
import { stageName, useTerms } from '@forms/lib/terms'
import { STAGES } from '../lib/types'

const ICONS = [Inbox, ClipboardCheck, Users, BadgeDollarSign, Gavel]

/** The five stages as connected steps: done / current / upcoming. Named for the framework in use. */
export function StageTracker({ index, onDark, perch }: { index: number; onDark?: boolean; perch?: boolean }) {
  const t = useTerms()
  return (
    <ol className="flex w-full min-w-0 items-start" aria-label={`${t.Process} stages`}>
      {STAGES.map((s, i) => {
        const done = i < index
        const current = i === index
        const Icon = done ? Check : ICONS[i]
        const ring = onDark
          ? done ? 'bg-white text-[var(--ss-brand-1)]' : current ? 'bg-white/25 text-white ring-2 ring-white' : 'bg-white/10 text-white/60'
          : done ? 'bg-primary text-primary-foreground' : current ? 'bg-primary/15 text-primary ring-2 ring-primary' : 'bg-muted text-muted-foreground'
        const line = onDark ? (done ? 'bg-white/80' : 'bg-white/20') : done ? 'bg-primary' : 'bg-border'
        return (
          <li key={s} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {/* The connector spans only the gap between circles (with a little air), so it never shows through one. */}
            {i > 0 && <span aria-hidden className={`absolute right-[calc(50%+1.375rem)] top-[15px] h-0.5 w-[calc(100%-2.75rem)] rounded-full ${line}`} />}
            {perch && current && <img src={robot} alt="" className="ss-perch" />}
            <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${ring}`}>
              <Icon className="h-4 w-4" />
            </span>
            <span className={`mt-1.5 w-full text-balance px-1 text-[11px] leading-tight ${current ? 'font-semibold' : ''} ${onDark ? 'text-white/90' : current ? 'text-foreground' : 'text-muted-foreground'}`}>{stageName(s, t.id)}</span>
          </li>
        )
      })}
    </ol>
  )
}
