import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useBackState } from '../lib/backlink'
import { ArrowLeft, ArrowRight, BookOpenCheck, Sparkles, UserPen, Users } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@uipath/apollo-wind/components/ui/card'
import { KindBadge, OriginBadge, Pill, RatingChip, SpreadBadge } from '../components/Bits'
import { OfferorAvatar } from '../components/Flair'
import { RatingPill } from '../components/Scorecard'
import { actorName, evaluatorBySlot, withEvaluatorNames } from '../lib/types'
import { PageViewer } from '../components/PageViewer'
import { useTerms, useVolumeLabel } from '@forms/lib/terms'
import { usePersona } from '../hooks/usePersona'
import { planOf, useData } from '../lib/data'
import { KIND_ORDER, cell, findingsFor, forSolicitation, rated, when } from '../lib/eval'
import type { Finding } from '../lib/types'

/** Word-level diff of the agent's draft against the evaluator's final text. */
function Diff({ from, to }: { from: string; to: string }) {
  const a = from.split(/(\s+)/)
  const b = to.split(/(\s+)/)
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: { t: string; k: 'same' | 'add' | 'del' }[] = []
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ t: a[i], k: 'same' }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: a[i++], k: 'del' })
    else out.push({ t: b[j++], k: 'add' })
  }
  while (i < a.length) out.push({ t: a[i++], k: 'del' })
  while (j < b.length) out.push({ t: b[j++], k: 'add' })
  return (
    <span>
      {out.map((x, n) => x.k === 'same' ? <span key={n}>{x.t}</span>
        : x.k === 'add' ? <ins key={n} className="rounded-sm bg-[color-mix(in_srgb,var(--ss-good)_18%,transparent)] no-underline">{x.t}</ins>
          : <del key={n} className="text-muted-foreground">{x.t}</del>)}
    </span>
  )
}

/** Numbered node on the evidence chain; sits on the connector line. */
function Step({ n }: { n: number }) {
  return (
    <span className="ss-hero relative -mb-2 -ml-11 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold shadow-md">
      <span className="relative z-10">{n}</span>
    </span>
  )
}

