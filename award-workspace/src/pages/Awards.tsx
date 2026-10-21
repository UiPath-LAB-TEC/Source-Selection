import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Building2, CircleCheck, Clock, Gavel, Loader2, Play, Trophy } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Card, CardContent } from '@uipath/apollo-wind/components/ui/card'
import { EmptyState } from '@uipath/apollo-wind/components/ui/empty-state'
import { useTerms } from '@forms/lib/terms'
import { AgencyMark, PersonaAvatar } from '@ss/components/Flair'
import { Pill, Section } from '@ss/components/Bits'
import { appUrl } from '@ss/lib/apps'
import { day, moneyShort } from '@ss/lib/eval'
import type { Solicitation } from '@ss/lib/types'
import { AwardTracker } from '../components/AwardTracker'
import { AWARD_NEXT, AWARD_PERSONAS, AWARD_STAGES, atAwardDecision, awardStageIndex, isAwarded } from '../lib/award'
import type { AwardRow } from '../lib/award'
import { useAwardData, useScopedAwardData } from '../lib/data'
import { awardTitled, useAwardPersona } from '../hooks/usePersona'
import { useBeginAward, useCanBeginAward } from '../lib/start'

type Show = 'open' | 'done'

const to = (s: Solicitation) => `/a/${encodeURIComponent(s.SolicitationId)}`

/**
 * One awarded evaluation, laid out like Source Selection's evaluation card so both apps read as one system: identity,
 * awardee and value, the award team, the Award-step tracker, and whose move it is (or that it closed).
 */
export function AwardCard({ s, award, n = 0 }: { s: Solicitation; award?: AwardRow; n?: number }) {
  const t = useTerms()
  const { data } = useAwardData()
  const { persona } = useAwardPersona()
  const { starting, begin } = useBeginAward()
  const canBegin = useCanBeginAward()
  const index = awardStageIndex(award, t.id)
  const stages = AWARD_STAGES[t.id]
  const closed = index >= stages.length
  const next = AWARD_NEXT[t.id][index + 1]
  const yours = !!next?.who.includes(persona.id)
  const value = award?.ContractValue ?? data?.offerors.find((o) => o.SolicitationId === s.SolicitationId && o.Name === s.AwardeeName)?.TotalEvaluatedPrice
  const team = AWARD_PERSONAS.map((p) => awardTitled(p, t.id))
  const left = stages.length - 1 - Math.max(0, index)
  return (
    <article style={{ animationDelay: `${80 + n * 70}ms` }}
      className="ss-in ss-lift relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <span className="ss-accent absolute inset-y-0 left-0 w-1" />
      <div className="flex flex-1 flex-col gap-5 p-5 pl-6">
        <div className="flex flex-wrap items-start gap-4">
          <AgencyMark agency={s.Agency} />
          {/* At least 16rem for the details, so on a phone the actions drop to their own line instead of squeezing them. */}
          <div className="min-w-0 flex-1 basis-64 space-y-1">
            {/* The title wraps to a second line rather than being cut short. */}
            <div className="flex min-w-0 items-start gap-2">
              <Link to={to(s)} title={s.Title} className="line-clamp-2 min-w-0 flex-1 text-lg font-semibold leading-snug hover:underline">{s.Title}</Link>
              <span className="mt-0.5 shrink-0"><Pill>{index < 0 ? 'Not started' : closed ? 'Closed' : stages[index]}</Pill></span>
            </div>
            <div className="flex min-w-0 items-center gap-x-4 text-sm text-muted-foreground">
              <span className="shrink-0 font-mono text-xs">{s.SolicitationId}</span>
              <span className="flex min-w-0 items-center gap-1" title={s.Agency}><Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{s.Agency}</span></span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1"><Trophy className="h-3.5 w-3.5 shrink-0 text-[var(--ss-gold)]" /><span className="truncate"><span className="font-medium text-foreground">{s.AwardeeName ?? 'Awardee not recorded'}</span> · {moneyShort(value)}</span></span>
              <span className="flex shrink-0 items-center gap-1"><Clock className="h-3.5 w-3.5" />{t.sled ? 'Recommended' : 'Awarded'} {day(s.AwardedAt)}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            {/* Only where the row has room: the title must never be cut short to fit the faces. */}
            <span className="hidden items-center gap-2 2xl:flex" aria-label={`Award team: ${team.map((p) => p.name).join(', ')}`}>
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Award team</span>
              <span className="flex -space-x-2 [&>*:hover]:z-10 [&>*]:relative">
                {team.map((p) => <PersonaAvatar key={p.id} id={p.id} short={p.short} size={30} title={`${p.name} · ${p.label}`} />)}
              </span>
            </span>
            {index < 0 && persona.id === 'co'
              ? <Button onClick={() => begin(s.SolicitationId)} disabled={!canBegin || !!starting} title={canBegin ? undefined : 'Not available in the preview'}>
                  {starting === s.SolicitationId ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}Begin award
                </Button>
              : <Button asChild><Link to={to(s)}>Open<ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>}
          </div>
        </div>
        <div className="pt-5"><AwardTracker index={index} /></div>
        {closed ? (
          <div className="mt-auto flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            <CircleCheck className="h-4 w-4 shrink-0 text-[var(--ss-good)]" />
            <span className="min-w-0 truncate"><span className="font-medium text-foreground">Closed</span>{award?.ContractNumber ? <> · contract {award.ContractNumber}</> : null}</span>
            {award?.ClosedAt && <span className="ml-auto shrink-0 text-xs">{day(award.ClosedAt)}</span>}
          </div>
        ) : (
          <div className={`mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${yours ? 'bg-primary/10 text-foreground' : 'bg-muted/50 text-muted-foreground'}`}>
            <ArrowRight className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate"><span className="font-medium">Next:</span> {next?.label ?? 'No action pending'}{yours && <span className="font-semibold"> — that’s you</span>}</span>
            <span className="ml-auto shrink-0 text-xs">{left + (index < 0 ? 1 : 0)} step{left + (index < 0 ? 1 : 0) === 1 ? '' : 's'} left</span>
          </div>
        )}
      </div>
    </article>
  )
}

