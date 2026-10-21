import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Loader2, Mail, Play, ShieldCheck, Trophy } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Card, CardContent } from '@uipath/apollo-wind/components/ui/card'
import { EmptyState } from '@uipath/apollo-wind/components/ui/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@uipath/apollo-wind/components/ui/tabs'
import { useTerms } from '@forms/lib/terms'
import { AgencyMark, HeroTile, OfferorAvatar } from '@ss/components/Flair'
import { Pill, Section } from '@ss/components/Bits'
import { appUrl } from '@ss/lib/apps'
import { planOf } from '@ss/lib/data'
import { day, money, moneyShort, when } from '@ss/lib/eval'
import { actorName } from '@ss/lib/types'
import { AwardTracker } from '../components/AwardTracker'
import { AWARD_STAGES, awardStageIndex } from '../lib/award'
import { useAwardData } from '../lib/data'
import { useAwardPersona } from '../hooks/usePersona'
import { useBeginAward, useCanBeginAward } from '../lib/start'

/** One award: where its Award phase stands, the offerors it must notify, and the whole record's audit trail. */
export function Award() {
  const { id = '' } = useParams()
  const { data } = useAwardData()
  const t = useTerms()
  const [tab, setTab] = useState('overview')
  const { persona } = useAwardPersona()
  const { starting, begin } = useBeginAward()
  const canBegin = useCanBeginAward()
  const sol = data?.solicitations.find((s) => s.SolicitationId === id)
  if (!data || !sol) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild><Link to="/awards"><ArrowLeft className="mr-1 h-4 w-4" />Awards</Link></Button>
        <Card><CardContent className="p-8"><EmptyState title={`${id} not found`} description="It may have been deleted, or it hasn't reached the award yet." /></CardContent></Card>
      </div>
    )
  }
  const plan = planOf(sol)
  const of = <T extends { SolicitationId: string }>(rows: T[]) => rows.filter((r) => r.SolicitationId === id)
  const award = of(data.awards)[0]
  const offerors = of(data.offerors).sort((a, b) => a.Name.localeCompare(b.Name))
  const awardee = offerors.find((o) => o.Name === sol.AwardeeName)
  const others = offerors.filter((o) => o !== awardee)
  const letters = of(data.correspondence)
  const protests = of(data.protests)
  const audit = of(data.audit).sort((a, b) => a.OccurredAt.localeCompare(b.OccurredAt))
  const decision = of(data.decisions).find((d) => d.Kind === 'Award')
  const index = awardStageIndex(award, t.id)
  const stages = AWARD_STAGES[t.id]
  const notified = others.filter((o) => letters.some((c) => c.OfferorId === o.OfferorId && /Notice/.test(c.Kind) && c.Status === 'Delivered')).length
  const record = appUrl('source-selection', `/s/${encodeURIComponent(id)}`)

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild><Link to="/awards"><ArrowLeft className="mr-1 h-4 w-4" />Awards</Link></Button>
      <section className="ss-hero ss-in rounded-2xl p-6">
        <div className="relative z-10 space-y-5">
          <div className="flex flex-wrap items-start gap-4">
            <AgencyMark agency={plan.agency} size={52} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 text-2xl font-semibold tracking-tight md:truncate md:text-3xl">{plan.title}</h1>
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium ring-1 ring-white/30">
                  {index < 0 ? 'Award phase not started' : index >= stages.length ? 'Closed' : stages[index]}
                </span>
              </div>
              <p className="text-sm text-white/80"><span className="font-mono text-xs">{id}</span> · {plan.agency} · {plan.contractType}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {index < 0 && persona.id === 'co' && (
                <Button size="sm" disabled={!canBegin || !!starting} onClick={() => begin(id)} className="bg-white text-[var(--ss-brand-1)] hover:bg-white/90"
                  title={canBegin ? `Start the Award process for ${id}` : 'Not available in the preview'}>
                  {starting === id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}Begin award
                </Button>
              )}
              <Button size="sm" variant="ghost" asChild className="text-white ring-1 ring-white/40 hover:bg-white/15 hover:text-white">
                <a href={record}><ArrowUpRight className="mr-1.5 h-4 w-4" />Evaluation record</a>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <HeroTile label={t.sled ? 'Recommended' : 'Awardee'} value={<span className="block truncate text-lg">{sol.AwardeeName ?? '—'}</span>} sub={`${t.sled ? 'Recommended' : 'Decision signed'} ${day(decision?.DecidedAt ?? sol.AwardedAt)}`} />
            <HeroTile label="Award value" value={moneyShort(award?.ContractValue ?? awardee?.TotalEvaluatedPrice)} sub={award?.ContractNumber ? `Contract ${award.ContractNumber}` : 'Total evaluated price'} />
            <HeroTile label={`${t.Offerors} notified`} value={`${notified} of ${others.length}`} sub={notified ? 'Notices delivered' : 'No notices yet'} />
            <HeroTile label="Protests" value={protests.length} sub={protests.length ? protests.map((p) => p.Forum ?? 'Filed').join(', ') : 'None filed'} />
          </div>
          <div className="rounded-xl bg-black/10 px-3 pb-2 pt-3"><AwardTracker index={index} onDark /></div>
        </div>
      </section>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-1 overflow-x-auto px-1"><TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="correspondence">Correspondence ({letters.length})</TabsTrigger>
          <TabsTrigger value="protest">Protest ({protests.length})</TabsTrigger>
          <TabsTrigger value="audit">Audit trail</TabsTrigger>
        </TabsList></div>

        <TabsContent value="overview" className="mt-4 space-y-6">
          <Section title={t.Offerors} description={t.sled ? 'The recommended proposer and everyone the notice of intent goes to.' : 'The awardee and each unsuccessful offeror owed a notice.'}>
            <Card><CardContent className="divide-y divide-border p-0">
              {[...(awardee ? [awardee] : []), ...others].map((o, i) => {
                const notice = letters.find((c) => c.OfferorId === o.OfferorId && /Notice/.test(c.Kind))
                return (
                  <div key={o.OfferorId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <OfferorAvatar name={o.Name} index={i} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-medium">{o.Name}{o === awardee && <Trophy className="h-4 w-4 text-[var(--ss-gold)]" aria-label="Awardee" />}</span>
                      <span className="block text-xs text-muted-foreground">Total evaluated {t.sled ? 'cost' : 'price'} {money(o.TotalEvaluatedPrice)}</span>
                    </span>
                    <Pill icon={<Mail className="h-3.5 w-3.5" />}>{notice ? `${notice.Kind.replace(/([a-z])([A-Z])/g, '$1 $2')}: ${notice.Status}` : o === awardee ? 'Award notice not sent' : 'Notice not sent'}</Pill>
                  </div>
                )
              })}
            </CardContent></Card>
          </Section>
          <Section title="Key dates" description="Every deadline in the Award phase runs from these.">
            <Card><CardContent className="grid gap-4 p-4 sm:grid-cols-3">
              <div><p className="text-xs text-muted-foreground">{t.sled ? 'Recommendation signed' : 'Award decision signed'}</p><p className="font-medium">{when(decision?.DecidedAt)}</p><p className="text-xs text-muted-foreground">{decision?.DecidedBy ? actorName(decision.DecidedBy) : ''}</p></div>
              <div><p className="text-xs text-muted-foreground">Award record filed</p><p className="font-medium">{when(sol.AwardedAt)}</p></div>
              <div><p className="text-xs text-muted-foreground">Award phase started</p><p className="font-medium">{award?.StartedAt ? when(award.StartedAt) : 'Not started'}</p></div>
            </CardContent></Card>
          </Section>
        </TabsContent>

        <TabsContent value="correspondence" className="mt-4">
          {letters.length ? (
            <Card><CardContent className="divide-y divide-border p-0">
              {letters.sort((a, b) => (a.DeliveredAt ?? a.ReceivedAt ?? '').localeCompare(b.DeliveredAt ?? b.ReceivedAt ?? '')).map((c) => (
                <div key={c.CorrespondenceId} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="font-medium">{c.Kind.replace(/([a-z])([A-Z])/g, '$1 $2')}</span>
                  <span className="text-muted-foreground">{offerors.find((o) => o.OfferorId === c.OfferorId)?.Name}</span>
                  <Pill>{c.Status}</Pill>
                  <span className="ml-auto text-xs text-muted-foreground">{when(c.DeliveredAt ?? c.ReceivedAt)}</span>
                </div>
              ))}
            </CardContent></Card>
          ) : (
            <Card><CardContent className="p-8"><EmptyState icon={<Mail className="h-6 w-6" />} title="No correspondence yet"
              description={t.sled ? 'The notice of intent to award is drafted for every proposer from the record.' : 'Notices are drafted for every offeror once the contract is awarded, and debriefings when an offeror asks for one.'} /></CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="protest" className="mt-4">
          <Card><CardContent className="p-8"><EmptyState icon={<ShieldCheck className="h-6 w-6" />} title={protests.length ? `${protests.length} protest${protests.length > 1 ? 's' : ''} filed` : 'No protest filed'}
            description="If an offeror protests, each ground is mapped to the evaluation record and the agency report is assembled from it." /></CardContent></Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <p className="mb-3 text-sm text-muted-foreground">The whole record, from proposal intake in {t.sled ? 'RFP Evaluation' : 'Source Selection'} to the last step here.</p>
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
