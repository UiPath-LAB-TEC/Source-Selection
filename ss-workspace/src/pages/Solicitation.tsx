import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBackLink, useBackState } from '../lib/backlink'
import { ArrowLeft, EyeOff, Gavel, Loader2, Scale, Trash2 } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@uipath/apollo-wind/components/ui/sheet'
import { Card, CardContent, CardHeader, CardTitle } from '@uipath/apollo-wind/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@uipath/apollo-wind/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@uipath/apollo-wind/components/ui/tabs'
import { ComplianceBadge, Pill, Section } from '../components/Bits'
import { AgencyMark, HeroTile, OfferorAvatar } from '../components/Flair'
import { FindingsBoard } from '../components/FindingsBoard'
import { ExtractionPanel } from '../components/Extraction'
import { TeamStrip } from '../components/TeamStrip'
import { LiveCasePanel } from '../components/LiveCase'
import { DeleteEvaluationDialog } from '../components/DeleteEvaluationDialog'
import { NextActions, useNextActions } from '../components/NextActions'
import { MethodToggle, RatingDetail, RatingLegend, ScoreCell } from '../components/Scorecard'
import { methodOf, methodsFor, wordsOf } from '../lib/ratings'
import { ordinal, scoreFor, scores } from '@forms/lib/score'
import { pts, useTerms } from '@forms/lib/terms'
import { frameworkOfSolicitation, useFrameworkMode } from '../hooks/useFramework'
import { actorName, factorImportance, withEvaluatorNames } from '../lib/types'
import { StageTracker } from '../components/StageTracker'
import { usePersona } from '../hooks/usePersona'
import { useAuth } from '../hooks/useAuth'
import { useLiveCase } from '../lib/maestro'
import type { LiveCase } from '../lib/maestro'
import { STAGES } from '../lib/types'
import { planOf, useData } from '../lib/data'
import { appUrl } from '../lib/apps'
import { cell, forSolicitation, money, moneyShort, rank, rated, stageIndex, when } from '../lib/eval'
import type { RatingMethod } from '../lib/types'

