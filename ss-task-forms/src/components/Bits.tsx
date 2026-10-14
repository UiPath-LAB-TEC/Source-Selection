import { AlertTriangle, CircleCheck, OctagonAlert, Shield, ShieldAlert, ShieldCheck, ShieldMinus, ShieldX, Sparkles, UserPen } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { InfoTooltip } from '@uipath/apollo-wind/components/ui/info-tooltip'
import { TooltipProvider } from '@uipath/apollo-wind/components/ui/tooltip'
import { kindTone } from '../lib/eval'
import { CONFIDENCE_TERMS, NEUTRAL_CONFIDENCE, legend, level, look, lookOf, methodOf } from '../lib/ratings'
import type { Look, LookOptions } from '../lib/ratings'
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

/** An ⓘ button whose tooltip holds an explanation that would otherwise be a line of text on the page. */
export function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={80}>
      <InfoTooltip aria-label={label} content={<span className="block max-w-[280px] text-xs leading-snug">{children}</span>} />
    </TooltipProvider>
  )
}

const CONFIDENCE_ICONS = [ShieldCheck, Shield, ShieldMinus, ShieldAlert, ShieldX]
const CONFIDENCE_TONES = ['var(--ss-good)', 'var(--ss-good)', 'currentColor', 'var(--ss-warn)', 'var(--ss-critical)']

/** The shield beside a confidence term: its shape and tone tell the steps apart without relying on color alone. */
export function ConfidenceIcon({ step, className = 'h-3.5 w-3.5' }: { step: number; className?: string }) {
  const Icon = CONFIDENCE_ICONS[step] ?? Shield
  return <Icon aria-hidden className={`shrink-0 ${className}`} style={{ color: CONFIDENCE_TONES[step] }} />
}

/** A rating chip: the merit adjective or DoD color name in the DoD colors, the confidence term itself for past
 *  performance, or (State & Local) points. Mirrors ss-workspace's Scorecard. */
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
  if (l.confidence != null) {
    return (
      <span title={tip} className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border font-semibold ${l.confidence === NEUTRAL_CONFIDENCE ? 'border-dashed' : ''} ${pad} ${dashed}`}
        style={{ background: l.bg, color: l.fg, borderColor: 'var(--ss-confidence-border)' }}>
        <ConfidenceIcon step={l.confidence} /><span className="truncate">{l.text}</span>
      </span>
    )
  }
  if (m === 'points') {
    return (
      <span title={tip} className={`inline-flex shrink-0 items-baseline gap-1 rounded-lg font-semibold tabular-nums ${pad} ${dashed}`} style={{ background: l.bg, color: l.fg }}>
        {l.text}{factor.weight != null && <span className="text-[0.8em] font-normal opacity-85">/ {factor.weight}</span>}
      </span>
    )
  }
  return (
    <span title={tip} className={`inline-flex max-w-full items-center gap-1.5 rounded-lg font-semibold ${pad} ${dashed}`} style={{ background: l.bg, color: l.fg }}>
      <span className="truncate">{l.text}</span>
    </span>
  )
}

/** Tooltip text: what the display means, plus the stored scale term when it differs from what's shown. */
export function ratingTip(m: RatingMethod, l: Look, max?: number) {
  if (l.confidence != null) return l.confidence === NEUTRAL_CONFIDENCE ? `${l.official}: no recent, relevant performance record; neither favorable nor unfavorable` : l.official
  const shown = m === 'color' ? `${l.text} · ${l.word}` : m === 'points' ? `${l.text}${max != null ? ` of ${max} points` : ''} · ${l.word}` : l.word
  return [shown, l.official !== l.word ? l.official : ''].filter(Boolean).join(' — ')
}

/** Detail views only: the adjective under a DoD color, and the stored scale term when it differs.
 *  `officialOnly` where the adjective is already on screen, e.g. under a RatingPicker. */
export function OfficialTerm({ plan, factor, rating, method, officialOnly }: { plan: Plan; factor: Factor; rating?: string; method?: RatingMethod; officialOnly?: boolean }) {
  const m = method ?? methodOf(plan)
  const i = level(plan, factor, rating)
  if (!rating || i == null) return null
  const l = look(m, i, rating, lookOf(plan, factor))
  if (l.confidence != null) return null
  const parts = [m !== 'adjectival' && !officialOnly ? l.word : '', l.official !== l.word ? `Official rating: ${l.official}` : ''].filter(Boolean)
  return parts.length ? <span className="text-xs text-muted-foreground">{parts.join(' · ')}</span> : null
}

/** The legend, best to worst: the merit steps in their colors, then (when a factor uses it) the past performance
 *  confidence terms. `words` are the plan's step words (wordsOf); under points each step shows its share of the points. */
export function RatingLegend({ factors, method, words, confidenceWords = CONFIDENCE_TERMS }: {
  factors: Factor[]; method: RatingMethod; words?: LookOptions['words']; confidenceWords?: readonly string[]
}) {
  const confidence = factors.some((f) => f.scale === 'confidence') && method !== 'points'
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
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
      </div>
      {confidence && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-0.5 text-muted-foreground">Past performance
            <Info label="About past performance confidence ratings">
              Confidence assessments carry no colors. {confidenceWords[NEUTRAL_CONFIDENCE]} means no recent, relevant performance record, so it is neither favorable nor unfavorable (FAR 15.305(a)(2)(iv)): not a midpoint between the other ratings.
            </Info>
          </span>
          {confidenceWords.slice(0, 5).map((term, i) => (
            <span key={term} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-semibold ${i === NEUTRAL_CONFIDENCE ? 'border-dashed' : ''}`}
              style={{ background: 'var(--ss-confidence)', color: 'var(--ss-confidence-fg)', borderColor: 'var(--ss-confidence-border)' }}>
              <ConfidenceIcon step={i} className="h-3 w-3" />{term}
            </span>
          ))}
        </div>
      )}
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
