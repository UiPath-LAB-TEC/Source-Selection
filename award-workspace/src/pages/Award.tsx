import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarClock, Check, FileText, Flag, Gavel, Link2, Loader2, Mail, ShieldCheck, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { Buckets } from '@uipath/uipath-typescript/buckets'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Card, CardContent } from '@uipath/apollo-wind/components/ui/card'
import { EmptyState } from '@uipath/apollo-wind/components/ui/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@uipath/apollo-wind/components/ui/tabs'
import { useTerms } from '@forms/lib/terms'
import { AgencyMark, HeroTile, OfferorAvatar } from '@ss/components/Flair'
import { Pill, Section } from '@ss/components/Bits'
import { appUrl } from '@ss/lib/apps'
import { FOLDER, planOf } from '@ss/lib/data'
import { day, money, moneyShort, when } from '@ss/lib/eval'
import { actorName } from '@ss/lib/types'
import type { AuditEvent, Decision, Offeror, Solicitation } from '@ss/lib/types'
import { AwardTracker } from '../components/AwardTracker'
import { AwardTimeline } from '../components/AwardTimeline'
import { ActionGroups } from '../components/ActionItems'
import { ActiveChip } from '../components/ContractCard'
import { FundsPanel } from '../components/FundsPanel'
import { Letters } from '../components/Letters'
import { Modifications } from '../components/Modifications'
import { NextStep } from '../components/NextStep'
import { PeriodTracker } from '../components/PeriodTracker'
import { ScheduleTimeline } from '../components/ScheduleTimeline'
import { AwardRunPanel } from '../components/AwardRunPanel'
import { openAwardTasks } from '../components/AwardTask'
import { AWARD_STAGES, abstractOf, awardStageIndex, fundsOf, isImported, isLive, kindLabel } from '../lib/award'
import type { AwardDataset, AwardRow, Correspondence, Protest } from '../lib/award'
import { grouped } from '../lib/alerts'
import { useAwardData } from '../lib/data'
import { STATUS_LABEL, fmtDay, isContract, periodNow, postAward, shortMoney, signedOn, statusOf } from '../lib/status'
import { AwardChip } from './Awards'

const heroButton = 'text-white ring-1 ring-white/40 hover:bg-white/15 hover:text-white'

/** One page for a record: a signed contract's administration, or an award on its way to signature. */
export function Award() {
  const { id = '' } = useParams()
  // Keyed by record, so moving from one to another opens it on its Overview.
  return <RecordPage key={id} id={id} />
}

function RecordPage({ id }: { id: string }) {
  const { data } = useAwardData()
  const sol = data?.solicitations.find((s) => s.SolicitationId === id)
  if (!data || !sol) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild><Link to="/contracts"><ArrowLeft className="mr-1 h-4 w-4" />Contracts</Link></Button>
        <Card><CardContent className="p-8"><EmptyState title={`${id} not found`} description="It may have been deleted, or it hasn't reached the award yet." /></CardContent></Card>
      </div>
    )
  }
  const status = statusOf(data, sol)
  if (isContract(status)) return <ContractView d={data} sol={sol} />
  if (status === 'ready' || status === 'awarding') return <AwardView d={data} sol={sol} />
  // Still in Source Selection: nothing to do here until the decision is signed.
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild><Link to="/awards"><ArrowLeft className="mr-1 h-4 w-4" />Awards</Link></Button>
      <Card><CardContent className="p-8"><EmptyState icon={<Gavel className="h-6 w-6" />} title={`${sol.Title}: ${status === 'awaiting' ? STATUS_LABEL.awaiting.toLowerCase() : 'still in evaluation'}`}
        description="It's still in Source Selection. Its award steps start here once the decision is signed."
        action={{ label: 'Open in Source Selection', onClick: () => { window.location.href = appUrl('source-selection', `/s/${encodeURIComponent(id)}`) } }} /></CardContent></Card>
    </div>
  )
}

