import { Fragment, useRef, useState } from 'react'
import { AlertTriangle, BadgeDollarSign, ChevronDown, Gavel, ListChecks, MessageSquareReply, PenLine, ShieldCheck, Trophy } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { ComplianceBadge, KindBadge, Pill, Rating, RatingLegend } from '../components/Bits'
import { OfferorAvatar, PersonaAvatar } from '../components/Flair'
import { cell, findingsFor, money, rank, rated } from '../lib/eval'
import { methodOf, wordsOf } from '../lib/ratings'
import { ordinal, scoreFor, scores } from '../lib/score'
import { costPoints, pts, titled, useTerms } from '../lib/terms'
import type { Terms } from '../lib/terms'
import { evaluatorBySlot, importanceOf, persona } from '../lib/types'
import type { Offeror, Plan, Rating as RatingRow } from '../lib/types'
import { AgentMark, Field, FormShell, Panel, auditRow, nowIso, textareaCls, useForm, withEvaluatorNames } from './common'

const parse = <T,>(s: unknown, fallback: T): T => {
  try { return typeof s === 'string' ? (s.trim() ? JSON.parse(s) as T : fallback) : (s as T) ?? fallback } catch { return fallback }
}

// ------------------------------------------------------------- CO: release

export function ReleaseForm() {
  const { backend, task, data, sol, plan, update } = useForm()
  const t = useTerms()
  const [rationale, setRationale] = useState(task.data.notes ?? '')
  const [busy, setBusy] = useState(false)
  const concerns = data.offerors.filter((o) => o.ComplianceStatus && o.ComplianceStatus !== 'Compliant')

  const finish = async (outcome: 'Release' | 'CancelSolicitation') => {
    setBusy(true)
    try {
      const decision = outcome === 'Release' ? 'Release' : 'Cancel'
      await backend.upsert('decisions', 'DecisionId', [{ DecisionId: `${sol.SolicitationId}-release`, SolicitationId: sol.SolicitationId, Kind: decision === 'Release' ? 'Release' : 'Cancel',
        Outcome: decision, Rationale: rationale, DecidedBy: task.actor, DecidedAt: nowIso() }])
      await backend.upsert('audit', 'EventId', [auditRow(sol.SolicitationId, 'case', decision === 'Release' ? 'ProposalsReleased' : 'SolicitationCancelled', t.co, rationale)])
      const patch = { decision, notes: rationale }
      update(patch)
      await backend.complete(outcome, { ...task.data, ...patch })
      backend.notify(decision === 'Release' ? `Proposals released to ${t.theBoard}` : `${t.Solicitation} cancelled`, 'success')
    } catch (e) { backend.notify(`Could not complete: ${(e as Error).message}`, 'error') } finally { setBusy(false) }
  }

  return (
    <FormShell eyebrow="Release to evaluation" title={plan.title} who={persona('co')} readOnly={task.isReadOnly}
      subtitle={`${sol.SolicitationId} · ${data.offerors.length} proposals received · ${concerns.length} flagged`}
      footer={<>
        <Button variant="outline" disabled={busy || task.isReadOnly || !rationale.trim()} onClick={() => finish('CancelSolicitation')}>Cancel {t.solicitation}</Button>
        <Button disabled={busy || task.isReadOnly || !rationale.trim()} onClick={() => finish('Release')}>{t.sled ? 'Release to committee' : 'Release to SSEB'}</Button>
      </>}>
      <Panel title={t.sled ? 'Responsiveness and responsibility screen' : 'Compliance and responsibility screen'} icon={<ShieldCheck className="h-4 w-4 text-primary" />}
        description={t.sled
          ? 'Required sections, page limits, state vendor registration and the debarment list — checked by robots before you decide.'
          : 'Volumes, page limits, SAM registration, exclusions and FAPIIS — checked by robots before you decide.'}>
        <div className="space-y-3">
          {data.offerors.map((o, n) => (
            <div key={o.OfferorId} className="flex flex-wrap items-start gap-3 rounded-xl border border-border p-3">
              <OfferorAvatar name={o.Name} index={n} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{o.Name}</span><ComplianceBadge status={o.ComplianceStatus} /><Pill>{t.registration} {o.SamStatus ?? '—'}</Pill></div>
                <p className="mt-1 text-sm text-muted-foreground">{o.ComplianceNotes}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{t.sled ? `Vendor ID ${o.UEI} · Tax ID on file` : `UEI ${o.UEI} · CAGE ${o.CAGE}`}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Your determination">
        <Field label="Rationale" hint={`Recorded in the ${t.sled ? 'procurement' : 'source selection'} file and the audit trail.`}>
          <textarea className={textareaCls} rows={4} value={rationale} disabled={task.isReadOnly} onChange={(e) => setRationale(e.target.value)}
            placeholder={t.sled
              ? 'e.g. All proposals are responsive to the RFP and are released to the evaluation committee. Vendor registration concerns will be resolved before the recommendation of award.'
              : 'e.g. All proposals are compliant with the submission instructions and are released to the SSEB. Responsibility concerns will be resolved before award.'} />
        </Field>
      </Panel>
    </FormShell>
  )
}

// --------------------------------------------------------------- CO: price

interface PriceRow { offerorId: string; name: string; total: number; igceVariancePct: number; unbalanced: string[] }

/** An offeror's CLIN (or price item) schedule as a sentence (for screen readers), from the robot's PriceLinesJson. */
function priceLinesText(json: string, t: Terms) {
  try {
    const lines = JSON.parse(json) as { clin: string; description?: string; amount: number }[]
    return lines.map((l) => `${t.clin} ${l.clin}${l.description ? ` ${l.description}` : ''}: ${money(l.amount)}`).join('; ')
  } catch { return '' }
}

export function PriceForm() {
  const { backend, task, data, sol, plan, update } = useForm()
  const t = useTerms()
  // State & Local: cost points by formula, lowest total cost earns them all.
  const costFactor = plan.factors.find((f) => f.evaluatedNotRated)
  const parsed = parse<unknown>(task.data.priceAnalysis, [])
  const rows = (Array.isArray(parsed) ? parsed as PriceRow[] : []).map((r) => ({ ...r, unbalanced: Array.isArray(r.unbalanced) ? r.unbalanced : [] }))
  const [text, setText] = useState(task.data.notes ?? '')
  const [busy, setBusy] = useState(false)
  const max = Math.max(plan.igce.total, ...rows.map((r) => r.total)) * 1.05
  const lowest = rows.length ? Math.min(...rows.map((r) => r.total)) : undefined
  const pointsOf = (total: number) => (t.sled && costFactor?.weight != null ? costPoints(costFactor.weight, total, lowest) : undefined)

  const finish = async (outcome: 'Proceed' | 'CancelSolicitation') => {
    setBusy(true)
    try {
      const decision = outcome === 'Proceed' ? 'Proceed' : 'Cancel'
      await backend.upsert('offerors', 'OfferorId', rows.map((r) => ({ OfferorId: r.offerorId, TotalEvaluatedPrice: r.total, IgceVariancePct: Math.round(r.igceVariancePct * 100) / 100 })))
      await backend.upsert('decisions', 'DecisionId', [{ DecisionId: `${sol.SolicitationId}-price`, SolicitationId: sol.SolicitationId, Kind: decision === 'Proceed' ? 'Price' : 'Cancel',
        Outcome: decision, Rationale: text, DecidedBy: task.actor, DecidedAt: nowIso() }])
      await backend.upsert('audit', 'EventId', [auditRow(sol.SolicitationId, 'case', 'PriceDetermined', t.co, text)])
      const patch = { decision, notes: text }
      update(patch)
      await backend.complete(outcome, { ...task.data, ...patch })
      backend.notify(t.sled ? 'Cost evaluation recorded' : 'Price determination recorded', 'success')
    } catch (e) { backend.notify(`Could not complete: ${(e as Error).message}`, 'error') } finally { setBusy(false) }
  }

  return (
    <FormShell eyebrow={t.sled ? 'Cost evaluation' : 'Price evaluation'} title={plan.title} who={persona('co')} readOnly={task.isReadOnly}
      subtitle={`${sol.SolicitationId} · ${t.sled ? 'Cost estimate' : 'IGCE'} ${money(plan.igce.total)}`}
      footer={<>
        <Button variant="outline" disabled={busy || task.isReadOnly || !text.trim()} onClick={() => finish('CancelSolicitation')}>Cancel {t.solicitation}</Button>
        <Button disabled={busy || task.isReadOnly || !text.trim()} onClick={() => finish('Proceed')}>{t.sled ? 'Proceed to award recommendation' : 'Proceed to award decision'}</Button>
      </>}>
      <Panel title={t.sled ? 'Total cost vs the District cost estimate' : 'Total evaluated price vs IGCE'} icon={<BadgeDollarSign className="h-4 w-4 text-primary" />}
        description={t.sled && costFactor?.weight != null
          ? `Computed by robots from the extracted price schedules. Cost points: the lowest total earns all ${costFactor.weight}; each other earns (lowest ÷ its cost) × ${costFactor.weight}.`
          : 'Computed by robots from the extracted price schedules.'}>
        <div className="space-y-4">
          {rows.map((r, n) => {
            const o = data.offerors.find((x) => x.OfferorId === r.offerorId)
            return (
              <div key={r.offerorId} className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <OfferorAvatar name={r.name} index={n} size={24} /><span className="font-medium">{r.name}</span>
                  {r.unbalanced.length > 0 && <Pill>Potentially unbalanced: {r.unbalanced.join(', ')}</Pill>}
                  <span className="ml-auto tabular-nums font-medium">{money(r.total)}</span>
                  <span className={`w-16 text-right text-xs tabular-nums ${r.igceVariancePct > 0 ? 'text-[var(--ss-serious)]' : 'text-[var(--ss-good)]'}`}>{r.igceVariancePct > 0 ? '+' : ''}{r.igceVariancePct.toFixed(1)}%</span>
                  {pointsOf(r.total) != null && <span className="w-24 text-right text-xs font-semibold tabular-nums" title="Cost points by formula">{pts(pointsOf(r.total))} / {costFactor?.weight} pts</span>}
                </div>
                <div className="relative h-3 rounded-full bg-muted">
                  <div className="h-3 rounded-full transition-[width] duration-700" style={{ width: `${(r.total / max) * 100}%`, background: 'linear-gradient(90deg, var(--ss-brand-2), var(--ss-brand-3))' }} />
                  <div className="absolute -top-1 h-5 w-0.5 bg-foreground/70" style={{ left: `${(plan.igce.total / max) * 100}%` }} title={`${t.sled ? 'Cost estimate' : 'IGCE'} ${money(plan.igce.total)}`} />
                </div>
                {o?.PriceLinesJson && <span className="sr-only">{priceLinesText(o.PriceLinesJson, t)}</span>}
              </div>
            )
          })}
          <p className="text-xs text-muted-foreground">The vertical marker is the {t.sled ? 'District cost estimate' : 'IGCE'} ({money(plan.igce.total)}).</p>
        </div>
      </Panel>
      <Panel title={t.sled ? 'Cost evaluation' : 'Price reasonableness determination'}>
        <textarea className={textareaCls} rows={4} value={text} disabled={task.isReadOnly} onChange={(e) => setText(e.target.value)}
          aria-label={t.sled ? 'Cost evaluation' : 'Price reasonableness determination'}
          placeholder={t.sled
            ? 'e.g. Cost points are assigned by the RFP formula. All totals are within a reasonable range of the District cost estimate; one proposer’s implementation item is well above the estimate line and is noted for clarification before award.'
            : 'e.g. Prices are fair and reasonable based on adequate price competition (FAR 15.404-1(b)(2)(i)) and comparison with the IGCE. Northstar CLIN 0005 is materially below the IGCE line and is noted as a performance risk.'} />
      </Panel>
    </FormShell>
  )
}

// ------------------------------------------------------------- SSA: award

/** SSDecision.DocumentText is a Data Fabric MULTILINE_TEXT capped at 10,000 characters; the SSDD keeps room for the signature block. */
export const SSDD_LIMIT = 9_500
const DOCUMENT_LIMIT = 10_000
const n = (x: number) => x.toLocaleString('en-US')
const asText = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v, null, 2))

/** A signature rule: a line of underscores, or one already signed ("/s/ Name"). */
const RULE = /^[ \t]*(?:_{5,}|\/s\/ .*)[ \t]*$/

/**
 * Fill the SSDD's signature block for the SSA: the printed name under the signature rule, and the date. The decision
 * writer leaves both blank ("____" and "Date: ____"). Safe to run again; a draft with no block is left alone.
 */
export function fillSignatureBlock(text: string, name: string, date: string) {
  return text
    .replace(/^([ \t]*_{5,}[ \t]*)\n([ \t]*(?:Source Selection Authority|Award Authority)\b)/m, `$1\n${name}\n$2`)
    .replace(/^([ \t]*Date:[ \t]*)_{3,}[ \t]*$/m, `$1${date}`)
    .replace(/\[(?:SSA|Source Selection Authority|Award Authority)?\s*(?:name)\]/gi, name)
    .replace(/\[(?:signature )?date\]/gi, date)
}

/** The decision writer's Section 5 placeholder, left for the SSA (or, State & Local, the Award Authority). */
const DECISION_PLACEHOLDER = /\[(?:The )?(?:Source Selection Authority|Award Authority)['’]s independent (?:decision|recommendation)[^\]]*\]/i

const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/**
 * A first-person decision statement for the offeror the SSA selected, drawn only from the record: the consensus ratings,
 * total evaluated prices and, against each other offeror, where the selection is rated higher or lower and what that
 * costs. A draft for the SSA to edit; the decision itself stays theirs (FAR 15.308).
 */
export function draftDecision(plan: Plan, offerors: Offeror[], ratings: RatingRow[], awardee: string) {
  if (plan.framework === 'sled') return draftRecommendation(plan, offerors, ratings, awardee)
  const a = offerors.find((o) => o.Name === awardee)
  if (!a) return ''
  const factors = rated(plan)
  const rating = (o: Offeror, f: (typeof factors)[number]) => cell(plan, f, ratings, o.OfferorId).consensus?.Rating
  const label = (f: (typeof factors)[number]) => (f.weight != null ? `${f.name} (${f.weight}%)` : f.name)
  const price = (o: Offeror) => o.TotalEvaluatedPrice ?? 0
  const igce = plan.igce?.total ?? 0
  const vsIgce = igce && a.TotalEvaluatedPrice != null
    ? ` (${Math.abs(((price(a) - igce) / igce) * 100).toFixed(1)}% ${price(a) >= igce ? 'above' : 'below'} the IGCE)` : ''
  const lines = [
    `Based on my review of the SSEB Consensus Report, the price analysis and the tradeoff analysis above, I select ${a.Name} for award as the best value to the Government.`,
    `${a.Name} is rated ${andList(factors.map((f) => `${rating(a, f) ?? 'not rated'} in ${f.name}`))}, at a total evaluated price of ${money(price(a))}${vsIgce}.`,
  ]
  // One sentence per kind of comparison, so offerors that compare the same way share it.
  const groups = new Map<string, { names: string[]; gaps: string[]; better: string[]; worse: string[]; dir: number }>()
  for (const o of offerors.filter((x) => x.OfferorId !== a.OfferorId)) {
    const better = factors.filter((f) => rank(plan, f, rating(a, f)) < rank(plan, f, rating(o, f))).map(label)
    const worse = factors.filter((f) => rank(plan, f, rating(a, f)) > rank(plan, f, rating(o, f))).map(label)
    const diff = price(a) - price(o)
    const dir = Math.sign(diff)
    const k = `${dir}|${better.join()}|${worse.join()}`
    const g = groups.get(k) ?? { names: [], gaps: [], better, worse, dir }
    g.names.push(o.Name)
    g.gaps.push(dir > 0 ? `${money(diff)} (${((diff / (price(o) || 1)) * 100).toFixed(1)}%)` : money(-diff))
    groups.set(k, g)
  }
  for (const { names, gaps, better, worse, dir } of groups.values()) {
    const who = andList(names)
    const many = names.length > 1
    const is = many ? 'are' : 'is'
    if (dir > 0 && better.length) {
      lines.push(`${who} ${is} ${andList(gaps)} lower in price${worse.length ? ` and rated higher in ${andList(worse)},` : ''} but rated lower in ${andList(better)}; I find ${a.Name}'s advantages worth the premium.`)
    } else if (dir > 0) {
      lines.push(`${who} ${is} rated as high or higher on every factor at ${andList(gaps)} less. [Explain why ${a.Name} is nonetheless the best value.]`)
    } else if (better.length) {
      lines.push(`${who} ${is} rated lower in ${andList(better)}${worse.length ? ` and higher in ${andList(worse)}` : ''} ${dir === 0 ? 'at the same price' : `and ${andList(gaps)} higher in price`}, so no price premium is involved.`)
    } else if (worse.length) {
      lines.push(`${who} ${is} rated higher in ${andList(worse)}, but I find ${many || worse.length > 1 ? 'those advantages' : 'that advantage'} not worth ${many ? 'their' : 'its'} ${andList(gaps)} higher price.`)
    } else {
      lines.push(`${who} ${is} rated the same ${dir === 0 ? 'at the same price' : `at ${andList(gaps)} more`}.`)
    }
  }
  lines.push('This decision reflects my independent judgment.')
  return lines.join('\n\n')
}

/**
 * State & Local: the Award Authority's recommendation for the proposer they selected, from the record — final scores
 * out of 100, how the selection earned its points, what separates it from the next proposer — then the Board approval
 * and Notice of Intent to Award that follow. A draft to edit; picking anyone but the top scorer leaves a reason to write.
 */
export function draftRecommendation(plan: Plan, offerors: Offeror[], ratings: RatingRow[], awardee: string) {
  const a = offerors.find((o) => o.Name === awardee)
  if (!a) return ''
  const all = scores(plan, offerors, ratings)
  const sa = scoreFor(all, a.OfferorId)
  if (!sa) return ''
  const factors = rated(plan)
  const costMax = plan.factors.find((f) => f.evaluatedNotRated)?.weight
  const total = (o: Offeror) => scoreFor(all, o.OfferorId)?.total ?? 0
  const ranked = [...offerors].sort((x, y) => total(y) - total(x))
  const estimate = plan.igce?.total ?? 0
  const price = a.TotalEvaluatedPrice
  const vs = estimate && price != null ? ` (${Math.abs(((price - estimate) / estimate) * 100).toFixed(1)}% ${price >= estimate ? 'above' : 'below'} the District cost estimate)` : ''
  const lines = [
    `Based on the Evaluation Committee Report and the cost evaluation, I recommend award to ${a.Name}, the ${sa.rank === 1 ? 'highest-scoring proposal' : `${ordinal(sa.rank)}-ranked proposal`}, with ${pts(sa.total)} of 100 points at a total cost of ${money(price)}${vs}.`,
    `Final scores: ${ranked.map((o) => `${o.Name} ${pts(total(o))}`).join('; ')}.`,
    `${a.Name} earned ${andList(factors.map((f) => `${pts(sa.byFactor[f.id])} of ${f.weight ?? '—'} points for ${f.name}`))}${costMax != null ? `, and ${pts(sa.cost)} of ${costMax} cost points` : ''}.`,
  ]
  const top = ranked[0]
  if (sa.rank !== 1 && top) {
    lines.push(`[Explain why ${a.Name} is recommended over the higher-scoring ${top.Name}.]`)
  } else if (ranked[1]) {
    const b = ranked[1]
    const sb = scoreFor(all, b.OfferorId)!
    const ahead = factors.filter((f) => (sa.byFactor[f.id] ?? 0) > (sb.byFactor[f.id] ?? 0)).map((f) => f.name)
    const costGap = (sb.cost ?? 0) - (sa.cost ?? 0)
    lines.push(`${a.Name} leads ${b.Name} by ${pts(Math.round((sa.total - sb.total) * 10) / 10)} points${ahead.length ? `, scoring higher in ${andList(ahead)}` : ''}${costGap > 0 ? `, which outweighs ${b.Name}'s ${pts(Math.round(costGap * 10) / 10)}-point advantage on cost` : ''}.`)
  }
  lines.push('Upon approval by the Board of Education, the Purchasing Department will issue a Notice of Intent to Award to every proposer. A proposer may protest in writing within five business days of the notice; the contract is executed after that period closes.')
  lines.push('This recommendation reflects my independent judgment.')
  return lines.join('\n\n')
}

/**
 * The signed SSDD: the typed signature goes on the signature rule (the last one, since the block closes the document),
 * or below the document when it has none.
 */
function signDocument(text: string, signature: string, date: string, title = 'Source Selection Authority') {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!RULE.test(lines[i])) continue
    lines[i] = `/s/ ${signature}`
    return lines.join('\n')
  }
  return `${text}\n\nSigned: ${signature}, ${title} — ${date}`
}

export function AwardDecision() {
  const { backend, task, data, sol, plan, update } = useForm()
  const t = useTerms()
  const factors = rated(plan)
  const priceFactor = plan.factors.find((f) => f.evaluatedNotRated)
  const ssa = titled(persona('ssa'), t.id)
  // State & Local: totals out of 100 and the ranking they give.
  const points = t.sled ? scores(plan, data.offerors, data.ratings) : []
  const [awardee, setAwardee] = useState(task.data.awardee || task.data.recommendedAwardee || '')
  const longDate = (d: Date) => d.toLocaleDateString('en-US', { dateStyle: 'long' })
  const [today] = useState(() => longDate(new Date()))
  // The signature block comes filled in with the SSA's name and today's date, and Section 5 with a decision statement
  // drafted for the selected offeror (redrafted when the SSA selects another, until the SSA edits it).
  const [initial] = useState(() => {
    const text = fillSignatureBlock(asText(task.data.payload || task.data.ssddDraft), ssa.name, today)
    const drafted = awardee && DECISION_PLACEHOLDER.test(text) ? draftDecision(plan, data.offerors, data.ratings, awardee) : ''
    return { text: drafted ? text.replace(DECISION_PLACEHOLDER, drafted) : text, drafted }
  })
  const [ssdd, setSsdd] = useState(initial.text)
  const drafted = useRef(initial.drafted)
  const select = (name: string) => {
    if (name === awardee) return
    setAwardee(name)
    const next = draftDecision(plan, data.offerors, data.ratings, name)
    const at = DECISION_PLACEHOLDER.test(ssdd) ? DECISION_PLACEHOLDER : drafted.current && ssdd.includes(drafted.current) ? drafted.current : undefined
    if (!at || !next) return backend.notify(`You've edited the decision in Section 5, so it wasn't redrafted for ${name}. Update it to match your selection.`, 'info')
    setSsdd(ssdd.replace(at, next))
    drafted.current = next
  }
  const [signature, setSignature] = useState('')
  const [busy, setBusy] = useState(false)
  // The basis behind each rating, one offeror or all at once: the SSA's decision has to be their own (FAR 15.308).
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const allOpen = data.offerors.length > 0 && data.offerors.every((o) => expanded.has(o.OfferorId))
  const toggle = (id: string) => setExpanded((e) => { const n = new Set(e); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const signed = (name: string, date: string) => signDocument(ssdd, name, date, t.ssa)
  // With a signature block, signing only fills its rule, so the SSDD can use the whole record field; without one the
  // signature line is appended and needs room.
  const limit = ssdd.split('\n').some((l) => RULE.test(l)) ? DOCUMENT_LIMIT : SSDD_LIMIT
  const over = ssdd.length - limit
  const tooLong = over > 0 || signed(signature, today).length > DOCUMENT_LIMIT
  const meter = ssdd.length / limit

  const sign = async () => {
    if (tooLong) return
    setBusy(true)
    try {
      const text = signed(signature, longDate(new Date()))
      await backend.upsert('decisions', 'DecisionId', [{ DecisionId: `${sol.SolicitationId}-award`, SolicitationId: sol.SolicitationId, Kind: 'Award', Outcome: 'Award',
        Rationale: t.sled ? `Recommend award to ${awardee}, ${pts(scoreFor(points, data.offerors.find((o) => o.Name === awardee)?.OfferorId ?? '')?.total)} of 100 points.` : `Award to ${awardee} as the best value.`,
        DecidedBy: task.actor, DecidedAt: nowIso(), DocumentText: text }])
      await backend.upsert('audit', 'EventId', [auditRow(sol.SolicitationId, 'case', 'AwardDecisionSigned', t.ssa, `${t.sled ? 'Recommend award to' : 'Award to'} ${awardee}`)])
      const patch = { decision: 'Signed', awardee, payload: text }
      update(patch)
      await backend.complete('SignDecision', { ...task.data, ...patch })
      backend.notify(t.sled ? 'Recommendation of award signed' : 'Source selection decision signed', 'success')
    } catch (e) { backend.notify(`Could not sign: ${(e as Error).message}`, 'error') } finally { setBusy(false) }
  }

  return (
    <FormShell eyebrow={t.sled ? 'Award recommendation' : 'Award decision'} title={plan.title} who={ssa} readOnly={task.isReadOnly}
      subtitle={`${sol.SolicitationId} · ${plan.basisForAward}`}
      footer={<>
        {tooLong
          ? <span className="mr-auto flex items-center gap-1.5 text-xs font-medium"><AlertTriangle className="h-3.5 w-3.5 text-[var(--ss-critical)]" />Shorten the {t.sled ? 'recommendation' : 'SSDD'} to {n(limit)} characters to sign.</span>
          : <span className="mr-auto text-xs text-muted-foreground">{t.sled ? 'Your recommendation must reflect your independent judgment. The Board of Education approves the award.' : 'Your decision must reflect your independent judgment (FAR 15.308).'}</span>}
        <Button disabled={busy || task.isReadOnly || !awardee || !ssdd.trim() || !signature.trim() || tooLong} onClick={sign}><PenLine className="mr-1.5 h-4 w-4" />{t.sled ? 'Sign recommendation' : 'Sign decision'}</Button>
      </>}>
      <Panel title={t.sled ? 'Score summary' : 'Comparative assessment'} icon={<Gavel className="h-4 w-4 text-primary" />} description={plan.relativeImportance}
        actions={<Button size="sm" variant="outline" aria-pressed={allOpen} onClick={() => setExpanded(allOpen ? new Set() : new Set(data.offerors.map((o) => o.OfferorId)))}>
          <ListChecks className="mr-1.5 h-4 w-4" />{allOpen ? `Hide ${t.rating} details` : `Show ${t.rating} details`}
        </Button>}>
        <div className="space-y-3">
          <RatingLegend factors={factors} method={methodOf(plan)} words={wordsOf(plan)} confidenceWords={plan.scales.confidence} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="text-left align-bottom text-xs text-muted-foreground">
                <th className="pb-2 font-medium">{t.Offeror}</th>
                {factors.map((f) => <th key={f.id} className="pb-2 pr-3 font-medium">{f.name}<span className="block font-normal">{importanceOf(f, plan, t.id)}</span></th>)}
                <th className="pb-2 text-right font-medium">{t.Price}{priceFactor && <span className="block font-normal">{importanceOf(priceFactor, plan, t.id)}</span>}</th>
                {t.sled && <th className="pb-2 pl-3 text-right font-medium">Total<span className="block font-normal">of 100 points</span></th>}
                <th />
              </tr></thead>
              <tbody>
                {data.offerors.map((o, i) => (
                  <Fragment key={o.OfferorId}>
                  <tr className={`border-t border-border ${o.Name === awardee ? 'bg-primary/10' : ''}`}>
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-2">
                        <OfferorAvatar name={o.Name} index={i} size={26} /><span className="font-medium">{o.Name}</span>
                        <button type="button" onClick={() => toggle(o.OfferorId)} aria-expanded={expanded.has(o.OfferorId)} aria-label={`Details for ${o.Name}`}
                          className="ml-1 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10">
                          Details<ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded.has(o.OfferorId) ? 'rotate-180' : ''}`} />
                        </button>
                      </span>
                    </td>
                    {factors.map((f) => <td key={f.id} className="py-2.5 pr-3"><Rating plan={plan} factor={f} rating={cell(plan, f, data.ratings, o.OfferorId).consensus?.Rating} size="sm" /></td>)}
                    <td className="py-2.5 text-right tabular-nums">{money(o.TotalEvaluatedPrice)}
                      {t.sled && <span className="block text-xs text-muted-foreground">{pts(scoreFor(points, o.OfferorId)?.cost)} pts</span>}
                    </td>
                    {t.sled && (() => {
                      const s = scoreFor(points, o.OfferorId)
                      return (
                        <td className="py-2.5 pl-3 text-right">
                          <span className="text-base font-semibold tabular-nums">{pts(s?.total)}</span>
                          {s && <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${s.rank === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{ordinal(s.rank)}</span>}
                        </td>
                      )
                    })()}
                    <td className="py-2.5 pl-3 text-right">
                      <Button size="sm" variant={o.Name === awardee ? 'default' : 'outline'} disabled={task.isReadOnly} onClick={() => select(o.Name)}>
                        {o.Name === awardee ? <><Trophy className="mr-1 h-3.5 w-3.5" />Selected</> : 'Select'}
                      </Button>
                    </td>
                  </tr>
                  {expanded.has(o.OfferorId) && (
                    <tr className={o.Name === awardee ? 'bg-primary/5' : ''}>
                      <td colSpan={factors.length + (t.sled ? 4 : 3)} className="pb-4 pt-1">
                        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                          {factors.map((f) => {
                            const c = cell(plan, f, data.ratings, o.OfferorId).consensus
                            // Discriminators: what the evaluation team found that sets this offeror apart, once per finding.
                            const keys = new Set<string>()
                            const notable = findingsFor(data.findings, o.OfferorId, f.id)
                              .filter((x) => x.Origin === 'Evaluator' && x.Status !== 'Rejected' && /Significant|Deficiency|Risk/.test(x.Kind))
                              .filter((x) => { const k = `${x.Kind}|${x.FindingText.slice(0, 60)}`; if (keys.has(k)) return false; keys.add(k); return true })
                            return (
                              <div key={f.id} className="space-y-2 rounded-xl border border-border bg-background/60 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="min-w-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{f.name}{f.weight != null && <span className="ml-1.5 font-medium normal-case tracking-normal">· {f.weight}{t.sled ? ' pts' : '%'}</span>}</span>
                                  <Rating plan={plan} factor={f} rating={c?.Rating} size="sm" />
                                </div>
                                <p className="text-sm leading-relaxed">{c?.Rationale ? withEvaluatorNames(c.Rationale) : <span className="text-muted-foreground">No consensus narrative recorded.</span>}</p>
                                {notable.length > 0 && (
                                  <ul className="space-y-1.5 border-t border-dashed border-border pt-2">
                                    {notable.slice(0, 4).map((x) => <li key={x.FindingId} className="flex items-start gap-2 text-xs"><KindBadge kind={x.Kind} /><span className="text-muted-foreground">{x.FindingText}</span></li>)}
                                  </ul>
                                )}
                              </div>
                            )
                          })}
                          {(() => {
                            const igce = plan.igce?.total ?? 0
                            const price = o.TotalEvaluatedPrice
                            const pct = igce && price != null ? ((price - igce) / igce) * 100 : undefined
                            return (
                              <div className="space-y-2 rounded-xl border border-border bg-background/60 p-3">
                                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.Price}{priceFactor?.weight != null && <span className="ml-1.5 font-medium normal-case tracking-normal">· {priceFactor.weight}{t.sled ? ' pts' : '%'}</span>}</span>
                                <p className="text-lg font-semibold tabular-nums">{money(price)}</p>
                                {pct != null && <p className="text-sm text-muted-foreground">{Math.abs(pct).toFixed(1)}% {pct >= 0 ? 'above' : 'below'} the {t.sled ? 'District cost estimate' : 'IGCE'} of {money(igce)}.</p>}
                                {t.sled && <p className="text-sm text-muted-foreground">{pts(scoreFor(points, o.OfferorId)?.cost)} of {priceFactor?.weight ?? '—'} cost points by formula.</p>}
                              </div>
                            )
                          })()}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {task.data.recommendedAwardee && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><AgentMark size={18} />The decision writer recommended {task.data.recommendedAwardee}. The selection is yours.</p>
          )}
        </div>
      </Panel>
      <Panel title={t.decisionDoc} description={t.sled
        ? 'Drafted by the decision writer from the evaluation committee record, with the recommendation drafted for your selection. Edit it to reflect your reasoning.'
        : 'Drafted by the decision writer from the SSEB record, with Section 5 drafted for your selection. Edit it to reflect your reasoning.'}
        actions={
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${over > 0 ? 'bg-[var(--ss-lvl-4)] text-[var(--ss-lvl-4-fg)]' : meter > 0.9 ? 'bg-[var(--ss-lvl-3)] text-[var(--ss-lvl-3-fg)]' : 'bg-muted text-muted-foreground'}`}
            aria-live="polite" title={`The award record stores up to ${n(DOCUMENT_LIMIT)} characters, including the signature block.`}>
            {n(ssdd.length)} / {n(limit)} characters
          </span>
        }>
        <div className="space-y-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, meter * 100)}%`, background: over > 0 ? 'var(--ss-critical)' : meter > 0.9 ? 'var(--ss-warn)' : 'var(--ss-brand-2)' }} />
          </div>
          {over > 0 && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-[var(--ss-critical)]/40 bg-[var(--ss-critical)]/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ss-critical)]" />
              <span>
                <span className="font-medium">This {t.sled ? 'recommendation' : 'SSDD'} is {n(ssdd.length)} characters; the award record holds {n(limit)}.</span>{' '}
                Cut {n(over)} characters before signing — for example, refer to the {t.consensusReport} instead of restating each {t.factor} and {t.offeror}.
              </span>
            </div>
          )}
          <textarea className={`${textareaCls} ss-doc leading-7`} rows={16} value={ssdd} disabled={task.isReadOnly} onChange={(e) => setSsdd(e.target.value)} aria-label={t.decisionDoc} />
        </div>
      </Panel>
      <Panel title="Signature">
        <div className="flex flex-wrap items-center gap-4">
          <PersonaAvatar id={ssa.id} short={ssa.short} size={44} />
          <div className="min-w-0 flex-1">
            <Field label="Type your full name to sign" hint={t.sled ? 'Signing records your recommendation, its text and the timestamp in the award record for the Board.' : 'Signing records your decision, the SSDD text and the timestamp in the award record.'}>
              <input className={`${textareaCls} max-w-md font-[cursive] text-lg`} value={signature} maxLength={120} disabled={task.isReadOnly} onChange={(e) => setSignature(e.target.value)} placeholder={ssa.name} />
            </Field>
          </div>
        </div>
      </Panel>
    </FormShell>
  )
}

// --------------------------------------------------- Evaluator: clarification

export function ClarificationForm() {
  const { backend, task, sol, plan, update } = useForm()
  const t = useTerms()
  const me = evaluatorBySlot(task.data.evaluatorSlot ?? 1) ?? persona('evaluator1')
  const chair = titled(persona('chair'), t.id)
  const [notes, setNotes] = useState(task.data.notes ?? '')
  const [busy, setBusy] = useState(false)
  const finish = async () => {
    setBusy(true)
    try {
      await backend.upsert('audit', 'EventId', [auditRow(sol.SolicitationId, 'case', 'ClarificationProvided', `Evaluator ${task.data.evaluatorSlot ?? 1}`, notes)])
      update({ notes })
      await backend.complete('Submit', { ...task.data, decision: 'Submitted', notes })
      backend.notify(`Clarification sent to ${chair.name}`, 'success')
    } catch (e) { backend.notify(`Could not submit: ${(e as Error).message}`, 'error') } finally { setBusy(false) }
  }
  return (
    <FormShell eyebrow="Consensus clarification" title={plan.title} who={me} readOnly={task.isReadOnly} subtitle={sol.SolicitationId}
      footer={<Button disabled={busy || task.isReadOnly || !notes.trim()} onClick={finish}>Send to {chair.name}</Button>}>
      <Panel title={`Questions from the ${t.chair}`} icon={<MessageSquareReply className="h-4 w-4 text-primary" />}>
        <div className="flex gap-3">
          <PersonaAvatar id={chair.id} short={chair.short} size={36} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{chair.name}</div>
            <div className="text-xs text-muted-foreground">{chair.label}</div>
            <p className="mt-2 whitespace-pre-wrap rounded-xl rounded-tl-sm border border-border bg-muted/50 p-3 text-sm">{asText(task.data.chairQuestions) || 'No questions provided.'}</p>
          </div>
        </div>
      </Panel>
      <Panel title="Your response">
        <textarea className={textareaCls} rows={6} value={notes} disabled={task.isReadOnly} onChange={(e) => setNotes(e.target.value)} placeholder={`Answer each question and note any change to your findings or ${t.rating}.`} />
      </Panel>
    </FormShell>
  )
}
