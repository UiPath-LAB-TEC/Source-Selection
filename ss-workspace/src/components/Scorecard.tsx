import { ArrowRight, ChevronDown, Trophy, Users } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@uipath/apollo-wind/components/ui/toggle-group'
import { KindBadge } from './Bits'
import { PersonaAvatar } from './Flair'
import { KIND_ORDER, rank } from '../lib/eval'
import type { Cell } from '../lib/eval'
import { Rating } from '@forms/components/Bits'
import { level, look, lookOf, methodsFor } from '../lib/ratings'
import { titled, useTerms, useVolumeLabel } from '@forms/lib/terms'
import type { Framework } from '@forms/lib/terms'
import { evaluatorBySlot, withEvaluatorNames } from '../lib/types'
import type { Factor, Finding, Plan, RatingMethod } from '../lib/types'

/** Rating chips and the legend are the task forms' own, so the workspace and Action Center show ratings alike. */
export { Rating, RatingLegend } from '@forms/components/Bits'

/** Back-compat wrapper used by the trace page. */
export function RatingPill(p: { plan: Plan; factor: Factor; rating?: string; size?: 'sm' | 'md'; pending?: boolean }) {
  return <Rating {...p} />
}

export function MethodToggle({ value, onChange, framework = 'federal' }: { value: RatingMethod; onChange: (m: RatingMethod) => void; framework?: Framework }) {
  return (
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v as RatingMethod)} className="rounded-lg border border-border p-0.5" aria-label="Rating display">
      {methodsFor(framework).map((m) => (
        <ToggleGroupItem key={m.id} value={m.id} className="h-7 px-2.5 text-xs" title={m.hint}>{m.label}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** Under the chip: the adjective (for color/numeric) and the official confidence term when it differs. */
function OfficialTerm({ plan, factor, rating, method }: { plan: Plan; factor: Factor; rating?: string; method: RatingMethod }) {
  const i = level(plan, factor, rating)
  if (!rating || i == null) return null
  const l = look(method, i, rating, lookOf(plan, factor))
  const parts = [method !== 'adjectival' ? l.word : '', l.official !== l.word ? `Official rating: ${l.official}` : ''].filter(Boolean)
  return parts.length ? <span className="text-sm text-muted-foreground">{parts.join(' · ')}</span> : null
}

function median(plan: Plan, factor: Factor, c: Cell) {
  if (!c.individual.length) return undefined
  return [...c.individual].sort((a, b) => rank(plan, factor, a.Rating) - rank(plan, factor, b.Rating))[Math.floor(c.individual.length / 2)].Rating
}

/** One offeror × factor cell: the rating, plus a quiet marker when evaluators split. Detail opens on click. */
export function ScoreCell({ plan, factor, c, leader, hideOthers, mySlot, method, onOpen }: {
  plan: Plan; factor: Factor; c: Cell; leader: boolean; hideOthers: boolean; mySlot?: number; method: RatingMethod; onOpen: () => void
}) {
  const mine = c.individual.find((r) => r.EvaluatorSlot === mySlot)
  const shown = c.consensus?.Rating ?? (hideOthers ? mine?.Rating : median(plan, factor, c))
  const t = useTerms()
  const status = c.consensus ? null : hideOthers ? `Your ${t.rating}` : c.individual.length ? 'Pending consensus' : null
  return (
    <button onClick={onOpen} aria-label={`${factor.name}: ${shown ?? 'not rated'}. Open detail`}
      className="ss-lift group flex h-full min-h-[64px] w-full items-center justify-between gap-2 rounded-xl border border-border bg-background/60 px-3 py-2.5 text-left hover:border-primary">
      <span className="flex min-w-0 flex-col gap-1">
        <Rating plan={plan} factor={factor} rating={shown} method={method} pending={!c.consensus && !hideOthers} />
        {status && <span className="text-[11px] text-muted-foreground">{status}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {!hideOthers && c.spread >= 1 && (
          <span title={`${c.spread >= 2 ? 'Disagreement' : 'Split'}: evaluators were ${c.spread} step${c.spread > 1 ? 's' : ''} apart`}
            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${c.spread >= 2 ? 'bg-[var(--ss-critical)]/15 text-[var(--ss-critical)]' : 'bg-[var(--ss-warn)]/15 text-[var(--ss-warn)]'}`}>
            <Users className="h-3 w-3" />Split
          </span>
        )}
        {leader && <Trophy className="h-4 w-4 text-primary" aria-label={`Leads this ${t.factor}`} />}
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
    </button>
  )
}

/**
 * Side-panel detail for one cell: who rated what and why, the consensus, and the supporting findings. With
 * `workingPapers` (the SSA's view) the individual ratings come last and collapsed: the SSA decides from the SSEB
 * consensus, and the pre-consensus ratings stay in the record to open on purpose.
 */
export function RatingDetail({ plan, factor, c, findings, hideOthers, mySlot, method, onTrace, workingPapers }: {
  plan: Plan; factor: Factor; c: Cell; findings: Finding[]; hideOthers: boolean; mySlot?: number; method: RatingMethod; onTrace: () => void
  workingPapers?: boolean
}) {
  const people = hideOthers ? c.individual.filter((r) => r.EvaluatorSlot === mySlot) : c.individual
  const support = findings.filter((f) => f.Origin === 'Evaluator' && f.Status !== 'Rejected' && (!hideOthers || f.EvaluatorSlot === mySlot))
  const unique = [...new Map(support.map((f) => [f.FindingText, f])).values()].sort((a, b) => KIND_ORDER.indexOf(a.Kind) - KIND_ORDER.indexOf(b.Kind))
  const individual = <IndividualRatings plan={plan} factor={factor} people={people} spread={c.spread} hideOthers={hideOthers} method={method} />
  const t = useTerms()
  const volumeLabel = useVolumeLabel()
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.consensus ? `${t.board} consensus` : hideOthers ? `Your ${t.rating}` : 'Awaiting consensus'}</p>
        <div className="flex items-center gap-3">
          <Rating plan={plan} factor={factor} rating={c.consensus?.Rating ?? people[0]?.Rating} method={method} size="lg" pending={!c.consensus} />
          <OfficialTerm plan={plan} factor={factor} rating={c.consensus?.Rating ?? people[0]?.Rating} method={method} />
        </div>
        {c.consensus?.Rationale && <p className="text-sm">{withEvaluatorNames(c.consensus.Rationale)}</p>}
      </section>

      {!workingPapers && <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Individual {t.ratings}</p>
        {individual}
      </section>}

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Supporting findings ({unique.length})</p>
        {!unique.length && <p className="text-sm text-muted-foreground">No findings accepted yet.</p>}
        <ul className="space-y-2">
          {unique.slice(0, 6).map((f) => (
            <li key={f.FindingId} className="space-y-1 rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <KindBadge kind={f.Kind} />
                <span className="text-xs text-muted-foreground">{volumeLabel(f.CitationVolume)}, p. {f.CitationPage}</span>
              </div>
              <p className="text-sm">{f.FindingText}</p>
            </li>
          ))}
        </ul>
      </section>

      {workingPapers && (
        <details className="group rounded-xl border border-border">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">Pre-consensus {t.ratings} ({people.length})</span>
              <span className="block text-xs text-muted-foreground">Evaluator working papers. The {t.sled ? 'committee' : 'SSEB'} consensus above is the evaluation of record.</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-border p-3">{individual}</div>
        </details>
      )}

      <Button className="w-full" onClick={onTrace}>Open full evidence trace<ArrowRight className="ml-1.5 h-4 w-4" /></Button>
    </div>
  )
}

function IndividualRatings({ plan, factor, people, spread, hideOthers, method }: {
  plan: Plan; factor: Factor; people: Cell['individual']; spread: number; hideOthers: boolean; method: RatingMethod
}) {
  const t = useTerms()
  return (
    <>
      {!people.length && <p className="text-sm text-muted-foreground">No individual {t.ratings} yet.</p>}
      <ul className="space-y-2">
        {people.map((r) => {
          const who = evaluatorBySlot(r.EvaluatorSlot)
          return (
            <li key={r.RatingId} className="flex gap-3 rounded-xl border border-border p-3">
              {who ? <PersonaAvatar id={who.id} short={who.short} size={36} /> : null}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{who?.name ?? `Evaluator ${r.EvaluatorSlot}`}</div>
                    <div className="truncate text-xs text-muted-foreground">{who && titled(who, t.id).label}</div>
                  </div>
                  <Rating plan={plan} factor={factor} rating={r.Rating} method={method} size="sm" />
                </div>
                {r.Rationale && <p className="text-sm text-muted-foreground">{r.Rationale}</p>}
              </div>
            </li>
          )
        })}
      </ul>
      {!hideOthers && spread >= 1 && (
        <p className="text-xs text-[var(--ss-warn)]">Evaluators were {spread} step{spread > 1 ? 's' : ''} apart — the {t.chair} reconciled this at consensus.</p>
      )}
    </>
  )
}
