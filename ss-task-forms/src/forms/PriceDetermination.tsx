import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, BadgeDollarSign, CircleCheck, FileText, ListChecks, RotateCcw, Scale, TableProperties } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Info, Pill } from '../components/Bits'
import { OfferorAvatar } from '../components/Flair'
import { money } from '../lib/eval'
import { persona } from '../lib/types'
import type { Plan } from '../lib/types'
import { ChoiceGroup, FormShell, Panel, auditRow, nowIso, textareaCls, useForm } from './common'

/**
 * The Contracting Officer's price reasonableness determination for a federal (FAR Part 15) source selection: the
 * competition and basis, prices against the IGCE and each other, line-item balance, a disposition for every variance,
 * the techniques used and a finding per offeror. The narrative is drafted from those choices (method, data, variance
 * analysis, conclusion) until the CO edits it, and is filed with a memorandum for the record in SSDecision.
 */

interface PriceRow { offerorId: string; name: string; total: number; igceVariancePct: number; unbalanced: string[] }
interface Line { clin: string; description?: string; amount: number }

/** A total this far from the IGCE needs an explanation. FAR sets no threshold; this is the office's own. */
const TOTAL_VARIANCE = 10
/** A line item this far from its IGCE line is potentially unbalanced (the price robot's BR-04 threshold). */
const LINE_VARIANCE = 25

