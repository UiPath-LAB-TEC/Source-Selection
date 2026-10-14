import { ArrowRight, ChevronDown, Users } from 'lucide-react'
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

function median(plan: Plan, factor: Factor, c: Cell) {
  if (!c.individual.length) return undefined
  return [...c.individual].sort((a, b) => rank(plan, factor, a.Rating) - rank(plan, factor, b.Rating))[Math.floor(c.individual.length / 2)].Rating
}

/**
 * The findings behind a cell as strengths · weaknesses · deficiencies, deduplicated by text (evaluators often accept the
 * same draft). Evaluators' accepted findings once there are any (only your own during independent evaluation), else
 * the agent's drafts.
 */
export function findingCounts(findings: Finding[], hideOthers: boolean, mySlot?: number) {
  const evaluated = findings.filter((f) => f.Origin === 'Evaluator' && f.Status !== 'Rejected' && (!hideOthers || f.EvaluatorSlot === mySlot))
  const pool = evaluated.length ? evaluated : findings.filter((f) => f.Origin === 'Agent' && f.Status !== 'Rejected')
  const unique = [...new Map(pool.map((f) => [f.FindingText, f])).values()]
  const n = (re: RegExp) => unique.filter((f) => re.test(f.Kind)).length
  return { s: n(/Strength/), w: n(/Weakness/), d: n(/Deficiency/), risks: n(/Risk/), significant: n(/Significant/), total: unique.length, drafted: !evaluated.length }
}

function FindingCounts({ n }: { n: ReturnType<typeof findingCounts> }) {
  const tip = [`${n.s} strength${n.s === 1 ? '' : 's'}`, `${n.w} weakness${n.w === 1 ? '' : 'es'}`, `${n.d} deficienc${n.d === 1 ? 'y' : 'ies'}`,
    n.significant ? `${n.significant} significant` : '', n.risks ? `${n.risks} risk${n.risks === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ')
  return (
    <span title={`${tip}${n.drafted ? ' (agent drafts, not yet reviewed)' : ''}`} className="text-xs font-medium tabular-nums text-foreground/80">
      {n.s} S · {n.w} W · {n.d} D{n.drafted && <span className="font-normal text-muted-foreground"> drafted</span>}
    </span>
  )
}

/** A split, said plainly: how far apart the evaluators were and which rating the chip is showing. */
function SplitNote({ spread, consensus }: { spread: number; consensus: boolean }) {
  const wide = spread >= 2
  const color = wide ? 'var(--ss-critical)' : 'var(--ss-warn)'
  return (
    <span className="flex w-full items-start gap-1.5 rounded-md border-l-[3px] px-1.5 py-1 text-xs font-medium text-foreground"
      style={{ borderColor: color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      <Users aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" style={{ color }} />
      <span>{wide ? `Wide split (${spread} steps)` : 'Split'} · {consensus ? 'consensus rating shown' : 'median shown, consensus pending'}</span>
    </span>
  )
}

/** One offeror × factor cell: the rating, the findings behind it, and a plain note when evaluators split. Detail on click. */
export function ScoreCell({ plan, factor, c, findings, leader, hideOthers, mySlot, method, onOpen }: {
  plan: Plan; factor: Factor; c: Cell; findings: Finding[]; leader: boolean; hideOthers: boolean; mySlot?: number; method: RatingMethod; onOpen: () => void
}) {
  const mine = c.individual.find((r) => r.EvaluatorSlot === mySlot)
  const shown = c.consensus?.Rating ?? (hideOthers ? mine?.Rating : median(plan, factor, c))
  const t = useTerms()
  const n = findingCounts(findings, hideOthers, mySlot)
  const split = !hideOthers && c.spread >= 1
  const status = c.consensus ? null : hideOthers ? `Your ${t.rating}` : c.individual.length && !split ? 'Pending consensus' : null
  return (
    <button onClick={onOpen} aria-label={`${factor.name}: ${shown ?? 'not rated'}. Open detail`}
      className="flex h-full w-full flex-col items-start gap-1.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex w-full items-center justify-between gap-2">
        <Rating plan={plan} factor={factor} rating={shown} method={method} pending={!c.consensus && !hideOthers} />
        {leader && <span className="shrink-0 text-xs text-muted-foreground">Highest rated</span>}
      </span>
      {n.total > 0 && <FindingCounts n={n} />}
      {split && <SplitNote spread={c.spread} consensus={!!c.consensus} />}
      {status && <span className="text-xs text-muted-foreground">{status}</span>}
    </button>
  )
}

/** What the matrix's markers mean, under the rating legend. */
export function MatrixKey({ hideOthers }: { hideOthers: boolean }) {
  const t = useTerms()
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
      <span><span className="font-medium tabular-nums text-foreground">3 S · 1 W · 0 D</span> strengths · weaknesses · deficiencies behind the {t.rating}</span>
      {!hideOthers && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md border-l-[3px] px-1.5 py-0.5 font-medium text-foreground" style={{ borderColor: 'var(--ss-warn)', background: 'color-mix(in srgb, var(--ss-warn) 14%, transparent)' }}>
            <Users aria-hidden className="h-3 w-3" style={{ color: 'var(--ss-warn)' }} />Split
          </span>
          evaluators differ; the median shows until {t.theBoard} reaches consensus
        </span>
      )}
      <span><span className="text-foreground">Highest rated</span> top consensus {t.rating} on the {t.factor}</span>
    </div>
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
