import { ArrowRight, ChevronDown, ChevronRight, Trophy, Users } from 'lucide-react'
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

/** Under the chip: the adjective under a DoD color, and the stored scale term when it differs. */
function OfficialTerm({ plan, factor, rating, method }: { plan: Plan; factor: Factor; rating?: string; method: RatingMethod }) {
  const i = level(plan, factor, rating)
  if (!rating || i == null) return null
  const l = look(method, i, rating, lookOf(plan, factor))
  if (l.confidence != null) return null
  const parts = [method !== 'adjectival' ? l.word : '', l.official !== l.word ? `Official rating: ${l.official}` : ''].filter(Boolean)
  return parts.length ? <span className="text-sm text-muted-foreground">{parts.join(' · ')}</span> : null
}

/** The evaluators' ratings grouped by step, best first: what a split actually is, with no averaged stand-in. */
function spreadOf(plan: Plan, factor: Factor, ratings: Cell['individual']) {
  const counts = new Map<string, number>()
  for (const r of ratings) counts.set(r.Rating, (counts.get(r.Rating) ?? 0) + 1)
  return [...counts].sort(([a], [b]) => rank(plan, factor, a) - rank(plan, factor, b)).map(([rating, n]) => ({ rating, n }))
}

/** "2 Outstanding · 1 Good", in the step's word (or confidence term) whatever the display method. */
function spreadText(plan: Plan, factor: Factor, ratings: Cell['individual'], method: RatingMethod) {
  return spreadOf(plan, factor, ratings).map(({ rating, n }) => {
    const i = level(plan, factor, rating)
    return `${n} ${i == null ? rating : look(method, i, rating, lookOf(plan, factor)).word}`
  }).join(' · ')
}

/** An unreconciled split: each distinct rating the evaluators gave, with how many gave it. */
function RatingSpread({ plan, factor, ratings, method, size = 'md' }: { plan: Plan; factor: Factor; ratings: Cell['individual']; method: RatingMethod; size?: 'md' | 'lg' }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {spreadOf(plan, factor, ratings).map(({ rating, n }) => (
        <span key={rating} className="inline-flex items-center gap-1">
          <Rating plan={plan} factor={factor} rating={rating} method={method} size={size === 'lg' ? 'md' : 'sm'} />
          {n > 1 && <span className="text-xs font-semibold tabular-nums text-foreground/80">×{n}</span>}
        </span>
      ))}
    </span>
  )
}

/** A split with no consensus yet: there is no rating of record, so the cell says so under the evaluators' own ratings. */
function PendingSplit({ spread }: { spread: number }) {
  const color = spread >= 2 ? 'var(--ss-critical)' : 'var(--ss-warn)'
  return (
    <span className="flex w-full items-start gap-1.5 rounded-md border-l-[3px] px-1.5 py-1 text-xs font-medium text-foreground"
      style={{ borderColor: color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      <Users aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" style={{ color }} />
      <span>{spread >= 2 ? `Wide split (${spread} steps)` : 'Split'} · consensus pending</span>
    </span>
  )
}

/**
 * One offeror × factor cell: the rating and, on the top consensus rating, a gold trophy. Before consensus: the
 * evaluators' shared rating, or on a split each of their ratings; never a median that looks official. How a reconciled
 * split was decided is in the detail panel, not the grid.
 */
export function ScoreCell({ plan, factor, c, leader, hideOthers, mySlot, method, onOpen }: {
  plan: Plan; factor: Factor; c: Cell; leader: boolean; hideOthers: boolean; mySlot?: number; method: RatingMethod; onOpen: () => void
}) {
  const t = useTerms()
  const mine = c.individual.find((r) => r.EvaluatorSlot === mySlot)
  const split = !hideOthers && c.spread >= 1
  const unreconciled = split && !c.consensus
  const shown = c.consensus?.Rating ?? (hideOthers ? mine?.Rating : c.individual[0]?.Rating)
  const status = c.consensus ? null : hideOthers ? `Your ${t.rating}` : c.individual.length && !split ? 'Agreed · consensus pending' : null
  const label = unreconciled ? `split, ${spreadText(plan, factor, c.individual, method)}, consensus pending` : shown ?? 'not rated'
  return (
    // Each cell is its own target (the row is not): an outline on hover or focus, and a chevron that's always there.
    <button onClick={onOpen} aria-label={`${factor.name}: ${label}. Open details`} title="Open details"
      className="group flex h-full w-full flex-col items-start gap-1.5 rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:border-border hover:bg-muted/60 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
      <span className="flex w-full items-center justify-between gap-2">
        {unreconciled ? <RatingSpread plan={plan} factor={factor} ratings={c.individual} method={method} />
          : <Rating plan={plan} factor={factor} rating={shown} method={method} pending={!c.consensus && !hideOthers} />}
        <span className="flex shrink-0 items-center gap-1">
          {leader && c.consensus && <span title={`Highest rated: top consensus ${t.rating} on this ${t.factor}`} className="inline-flex"><Trophy role="img" aria-label="Highest rated" className="h-4 w-4" style={{ color: 'var(--ss-gold)', fill: 'color-mix(in srgb, var(--ss-gold) 30%, transparent)' }} /></span>}
          <ChevronRight aria-hidden className="h-4 w-4 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-foreground group-focus-visible:text-foreground" />
        </span>
      </span>
      {unreconciled && <PendingSplit spread={c.spread} />}
      {status && <span className="text-xs text-muted-foreground">{status}</span>}
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
  const individual = <IndividualRatings plan={plan} factor={factor} people={people} spread={c.spread} reconciled={!!c.consensus} hideOthers={hideOthers} method={method} />
  const t = useTerms()
  const volumeLabel = useVolumeLabel()
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.consensus ? `${t.board} consensus` : hideOthers ? `Your ${t.rating}` : c.spread >= 1 ? 'Split · consensus pending' : 'Agreed · consensus pending'}</p>
        {!c.consensus && !hideOthers && c.spread >= 1 ? <RatingSpread plan={plan} factor={factor} ratings={people} method={method} size="lg" /> : (
          <div className="flex flex-wrap items-center gap-3">
            <Rating plan={plan} factor={factor} rating={c.consensus?.Rating ?? people[0]?.Rating} method={method} size="lg" pending={!c.consensus} />
            <OfficialTerm plan={plan} factor={factor} rating={c.consensus?.Rating ?? people[0]?.Rating} method={method} />
            {/* A split the Chair decided matters to the SSA and to a protest record, so it's called out in the split's amber. */}
            {c.consensus && !hideOthers && c.spread >= 1 && (
              <span className="flex w-full items-start gap-2 rounded-md border-l-4 px-2.5 py-1.5 text-sm text-foreground"
                style={{ borderColor: 'var(--ss-warn)', background: 'color-mix(in srgb, var(--ss-warn) 14%, transparent)' }}>
                <Users aria-hidden className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--ss-warn)' }} />
                <span className="font-semibold" title={`Evaluators split: ${spreadText(plan, factor, c.individual, method)}`}>Reconciled at consensus</span>
              </span>
            )}
          </div>
        )}
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

function IndividualRatings({ plan, factor, people, spread, reconciled, hideOthers, method }: {
  plan: Plan; factor: Factor; people: Cell['individual']; spread: number; reconciled: boolean; hideOthers: boolean; method: RatingMethod
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
        <p className="text-xs text-muted-foreground">Evaluators were {spread} step{spread > 1 ? 's' : ''} apart. {reconciled ? `The ${t.chair} reconciled this at consensus.` : `The ${t.chair} reconciles it at consensus; until then there is no ${t.rating} of record.`}</p>
      )}
    </>
  )
}