const rowsOf = (d: AwardDataset, id: string) => {
  const of = <T extends { SolicitationId: string }>(rows: T[]) => rows.filter((r) => r.SolicitationId === id)
  const decisions = of(d.decisions)
  return {
    award: of(d.awards)[0],
    offerors: of(d.offerors).sort((a, b) => a.Name.localeCompare(b.Name)),
    letters: of(d.correspondence), protests: of(d.protests), schedule: of(d.schedule), funding: of(d.funding), alerts: of(d.alerts), modifications: of(d.modifications ?? []),
    audit: of(d.audit).sort((a, b) => a.OccurredAt.localeCompare(b.OccurredAt)),
    decision: decisions.find((x) => x.Kind === 'Award'), contract: decisions.find((x) => x.Kind === 'Contract'),
  }
}

function AuditTrail({ audit, intro }: { audit: AuditEvent[]; intro: string }) {
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">{intro}</p>
      <ol className="relative space-y-3 border-l border-border pl-5">
        {audit.map((e) => (
          <li key={e.EventId} className="text-sm">
            <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{e.Action.replace(/([a-z])([A-Z])/g, '$1 $2')}</span>
              <span className="text-xs text-muted-foreground">{actorName(e.Actor)} · {when(e.OccurredAt)}</span>
            </div>
            {e.Detail && <p className="text-muted-foreground">{e.Detail}</p>}
          </li>
        ))}
      </ol>
    </>
  )
}

