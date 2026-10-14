import { useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, MessagesSquare, Sparkles, Users } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { KindBadge, OfficialTerm, Rating, RatingLegend } from '../components/Bits'
import { OfferorAvatar, PersonaAvatar } from '../components/Flair'
import { cell, findingsFor, rank, rated } from '../lib/eval'
import { level, look, lookOf, methodOf, pointsFor, scaleOf, wordsOf } from '../lib/ratings'
import { pts, titled, useTerms } from '../lib/terms'
import type { Factor, Offeror, Plan, Rating as RatingRow } from '../lib/types'
import { evaluatorBySlot, persona } from '../lib/types'
import { AgentMark, FormShell, Panel, RatingPicker, auditRow, nowIso, textareaCls, useForm, withEvaluatorNames } from './common'

interface Choice { rating?: string; narrative: string }

/** SS_ConsensusAnalyst proposals, passed by the case as JSON in consensusDraft. */
interface AgentProposal { offerorId: string; factorId: string; proposedRating?: string; rationale?: string; chairQuestions?: string }

/** Where a cell's preselected rating came from. */
interface Proposal { rating: string; source: 'agent' | 'modal'; rationale?: string }

const camel = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k[0].toLowerCase() + k.slice(1), x]))

function agentProposals(raw?: unknown): AgentProposal[] {
  try {
    let v = typeof raw === 'string' ? (raw.trim() ? JSON.parse(raw) : []) : raw ?? []
    if (typeof v === 'string') v = JSON.parse(v)
    // Agent output keys may arrive PascalCased, at the top level as well as per proposal.
    const top = !Array.isArray(v) && v && typeof v === 'object' ? camel(v as Record<string, unknown>) : undefined
    const list = Array.isArray(v) ? v : Array.isArray(top?.proposals) ? top.proposals as unknown[] : []
    return list.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object').map(camel) as unknown as AgentProposal[]
  } catch { return [] }
}

