import { useState } from 'react'
import type { MouseEvent, KeyboardEvent } from 'react'
import { Check, Eye, FileText, Pencil, Plus, Save, Undo2, X } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { KindBadge, OfficialTerm, Pill, kindAccent } from '../components/Bits'
import { OfferorAvatar } from '../components/Flair'
import { PageViewer } from '../components/PageViewer'
import type { CitedFinding } from '../components/PageViewer'
import { KIND_ORDER, rated } from '../lib/eval'
import type { Finding } from '../lib/types'
import { evaluatorBySlot, persona } from '../lib/types'
import { useTerms, useVolumeLabel } from '../lib/terms'
import { AgentMark, ChoiceGroup, FormShell, Panel, RatingPicker, auditRow, nowIso, rovingKey, textareaCls, useForm } from './common'

type Disposition = 'Pending' | 'Accepted' | 'Edited' | 'Rejected'
interface Work { status: Disposition; text: string }
interface Added { id: string; offerorId: string; factorId: string; kind: string; text: string; volume: string; page: number }
interface Score { rating?: string; rationale: string }
/** What Save draft keeps: everything the evaluator has done so far, restored when the task reopens. */
interface Draft { v: 1; savedAt: string; work: Record<string, Work>; added: Added[]; scores: Record<string, Score> }
/** A finding card the document viewer can show. */
interface Card extends CitedFinding { id: string }

const KINDS = ['Significant Strength', 'Strength', 'Weakness', 'Significant Weakness', 'Deficiency', 'Risk']

