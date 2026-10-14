import { AlertTriangle, CircleCheck, OctagonAlert, ShieldAlert, Sparkles, UserPen } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { kindTone } from '../lib/eval'
import { legend, level, look, lookOf, methodOf } from '../lib/ratings'
import type { LookOptions } from '../lib/ratings'
import type { Factor, Plan, RatingMethod } from '../lib/types'
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
    : <Pill icon={<UserPen className="h-3.5 w-3.5" />} color="var(--ss-rate-2)">{evaluatorBySlot(slot)?.name ?? `Evaluator ${slot}`}</Pill>
}

/** A rating shown as the merit adjective, a DoD color, a 5-point number or (State & Local) points (plan.ratingMethod).
 *  The stored scale label (e.g. "Substantial Confidence") only appears in the tooltip. Mirrors ss-workspace's Scorecard. */
export function Rating({ plan, factor, rating, method, size = 'md', pending }: {
  plan: Plan; factor: Factor; rating?: string; method?: RatingMethod; size?: 'sm' | 'md' | 'lg'; pending?: boolean
}) {
  const m = method ?? methodOf(plan)
  const i = level(plan, factor, rating)
  if (!rating || i == null) return <span className="inline-flex rounded-lg border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground">Not rated</span>
  const l = look(m, i, rating, lookOf(plan, factor))
  const tip = ratingTip(m, l, factor.weight)
  const pad = size === 'lg' ? 'px-3.5 py-2 text-base' : size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs'
  const dashed = pending ? 'opacity-75 outline-dashed outline-1 outline-offset-2 outline-current' : ''
  if (m === 'points') {
    return (
      <span title={tip} className={`inline-flex shrink-0 items-baseline gap-1 rounded-lg font-semibold tabular-nums ${pad} ${dashed}`} style={{ background: l.bg, color: l.fg }}>
        {l.text}{factor.weight != null && <span className="text-[0.8em] font-normal opacity-85">/ {factor.weight}</span>}
      </span>
    )
  }
  if (m === 'numeric') {
    const box = size === 'lg' ? 'h-11 w-11 text-xl' : size === 'md' ? 'h-9 w-9 text-lg' : 'h-6 w-6 text-xs'
    return <span title={tip} className={`inline-flex shrink-0 items-center justify-center rounded-lg font-bold tabular-nums ${box} ${dashed}`} style={{ background: l.bg, color: l.fg }}>{l.text}</span>
  }
  return (
    <span title={tip} className={`inline-flex max-w-full items-center gap-1.5 rounded-lg font-semibold ${pad} ${dashed}`} style={{ background: l.bg, color: l.fg }}>
      <span className="truncate">{l.text}</span>
    </span>
  )
}

/** Tooltip text: what the display means, plus the official scale term when it differs from the adjective. */
export function ratingTip(m: RatingMethod, l: ReturnType<typeof look>, max?: number) {
  const shown = m === 'color' ? `${l.text} · ${l.word}` : m === 'numeric' ? `${l.text} of 5 · ${l.word}`
    : m === 'points' ? `${l.text}${max != null ? ` of ${max} points` : ''} · ${l.word}` : l.word
  return [shown, l.official !== l.word ? l.official : ''].filter(Boolean).join(' — ')
}

/** Detail views only: the adjective (for color/numeric) and the official confidence term when it differs.
 *  `officialOnly` where the adjective is already on screen, e.g. under a RatingPicker. */
export function OfficialTerm({ plan, factor, rating, method, officialOnly }: { plan: Plan; factor: Factor; rating?: string; method?: RatingMethod; officialOnly?: boolean }) {
  const m = method ?? methodOf(plan)
  const i = level(plan, factor, rating)
  if (!rating || i == null) return null
  const l = look(m, i, rating, lookOf(plan, factor))
  const parts = [m !== 'adjectival' && !officialOnly ? l.word : '', l.official !== l.word ? `Official rating: ${l.official}` : ''].filter(Boolean)
  return parts.length ? <span className="text-xs text-muted-foreground">{parts.join(' · ')}</span> : null
}

/** Single legend, best to worst. Past performance confidence ratings sit on the same five steps.
 *  `words` are the plan's step words (wordsOf); under points each step shows its share of the criterion's points. */
export function RatingLegend({ factors, method, words }: { factors: Factor[]; method: RatingMethod; words?: LookOptions['words'] }) {
  const confidence = factors.some((f) => f.scale === 'confidence') && method !== 'points'
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="mr-1 text-muted-foreground">Best</span>
      {legend(words).map(({ i, word }) => {
        const l = look(method, i, word, { words })
        return (
          <span key={i} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold" style={{ background: l.bg, color: l.fg }}>
            {method === 'adjectival' ? word : <>{l.text}<span className="font-normal opacity-90">{word}</span></>}
          </span>
        )
      })}
      <span className="ml-1 text-muted-foreground">Worst</span>
      {confidence && <span className="basis-full pt-0.5 text-[11px] text-muted-foreground">Past Performance confidence ratings use the same five steps — hover a rating for the official term.</span>}
    </div>
  )
}

export function SpreadBadge({ spread }: { spread: number }) {
  if (spread < 1) return null
  return spread >= 2
    ? <Pill icon={<AlertTriangle className="h-3.5 w-3.5" />} color="var(--ss-critical)" title="Evaluators differ by 2 or more rating steps">Disagreement</Pill>
    : <Pill icon={<AlertTriangle className="h-3.5 w-3.5" />} color="var(--ss-warn)" title="Evaluators differ by one rating step">Split</Pill>
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

/** The accent a finding kind is drawn in (badge icon, card stripe, document highlight). */
export const kindAccent = (kind: string) => TONE[kindTone(kind)].color

/**
 * Where a cited quote sits in the page text. Tolerates differences the citation step introduces:
 * whitespace and line breaks, curly vs straight quotes, letter case and leading/trailing ellipses.
 */
export function findQuote(text: string, quote?: string): { start: number; end: number } | null {
  const q = quote?.trim().replace(/^[\s.…"“”'‘’]+|[\s.…"“”'‘’]+$/g, '')
  if (!q) return null
  const pattern = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+').replace(/['‘’]/g, "['‘’]").replace(/["“”]/g, '["“”]')
  const m = new RegExp(pattern, 'i').exec(text)
  return m ? { start: m.index, end: m.index + m[0].length } : null
}

/** Highlight a quoted passage inside page text, tinted in the finding kind's accent when one is given. */
export function Highlighted({ text, quote, kind, markRef }: { text: string; quote?: string; kind?: string; markRef?: Ref<HTMLElement> }) {
  const at = findQuote(text, quote)
  if (!at) return <>{text}</>
  const accent = kind ? kindAccent(kind) : '#e0a800'
  const strong = !!kind && /Significant|Deficiency/.test(kind)
  return (
    <>
      {text.slice(0, at.start)}
      <mark ref={markRef} className="rounded-sm px-0.5"
        style={{ background: kind ? `color-mix(in srgb, ${accent} ${strong ? 40 : 26}%, #ffffff)` : '#ffe58a', color: '#1f2328', boxShadow: `inset 0 -${strong ? 3 : 2}px 0 ${accent}` }}>
        {text.slice(at.start, at.end)}
      </mark>
      {text.slice(at.end)}
    </>
  )
}