export function Solicitation() {
  const { id = '' } = useParams()
  const { data, preview } = useData()
  const { sdk } = useAuth()
  const { persona } = usePersona()
  const nav = useNavigate()
  const back = useBackLink()
  const backState = useBackState()
  const [tab, setTab] = useState('matrix')
  const [method, setMethod] = useState<RatingMethod>()
  const [open, setOpen] = useState<{ offerorId: string; factorId: string }>()
  const [deleting, setDeleting] = useState(false)
  const sol = data?.solicitations.find((s) => s.SolicitationId === id)
  const d = useMemo(() => (data ? forSolicitation(data, id) : undefined), [data, id])
  // Opened from a link or a task in the other framework: the workspace follows the evaluation.
  const { framework, setFramework } = useFrameworkMode()
  const fw = sol ? frameworkOfSolicitation(sol) : framework
  useEffect(() => { if (fw !== framework) setFramework(fw) }, [fw, framework, setFramework])
  const t = useTerms()
  const { live, error: liveError, running, settled } = useLiveCase(sdk, sol, !preview)
  const next = useNextActions(live)
  // Hold the page until Maestro's status and the steps it's waiting on are in, so nothing fills in after it appears;
  // a slow Maestro never holds it longer than a few seconds. Once shown, later refreshes update it in place.
  const [shownFor, setShownFor] = useState<string>()
  const [waited, setWaited] = useState<string>()
  const show = shownFor === id || waited === id || (settled && next.ready)
  useEffect(() => { const t = setTimeout(() => setWaited(id), 6000); return () => clearTimeout(t) }, [id])
  useEffect(() => { if (show && shownFor !== id) setShownFor(id) }, [show, shownFor, id])
  if (!data || !d) return null
  if (!sol) return <p className="text-muted-foreground">Evaluation not found.</p>
  if (!show || fw !== t.id) return <PageLoading />

  const plan = planOf(sol)
  const factors = rated(plan)
  const priceFactor = plan.factors.find((f) => f.evaluatedNotRated)
  const shownAs = method ?? methodOf(plan)
  const openOfferor = open && d.offerors.find((o) => o.OfferorId === open.offerorId)
  const openFactor = open && factors.find((f) => f.id === open.factorId)
  const consensusDone = d.ratings.some((r) => r.Level === 'Consensus')
  // Independent evaluation: an evaluator sees only their own ratings until consensus.
  const hideOthers = persona.slot != null && !consensusDone
  const cells = d.offerors.flatMap((o) => factors.map((f) => ({ o, f, c: cell(plan, f, d.ratings, o.OfferorId) })))
  // Splits still waiting on the Chair; reconciled ones are history, not work.
  const splits = cells.filter((x) => x.c.spread >= 1)
  const openSplits = splits.filter((x) => !x.c.consensus).length
  const priced = d.offerors.filter((o) => o.TotalEvaluatedPrice != null)
  const lowest = priced.sort((a, b) => (a.TotalEvaluatedPrice ?? 0) - (b.TotalEvaluatedPrice ?? 0))[0]
  const leader = (fid: string) => {
    const ranks = cells.filter((x) => x.f.id === fid && x.c.consensus).map((x) => ({ id: x.o.OfferorId, r: rank(plan, x.f, x.c.consensus!.Rating) }))
    const best = Math.min(...ranks.map((x) => x.r))
    return new Set(ranks.filter((x) => x.r === best).map((x) => x.id))
  }
  // State & Local: totals out of 100 (criteria points from consensus, cost points by formula) and the ranking.
  const points = t.sled ? scores(plan, d.offerors, d.ratings) : []
  const decisionKind = (k: string) => (t.sled ? ({ Price: 'Cost evaluation', Award: 'Award recommendation', Consensus: 'Committee consensus', Release: 'Release' } as Record<string, string>)[k] ?? k : `${k} decision`)

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild><Link to={back.to}><ArrowLeft className="mr-1 h-4 w-4" />{back.label}</Link></Button>
      <section className="ss-hero ss-in rounded-2xl p-6">
        <div className="relative z-10 space-y-5">
          <div className="flex flex-wrap items-start gap-4">
            <AgencyMark agency={plan.agency} size={52} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 text-2xl font-semibold tracking-tight md:truncate md:text-3xl">{plan.title}</h1>
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium ring-1 ring-white/30">{sol.Status}</span>
              </div>
              <p className="text-sm text-white/80"><span className="font-mono text-xs">{plan.solicitationId}</span> · {plan.agency} · {plan.contractType}</p>
            </div>
            {sol.Status === 'Awarded' && (
              <Button size="sm" asChild className="shrink-0 bg-white text-[var(--ss-brand-1)] hover:bg-white/90">
                <a href={appUrl('award', `/a/${encodeURIComponent(sol.SolicitationId)}`)}><Gavel className="mr-1.5 h-4 w-4" />Open in Award</a>
              </Button>
            )}
            {persona.id === 'admin' && !preview && (
              <Button variant="ghost" size="sm" onClick={() => setDeleting(true)} className="shrink-0 text-white/80 hover:bg-white/15 hover:text-white">
                <Trash2 className="mr-1.5 h-4 w-4" />Delete evaluation
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <HeroTile label={t.Offerors} value={d.offerors.length || plan.offerors.length} sub={`${d.offerors.filter((o) => o.ComplianceStatus === 'Compliant').length} ${t.sled ? 'responsive' : 'compliant'}`} />
            <HeroTile label="Findings drafted" value={d.findings.filter((f) => f.Origin === 'Agent').length} sub="by the evaluation assistant" />
            <HeroTile label={`${t.Rating} splits`} value={openSplits}
              sub={openSplits ? `for the ${t.chair} to reconcile` : splits.length ? `${splits.length} reconciled at consensus` : 'evaluators agree so far'} />
            <HeroTile label={t.sled ? 'Cost estimate' : 'IGCE'} value={moneyShort(plan.igce.total)} sub={lowest ? `Lowest ${t.sled ? 'cost' : 'offer'} ${moneyShort(lowest.TotalEvaluatedPrice)}` : `${t.Price} not yet evaluated`} />
          </div>
          <div className="rounded-xl bg-black/10 px-3 pb-2 pt-3"><StageTracker index={live ? liveIndex(live) : sol.Status === 'Proposals Received' ? -1 : stageIndex(sol)} onDark /></div>
        </div>
      </section>

      <DeleteEvaluationDialog open={deleting} onOpenChange={setDeleting} sol={sol} running={running} onDeleted={() => nav('/')} />
      <NextActions next={next} panelSize={plan.panel.evaluators.filter((e) => e.factors.length).length} />
      <TeamStrip plan={plan} sol={sol} nextUp={next.live ? next.rows.map((r) => r.owner.id) : undefined} />
      <LiveCasePanel sol={sol} live={live} running={running} error={liveError} />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-1 overflow-x-auto px-1"><TabsList>
          <TabsTrigger value="matrix">{t.sled ? 'Score sheet' : 'Evaluation matrix'}</TabsTrigger>
          <TabsTrigger value="offerors">{t.Offerors} ({d.offerors.length})</TabsTrigger>
          <TabsTrigger value="findings">Findings ({d.findings.filter((f) => f.Origin === 'Agent').length})</TabsTrigger>
          <TabsTrigger value="decisions">Decisions ({d.decisions.length})</TabsTrigger>
          <TabsTrigger value="audit">Audit trail</TabsTrigger>
          <TabsTrigger value="plan">Evaluation plan</TabsTrigger>
        </TabsList></div>

        <TabsContent value="matrix" className="mt-4 space-y-4">
          {hideOthers && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <EyeOff className="h-4 w-4 shrink-0" />{t.sled ? 'Independent scoring' : 'Independent evaluation'} — you see only your own {t.ratings} until {t.theBoard} reaches consensus.
            </div>
          )}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1"><RatingLegend factors={factors} method={shownAs} words={wordsOf(plan)} confidenceWords={plan.scales.confidence} /></div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">Show {t.ratings} as<MethodToggle value={shownAs} onChange={setMethod} framework={t.id} /></div>
          </div>
          <div className="ss-in overflow-x-auto rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-background">
                  <TableHead className="min-w-[240px]">{t.Offeror}</TableHead>
                  {factors.map((f) => (
                    <TableHead key={f.id} className="min-w-[190px] py-3">
                      <span className="block font-semibold text-foreground">{f.name}</span>
                      <span className="mt-0.5 block text-xs font-normal text-foreground/70">{factorImportance(f, plan.factors, t.id)}</span>
                    </TableHead>
                  ))}
                  <TableHead className="min-w-[180px] py-3 text-right">
                    <span className="block font-semibold text-foreground">{t.Price}</span>
                    {priceFactor?.weight != null && <span className="mt-0.5 block text-xs font-normal text-foreground/70">{factorImportance(priceFactor, plan.factors, t.id)}</span>}
                  </TableHead>
                  {t.sled && (
                    <TableHead className="min-w-[110px] py-3 text-right">
                      <span className="block font-semibold text-foreground">Total</span>
                      <span className="mt-0.5 block text-xs font-normal text-foreground/70">of 100 points</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Rows stay still on hover: only the rating cells open anything. */}
                {d.offerors.map((o) => (
                  <TableRow key={o.OfferorId} className="hover:bg-background">
                    <TableCell className="align-top">
                      <div className="flex items-start gap-2.5">
                        <OfferorAvatar name={o.Name} index={d.offerors.indexOf(o)} size={32} />
                        <div className="min-w-0"><div className="font-medium">{o.Name}</div>
                          {/* Only an exception is news: a row of "Compliant" badges carries no information. */}
                          {o.ComplianceStatus && o.ComplianceStatus !== 'Compliant' && <div className="mt-1"><ComplianceBadge status={o.ComplianceStatus} /></div>}</div>
                      </div>
                    </TableCell>
                    {factors.map((f) => (
                      <TableCell key={f.id} className="p-2 align-top">
                        <ScoreCell plan={plan} factor={f} c={cell(plan, f, d.ratings, o.OfferorId)} leader={!hideOthers && leader(f.id).has(o.OfferorId)}
                          hideOthers={hideOthers} mySlot={persona.slot} method={shownAs}
                          onOpen={() => setOpen({ offerorId: o.OfferorId, factorId: f.id })} />
                      </TableCell>
                    ))}
                    <TableCell className="text-right align-top tabular-nums">
                      <div className="font-medium">{money(o.TotalEvaluatedPrice)}</div>
                      {lowest?.OfferorId === o.OfferorId && <div className="mt-0.5 inline-flex rounded-md border border-border px-1.5 py-0.5 text-xs font-medium text-foreground">Lowest {t.price}</div>}
                      {o.IgceVariancePct != null && (
                        <div className="mt-0.5 text-sm text-foreground/75">{o.IgceVariancePct > 0 ? '+' : ''}{o.IgceVariancePct.toFixed(1)}% vs {t.sled ? 'estimate' : 'IGCE'}</div>
                      )}
                      {t.sled && scoreFor(points, o.OfferorId)?.cost != null && (
                        <div className="text-xs font-medium">{pts(scoreFor(points, o.OfferorId)?.cost)} / {priceFactor?.weight} cost pts</div>
                      )}
                    </TableCell>
                    {t.sled && (() => {
                      const s = scoreFor(points, o.OfferorId)
                      const any = s && s.of > 0
                      return (
                        <TableCell className="text-right align-top tabular-nums">
                          <div className="text-lg font-semibold">{any ? pts(s.total) : '—'}</div>
                          {any && !s.complete && <div className="text-xs text-foreground/70">of {s.of} scored so far</div>}
                          {any && s.complete && <div className={`mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-xs font-semibold ${s.rank === 1 ? 'bg-foreground text-background' : 'bg-muted text-foreground/80'}`}>Ranked {ordinal(s.rank)}</div>}
                        </TableCell>
                      )
                    })()}
                  </TableRow>
                ))}
                {!d.offerors.length && (
                  <TableRow><TableCell colSpan={factors.length + (t.sled ? 3 : 2)} className="py-10 text-center text-muted-foreground">Proposals have not been ingested yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(undefined)}>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
              {openOfferor && openFactor && (
                <>
                  <SheetHeader className="mb-4">
                    <SheetTitle>{openOfferor.Name}</SheetTitle>
                    <SheetDescription>{openFactor.name} · {factorImportance(openFactor, plan.factors, t.id).toLowerCase()}</SheetDescription>
                  </SheetHeader>
                  <RatingDetail plan={plan} factor={openFactor} c={cell(plan, openFactor, d.ratings, openOfferor.OfferorId)}
                    findings={d.findings.filter((x) => x.OfferorId === openOfferor.OfferorId && x.FactorId === openFactor.id)}
                    hideOthers={hideOthers} mySlot={persona.slot} method={shownAs} workingPapers={persona.id === 'ssa'}
                    onTrace={() => nav(`/s/${encodeURIComponent(id)}/trace/${encodeURIComponent(openOfferor.OfferorId)}/${openFactor.id}`, { state: backState })} />
                </>
              )}
            </SheetContent>
          </Sheet>
        </TabsContent>

        <TabsContent value="offerors" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {d.offerors.map((o) => {
              const lines = o.PriceLinesJson ? (JSON.parse(o.PriceLinesJson) as { clin: string; description: string; amount: number }[]) : []
              return (
                <Card key={o.OfferorId}>
                  <CardHeader className="space-y-1">
                    <CardTitle className="truncate text-base">{o.Name}</CardTitle>
                    <div className="flex flex-wrap gap-1.5"><ComplianceBadge status={o.ComplianceStatus} /><Pill>{t.registration} {o.SamStatus ?? '—'}</Pill></div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-muted-foreground">{t.sled ? 'Vendor ID' : 'UEI'}</dt><dd className="font-mono">{o.UEI}</dd>
                      {!t.sled && <><dt className="text-muted-foreground">CAGE</dt><dd className="font-mono">{o.CAGE}</dd></>}
                    </dl>
                    {o.ComplianceNotes && <p className="text-muted-foreground">{o.ComplianceNotes}</p>}
                    <ExtractionPanel o={o} />
                    {lines.length > 0 && (
                      <table className="w-full text-xs">
                        <tbody>
                          {lines.map((l) => (
                            <tr key={l.clin} className="border-t border-border">
                              <td className="py-1 pr-2 font-mono">{l.clin}</td><td className="py-1 pr-2">{l.description}</td>
                              <td className="py-1 text-right tabular-nums">{money(l.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="findings" className="mt-4">
          <FindingsBoard findings={d.findings.filter((f) => f.Origin === 'Agent')} offerors={d.offerors} factors={factors} sol={id} />
        </TabsContent>

        <TabsContent value="decisions" className="mt-4 space-y-3">
          {!d.decisions.length && <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>}
          {d.decisions.sort((a, b) => a.DecidedAt.localeCompare(b.DecidedAt)).map((x) => (
            <Card key={x.DecisionId}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {x.Kind === 'Award' ? <Gavel className="h-4 w-4" /> : <Scale className="h-4 w-4" />}
                  <span className="font-medium">{decisionKind(x.Kind)}</span><Pill>{x.Outcome}</Pill>
                  <span className="ml-auto text-xs text-muted-foreground">{x.DecidedBy} · {when(x.DecidedAt)}</span>
                </div>
                <p className="text-sm">{withEvaluatorNames(x.Rationale)}</p>
                {x.DocumentText && <pre className="ss-doc whitespace-pre-wrap rounded-md border border-border bg-background p-4 text-sm leading-6">{x.DocumentText}</pre>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <ol className="relative space-y-3 border-l border-border pl-5">
            {d.audit.map((e) => (
              <li key={e.EventId} className="text-sm">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{e.Action.replace(/([a-z])([A-Z])/g, '$1 $2')}</span>
                  <span className="text-xs text-muted-foreground">{actorName(e.Actor)} · {when(e.OccurredAt)}</span>
                </div>
                <p className="text-muted-foreground">{e.Detail}</p>
              </li>
            ))}
            {!d.audit.length && <li className="text-sm text-muted-foreground">No activity yet.</li>}
          </ol>
        </TabsContent>

        <TabsContent value="plan" className="mt-4 space-y-4">
          <Section title="Basis for award" description={plan.basisForAward}><p className="text-sm">{plan.relativeImportance}</p></Section>
          <div className="grid gap-4 lg:grid-cols-2">
            {plan.factors.sort((a, b) => a.order - b.order).map((f) => (
              <Card key={f.id}>
                <CardContent className="space-y-2 p-4 text-sm">
                  <div className="flex items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{f.id}</span><span className="font-medium">{f.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{t.sled
                      ? (f.evaluatedNotRated ? 'Cost points by formula' : 'Scored by the committee')
                      : f.evaluatedNotRated ? 'Evaluated, not rated' : `${(f.scale ?? 'technical') === 'confidence' ? 'Confidence assessment' : 'Merit rating'} · ${methodsFor(t.id).find((m) => m.id === methodOf(plan))?.label}`}</span>
                    {f.weight != null && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground" title={t.sled ? 'Maximum points' : 'Weight'}>{f.weight}{t.sled ? ' pts' : '%'}</span>}</div>
                  <p className="text-muted-foreground">{f.criteria}</p>
                  {f.subfactors && <ul className="list-disc pl-5">{f.subfactors.map((s) => <li key={s}>{s}</li>)}</ul>}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Hero tracker position from Maestro: the first primary stage that has not completed. */
/** Shown only if loading takes long enough to notice, so a quick load goes straight to the page. */
function PageLoading() {
  return (
    <div role="status" className="ss-loading flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />Loading evaluation…
    </div>
  )
}

function liveIndex(live: LiveCase) {
  const at = STAGES.findIndex((name) => !/complet/i.test(live.stages.find((s) => s.name === name)?.status ?? ''))
  return at === -1 ? STAGES.length : at
}
