import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Building2, CircleCheck, Clock, Gavel, Loader2, Play, Trophy } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Card, CardContent } from '@uipath/apollo-wind/components/ui/card'
import { useTerms } from '@forms/lib/terms'
import { AgencyMark, PersonaAvatar } from '@ss/components/Flair'
import { Section } from '@ss/components/Bits'
import { appUrl } from '@ss/lib/apps'
import { day, moneyShort } from '@ss/lib/eval'
import type { Solicitation } from '@ss/lib/types'
import { AwardTracker } from '../components/AwardTracker'
import { CompactRow } from '../components/ContractCard'
import { AWARD_NEXT, AWARD_PERSONAS, AWARD_STAGES, awardStageIndex } from '../lib/award'
import type { AwardDataset, AwardRow } from '../lib/award'
import { useAwardData, useScopedAwardData } from '../lib/data'
import { awardTitled, useAwardPersona } from '../hooks/usePersona'
import { useBeginAward, useCanBeginAward } from '../lib/start'
import { STATUS_LABEL, fmtDay, signedOn, statusOf } from '../lib/status'

const to = (s: Solicitation) => `/a/${encodeURIComponent(s.SolicitationId)}`

/** "Ready to award" or "Award in progress", with a gavel: an award's status, never worn by a contract. */
export function AwardChip({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-[var(--ss-brand-2)] px-2.5 py-0.5 text-xs font-medium text-[var(--ss-brand-2)]">
      <Gavel className="h-3.5 w-3.5" aria-hidden />{label}
    </span>
  )
}

/** The awards in progress here and their split: decision signed in Source Selection, contract not yet signed. */
export function awardsOf(d: AwardDataset) {
  const status = (s: Solicitation) => statusOf(d, s)
  const byDate = (a: Solicitation, b: Solicitation) => (b.AwardedAt ?? '').localeCompare(a.AwardedAt ?? '')
  return {
    inProgress: d.solicitations.filter((s) => status(s) === 'ready' || status(s) === 'awarding').sort(byDate),
    awaiting: d.solicitations.filter((s) => status(s) === 'awaiting'),
    signedRecently: d.solicitations.filter((s) => status(s) === 'active' && d.decisions.some((x) => x.SolicitationId === s.SolicitationId && x.Kind === 'Contract'
      && x.Outcome === 'Awarded' && Date.now() - Date.parse(x.DecidedAt ?? '') < 60 * 86_400_000)),
  }
}

/**
 * An award that isn't a contract yet, laid out like Source Selection's evaluation card so both apps read as one
 * system: identity, the selected offeror and value, the award team, the award-step tracker, and whose move it is.
 */
export function AwardCard({ s, award, n = 0 }: { s: Solicitation; award?: AwardRow; n?: number }) {
  const t = useTerms()
  const { data } = useAwardData()
  const { persona } = useAwardPersona()
  const { starting, begin } = useBeginAward()
  const canBegin = useCanBeginAward()
  const index = awardStageIndex(award, t.id)
  const stages = AWARD_STAGES[t.id]
  const next = AWARD_NEXT[t.id][index + 1]
  const yours = !!next?.who.includes(persona.id)
  const value = award?.ContractValue ?? data?.offerors.find((o) => o.SolicitationId === s.SolicitationId && o.Name === s.AwardeeName)?.TotalEvaluatedPrice
  const team = AWARD_PERSONAS.filter((p) => ['co', 'counsel', 'ssa'].includes(p.id)).map((p) => awardTitled(p, t.id))
  const left = stages.length - 1 - Math.max(0, index)
  const label = index < 0 ? STATUS_LABEL.ready : `${STATUS_LABEL.awarding} · ${stages[index]}`
  return (
    <article style={{ animationDelay: `${80 + n * 70}ms` }}
      className="ss-in ss-lift relative flex h-full flex-col overflow-hidden rounded-2xl border border-dashed border-[var(--ss-brand-2)]/60 bg-card">
      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="flex flex-wrap items-start gap-4">
          <AgencyMark agency={s.Agency} />
          {/* At least 16rem for the details, so on a phone the actions drop to their own line instead of squeezing them. */}
          <div className="min-w-0 flex-1 basis-64 space-y-1">
            <div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:gap-2">
              <Link to={to(s)} title={s.Title} className="line-clamp-2 min-w-0 flex-1 text-lg font-semibold leading-snug hover:underline">{s.Title}</Link>
              <span className="sm:mt-0.5"><AwardChip label={label} /></span>
            </div>
            <div className="flex min-w-0 items-center gap-x-4 text-sm text-muted-foreground">
              <span className="shrink-0 font-mono text-xs">{s.SolicitationId}</span>
              <span className="flex min-w-0 items-center gap-1" title={s.Agency}><Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{s.Agency}</span></span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1"><Trophy className="h-3.5 w-3.5 shrink-0 text-[var(--ss-gold)]" /><span className="truncate"><span className="font-medium text-foreground">{s.AwardeeName ?? 'Awardee not recorded'}</span> · {moneyShort(value)}</span></span>
              <span className="flex shrink-0 items-center gap-1"><Clock className="h-3.5 w-3.5" />{t.sled ? 'Recommended' : 'Decision signed'} {day(s.AwardedAt)}</span>
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
              ? <Button onClick={() => begin(s.SolicitationId)} disabled={!canBegin || t.sled || !!starting}
                  title={t.sled ? 'The district steps (notice of intent, Board approval) come in a later release' : canBegin ? undefined : 'Not available in the preview'}>
                  {starting === s.SolicitationId ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}Begin award
                </Button>
              : <Button asChild><Link to={to(s)}>Open<ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>}
          </div>
        </div>
        <div className="pt-5"><AwardTracker index={index} /></div>
        <div className={`mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${yours ? 'bg-primary/10 text-foreground' : 'bg-muted/50 text-muted-foreground'}`}>
          <ArrowRight className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate"><span className="font-medium">Next:</span> {next?.label ?? 'No action pending'}{yours && <span className="font-semibold"> — that’s you</span>}</span>
          <span className="ml-auto shrink-0 text-xs">{left + (index < 0 ? 1 : 0)} step{left + (index < 0 ? 1 : 0) === 1 ? '' : 's'} left</span>
        </div>
      </div>
    </article>
  )
}

