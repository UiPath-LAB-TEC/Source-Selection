import { Check, ClipboardCheck, FileStack, ListChecks, MessageSquareText, PenLine, Send } from 'lucide-react'
import { STAGES } from '../lib/types'
import type { Stage } from '../lib/types'

const ICONS = [PenLine, MessageSquareText, ListChecks, FileStack, Send, ClipboardCheck]

/** A requirement's six steps, drawn like the other apps' trackers: done, current (pulsing) and upcoming, in the app's crimson. */
export function StageBar({ stage, onDark }: { stage: Stage; onDark?: boolean }) {
  const index = STAGES.indexOf(stage)
  return (
    <ol className="flex w-full min-w-0 items-start" aria-label="Requirement steps">
      {STAGES.map((s, i) => {
        const done = i < index || stage === 'Accepted'
        const current = i === index && stage !== 'Accepted'
        const Icon = done ? Check : ICONS[i]
        const ring = onDark
          ? done ? 'bg-white text-[var(--ss-brand-1)]' : current ? 'bg-white/25 text-white ring-2 ring-white' : 'bg-white/10 text-white/60'
          : done ? 'bg-[var(--ss-brand-2)] text-white' : current ? 'rq-step-current ring-2 ring-[var(--ss-brand-2)]' : 'bg-muted text-muted-foreground'
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
