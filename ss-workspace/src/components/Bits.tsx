import { AlertTriangle, CircleCheck, OctagonAlert, ShieldAlert, Sparkles, UserPen } from 'lucide-react'
import type { ReactNode } from 'react'
import { kindTone, rank, scaleOf } from '../lib/eval'
import type { Factor, Plan } from '../lib/types'
import { evaluatorBySlot } from '../lib/types'

const TONE = {
  good: { color: 'var(--ss-good)', icon: <CircleCheck className="h-3.5 w-3.5" /> },
  warn: { color: 'var(--ss-warn)', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  serious: { color: 'var(--ss-serious)', icon: <ShieldAlert className="h-3.5 w-3.5" /> },
  critical: { color: 'var(--ss-critical)', icon: <OctagonAlert className="h-3.5 w-3.5" /> },
}

export function Pill({ children, icon, color, title }: { children: ReactNode; icon?: ReactNode; color?: string; title?: string }) {
  return (
    <span title={title} className="inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground">
      {icon && <span className="flex shrink-0" style={{ color }}>{icon}</span>}
      <span className="truncate">{children}</span>
    </span>
  )
}

/** Finding kind — color always paired with an icon and the word. */
export function KindBadge({ kind }: { kind: string }) {
  const t = TONE[kindTone(kind)]
  return <Pill icon={t.icon} color={t.color}>{kind}</Pill>
}

export function OriginBadge({ origin, slot }: { origin: string; slot?: number }) {
  return origin === 'Agent'
    ? <Pill icon={<Sparkles className="h-3.5 w-3.5" />} color="var(--ss-rate-2)">Agent draft</Pill>
    : <Pill icon={<UserPen className="h-3.5 w-3.5" />} color="var(--ss-rate-2)">{(slot && evaluatorBySlot(slot)?.name) || `Evaluator ${slot}`}</Pill>
}

/** Ordinal rating: five segments, filled up to the rating, one hue light to dark. */
export function RatingChip({ plan, factor, rating, size = 'md' }: { plan: Plan; factor: Factor; rating?: string; size?: 'sm' | 'md' }) {
  if (!rating) return <span className="text-xs text-muted-foreground">Not rated</span>
  const scale = scaleOf(plan, factor)
  const r = rank(plan, factor, rating)
  const filled = scale.length - r
  return (
    <span className="inline-flex min-w-0 items-center gap-2" title={`${rating} (${r + 1} of ${scale.length}, 1 is best)`}>
      <span className="flex shrink-0 gap-0.5">
        {scale.map((_, i) => (
          <span key={i} className={size === 'sm' ? 'h-2.5 w-1.5 rounded-[2px]' : 'h-3 w-2 rounded-[2px]'}
            style={{ background: i < filled ? `var(--ss-rate-${Math.min(5, r + 1)})` : 'var(--muted)' }} />
        ))}
      </span>
      <span className={`truncate ${size === 'sm' ? 'text-xs' : 'text-sm font-medium'}`}>{rating}</span>
    </span>
  )
}

export function SpreadBadge({ spread }: { spread: number }) {
  if (spread < 1) return null
  return spread >= 2
    ? <Pill icon={<AlertTriangle className="h-3.5 w-3.5" />} color="var(--ss-critical)" title="Evaluators differ by 2 or more rating steps">Disagreement</Pill>
    : <Pill icon={<AlertTriangle className="h-3.5 w-3.5" />} color="var(--ss-warn)" title="Evaluators differ by one rating step">Split</Pill>
}

/** Heatmap tint for a rating cell: stronger for better ratings, one hue. */
export function ratingTint(rankIndex: number) {
  if (rankIndex > 4) return 'transparent'
  const pct = [26, 18, 11, 6, 3][rankIndex]
  return `color-mix(in srgb, var(--ss-brand-2) ${pct}%, transparent)`
}

export function ComplianceBadge({ status }: { status?: string }) {
  if (!status) return null
  const t = status === 'Compliant' ? TONE.good : status === 'Pending' ? TONE.warn : TONE.serious
  return <Pill icon={t.icon} color={t.color}>{status}</Pill>
}

export function Section({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** Highlight a quoted passage inside page text. */
export function Highlighted({ text, quote }: { text: string; quote?: string }) {
  const q = quote?.trim()
  const i = q ? text.indexOf(q) : -1
  if (!q || i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm px-0.5 text-foreground" style={{ background: '#ffe58a', color: '#1f2328', boxShadow: 'inset 0 -2px 0 #e0a800' }}>{q}</mark>
      {text.slice(i + q.length)}
    </>
  )
}