/** The award's own record: who was notified, the timeline it ran on, the letters, any protest. */
function AwardRecord({ sol, award, offerors, letters, protests, decision, contract, withRun = true }: {
  sol: Solicitation; award?: AwardRow; offerors: Offeror[]; letters: Correspondence[]; protests: Protest[]; decision?: Decision; contract?: Decision; withRun?: boolean
}) {
  const t = useTerms()
  const awardee = offerors.find((o) => o.Name === sol.AwardeeName)
  const others = offerors.filter((o) => o !== awardee)
  return (
    <div className="space-y-6">
      <Section title={t.Offerors} description={t.sled ? 'The recommended proposer and everyone the notice of intent goes to.' : 'The awardee and each unsuccessful offeror owed a notice.'}>
        <Card><CardContent className="divide-y divide-border p-0">
          {[...(awardee ? [awardee] : []), ...others].map((o, i) => {
            const notice = letters.find((c) => c.OfferorId === o.OfferorId && /Notice/.test(c.Kind))
            const label = notice ? `${kindLabel(notice.Kind)}: ${notice.Status.toLowerCase()}` : o === awardee ? 'Award notice not drafted' : 'Notice not drafted'
            return (
              <div key={o.OfferorId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <OfferorAvatar name={o.Name} index={i} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-medium">{o.Name}{o === awardee && <Trophy className="h-4 w-4 text-[var(--ss-gold)]" aria-label="Awardee" />}</span>
                  <span className="block text-xs text-muted-foreground">Total evaluated {t.sled ? 'cost' : 'price'} {money(o.TotalEvaluatedPrice)}</span>
                </span>
                <Pill icon={<Mail className="h-3.5 w-3.5" />} color={notice?.Status === 'Delivered' ? 'var(--ss-good)' : undefined}>{label}</Pill>
              </div>
            )
          })}
        </CardContent></Card>
      </Section>
      <Section title="Timeline" description="Each step of the award and every deadline it ran on. A deadline on a weekend or federal holiday moves to the next business day.">
        <Card><CardContent className="p-5"><AwardTimeline award={award} decision={decision} contract={contract} offerors={offerors} letters={letters} /></CardContent></Card>
      </Section>
      <Section title="Correspondence" description="Every notice, request and debriefing exchanged with the offerors.">
        <Letters letters={letters} offerors={offerors} />
      </Section>
      <Section title="Protest" description="If an offeror protests, each ground is mapped to the evaluation record and the agency report is assembled from it.">
        <Card><CardContent className="p-6"><EmptyState icon={<ShieldCheck className="h-6 w-6" />} title={protests.length ? `${protests.length} protest${protests.length > 1 ? 's' : ''} filed` : 'No protest filed'} description="" /></CardContent></Card>
      </Section>
      {withRun && <AwardRunPanel sol={sol} award={award} />}
    </div>
  )
}

function LinkedContract({ award, rel }: { award?: AwardRow; rel: 'Follow-on' | 'Replaces' }) {
  if (!award) return null
  return (
    <Link to={`/a/${encodeURIComponent(award.SolicitationId)}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/50">
      <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{rel === 'Follow-on' ? 'Replaced by the follow-on contract' : 'Replaces the incumbent contract'}</span>
        <span className="block truncate text-sm font-medium">{award.ContractNumber ?? award.SolicitationId} · {award.AwardeeName ?? 'Awardee'}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><div className="text-sm">{children}</div></div>
}

/**
 * A signed contract: one status, four plain tiles (period, spending, what needs action, contractor), the contract's
 * periods, a post-award line while the debriefing and protest windows run, and the award's history one tab away.
 */
function ContractView({ d, sol }: { d: AwardDataset; sol: Solicitation }) {
  const { sdk, preview, tasks } = useAwardData()
  const [tab, setTab] = useState('overview')
  const [opening, setOpening] = useState(false)
  const id = sol.SolicitationId
  const r = rowsOf(d, id)
  const { award } = r
  const plan = planOf(sol)
  const imported = isImported(award)
  const p = periodNow(r.schedule, award)
  const groups = grouped(r.alerts.filter(isLive))
  const after = postAward(award, r.letters, r.protests)
  const abstract = abstractOf(award)
  const successor = d.awards.find((a) => a.AwardId === award?.SuccessorId)
  const predecessor = d.awards.find((a) => a.AwardId === award?.PredecessorId)
  const hasTask = openAwardTasks(tasks, id, award).length > 0
  const Word = `${p.word[0].toUpperCase()}${p.word.slice(1)}`

  const openContract = async () => {
    if (preview) { toast.info('The preview can’t open filed documents.'); return }
    setOpening(true)
    try {
      const path = `${id}/contract/${award?.ContractNumber}-Conformed.pdf`
      const res = await new Buckets(sdk).getReadUri({ name: 'SS-Records' }, path, { folderKey: FOLDER.folderKey, expiryInMinutes: 30 })
      window.open(res.uri, '_blank', 'noopener')
    } catch (e) { toast.error(`Could not open the contract: ${(e as Error).message}`) } finally { setOpening(false) }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild><Link to="/contracts"><ArrowLeft className="mr-1 h-4 w-4" />Contracts</Link></Button>
      <section className="ss-hero ss-in rounded-2xl p-6">
        <div className="relative z-10 space-y-5">
          <div className="flex flex-wrap items-start gap-4">
            <AgencyMark agency={plan.agency} size={52} />
            {/* At least 16rem for the title, so on a phone the button drops to its own line instead of squeezing it. */}
            <div className="min-w-0 flex-1 basis-64 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 text-2xl font-semibold tracking-tight md:text-3xl">{plan.title}</h1>
                <ActiveChip word={p.word} onDark />
              </div>
              <p className="text-sm text-white/80"><span className="font-mono text-xs">{award?.ContractNumber ?? id}</span> · {plan.agency} · {moneyShort(award?.ContractValue)} · {plan.contractType}</p>
            </div>
            {imported
              ? <Button size="sm" variant="ghost" onClick={openContract} disabled={opening} className={heroButton}>
                  {opening ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}Signed contract
                </Button>
              : <Button size="sm" variant="ghost" asChild className={heroButton}><a href={appUrl('source-selection', `/s/${encodeURIComponent(id)}`)}><ArrowUpRight className="mr-1.5 h-4 w-4" />Evaluation record</a></Button>}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <HeroTile label="Contractor" value={<span className="block truncate text-lg">{sol.AwardeeName ?? award?.AwardeeName ?? '—'}</span>} sub={`Signed ${fmtDay(signedOn(d, sol, award))}`} />
            <HeroTile label="Period" value={p.current ? Word : 'Not started'} sub={p.current ? `Day ${p.day} of ${p.total} · ends ${fmtDay(p.current.EndDay)}` : ''} />
            <HeroTile label="Invoiced this period" value={shortMoney(p.invoiced)} sub={p.obligated ? `of ${shortMoney(p.obligated)} obligated` : 'no funds forecast yet'} />
            <HeroTile label="Needs action" value={groups.needs.length} sub={`${groups.inHand.length} in hand · ${groups.coming.length} coming up`} />
          </div>
          <div className="rounded-xl bg-black/10 px-3 pb-2 pt-3"><PeriodTracker schedule={r.schedule} onDark /></div>
        </div>
      </section>

      {after && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="flex items-center gap-1.5 font-medium"><Flag className="h-4 w-4 text-muted-foreground" aria-hidden />Post-award</span>
          {after.lines.map((l) => (
            <span key={l.text} className={`inline-flex items-center gap-1 ${l.open ? '' : 'text-muted-foreground'}`}>
              {l.open ? <CalendarClock className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5 text-[var(--ss-good)]" aria-hidden />}{l.text}
            </span>
          ))}
          <button type="button" onClick={() => setTab('award')} className="ml-auto text-xs text-muted-foreground hover:text-primary">Award record →</button>
        </div>
      )}

      {/* An award task still open on a signed contract (a debriefing to deliver, a protest position) shows here. */}
      {hasTask && <NextStep sol={sol} award={award} contract={r.contract} />}

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-1 overflow-x-auto px-1"><TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="funds">Funds</TabsTrigger>
          {!imported && <TabsTrigger value="award">Award record</TabsTrigger>}
          <TabsTrigger value="audit">Audit trail</TabsTrigger>
        </TabsList></div>

        <TabsContent value="overview" className="mt-4 space-y-6">
          <Section title="Action items" description={award?.WatchedAt ? `From the contract watch, last run ${when(award.WatchedAt)}.` : 'The contract watch checks every contract each morning.'}>
            <ActionGroups groups={groups} empty="Nothing on this contract needs action right now." />
          </Section>
          {(successor || predecessor) && (
            <div className="grid gap-3 md:grid-cols-2">
              <LinkedContract award={successor} rel="Follow-on" />
              <LinkedContract award={predecessor} rel="Replaces" />
            </div>
          )}
          <Section title="Contract" description={abstract?.source ?? 'As signed.'}>
            <Card><CardContent className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
              <Fact label="Contractor">
                <p className="font-medium">{abstract?.contractor?.name ?? sol.AwardeeName}</p>
                {abstract?.contractor?.address && <p className="text-muted-foreground">{abstract.contractor.address}</p>}
                {(abstract?.contractor?.uei || abstract?.contractor?.cage) && <p className="text-xs text-muted-foreground">UEI {abstract?.contractor?.uei || '—'} · CAGE {abstract?.contractor?.cage || '—'}</p>}
              </Fact>
              <Fact label="Administered by">
                <p className="font-medium">{plan.office}</p>
                <p className="text-muted-foreground">Contracting Officer's Representative: {award?.CorName ?? 'Owen Mercer'}</p>
              </Fact>
              <Fact label="Base and options">{fmtDay(award?.PeriodStart)} to {fmtDay(award?.PeriodEnd)} · {moneyShort(award?.CeilingValue ?? award?.ContractValue)}</Fact>
              <Fact label="Clauses the watch reads">{(abstract?.clauses ?? []).map((c) => c.ref).join(' · ') || '—'}</Fact>
              <div className="sm:col-span-2"><Fact label="Line items">
                <ul className="mt-1 space-y-0.5">{(abstract?.clins ?? []).map((c) => (
                  <li key={c.clin} className="flex flex-wrap justify-between gap-x-4"><span>{c.clin} · {c.description} <span className="text-xs text-muted-foreground">({c.type?.toLowerCase()})</span></span>
                    <span className="tabular-nums text-muted-foreground">{money(c.byPeriod?.[p.current?.Name ?? ''] ?? Object.values(c.byPeriod ?? {})[0])} this period</span></li>
                ))}</ul>
              </Fact></div>
            </CardContent></Card>
          </Section>
        </TabsContent>

        <TabsContent value="schedule" className="mt-4">
          <ScheduleTimeline schedule={r.schedule} abstract={abstract} alerts={groups.needs.concat(groups.inHand, groups.coming)} />
        </TabsContent>

        <TabsContent value="funds" className="mt-4">
          <div className="space-y-6">
            <FundsPanel funds={fundsOf(award)} funding={r.funding} />
            <Modifications mods={r.modifications} letters={r.letters} />
          </div>
        </TabsContent>

        {!imported && (
          <TabsContent value="award" className="mt-4">
            <AwardRecord sol={sol} award={award} offerors={r.offerors} letters={r.letters} protests={r.protests} decision={r.decision} contract={r.contract} />
          </TabsContent>
        )}

        <TabsContent value="audit" className="mt-4">
          <AuditTrail audit={r.audit} intro={imported ? 'The contract’s record, from award to the latest watch.' : 'The whole record, from proposal intake in Source Selection to today.'} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/**
 * An award on its way to a signed contract: who's selected, the award steps, whose move it is, and the Maestro run.
 * Once the contract is signed this page becomes the contract's.
 */
function AwardView({ d, sol }: { d: AwardDataset; sol: Solicitation }) {
  const t = useTerms()
  const [tab, setTab] = useState('overview')
  const id = sol.SolicitationId
  const r = rowsOf(d, id)
  const { award } = r
  const plan = planOf(sol)
  const awardee = r.offerors.find((o) => o.Name === sol.AwardeeName)
  const others = r.offerors.filter((o) => o !== awardee)
  const index = awardStageIndex(award, t.id)
  const stages = AWARD_STAGES[t.id]
  const notified = others.filter((o) => r.letters.some((c) => c.OfferorId === o.OfferorId && /Notice/.test(c.Kind) && c.Status === 'Delivered')).length
  const label = index < 0 ? STATUS_LABEL.ready : `${STATUS_LABEL.awarding} · ${index >= stages.length ? 'Closed' : stages[index]}`
  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild><Link to="/awards"><ArrowLeft className="mr-1 h-4 w-4" />Awards</Link></Button>
      <section className="ss-hero ss-in rounded-2xl p-6">
        <div className="relative z-10 space-y-5">
          <div className="flex flex-wrap items-start gap-4">
            <AgencyMark agency={plan.agency} size={52} />
            <div className="min-w-0 flex-1 basis-64 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 text-2xl font-semibold tracking-tight md:text-3xl">{plan.title}</h1>
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium ring-1 ring-white/30">{label}</span>
              </div>
              <p className="text-sm text-white/80"><span className="font-mono text-xs">{id}</span> · {plan.agency} · {plan.contractType}</p>
            </div>
            <Button size="sm" variant="ghost" asChild className={heroButton}><a href={appUrl('source-selection', `/s/${encodeURIComponent(id)}`)}><ArrowUpRight className="mr-1.5 h-4 w-4" />Evaluation record</a></Button>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <HeroTile label={t.sled ? 'Recommended' : 'Selected'} value={<span className="block truncate text-lg">{sol.AwardeeName ?? '—'}</span>} sub={`${t.sled ? 'Recommended' : 'Decision signed'} ${day(r.decision?.DecidedAt ?? sol.AwardedAt)}`} />
            <HeroTile label="Award value" value={moneyShort(award?.ContractValue ?? awardee?.TotalEvaluatedPrice)} sub={award?.ContractNumber ? `Contract ${award.ContractNumber}` : 'Total evaluated price'} />
            <HeroTile label={`${t.Offerors} notified`} value={`${notified} of ${others.length}`} sub={notified ? 'Notices delivered' : 'No notices yet'} />
            <HeroTile label="Protests" value={r.protests.length} sub={r.protests.length ? r.protests.map((x) => x.Forum ?? 'Filed').join(', ') : 'None filed'} />
          </div>
          <div className="rounded-xl bg-black/10 px-3 pb-2 pt-3"><AwardTracker index={index} onDark /></div>
        </div>
      </section>
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><AwardChip label={label} />Not a contract yet: it moves to Contracts the day the contract award is signed.</div>

      {/* Whose move it is, with the task to open: Begin award, the CO's signature, or the robots working in between. */}
      <NextStep sol={sol} award={award} contract={r.contract} />
      <AwardRunPanel sol={sol} award={award} />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-1 overflow-x-auto px-1"><TabsList>
          <TabsTrigger value="overview">Award record</TabsTrigger>
          <TabsTrigger value="audit">Audit trail</TabsTrigger>
        </TabsList></div>
        <TabsContent value="overview" className="mt-4">
          <AwardRecord sol={sol} award={award} offerors={r.offerors} letters={r.letters} protests={r.protests} decision={r.decision} contract={r.contract} withRun={false} />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditTrail audit={r.audit} intro={`The whole record, from proposal intake in ${t.sled ? 'RFP Evaluation' : 'Source Selection'} to the last step here.`} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