/** Home: every awarded evaluation with where its Award phase stands, and the ones about to arrive from Source Selection. */
export function Awards() {
  const { data } = useScopedAwardData()
  const t = useTerms()
  const [show, setShow] = useState<Show>('open')
  if (!data) return null
  const awardOf = (s: Solicitation) => data.awards.find((a) => a.SolicitationId === s.SolicitationId)
  const awarded = data.solicitations.filter(isAwarded).sort((a, b) => (b.AwardedAt ?? '').localeCompare(a.AwardedAt ?? ''))
  const closed = (s: Solicitation) => awardStageIndex(awardOf(s), t.id) >= AWARD_STAGES[t.id].length
  const open = awarded.filter((s) => !closed(s))
  const done = awarded.filter(closed)
  const rows = show === 'open' ? open : done
  const coming = data.solicitations.filter(atAwardDecision)

  const tab = (id: Show, label: string, n: number) => (
    <button type="button" role="tab" aria-selected={show === id} onClick={() => setShow(id)}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${show === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
      {label}<span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{n}</span>
    </button>
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Awards</h1>
        <p className="text-sm text-muted-foreground">
          {t.sled
            ? 'Recommendations of award signed in RFP Evaluation, from the notice of intent to the Board-approved contract.'
            : 'Award decisions signed in Source Selection, from contract award through notices, debriefings and any protest.'}
        </p>
      </div>

      <Section title={t.sled ? 'Recommended awards' : 'Awarded'} description={`Each one picks up from the award record its ${t.process} filed.`}
        actions={<div role="tablist" aria-label="Show awards" className="inline-flex rounded-xl border border-border bg-muted/50 p-1">
          {tab('open', 'In progress', open.length)}{tab('done', 'Completed', done.length)}
        </div>}>
        {rows.length ? (
          <div className="space-y-3">
            {rows.map((s, n) => <AwardCard key={s.SolicitationId} s={s} n={n} award={awardOf(s)} />)}
          </div>
        ) : (
          <Card><CardContent className="p-8">
            <EmptyState icon={<Gavel className="h-6 w-6" />} title={show === 'open' ? 'No awards in progress' : 'No completed awards'}
              description={show === 'open' ? `An evaluation appears here once its ${t.sled ? 'recommendation of award' : 'source selection decision'} is signed.` : 'Closed awards appear here.'} />
          </CardContent></Card>
        )}
      </Section>

      {coming.length > 0 && (
        <Section title={t.sled ? 'At the award recommendation' : 'At the award decision'}
          description={`Still with the ${t.ssa} in ${t.sled ? 'RFP Evaluation' : 'Source Selection'}. Each arrives here once it's signed.`}>
          <Card><CardContent className="divide-y divide-border p-0">
            {coming.map((s) => (
              <a key={s.SolicitationId} href={appUrl('source-selection', `/s/${encodeURIComponent(s.SolicitationId)}`)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <AgencyMark agency={s.Agency} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.Title}</span>
                  <span className="block truncate text-xs text-muted-foreground"><span className="font-mono">{s.SolicitationId}</span> · {s.Agency}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><span className="hidden sm:inline">Open in {t.sled ? 'RFP Evaluation' : 'Source Selection'}</span><ArrowUpRight className="h-3.5 w-3.5" /></span>
              </a>
            ))}
          </CardContent></Card>
        </Section>
      )}
    </div>
  )
}