export function Trace() {
  const { id = '', offerorId = '', factorId = '' } = useParams()
  const [search] = useSearchParams()
  const { data } = useData()
  const { persona } = usePersona()
  const volumeLabel = useVolumeLabel()
  const t = useTerms()
  const backState = useBackState()
  const d = useMemo(() => (data ? forSolicitation(data, id) : undefined), [data, id])
  const sol = data?.solicitations.find((s) => s.SolicitationId === id)
  const [selected, setSelected] = useState<string | null>(search.get('finding'))
  const [page, setPage] = useState<number | null>(null)
  if (!data || !d || !sol) return null

  const plan = planOf(sol)
  const factor = rated(plan).find((f) => f.id === factorId)
  const offeror = d.offerors.find((o) => o.OfferorId === offerorId)
  if (!factor || !offeror) return <p className="text-muted-foreground">Nothing to trace.</p>

  const c = cell(plan, factor, d.ratings, offerorId)
  const hideOthers = persona.slot != null && !c.consensus
  const all = findingsFor(d.findings, offerorId, factorId)
  const drafts = all.filter((f) => f.Origin === 'Agent').sort((a, b) => KIND_ORDER.indexOf(a.Kind) - KIND_ORDER.indexOf(b.Kind))
  const copiesOf = (draft: Finding) => all.filter((f) => f.Origin === 'Evaluator' && f.FindingId.startsWith(draft.FindingId + '-E'))
    .filter((f) => !hideOthers || f.EvaluatorSlot === persona.slot)
  const focus = all.find((f) => f.FindingId === selected) ?? drafts[0]
  const focusPage = page ?? focus?.CitationPage ?? 1
  const refs = new Set([...all.map((f) => f.FindingId), ...c.individual.map((r) => r.RatingId), c.consensus?.RatingId])
  const events = d.audit.filter((e) => refs.has(e.EntityRef))

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild><Link to={`/s/${encodeURIComponent(id)}`} state={backState}><ArrowLeft className="mr-1 h-4 w-4" />{plan.title}</Link></Button>
      <section className="ss-hero ss-in rounded-2xl p-6">
        <div className="relative z-10 flex flex-wrap items-center gap-4">
          <OfferorAvatar name={offeror.Name} index={d.offerors.indexOf(offeror)} size={48} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/75">Protest trace</p>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{offeror.Name} · {factor.name}</h1>
            <p className="text-sm text-white/80">{t.Rating} → evaluators → findings → the proposal page. Every link is a recorded fact.</p>
          </div>
          {c.consensus && <div className="rounded-xl bg-white/95 px-3 py-2 text-foreground dark:bg-white/90"><RatingChip plan={plan} factor={factor} rating={c.consensus.Rating} /></div>}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="ss-chain relative space-y-4 pl-11">
          <Step n={1} />
          <Card className="ss-in">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><BookOpenCheck className="h-4 w-4" />{t.sled ? 'Committee consensus' : 'SSEB consensus'}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {c.consensus ? (
                <>
                  <RatingChip plan={plan} factor={factor} rating={c.consensus.Rating} />
                  <p>{withEvaluatorNames(c.consensus.Rationale)}</p>
                  <p className="text-xs text-muted-foreground">Signed by {actorName(t.chair)}, {t.chair} · {when(c.consensus.RatedAt)}</p>
                </>
              ) : <p className="text-muted-foreground">Consensus not reached yet.</p>}
            </CardContent>
          </Card>

          <Step n={2} />
          <Card className="ss-in" style={{ animationDelay: '80ms' }}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />Individual evaluations {!hideOthers && <SpreadBadge spread={c.spread} />}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(hideOthers ? c.individual.filter((r) => r.EvaluatorSlot === persona.slot) : c.individual).map((r) => (
                <div key={r.RatingId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Pill icon={<UserPen className="h-3.5 w-3.5" />} color="var(--ss-rate-2)">{evaluatorBySlot(r.EvaluatorSlot)?.name ?? `Evaluator ${r.EvaluatorSlot}`}</Pill>
                  <RatingPill plan={plan} factor={factor} rating={r.Rating} size="sm" />
                  <span className="text-xs text-muted-foreground">{when(r.RatedAt)}</span>
                </div>
              ))}
              {!c.individual.length && <p className="text-muted-foreground">No individual {t.ratings} yet.</p>}
            </CardContent>
          </Card>

          <Step n={3} />
          <Card className="ss-in" style={{ animationDelay: '160ms' }}>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" />Findings — agent draft and evaluator dispositions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {drafts.map((draft) => {
                const copies = copiesOf(draft)
                const active = [draft, ...copies].some((x) => x.FindingId === focus?.FindingId)
                return (
                  <div key={draft.FindingId} className={`rounded-lg border p-3 text-sm ${active ? 'border-primary' : 'border-border'}`}>
                    <button className="w-full text-left" onClick={() => { setSelected(draft.FindingId); setPage(null) }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <KindBadge kind={draft.Kind} /><OriginBadge origin="Agent" />
                        <span className="ml-auto text-xs text-muted-foreground">{volumeLabel(draft.CitationVolume)}, p. {draft.CitationPage}</span>
                      </div>
                      <p className="mt-1.5">{draft.AgentText ?? draft.FindingText}</p>
                    </button>
                    {copies.map((x) => (
                      <button key={x.FindingId} onClick={() => { setSelected(x.FindingId); setPage(null) }}
                        className="mt-2 flex w-full items-start gap-2 rounded-md bg-muted/40 p-2 text-left">
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 space-y-1">
                          <span className="flex flex-wrap items-center gap-2"><OriginBadge origin="Evaluator" slot={x.EvaluatorSlot} /><Pill>{x.Status}</Pill></span>
                          <span className="block">{x.Status === 'Edited' ? <Diff from={draft.AgentText ?? draft.FindingText} to={x.FindingText} /> : x.FindingText}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )
              })}
              {!drafts.length && <p className="text-sm text-muted-foreground">No findings drafted for this {t.factor} yet.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {focus && (
            <>
              <div className="flex items-center gap-2 text-sm font-medium"><span className="ss-hero flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"><span className="relative z-10">4</span></span>Source — the proposal page the finding cites</div>
              <PageViewer pages={d.pages} offeror={offeror} volume={focus.CitationVolume} page={focusPage} quote={focusPage === focus.CitationPage ? focus.CitationQuote : undefined} onPage={setPage} />
              <p className="text-xs text-muted-foreground">Highlighted: the passage this finding cites. Proposal text as indexed for the evaluation assistant.</p>
            </>
          )}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Audit events</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {events.map((e) => (
                  <li key={e.EventId} className="flex gap-2">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">{when(e.OccurredAt)}</span>
                    <span className="min-w-0"><span className="font-medium">{actorName(e.Actor)}</span> — {e.Action.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}</span>
                  </li>
                ))}
                {!events.length && <li className="text-muted-foreground">No events.</li>}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