/** Fallback when the agent gave no proposal: the modal individual rating, ties broken toward the more conservative one. */
function modal(ratings: string[], scale: string[]) {
  if (!ratings.length) return undefined
  const counts = new Map<string, number>()
  for (const r of ratings) counts.set(r, (counts.get(r) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || scale.indexOf(b[0]) - scale.indexOf(a[0]))[0][0]
}

/** A rating as words for running text, e.g. "Good", "Blue (Outstanding)" or "Good (28 of 35 points)". */
function says(plan: Plan, f: Factor, rating: string) {
  const i = level(plan, f, rating)
  if (i == null) return rating
  const m = methodOf(plan)
  const l = look(m, i, rating, lookOf(plan, f))
  if (m === 'points') return f.weight != null ? `${l.word} (${l.text} of ${f.weight} points)` : l.word
  return l.text === l.word ? l.word : `${l.text} (${l.word})`
}

function Raters({ ratings, official }: { ratings: RatingRow[]; official: string }) {
  const who = ratings.filter((r) => r.Rating === official).map((r) => evaluatorBySlot(r.EvaluatorSlot)).filter((p) => !!p)
  if (!who.length) return null
  return <span className="flex -space-x-1">{who.map((p) => <PersonaAvatar key={p.id} id={p.id} short={p.short} size={16} />)}</span>
}

interface Item { k: string; o: Offeror; f: Factor; x: ReturnType<typeof cell>; split: boolean }

/** One cell in the reconcile queue: where it stands, what the evaluators said and what the consensus is now. */
function QueueRow({ item, plan, active, done, consensus, showOfferor, onSelect }: {
  item: Item; plan: Plan; active: boolean; done: boolean; consensus?: string; showOfferor: boolean; onSelect: () => void
}) {
  const { o, f, x, split } = item
  return (
    <button type="button" onClick={onSelect} aria-current={active ? 'true' : undefined}
      className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${active ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border hover:border-primary/60 hover:bg-muted/40'}`}>
      <span className="flex items-center gap-2 text-sm">
        {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ss-good)]" aria-label="Confirmed" />
          : split ? <AlertTriangle className={`h-4 w-4 shrink-0 ${x.spread >= 2 ? 'text-[var(--ss-critical)]' : 'text-[var(--ss-warn)]'}`} aria-label={x.spread >= 2 ? 'Disagreement' : 'Split'} />
            : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Not confirmed" />}
        <span className="min-w-0 flex-1 truncate font-medium">{showOfferor ? `${o.Name.split(' ')[0]} · ` : ''}{f.name}</span>
      </span>
      <span className="mt-1.5 flex flex-wrap items-center gap-1 pl-6">
        {x.individual.map((r) => <Rating key={r.RatingId} plan={plan} factor={f} rating={r.Rating} size="sm" />)}
        {consensus && <><ArrowRight className="h-3 w-3 text-muted-foreground" aria-label="Consensus" /><Rating plan={plan} factor={f} rating={consensus} size="sm" /></>}
      </span>
    </button>
  )
}

export function ConsensusBoard() {
  const { backend, task, data, sol, plan, update } = useForm()
  const factors = rated(plan)
  const method = methodOf(plan)
  const t = useTerms()
  const chair = titled(persona('chair'), t.id)
  const fromAgent = agentProposals(task.data.consensusDraft)

  const proposalFor = (oid: string, f: Factor): Proposal | undefined => {
    const a = fromAgent.find((p) => p.offerorId === oid && p.factorId === f.id)
    if (a?.proposedRating && scaleOf(plan, f).includes(a.proposedRating)) return { rating: a.proposedRating, source: 'agent', rationale: withEvaluatorNames(a.rationale) }
    const m = modal(cell(plan, f, data.ratings, oid).individual.map((r) => r.Rating), scaleOf(plan, f))
    return m ? { rating: m, source: 'modal' } : undefined
  }

  const [choices, setChoices] = useState<Record<string, Choice>>(() => {
    const c: Record<string, Choice> = {}
    for (const o of data.offerors) for (const f of factors) {
      const x = cell(plan, f, data.ratings, o.OfferorId)
      const p = proposalFor(o.OfferorId, f)
      c[`${o.OfferorId}|${f.id}`] = { rating: x.consensus?.Rating ?? p?.rating, narrative: x.consensus?.Rationale ?? (p?.source === 'agent' ? p.rationale : '') ?? '' }
    }
    return c
  })
  const [open, setOpen] = useState<string>(() => {
    const first = data.offerors.flatMap((o) => factors.map((f) => ({ k: `${o.OfferorId}|${f.id}`, s: cell(plan, f, data.ratings, o.OfferorId).spread })))
      .sort((a, b) => b.s - a.s)[0]
    return first?.k ?? ''
  })
  // The case passes chairQuestions as "" on this task, so fall back on empty as well as missing.
  const [questions, setQuestions] = useState(task.data.chairQuestions
    || fromAgent.map((p) => withEvaluatorNames(p.chairQuestions)).filter((q) => q && q !== 'None').join('\n'))
  const [busy, setBusy] = useState(false)

  const keys = Object.keys(choices)
  const splits = data.offerors.flatMap((o) => factors.map((f) => cell(plan, f, data.ratings, o.OfferorId))).filter((x) => x.spread >= 1).length
  const fromAgentCount = data.offerors.flatMap((o) => factors.map((f) => proposalFor(o.OfferorId, f))).filter((p) => p?.source === 'agent').length

  // The board as a queue: splits first (widest disagreement first), agreed cells after, optionally one offeror at a time.
  const items: Item[] = data.offerors.flatMap((o) => factors.map((f) => {
    const x = cell(plan, f, data.ratings, o.OfferorId)
    return { k: `${o.OfferorId}|${f.id}`, o, f, x, split: x.spread >= 1 }
  }))
  const [vendor, setVendor] = useState('all')
  const inView = (i: Item) => vendor === 'all' || i.o.OfferorId === vendor
  const queue = items.filter((i) => i.split).sort((a, b) => b.x.spread - a.x.spread).filter(inView)
  const agreed = items.filter((i) => !i.split).filter(inView)
  // Agent narratives arrive prefilled, so a cell counts only once the Chair has confirmed it.
  const [reviewed, setReviewed] = useState<Set<string>>(() => new Set(task.isReadOnly ? items.map((i) => i.k) : []))
  const isSet = (k: string) => !!choices[k]?.rating && !!choices[k]?.narrative.trim()
  const done = (k: string) => reviewed.has(k) && isSet(k)
  const confirmed = items.filter((i) => done(i.k)).length
  const complete = items.every((i) => done(i.k))
  const pick = (v: string) => {
    setVendor(v)
    const visible = items.filter((i) => v === 'all' || i.o.OfferorId === v)
    if (!visible.some((i) => i.k === open)) setOpen((visible.find((i) => i.split && !done(i.k)) ?? visible[0])?.k ?? '')
  }
  const confirm = (k: string) => {
    setReviewed((r) => new Set(r).add(k))
    const order = [...queue, ...agreed]
    const at = order.findIndex((i) => i.k === k)
    const next = [...order.slice(at + 1), ...order.slice(0, at)].find((i) => !done(i.k) && i.k !== k)
    if (next) setOpen(next.k)
  }
  const confirmAgreed = () => {
    setChoices((c) => {
      const out = { ...c }
      for (const i of agreed) {
        const rating = out[i.k].rating ?? i.x.individual[0]?.Rating
        const who = i.x.individual.length === 1 ? (evaluatorBySlot(i.x.individual[0].EvaluatorSlot)?.name ?? 'The evaluator') : `All ${i.x.individual.length} evaluators`
        out[i.k] = { rating, narrative: out[i.k].narrative.trim() || (rating ? `${who} ${t.sled ? 'scored' : 'rated'} ${says(plan, i.f, rating)}; the findings they accepted support the ${t.rating}.` : '') }
      }
      return out
    })
    setReviewed((r) => { const n = new Set(r); agreed.forEach((i) => n.add(i.k)); return n })
  }

  const finish = async (outcome: 'SignReport' | 'Reconvene') => {
    setBusy(true)
    try {
      const id = sol.SolicitationId
      if (outcome === 'SignReport') {
        const rows = keys.map((k) => {
          const [o, f] = k.split('|')
          return { RatingId: `${o}-${f}-C`, SolicitationId: id, OfferorId: o, FactorId: f, Level: 'Consensus', EvaluatorSlot: 0,
            Rating: choices[k].rating, Rationale: choices[k].narrative, RatedBy: task.actor, RatedAt: nowIso() }
        })
        await backend.upsert('ratings', 'RatingId', rows)
        await backend.upsert('decisions', 'DecisionId', [{ DecisionId: `${id}-consensus`, SolicitationId: id, Kind: 'Consensus', Outcome: 'Approve',
          Rationale: `${t.consensusReport} signed.`, DecidedBy: task.actor, DecidedAt: nowIso() }])
        await backend.upsert('audit', 'EventId', rows.map((r) => auditRow(id, r.RatingId, 'ConsensusRatingSet', t.chair, `${r.FactorId}: ${r.Rating}`)))
        const patch = { decision: 'Approve', payload: JSON.stringify(rows.map((r) => ({ offerorId: r.OfferorId, factorId: r.FactorId, rating: r.Rating, rationale: r.Rationale }))) }
        update(patch)
        await backend.complete('SignReport', { ...task.data, ...patch })
        backend.notify(`${t.consensusReport} signed`, 'success')
      } else {
        await backend.upsert('audit', 'EventId', [auditRow(id, 'case', 'EvaluatorsReconvened', t.chair, questions)])
        const patch = { decision: 'Reconvene', payload: questions }
        update(patch)
        await backend.complete('Reconvene', { ...task.data, ...patch })
        backend.notify('Evaluators reconvened', 'info')
      }
    } catch (e) {
      backend.notify(`Could not complete: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormShell eyebrow={t.sled ? 'Committee consensus' : 'SSEB consensus'} title={plan.title} who={chair} readOnly={task.isReadOnly}
      subtitle={`${sol.SolicitationId} · ${splits} ${t.rating} split${splits === 1 ? '' : 's'} to reconcile`}
      footer={
        <>
          <span className="mr-auto text-sm text-muted-foreground">{confirmed} of {keys.length} consensus {t.ratings} confirmed</span>
          <Button variant="outline" disabled={busy || task.isReadOnly || !questions.trim()} onClick={() => finish('Reconvene')}><MessagesSquare className="mr-1.5 h-4 w-4" />Reconvene evaluators</Button>
          <Button disabled={busy || task.isReadOnly || !complete} onClick={() => finish('SignReport')}>{t.sled ? 'Sign committee report' : 'Sign SSEB report'}</Button>
        </>
      }>
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={`Filter by ${t.offeror}`}>
        {[{ id: 'all', name: `All ${t.offerors}` }, ...data.offerors.map((o) => ({ id: o.OfferorId, name: o.Name }))].map((v) => {
          const n = items.filter((i) => i.split && (v.id === 'all' || i.o.OfferorId === v.id)).length
          // State & Local: the proposer's running points from the consensus scores chosen so far.
          const mine = items.filter((i) => i.o.OfferorId === v.id)
          const running = t.sled && v.id !== 'all' ? mine.reduce((s, i) => s + (pointsFor(plan, i.f, choices[i.k]?.rating) ?? 0), 0) : undefined
          const possible = mine.reduce((s, i) => s + (i.f.weight ?? 0), 0)
          const on = vendor === v.id
          return (
            <button key={v.id} type="button" aria-pressed={on} onClick={() => pick(v.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background/70 hover:border-primary/60 hover:bg-muted'}`}>
              {v.id !== 'all' && <OfferorAvatar name={v.name} index={data.offerors.findIndex((o) => o.OfferorId === v.id)} size={18} />}
              <span className="font-medium">{v.name}</span>
              {running != null && <span className="text-xs tabular-nums opacity-85" title={`Consensus points so far, before cost`}>{pts(Math.round(running * 10) / 10)} / {possible}</span>}
              <span className={`rounded-full px-1.5 text-xs ${on ? 'bg-primary-foreground/20' : n ? 'bg-[var(--ss-lvl-3)] text-[var(--ss-lvl-3-fg)]' : 'bg-muted text-muted-foreground'}`}>{n ? `${n} split${n === 1 ? '' : 's'}` : 'agreed'}</span>
            </button>
          )
        })}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Panel title="Reconcile" icon={<Users className="h-4 w-4 text-primary" />}
          description={fromAgentCount ? `The consensus analyst's proposal is preselected in ${fromAgentCount} of ${keys.length} cells. Confirm each one.` : `The most common individual ${t.rating} is preselected. Confirm each cell.`}>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">To reconcile · {queue.length}</p>
              {queue.map((i) => <QueueRow key={i.k} item={i} plan={plan} active={open === i.k} done={done(i.k)} consensus={choices[i.k]?.rating} showOfferor={vendor === 'all'} onSelect={() => setOpen(i.k)} />)}
              {!queue.length && <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">No splits{vendor === 'all' ? '' : ` for this ${t.offeror}`}: the evaluators agree.</p>}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agreed · {agreed.length}</p>
                {agreed.some((i) => !done(i.k)) && !task.isReadOnly && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={confirmAgreed}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Confirm all agreed</Button>}
              </div>
              {agreed.map((i) => <QueueRow key={i.k} item={i} plan={plan} active={open === i.k} done={done(i.k)} consensus={choices[i.k]?.rating} showOfferor={vendor === 'all'} onSelect={() => setOpen(i.k)} />)}
            </div>
            <RatingLegend factors={factors} method={method} words={wordsOf(plan)} />
          </div>
        </Panel>

        {open && choices[open] && (() => {
          const [oid, fid] = open.split('|')
          const f = factors.find((x) => x.id === fid)
          const o = data.offerors.find((x) => x.OfferorId === oid)
          if (!f || !o) return null
          const x = cell(plan, f, data.ratings, oid)
          const p = proposalFor(oid, f)
          const evidence = [...new Map(findingsFor(data.findings, oid, fid).filter((y) => y.Origin === 'Evaluator' && y.Status !== 'Rejected').map((e) => [e.FindingId.replace(/-E\d$/, ''), e])).values()]
          const ch = choices[open]
          const departing = !!(ch.rating && p && rank(plan, f, ch.rating) !== rank(plan, f, p.rating))
          const position = queue.findIndex((i) => i.k === open)
          return (
            <Panel key={open} title={`${o.Name} · ${f.name}`}
              description={x.spread >= 1 ? `${x.individual.length} evaluators · ${x.spread} step${x.spread > 1 ? 's' : ''} apart${position >= 0 ? ` · split ${position + 1} of ${queue.length}` : ''}` : x.individual.length > 1 ? 'The evaluators agree' : `One evaluator ${t.sled ? 'scored' : 'rated'} this ${t.factor}`}>
              <div className="space-y-4">
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                  {x.individual.map((r) => {
                    const who = evaluatorBySlot(r.EvaluatorSlot)
                    return (
                      <div key={r.RatingId} className="space-y-2 rounded-xl border border-border bg-background/50 p-3">
                        <div className="flex items-center gap-2">
                          {who && <PersonaAvatar id={who.id} short={who.short} size={30} />}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{who?.name ?? `Evaluator ${r.EvaluatorSlot}`}</span>
                          <Rating plan={plan} factor={f} rating={r.Rating} size="sm" />
                        </div>
                        {r.Rationale && <p className="text-sm leading-relaxed text-muted-foreground">{r.Rationale}</p>}
                      </div>
                    )
                  })}
                  {!x.individual.length && <p className="text-sm text-muted-foreground">No individual {t.ratings} yet.</p>}
                </div>
                {evidence.length > 0 && (
                  <details className="rounded-xl border border-border px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium">Findings the evaluators accepted ({evidence.length})</summary>
                    <div className="mt-2 space-y-1.5">
                      {evidence.map((e) => <div key={e.FindingId} className="flex items-start gap-2 text-sm"><KindBadge kind={e.Kind} /><span>{e.FindingText}</span></div>)}
                    </div>
                  </details>
                )}
                {p?.source === 'agent' && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <AgentMark />
                      <span className="font-medium">Consensus analyst proposes</span>
                      <Rating plan={plan} factor={f} rating={p.rating} size="sm" />
                    </div>
                    {p.rationale && <p className="mt-1.5 text-sm text-muted-foreground">{p.rationale}</p>}
                  </div>
                )}
                {p?.source === 'modal' && (
                  <div className="rounded-xl border border-dashed border-border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Most common individual {t.rating}</span>
                      <Rating plan={plan} factor={f} rating={p.rating} size="sm" />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">The consensus analyst gave no proposal for this cell, so the most common evaluator {t.rating} is preselected (ties go to the lower {t.rating}).</p>
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t.sled ? 'Committee consensus' : 'SSEB consensus'}</p>
                  <RatingPicker plan={plan} factor={f} value={ch.rating} disabled={task.isReadOnly}
                    onChange={(v) => setChoices((c) => ({ ...c, [open]: { ...c[open], rating: v } }))}
                    note={(official) => (x.individual.some((r) => r.Rating === official) || (p?.source === 'agent' && p.rating === official))
                      ? <span className="flex items-center gap-1"><Raters ratings={x.individual} official={official} />{p?.source === 'agent' && p.rating === official && <Sparkles className="h-3 w-3" aria-label="Proposed by the consensus analyst" />}</span>
                      : null} />
                  <OfficialTerm plan={plan} factor={f} rating={ch.rating} officialOnly />
                  {departing && p && (
                    <p className="text-xs font-medium text-[var(--ss-lvl-3-fg)]">
                      You are departing from {p.source === 'agent' ? "the consensus analyst's proposal" : `the most common individual ${t.rating}`}, {says(plan, f, p.rating)}. State why in the narrative.
                    </p>
                  )}
                  <textarea className={textareaCls} rows={4} disabled={task.isReadOnly} placeholder={`Consensus narrative citing the findings that support the ${t.rating}…`}
                    value={ch.narrative} onChange={(e) => setChoices((c) => ({ ...c, [open]: { ...c[open], narrative: e.target.value } }))} />
                </div>
                {!task.isReadOnly && (
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                    {done(open) && <span className="mr-auto inline-flex items-center gap-1 text-sm text-[var(--ss-good)]"><CheckCircle2 className="h-4 w-4" />Confirmed</span>}
                    <Button disabled={!isSet(open)} onClick={() => confirm(open)}>
                      {done(open) ? 'Next' : 'Confirm and next'}<ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </Panel>
          )
        })()}
      </div>

      <Panel title="Questions for evaluators" description="Only needed if you reconvene the panel instead of signing.">
        <textarea className={textareaCls} rows={3} value={questions} disabled={task.isReadOnly} onChange={(e) => setQuestions(e.target.value)}
          placeholder={t.sled
            ? 'e.g. Priya Natarajan scored Functional and Technical Fit Satisfactory while the others scored Excellent — was the in-system IEP module considered?'
            : 'e.g. Priya Natarajan rated Technical Approach Good while the others rated Outstanding — was the continuous ATO strength considered?'} />
      </Panel>
    </FormShell>
  )
}