const TECHNIQUES = [
  { id: 'i', label: 'Comparison of proposed prices received', cite: 'FAR 15.404-1(b)(2)(i)', extra: '' },
  { id: 'ii', label: 'Comparison with historical prices paid', cite: 'FAR 15.404-1(b)(2)(ii)', extra: 'Prices were also compared with prices previously paid for the same or similar services [cite the contracts and prices].' },
  { id: 'iii', label: 'Parametric estimating', cite: 'FAR 15.404-1(b)(2)(iii)', extra: 'Prices were also checked with parametric estimating methods [state the yardstick and result].' },
  { id: 'iv', label: 'Published price lists or market prices', cite: 'FAR 15.404-1(b)(2)(iv)', extra: 'Prices were also compared with published price lists and market prices [cite the source].' },
  { id: 'v', label: 'Comparison with the IGCE', cite: 'FAR 15.404-1(b)(2)(v)', extra: '' },
  { id: 'vi', label: 'Market research for the same or similar items', cite: 'FAR 15.404-1(b)(2)(vi)', extra: 'Prices were also compared with prices found in market research [cite the source].' },
  { id: 'vii', label: 'Data other than certified cost or pricing data', cite: 'FAR 15.404-1(b)(2)(vii)', extra: 'Data other than certified cost or pricing data were also analyzed [describe the data].' },
]

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
/** A count that may open a sentence: "Three offerors", not "3 offerors". */
const count = (n: number) => { const w = WORDS[n] ?? String(n); return w[0].toUpperCase() + w.slice(1) }
const pct = (x: number) => `${Math.abs(x).toFixed(1)}%`
const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${pct(x)}`
const variance = (amount: number, ref: number) => (ref ? ((amount - ref) / ref) * 100 : 0)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const parse = <T,>(s: unknown, fallback: T): T => {
  try { return typeof s === 'string' ? (s.trim() ? JSON.parse(s) as T : fallback) : (s as T) ?? fallback } catch { return fallback }
}
const PLACEHOLDER = /\[[^\]]+\]/

/** Something the CO must explain: a total well off the IGCE, or a potentially unbalanced line item. */
interface Item {
  id: string
  offerorId: string
  title: string
  /** The facts, as the narrative's opening sentence for this item. */
  fact: string
  options: { label: string; text: string; concern?: boolean }[]
}

function itemsFor(plan: Plan, rows: PriceRow[], lines: Record<string, Line[]>): Item[] {
  const items: Item[] = []
  const igce = plan.igce.total
  const below = rows.filter((r) => r.total < igce).length
  const above = rows.length - below
  for (const r of rows) {
    const v = variance(r.total, igce)
    if (Math.abs(v) < TOTAL_VARIANCE) continue
    const others = mean(rows.filter((x) => x.offerorId !== r.offerorId).map((x) => x.total))
    const vo = variance(r.total, others)
    const dir = v < 0 ? 'below' : 'above'
    const fact = `${r.name}'s total of ${money(r.total)} is ${pct(v)} ${dir} the IGCE${rows.length > 1 ? ` and ${pct(vo)} ${vo < 0 ? 'below' : 'above'} the average of the other offers` : ''}.`
    items.push({
      id: `total-${r.offerorId}`, offerorId: r.offerorId, title: `${r.name} · total ${pct(v)} ${dir} the IGCE`, fact,
      options: v < 0
        ? [
            { label: 'No reasonableness concern', text: 'A reasonableness analysis asks whether a price is too high, not too low, so the lower price raises no reasonableness concern.' },
            ...(below > 1 ? [{ label: 'Conservative IGCE', text: `${below} of ${rows.length} offers are below the IGCE, which indicates its assumptions were conservative.` }] : []),
            { label: 'Other (explain)', text: '[Explain the variance.]' },
          ]
        : [
            { label: 'Supported by the technical approach', text: 'The premium reflects the labor mix and approach in its technical proposal; whether it is worth paying is a matter for the best-value tradeoff.' },
            ...(above > 1 ? [{ label: 'IGCE understated current rates', text: `${above} of ${rows.length} offers exceed the IGCE, which indicates it understated current market rates.` }] : []),
            { label: 'Price is too high', text: '[State why the price is too high.]', concern: true },
          ],
    })
  }
  for (const r of rows) {
    const ls = lines[r.offerorId] ?? []
    for (const l of ls) {
      const ref = plan.igce.lines[l.clin]
      if (!ref) continue
      const v = variance(l.amount, ref)
      if (Math.abs(v) <= LINE_VARIANCE) continue
      // Where a line is underpriced, money often moved to another line: name the lines well above theirs.
      const offset = ls.filter((x) => x !== l && plan.igce.lines[x.clin] && variance(x.amount, plan.igce.lines[x.clin]) * v < 0 && Math.abs(variance(x.amount, plan.igce.lines[x.clin])) >= TOTAL_VARIANCE)
      const name = `CLIN ${l.clin}${l.description ? ` (${l.description})` : ''}`
      const fact = `${r.name} prices ${name} at ${money(l.amount)} against the IGCE line of ${money(ref)} (${pct(v)} ${v < 0 ? 'below' : 'above'})`
        + (offset.length ? `, while ${andList(offset.map((x) => `CLIN ${x.clin}${x.description ? ` (${x.description})` : ''} is ${pct(variance(x.amount, plan.igce.lines[x.clin]))} ${v < 0 ? 'above' : 'below'} its IGCE line`))}.` : '.')
      items.push({
        id: `clin-${r.offerorId}-${l.clin}`, offerorId: r.offerorId, title: `${r.name} · CLIN ${l.clin} ${pct(v)} ${v < 0 ? 'below' : 'above'} the IGCE line`, fact,
        options: [
          { label: 'Risk acceptable', text: 'The total price is reasonable and award will not result in paying unreasonably high prices for contract performance, so the imbalance poses no unacceptable risk (FAR 15.404-1(g)(2)).' },
          { label: 'Risk noted for the SSA', text: 'The imbalance is noted as a risk for the Source Selection Authority to consider in the source selection decision (FAR 15.404-1(g)(2)(i)).' },
          { label: 'Unacceptable risk', text: 'I find that the lack of balance poses an unacceptable risk to the Government, and the offer may be rejected (FAR 15.404-1(g)(3)).', concern: true },
        ],
      })
    }
  }
  return items
}

const COST_TYPE = /cost[- ](plus|reimburse)|\bCP(FF|AF|IF)\b/i