/** The decisions still with the SSA in Source Selection, one compact row each, linking there. */
export function AwaitingList({ rows }: { rows: Solicitation[] }) {
  const t = useTerms()
  return (
    <Card><CardContent className="divide-y divide-border p-0">
      {rows.map((s) => (
        <CompactRow key={s.SolicitationId} href={appUrl('source-selection', `/s/${encodeURIComponent(s.SolicitationId)}`)} agency={s.Agency} title={s.Title}
          sub={<><span className="font-mono">{s.SolicitationId}</span><span className="truncate">· {s.Agency}</span></>}
          right={<><span className="hidden rounded-full bg-muted px-2 py-0.5 sm:inline">{STATUS_LABEL.awaiting}</span><span className="hidden md:inline">Open in {t.sled ? 'RFP Evaluation' : 'Source Selection'}</span><ArrowUpRight className="h-3.5 w-3.5" /></>} />
      ))}
    </CardContent></Card>
  )
}

/** Awards: what isn't a contract yet. Each moves to Contracts the day its contract award is signed. */
export function Awards() {
  const { data } = useScopedAwardData()
  const t = useTerms()
  if (!data) return null
  const awardOf = (s: Solicitation) => data.awards.find((a) => a.SolicitationId === s.SolicitationId)
  const { inProgress, awaiting, signedRecently } = awardsOf(data)
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Awards</h1>
        <p className="text-sm text-muted-foreground">
          {t.sled ? 'Recommendations of award on their way to a Board-approved contract.' : 'Award decisions on their way to a signed contract.'} Once the contract is signed it moves to Contracts.
        </p>
      </div>

      <Section title={STATUS_LABEL.awarding} description={`Decision signed in ${t.sled ? 'RFP Evaluation' : 'Source Selection'}; the contract isn't signed yet.`}>
        {inProgress.length ? (
          <div className="space-y-3">{inProgress.map((s, n) => <AwardCard key={s.SolicitationId} s={s} n={n} award={awardOf(s)} />)}</div>
        ) : (
          <p className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <Gavel className="h-4 w-4 shrink-0" />No awards in progress. An evaluation arrives here once its {t.sled ? 'recommendation of award' : 'source selection decision'} is signed.
          </p>
        )}
      </Section>

      {awaiting.length > 0 && (
        <Section title={STATUS_LABEL.awaiting} description={`Still with the ${t.ssa} in ${t.sled ? 'RFP Evaluation' : 'Source Selection'}. Each arrives here once it's signed.`}>
          <AwaitingList rows={awaiting} />
        </Section>
      )}

      {signedRecently.length > 0 && (
        <Section title="Signed recently" description="Awarded here in the last 60 days. Each is now an active contract.">
          <Card><CardContent className="divide-y divide-border p-0">
            {signedRecently.map((s) => {
              const a = awardOf(s)
              return (
                <CompactRow key={s.SolicitationId} to={to(s)} agency={s.Agency} title={s.Title}
                  sub={<><span className="font-mono">{a?.ContractNumber ?? s.SolicitationId}</span><span className="truncate">· {s.AwardeeName}</span></>}
                  right={<><CircleCheck className="h-3.5 w-3.5 text-[var(--ss-lvl-0)]" /><span>Signed {fmtDay(signedOn(data, s, a), false)}</span><span className="hidden md:inline">· now a contract</span><ArrowRight className="h-3.5 w-3.5" /></>} />
              )
            })}
          </CardContent></Card>
        </Section>
      )}
    </div>
  )
}