export function EvaluationWorksheet() {
  const { backend, task, data, sol, plan, update } = useForm()
  const slot = task.data.evaluatorSlot ?? 1
  const me = plan.panel.evaluators.find((e) => e.slot === slot)
  const who = evaluatorBySlot(slot) ?? persona('evaluator1')
  const t = useTerms()
  const volumeLabel = useVolumeLabel()
  const factors = rated(plan).filter((f) => me?.factors.includes(f.id))
  const offerors = data.offerors
  const drafts = data.findings.filter((f) => f.Origin === 'Agent')

  // A saved draft (Save draft) wins over what this evaluator already submitted to Data Fabric (re-opened task).
  const [saved] = useState<Draft | undefined>(() => { try { return task.data.draft ? JSON.parse(task.data.draft) as Draft : undefined } catch { return undefined } })
  const [work, setWork] = useState<Record<string, Work>>(() => {
    const w: Record<string, Work> = {}
    for (const d of drafts) {
      const mine = data.findings.find((f) => f.FindingId === `${d.FindingId}-E${slot}`)
      w[d.FindingId] = mine ? { status: mine.Status as Disposition, text: mine.FindingText } : { status: 'Pending', text: d.FindingText }
    }
    return { ...w, ...saved?.work }
  })
  const [added, setAdded] = useState<Added[]>(() => saved?.added ?? [])
  const [scores, setScores] = useState<Record<string, Score>>(() => {
    const s: Record<string, Score> = {}
    for (const r of data.ratings) if (r.Level === 'Individual' && r.EvaluatorSlot === slot) s[`${r.OfferorId}|${r.FactorId}`] = { rating: r.Rating, rationale: r.Rationale }
    return { ...s, ...saved?.scores }
  })
  const [savedAt, setSavedAt] = useState(saved?.savedAt)
  const [saving, setSaving] = useState(false)
  const [offerorId, setOfferorId] = useState(offerors[0]?.OfferorId ?? '')
  const [factorId, setFactorId] = useState(factors[0]?.id ?? '')
  // The finding shown in the document (defaults to the first card), and a page the user paged to by hand.
  const [selId, setSelId] = useState<string | null>(null)
  const [paged, setPaged] = useState<{ volume: string; page: number } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [attest, setAttest] = useState(false)
  const [busy, setBusy] = useState(false)

  const factor = factors.find((f) => f.id === factorId)!
  const offeror = offerors.find((o) => o.OfferorId === offerorId)
  const here = drafts.filter((d) => d.OfferorId === offerorId && d.FactorId === factorId).sort((a, b) => KIND_ORDER.indexOf(a.Kind) - KIND_ORDER.indexOf(b.Kind))
  const mineAdded = added.filter((a) => a.offerorId === offerorId && a.factorId === factorId)
  const scoreKey = `${offerorId}|${factorId}`
  const score = scores[scoreKey] ?? { rationale: '' }
  const cards: Card[] = [
    ...here.map((d) => ({ id: d.FindingId, kind: d.Kind, volume: d.CitationVolume, page: d.CitationPage, quote: d.CitationQuote })),
    ...mineAdded.map((a) => ({ id: a.id, kind: a.kind, volume: a.volume, page: a.page })),
  ]
  const selected = cards.find((c) => c.id === selId) ?? cards[0]
  const view = paged ?? (selected ? { volume: selected.volume, page: selected.page } : { volume: factor?.volume ?? 'technical', page: 1 })
  const select = (id: string) => { setSelId(id); setPaged(null) }
  const pickOfferor = (id: string) => { setOfferorId(id); setSelId(null); setPaged(null) }
  const pickFactor = (id: string) => { setFactorId(id); setSelId(null); setPaged(null) }
  /** Whole-card selection; the card's own buttons and the edit box keep their behaviour. */
  const cardProps = (id: string) => ({
    role: 'button' as const, tabIndex: 0, 'aria-pressed': selected?.id === id,
    onClick: (e: MouseEvent<HTMLElement>) => { if (!(e.target as HTMLElement).closest('button, textarea, input, select, a')) select(id) },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(id) } },
  })
  const cardCls = (id: string) => `relative cursor-pointer rounded-xl border p-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-primary ${selected?.id === id ? 'border-primary bg-primary/5 shadow-md ring-1 ring-primary' : 'border-border hover:border-primary/50'}`
  const shownTag = (c: Card) => selected?.id === c.id
    ? <>
        <span aria-hidden className="absolute inset-y-3 left-0 w-1 rounded-r" style={{ background: kindAccent(c.kind) }} />
        <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground"><Eye className="h-3 w-3" />Shown in document</span>
      </>
    : null

  const cells = offerors.flatMap((o) => factors.map((f) => `${o.OfferorId}|${f.id}`))
  const pendingIn = (k: string) => {
    const [o, f] = k.split('|')
    return drafts.filter((d) => d.OfferorId === o && d.FactorId === f && work[d.FindingId]?.status === 'Pending').length
  }
  const done = (k: string) => !!scores[k]?.rating && !!scores[k]?.rationale.trim() && !pendingIn(k)
  // Why a factor isn't rated yet: a rating counts only once every agent finding behind it has a decision.
  const statusOf = (k: string) => {
    if (done(k)) return t.sled ? 'scored' : 'rated'
    const left = pendingIn(k)
    return scores[k]?.rating && left ? `${left} finding${left === 1 ? '' : 's'} to decide` : t.sled ? 'not scored' : 'not rated'
  }
  const progress = cells.filter(done).length
  const ready = progress === cells.length && attest && !task.isReadOnly

  const setDisposition = (d: Finding, status: Disposition, text?: string) => {
    setWork((w) => ({ ...w, [d.FindingId]: { status, text: text ?? w[d.FindingId].text } }))
  }
  const setScore = (patch: Partial<Score>) => setScores((s) => ({ ...s, [scoreKey]: { ...(s[scoreKey] ?? { rationale: '' }), ...patch } }))

  const submit = async () => {
    setBusy(true)
    try {
      const id = sol.SolicitationId
      const actor = task.actor
      const copies = drafts.filter((d) => factors.some((f) => f.id === d.FactorId)).map((d) => {
        const w = work[d.FindingId]
        return {
          FindingId: `${d.FindingId}-E${slot}`, SolicitationId: id, OfferorId: d.OfferorId, FactorId: d.FactorId, Kind: d.Kind,
          FindingText: w.text, AgentText: d.AgentText ?? d.FindingText, CitationVolume: d.CitationVolume, CitationPage: d.CitationPage,
          CitationQuote: d.CitationQuote, Author: actor, Origin: 'Evaluator', Status: w.status, EvaluatorSlot: slot, Revision: w.status === 'Edited' ? 2 : 1,
        }
      })
      const extra = added.map((a, n) => ({
        FindingId: `${id}-${a.offerorId.split('-').pop()}-${a.factorId}-E${slot}-N${n + 1}`, SolicitationId: id, OfferorId: a.offerorId, FactorId: a.factorId,
        Kind: a.kind, FindingText: a.text, AgentText: '', CitationVolume: a.volume, CitationPage: a.page, CitationQuote: '',
        Author: actor, Origin: 'Evaluator', Status: 'Added', EvaluatorSlot: slot, Revision: 1,
      }))
      const ratings = cells.map((k) => {
        const [o, f] = k.split('|')
        return { RatingId: `${o}-${f}-E${slot}`, SolicitationId: id, OfferorId: o, FactorId: f, Level: 'Individual', EvaluatorSlot: slot,
          Rating: scores[k].rating, Rationale: scores[k].rationale, RatedBy: actor, RatedAt: nowIso() }
      })
      await backend.upsert('findings', 'FindingId', [...copies, ...extra])
      await backend.upsert('ratings', 'RatingId', ratings)
      await backend.upsert('audit', 'EventId', [
        ...copies.filter((c) => c.Status !== 'Accepted').map((c) => auditRow(id, c.FindingId, `Finding${c.Status}`, `Evaluator ${slot}`, c.FindingText)),
        ...extra.map((c) => auditRow(id, c.FindingId, 'FindingAdded', `Evaluator ${slot}`, c.FindingText)),
        ...ratings.map((r) => auditRow(id, r.RatingId, 'RatingAssigned', `Evaluator ${slot}`, `${r.FactorId}: ${r.Rating}`)),
      ])
      const out = JSON.stringify(ratings.map((r) => ({ offerorId: r.OfferorId, factorId: r.FactorId, rating: r.Rating })))
      const patch = { decision: 'Submitted', payload: out }
      update(patch)
      await backend.complete('Submit', { ...task.data, ...patch })
      backend.notify('Evaluation submitted', 'success')
    } catch (e) {
      backend.notify(`Could not submit: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  /** Long evaluations: keep everything so far (dispositions, added findings, ratings, rationales) without submitting. */
  const saveDraft = async () => {
    setSaving(true)
    try {
      const at = nowIso()
      const draft = JSON.stringify({ v: 1, savedAt: at, work, added, scores } satisfies Draft)
      await backend.saveDraft({ ...task.data, draft })
      update({ draft })
      setSavedAt(at)
      backend.notify('Draft saved. Pick up where you left off any time.', 'success')
    } catch (e) {
      backend.notify(`Could not save your draft: ${(e as Error).message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormShell eyebrow={`${t.sled ? 'Individual scoring' : 'Individual evaluation'} · ${me?.title ?? who.label}`} title={plan.title} who={who} readOnly={task.isReadOnly}
      subtitle={`${sol.SolicitationId} · ${factors.map((f) => f.name).join(' and ')} · ${offerors.length} ${t.offerors}`}
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--ss-brand-2)]" checked={attest} onChange={(e) => setAttest(e.target.checked)} disabled={task.isReadOnly} />
            {t.sled ? 'I scored each proposal independently against the RFP’s evaluation criteria.' : 'I evaluated each proposal independently against the stated criteria.'}
          </label>
          <span className="text-sm text-muted-foreground tabular-nums">{progress} of {cells.length} {t.sled ? 'scored' : 'rated'}</span>
          {savedAt && <span className="text-xs text-muted-foreground">Draft saved {new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
          <Button variant="outline" onClick={saveDraft} disabled={saving || busy || task.isReadOnly}><Save className="mr-1.5 h-4 w-4" />{saving ? 'Saving…' : 'Save draft'}</Button>
          <Button onClick={submit} disabled={!ready || busy}>{busy ? 'Submitting…' : t.sled ? 'Submit scores' : 'Submit evaluation'}</Button>
        </>
      }>
      <div className="ss-in space-y-2">
        <div role="tablist" aria-label={t.Offerors} className="flex flex-wrap items-end gap-2">
          {offerors.map((o, n) => {
            const on = o.OfferorId === offerorId
            const ratedN = factors.filter((f) => done(`${o.OfferorId}|${f.id}`)).length
            return (
              <button key={o.OfferorId} id={`offeror-tab-${n}`} type="button" role="tab" aria-selected={on} aria-controls="evaluation-panel" tabIndex={on ? 0 : -1}
                onClick={() => pickOfferor(o.OfferorId)}
                onKeyDown={(e) => { const k = rovingKey(e, n, offerors.length); if (k !== undefined) pickOfferor(offerors[k].OfferorId) }}
                className={`relative flex min-w-0 items-center rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${on
                  ? 'gap-3 border-2 border-primary bg-primary px-4 py-3 text-base text-primary-foreground shadow-md'
                  : 'gap-2 border border-border bg-transparent px-3 py-2 text-sm text-muted-foreground hover:border-foreground/40 hover:text-foreground'}`}>
                <OfferorAvatar name={o.Name} index={n} size={on ? 36 : 28} />
                <span className="min-w-0">
                  <span className={`block truncate ${on ? 'font-bold' : 'font-medium'}`}>{o.Name}</span>
                  <span className={`flex items-center gap-1 text-xs ${on ? 'font-semibold' : ''}`}>
                    {on && <><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />Viewing ·</>}<span>{ratedN}/{factors.length} {t.sled ? 'scored' : 'rated'}</span>
                  </span>
                </span>
                {on && <span aria-hidden className="absolute -bottom-[9px] left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 rounded-[3px] border-b-2 border-r-2 border-primary bg-primary" />}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-primary bg-card px-4 py-3">
          {offeror && <OfferorAvatar name={offeror.Name} index={offerors.indexOf(offeror)} size={36} />}
          {/* A real basis, so on narrow screens the factor buttons wrap below instead of squeezing the name away. */}
          <div className="min-w-0 flex-[1_1_16rem]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Evaluating</p>
            <p className="truncate text-base font-semibold">{offeror?.Name} <span className="font-normal text-muted-foreground">·</span> {factor?.name}</p>
          </div>
          {factors.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t.Factor}</span>
              {/* Every factor reads as a button, not just the selected one: bordered, with a hover state. */}
              <div role="tablist" aria-label={t.Factors} className="flex flex-wrap gap-2">
                {factors.map((f, i) => {
                  const on = f.id === factorId
                  const ok = done(`${offerorId}|${f.id}`)
                  return (
                    <button key={f.id} type="button" role="tab" aria-selected={on} aria-controls="evaluation-panel" tabIndex={on ? 0 : -1}
                      onClick={() => pickFactor(f.id)} onKeyDown={(e) => { const k = rovingKey(e, i, factors.length); if (k !== undefined) pickFactor(factors[k].id) }}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? 'border-primary bg-primary font-bold text-primary-foreground shadow' : 'border-border bg-background/70 font-medium text-foreground shadow-sm hover:border-primary/60 hover:bg-muted'}`}>
                      {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : ok ? <Check className="h-3.5 w-3.5 text-[var(--ss-good)]" strokeWidth={3} aria-hidden /> : null}{f.name}
                      <span className={`text-xs font-normal ${on ? 'opacity-90' : 'text-muted-foreground'}`}>· {statusOf(`${offerorId}|${f.id}`)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div id="evaluation-panel" role="tabpanel" aria-labelledby={`offeror-tab-${offerors.findIndex((o) => o.OfferorId === offerorId)}`} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Panel title="Agent-drafted findings" icon={<AgentMark size={20} />}
            description="The evaluation assistant's drafts, each cited to a proposal page. Select a finding to see its passage; you decide what stands.">
            <div className="space-y-3">
              {here.map((d) => {
                const w = work[d.FindingId]
                const c = cards.find((x) => x.id === d.FindingId)!
                return (
                  <div key={d.FindingId} {...cardProps(d.FindingId)} className={`${cardCls(d.FindingId)} ${w.status === 'Rejected' ? 'border-dashed opacity-60' : ''}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <KindBadge kind={d.Kind} />
                      <button type="button" onClick={() => select(d.FindingId)} aria-label={`Show ${volumeLabel(d.CitationVolume)}, page ${d.CitationPage}`}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
                        <FileText className="h-3 w-3" />{volumeLabel(d.CitationVolume)}, p. {d.CitationPage}
                      </button>
                      {shownTag(c)}
                      {w.status !== 'Pending' && <span className="ml-auto"><Pill>{w.status}</Pill></span>}
                    </div>
                    {editing === d.FindingId
                      ? <textarea className={`${textareaCls} mt-2`} rows={3} value={w.text} autoFocus
                          onChange={(e) => setDisposition(d, 'Edited', e.target.value)} onBlur={() => setEditing(null)} />
                      : <p className={`mt-2 text-sm ${w.status === 'Rejected' ? 'line-through' : ''}`}>{w.text}</p>}
                    {!task.isReadOnly && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button size="sm" variant={w.status === 'Accepted' ? 'default' : 'outline'} onClick={() => setDisposition(d, 'Accepted', d.FindingText)}><Check className="mr-1 h-3.5 w-3.5" />Accept</Button>
                        <Button size="sm" variant={w.status === 'Edited' ? 'default' : 'outline'} onClick={() => setEditing(d.FindingId)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                        <Button size="sm" variant={w.status === 'Rejected' ? 'default' : 'outline'} onClick={() => setDisposition(d, 'Rejected')}><X className="mr-1 h-3.5 w-3.5" />Reject</Button>
                        {w.status !== 'Pending' && <Button size="sm" variant="ghost" onClick={() => setDisposition(d, 'Pending', d.FindingText)}><Undo2 className="mr-1 h-3.5 w-3.5" />Reset</Button>}
                      </div>
                    )}
                  </div>
                )
              })}
              {!here.length && <p className="text-sm text-muted-foreground">No drafts for this {t.offeror} and {t.factor}.</p>}
              {mineAdded.map((a) => (
                <div key={a.id} {...cardProps(a.id)} className={`${cardCls(a.id)} ${selected?.id === a.id ? '' : 'border-primary/40 bg-primary/5'}`}>
                  <div className="flex flex-wrap items-center gap-2"><KindBadge kind={a.kind} /><Pill>Added by you</Pill>
                    {shownTag(cards.find((x) => x.id === a.id)!)}
                    <span className="ml-auto text-xs text-muted-foreground">{volumeLabel(a.volume)}, p. {a.page}</span></div>
                  <p className="mt-2 text-sm">{a.text}</p>
                </div>
              ))}
              {!task.isReadOnly && <AddFinding volume={view.volume} page={view.page}
                onAdd={(kind, text) => setAdded((xs) => [...xs, { id: crypto.randomUUID(), offerorId, factorId, kind, text, volume: view.volume, page: view.page }])} />}
            </div>
          </Panel>

          <Panel title={`Your ${t.rating} — ${factor?.name}${t.sled && factor?.weight != null ? ` (up to ${factor.weight} points)` : ''}`} description={factor?.criteria}>
            <div className="space-y-3">
              <RatingPicker plan={plan} factor={factor} value={score.rating} onChange={(v) => setScore({ rating: v })} disabled={task.isReadOnly} />
              <OfficialTerm plan={plan} factor={factor} rating={score.rating} officialOnly />
              <textarea className={textareaCls} rows={3} placeholder="Rationale tied to the findings above…" value={score.rationale}
                onChange={(e) => setScore({ rationale: e.target.value })} disabled={task.isReadOnly} />
            </div>
          </Panel>
        </div>

        <div className="space-y-2 lg:sticky lg:top-4 lg:self-start">
          <PageViewer pages={data.pages} offeror={offeror} volume={view.volume} page={view.page} finding={selected}
            onPage={(p) => setPaged({ volume: view.volume, page: p })} onReturn={() => setPaged(null)} />
          <p className="text-xs text-muted-foreground">Select a finding to see its passage. New findings you add cite the page shown here.</p>
        </div>
      </div>
    </FormShell>
  )
}

function AddFinding({ onAdd, page }: { volume: string; page: number; onAdd: (kind: string, text: string) => void }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState('Strength')
  const [text, setText] = useState('')
  if (!open) return <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" />Add your own finding</Button>
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
      <ChoiceGroup label="Finding kind" options={KINDS} value={kind} onChange={setKind} />
      <textarea className={textareaCls} rows={2} placeholder={`Finding, citing page ${page} of the volume on the right…`} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" disabled={!text.trim()} onClick={() => { onAdd(kind, text.trim()); setText(''); setOpen(false) }}>Add finding</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  )
}