export function FederalPriceForm() {
  const { backend, task, data, sol, plan, update } = useForm()
  const co = persona('co')
  const igce = plan.igce.total
  const priceFactor = plan.factors.find((f) => f.evaluatedNotRated)
  const criteria = priceFactor?.criteria ?? ''
  const realism = /realism/i.test(criteria)
  const costType = COST_TYPE.test(plan.contractType)

  const rows = useMemo(() => {
    const parsed = parse<unknown>(task.data.priceAnalysis, [])
    return (Array.isArray(parsed) ? parsed as PriceRow[] : [])
      .map((r) => ({ ...r, unbalanced: Array.isArray(r.unbalanced) ? r.unbalanced : [] }))
      .sort((a, b) => a.total - b.total)
  }, [task.data.priceAnalysis])
  const lines = useMemo(() => Object.fromEntries(rows.map((r) => [r.offerorId, parse<Line[]>(data.offerors.find((o) => o.OfferorId === r.offerorId)?.PriceLinesJson, [])])), [rows, data.offerors])
  const items = useMemo(() => itemsFor(plan, rows, lines), [plan, rows, lines])
  const clins = Object.keys(plan.igce.lines).sort()

  const compliant = rows.filter((r) => data.offerors.find((o) => o.OfferorId === r.offerorId)?.ComplianceStatus === 'Compliant')
  const [independent, setIndependent] = useState(true)
  const adequate = compliant.length >= 2 && independent
  const [techniques, setTechniques] = useState<string[]>(() => [...(compliant.length >= 2 ? ['i'] : []), ...(igce ? ['v'] : [])])
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [finding, setFinding] = useState<Record<string, boolean>>({})
  const reasonable = (id: string) => finding[id] ?? true
  const [text, setText] = useState(task.data.notes ?? '')
  const [edited, setEdited] = useState(!!task.data.notes)
  const [busy, setBusy] = useState(false)

  const avg = mean(rows.map((r) => r.total))
  const lo = rows[0]?.total ?? 0
  const hi = rows[rows.length - 1]?.total ?? 0
  const max = Math.max(igce, hi) * 1.05
  const open = items.filter((i) => !choice[i.id])

  const draft = useMemo(() => {
    const used = TECHNIQUES.filter((x) => techniques.includes(x.id))
    const core = used.filter((x) => !x.extra)
    const method = core.length
      ? `Price reasonableness was determined by price analysis under FAR 15.404-1(b), using ${andList(core.map((x) => `${x.id === 'i' ? 'comparison of the proposed prices received in response to the solicitation' : 'comparison with the IGCE, the independent Government cost estimate'} (${x.cite})`))}.`
      : 'Price reasonableness was determined by price analysis under FAR 15.404-1(b) [state the techniques used].'
    const competition = adequate
      ? `${count(compliant.length)} offerors, competing independently, submitted priced offers that satisfy the Government's requirement, so adequate price competition exists (FAR 15.403-1(c)(1)(i)) and certified cost or pricing data were not required (FAR 15.403-1(b)(1)(i)).`
      : 'Adequate price competition does not exist [state how price reasonableness was otherwise established and whether certified cost or pricing data were obtained].'
    const p1 = [method, competition, ...used.filter((x) => x.extra).map((x) => x.extra)].join(' ')
    const p2 = rows.length
      ? `Total evaluated prices: ${andList(rows.map((r) => `${r.name} ${money(r.total)} (${pct(r.igceVariancePct)} ${r.igceVariancePct < 0 ? 'below' : 'above'} the IGCE)`))}, against an IGCE of ${money(igce)}. The offers average ${money(Math.round(avg))} and the highest is ${pct(variance(hi, lo))} above the lowest.`
      : ''
    const sentence = (i: Item) => {
      const o = i.options.find((x) => x.label === choice[i.id])
      return `${i.fact} ${o ? o.text : '[Choose a disposition above.]'}`
    }
    const totals = items.filter((i) => i.id.startsWith('total-')).map(sentence)
    const balance = items.filter((i) => i.id.startsWith('clin-'))
    const p3 = totals.join(' ')
    const p4 = balance.length
      ? `Line-item prices were analyzed for balance (FAR 15.404-1(g)(2)). ${balance.map(sentence).join(' ')}`
      : `Line-item prices were analyzed for balance (FAR 15.404-1(g)(2)); no offer prices a CLIN more than ${LINE_VARIANCE}% from its IGCE line.`
    const p5 = costType
      ? 'A cost realism analysis is required for this cost-reimbursement contract (FAR 15.404-1(d)(2)) [summarize the probable cost of each offer].'
      : realism
        ? 'Price realism was evaluated as Section M provides (FAR 15.404-1(d)(3)) [summarize the result].'
        : `Section M does not provide for a price realism evaluation, so none was performed.${/fixed/i.test(plan.contractType) ? ' Under a fixed-price contract the offeror bears the cost risk, and prices are not adjusted for realism.' : ''}`
    const yes = rows.filter((r) => reasonable(r.offerorId))
    const no = rows.filter((r) => !reasonable(r.offerorId))
    const p6 = [
      yes.length ? `Therefore, I determine the total evaluated price${yes.length > 1 ? 's' : ''} of ${andList(yes.map((r) => r.name))} to be fair and reasonable.` : '',
      no.length ? `I do not find the price${no.length > 1 ? 's' : ''} of ${andList(no.map((r) => r.name))} fair and reasonable [state why].` : '',
    ].filter(Boolean).join(' ')
    return [p1, p2, p3, p4, p5, p6].filter(Boolean).join('\n\n')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techniques, adequate, compliant.length, rows, items, choice, finding, igce, avg, hi, lo, costType, realism, plan.contractType])

  const narrative = edited ? text : draft
  const blocked = !narrative.trim() ? 'Write the determination.'
    : open.length ? `Choose a disposition for ${open.length === 1 ? 'the variance' : `all ${open.length} variances`} above.`
    : PLACEHOLDER.test(narrative) ? 'Replace the bracketed text before submitting.' : ''

  /** The memorandum for the record filed with the determination (SSDecision.DocumentText, 10,000 characters). */
  const memo = () => {
    const table = rows.map((r) => {
      const others = mean(rows.filter((x) => x.offerorId !== r.offerorId).map((x) => x.total))
      return `   ${r.name}: ${money(r.total)} · ${signed(r.igceVariancePct)} vs IGCE${rows.length > 1 ? ` · ${signed(variance(r.total, others))} vs the other offers' average` : ''} · ${reasonable(r.offerorId) ? 'fair and reasonable' : 'not fair and reasonable'}`
    })
    const clinRows = clins.map((c) => {
      const ref = plan.igce.lines[c]
      const desc = Object.values(lines).flat().find((l) => l.clin === c)?.description
      const cells = rows.map((r) => {
        const l = (lines[r.offerorId] ?? []).find((x) => x.clin === c)
        return l ? `${r.name} ${money(l.amount)} (${signed(variance(l.amount, ref))})` : `${r.name} —`
      })
      return `   CLIN ${c}${desc ? ` ${desc}` : ''}: IGCE ${money(ref)}; ${cells.join('; ')}`
    })
    const out = [
      'MEMORANDUM FOR RECORD',
      '',
      `SUBJECT: Price Reasonableness Determination, Solicitation ${sol.SolicitationId}, ${plan.title}`,
      `${plan.agency}${plan.office ? `, ${plan.office}` : ''}`,
      '',
      `1. Acquisition. ${plan.contractType}. Basis for award: ${plan.basisForAward}. Section M: "${criteria}"`,
      '',
      `2. Total evaluated prices (IGCE ${money(igce)}):`,
      ...table,
      '',
      `3. Line-item prices (FAR 15.404-1(g)):`,
      ...clinRows,
      '',
      '4. Determination.',
      narrative.trim(),
      '',
      '________________________________',
      co.name,
      'Contracting Officer',
      `Date: ${nowIso().slice(0, 10)}`,
    ].join('\n')
    return out.slice(0, 10_000)
  }

  const finish = async (outcome: 'Proceed' | 'CancelSolicitation') => {
    setBusy(true)
    try {
      const decision = outcome === 'Proceed' ? 'Proceed' : 'Cancel'
      const notes = narrative.trim()
      await backend.upsert('offerors', 'OfferorId', rows.map((r) => ({ OfferorId: r.offerorId, TotalEvaluatedPrice: r.total, IgceVariancePct: Math.round(r.igceVariancePct * 100) / 100 })))
      await backend.upsert('decisions', 'DecisionId', [{ DecisionId: `${sol.SolicitationId}-price`, SolicitationId: sol.SolicitationId, Kind: decision === 'Proceed' ? 'Price' : 'Cancel',
        Outcome: decision, Rationale: notes.slice(0, 10_000), DecidedBy: task.actor, DecidedAt: nowIso(), DocumentText: memo() }])
      const yes = rows.filter((r) => reasonable(r.offerorId)).length
      await backend.upsert('audit', 'EventId', [auditRow(sol.SolicitationId, 'case', 'PriceDetermined', 'Contracting Officer',
        `${yes} of ${rows.length} offerors' prices determined fair and reasonable; ${items.length} variance${items.length === 1 ? '' : 's'} explained. ${decision === 'Proceed' ? 'Proceeding to the award decision.' : 'Solicitation to be cancelled.'}`)])
      const patch = { decision, notes }
      update(patch)
      await backend.complete(outcome, { ...task.data, ...patch })
      backend.notify('Price determination recorded', 'success')
    } catch (e) { backend.notify(`Could not complete: ${(e as Error).message}`, 'error') } finally { setBusy(false) }
  }

  const filed = data.decisions.find((d) => d.DecisionId === `${sol.SolicitationId}-price`)
  const ro = task.isReadOnly

  return (
    <FormShell eyebrow="Price evaluation" title={plan.title} who={co} readOnly={ro} subtitle={`${sol.SolicitationId} · IGCE ${money(igce)}`}
      footer={<>
        {!ro && blocked && <span className="mr-auto text-xs text-muted-foreground">{blocked}</span>}
        <Button variant="outline" disabled={busy || ro || !edited || !narrative.trim()} title={edited ? undefined : 'Edit the determination to record why the solicitation is being cancelled'}
          onClick={() => finish('CancelSolicitation')}>Cancel solicitation</Button>
        <Button disabled={busy || ro || !!blocked} onClick={() => finish('Proceed')}>Proceed to award decision</Button>
      </>}>

      <Panel title="Price competition and basis" icon={<Scale className="h-4 w-4 text-primary" />}>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Fact label="Contract type">{plan.contractType}</Fact>
          <Fact label="Section M price evaluation">{criteria || '—'}</Fact>
          <Fact label="Adequate price competition" info="FAR 15.403-1(c)(1)(i): two or more responsible offerors, competing independently, submit priced offers that satisfy the Government's expressed requirement.">
            <span className="flex items-center gap-1.5">
              {adequate ? <CircleCheck aria-hidden className="h-4 w-4 shrink-0 text-[var(--ss-good)]" /> : <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-[var(--ss-warn)]" />}
              {adequate ? 'Exists' : 'Does not exist'}: {rows.length} priced offer{rows.length === 1 ? '' : 's'}, {compliant.length} compliant at the intake screen
            </span>
            <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--ss-brand-2)]" checked={independent} disabled={ro} onChange={(e) => setIndependent(e.target.checked)} />
              Offers were priced independently (FAR 52.203-2 certificate in each offeror's SAM representations)
            </label>
          </Fact>
          <Fact label="Certified cost or pricing data">
            {adequate ? 'Not required: adequate price competition (FAR 15.403-1(b)(1)(i))' : 'Required above the threshold unless another exception applies (FAR 15.403-4)'}
          </Fact>
          <Fact label={costType ? 'Cost realism' : 'Price realism'}>
            {costType ? 'Required for a cost-reimbursement contract (FAR 15.404-1(d)(2))' : realism ? 'Evaluated, as Section M provides (FAR 15.404-1(d)(3))' : 'Not evaluated: Section M does not provide for it'}
          </Fact>
        </dl>
      </Panel>

      <Panel title="Total evaluated price vs IGCE" icon={<BadgeDollarSign className="h-4 w-4 text-primary" />}
        description={`Computed by robots from the extracted price schedules. Average offer ${money(Math.round(avg))}; the highest is ${pct(variance(hi, lo))} above the lowest.`}>
        <div className="space-y-4">
          {rows.map((r, n) => {
            const others = mean(rows.filter((x) => x.offerorId !== r.offerorId).map((x) => x.total))
            const flagged = Math.abs(r.igceVariancePct) >= TOTAL_VARIANCE
            return (
              <div key={r.offerorId} className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <OfferorAvatar name={r.name} index={n} size={24} /><span className="min-w-0 font-medium">{r.name}</span>
                  {flagged && <Pill icon={<AlertTriangle className="h-3.5 w-3.5" />} color="var(--ss-warn)">{pct(r.igceVariancePct)} from the IGCE</Pill>}
                  <span className="ml-auto tabular-nums font-medium">{money(r.total)}</span>
                  <span className="w-28 text-right text-xs tabular-nums text-muted-foreground" title="Difference from the IGCE">{signed(r.igceVariancePct)} vs IGCE</span>
                  {rows.length > 1 && <span className="w-32 text-right text-xs tabular-nums text-muted-foreground" title="Difference from the average of the other offers">{signed(variance(r.total, others))} vs others</span>}
                </div>
                <div className="relative h-3 rounded-full bg-muted">
                  <div className="h-3 rounded-full transition-[width] duration-700" style={{ width: `${(r.total / max) * 100}%`, background: 'linear-gradient(90deg, var(--ss-brand-2), var(--ss-brand-3))' }} />
                  <div className="absolute -top-1 h-5 w-0.5 bg-foreground/70" style={{ left: `${(igce / max) * 100}%` }} title={`IGCE ${money(igce)}`} />
                </div>
              </div>
            )
          })}
          <p className="text-xs text-muted-foreground">The vertical marker is the IGCE ({money(igce)}). Totals {TOTAL_VARIANCE}% or more from the IGCE need an explanation.</p>
        </div>
      </Panel>

      {clins.length > 0 && (
        <Panel title="Line-item prices vs IGCE" icon={<TableProperties className="h-4 w-4 text-primary" />}
          description={`Balance check (FAR 15.404-1(g)): lines more than ${LINE_VARIANCE}% from the IGCE line are potentially unbalanced.`}>
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">CLIN</th>
                  <th className="pb-2 pr-3 text-right font-medium">IGCE</th>
                  {rows.map((r) => <th key={r.offerorId} className="pb-2 pl-3 text-right font-medium">{r.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {clins.map((c) => {
                  const ref = plan.igce.lines[c]
                  const desc = Object.values(lines).flat().find((l) => l.clin === c)?.description
                  return (
                    <tr key={c} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3"><span className="font-medium tabular-nums">{c}</span>{desc && <span className="block text-xs text-muted-foreground">{desc}</span>}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{money(ref)}</td>
                      {rows.map((r) => {
                        const l = (lines[r.offerorId] ?? []).find((x) => x.clin === c)
                        const v = l ? variance(l.amount, ref) : 0
                        const off = Math.abs(v) > LINE_VARIANCE
                        return (
                          <td key={r.offerorId} className="py-2 pl-3 text-right tabular-nums">
                            {l ? <>
                              <span className={off ? 'font-semibold' : ''}>{money(l.amount)}</span>
                              <span className={`flex items-center justify-end gap-1 text-xs ${off ? 'font-medium text-[var(--ss-warn)]' : 'text-muted-foreground'}`}>
                                {off && <AlertTriangle aria-hidden className="h-3 w-3" />}{signed(v)}{off && <span className="sr-only"> potentially unbalanced</span>}
                              </span>
                            </> : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                <tr className="text-xs font-medium">
                  <td className="pt-2 pr-3">Total</td>
                  <td className="pt-2 pr-3 text-right tabular-nums">{money(igce)}</td>
                  {rows.map((r) => <td key={r.offerorId} className="pt-2 pl-3 text-right tabular-nums">{money(r.total)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {ro ? (
        <Panel title="Determination as filed" icon={<FileText className="h-4 w-4 text-primary" />}>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-6">{filed?.DocumentText || task.data.notes || 'No determination recorded.'}</pre>
        </Panel>
      ) : <>
        <Panel title="Variances to explain" icon={<AlertTriangle className="h-4 w-4 text-[var(--ss-warn)]" />}
          description={items.length ? `${items.length - open.length} of ${items.length} explained. Each needs a disposition before the determination is complete.` : undefined}>
          {items.length ? (
            <ul className="space-y-4">
              {items.map((i) => {
                const picked = i.options.find((o) => o.label === choice[i.id])
                return (
                  <li key={i.id} className="space-y-1.5 border-b border-border pb-4 last:border-0 last:pb-0">
                    <p className="text-sm font-medium">{i.title}</p>
                    <p className="text-sm text-muted-foreground">{i.fact}</p>
                    <ChoiceGroup label={`Disposition: ${i.title}`} options={i.options.map((o) => o.label)} value={choice[i.id]} onChange={(v) => setChoice((c) => ({ ...c, [i.id]: v }))} />
                    {picked?.concern && <p className="flex items-center gap-1.5 text-xs text-[var(--ss-warn)]"><AlertTriangle aria-hidden className="h-3.5 w-3.5" />Record the reason in the determination below; it goes to the Source Selection Authority.</p>}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="flex items-center gap-1.5 text-sm"><CircleCheck aria-hidden className="h-4 w-4 text-[var(--ss-good)]" />No total is {TOTAL_VARIANCE}% or more from the IGCE and no line item is more than {LINE_VARIANCE}% from its IGCE line.</p>
          )}
        </Panel>

        <Panel title="Price reasonableness determination" icon={<ListChecks className="h-4 w-4 text-primary" />}
          actions={edited && <Button size="sm" variant="outline" onClick={() => { setEdited(false); setText('') }}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Redraft from the analysis</Button>}>
          <div className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="flex items-center gap-1.5 text-sm font-medium">Price analysis techniques used
                <Info label="About price analysis techniques">FAR 15.404-1(b)(3): comparison of proposed prices and comparison with historical prices are the preferred techniques. Use the others when those are unavailable or insufficient.</Info>
              </legend>
              <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {['i', 'v', 'ii', 'vi', 'iv', 'iii', 'vii'].map((id) => TECHNIQUES.find((x) => x.id === id)!).map((x) => (
                  <label key={x.id} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ss-brand-2)]" checked={techniques.includes(x.id)}
                      onChange={(e) => setTechniques((ts) => (e.target.checked ? [...ts, x.id] : ts.filter((y) => y !== x.id)))} />
                    <span>{x.label} <span className="text-xs text-muted-foreground">({x.cite.replace('FAR ', '')})</span></span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Finding for each offeror</legend>
              <ul className="space-y-1">
                {rows.map((r, n) => (
                  <li key={r.offerorId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <OfferorAvatar name={r.name} index={n} size={22} /><span className="min-w-0 flex-1 text-sm">{r.name}</span>
                    <ChoiceGroup label={`Finding for ${r.name}`} options={['Fair and reasonable', 'Not fair and reasonable']} value={reasonable(r.offerorId) ? 'Fair and reasonable' : 'Not fair and reasonable'}
                      onChange={(v) => setFinding((f) => ({ ...f, [r.offerorId]: v === 'Fair and reasonable' }))} />
                  </li>
                ))}
              </ul>
            </fieldset>

            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-sm font-medium">Determination
                <Info label="About the determination">Method, data, variance analysis and conclusion, drafted from your choices above. Edit it freely; "Redraft from the analysis" starts again from your choices. It is filed with a memorandum for the record.</Info>
              </p>
              <textarea className={textareaCls} rows={18} value={narrative} aria-label="Price reasonableness determination"
                onChange={(e) => { setText(e.target.value); setEdited(true) }} />
              {!edited && <p className="text-xs text-muted-foreground">Drafted from the analysis above and updated as you choose.</p>}
            </div>
          </div>
        </Panel>
      </>}
    </FormShell>
  )
}

function Fact({ label, info, children }: { label: string; info?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs font-medium text-muted-foreground">{label}{info && <Info label={`About ${label.toLowerCase()}`}>{info}</Info>}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}
