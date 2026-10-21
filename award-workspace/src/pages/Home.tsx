import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, CheckCircle2, Gavel, Inbox, Mail, MessagesSquare, Scale, ShieldAlert, Users } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { useTerms } from '@forms/lib/terms'
import type { Terms } from '@forms/lib/terms'
import { AgencyMark, HeroTile, PersonaAvatar } from '@ss/components/Flair'
import { CountUp } from '@ss/components/ProductOrbit'
import { appUrl } from '@ss/lib/apps'
import { when } from '@ss/lib/eval'
import { greeting } from '@ss/lib/roles'
import { actorName } from '@ss/lib/types'
import type { Persona, Solicitation } from '@ss/lib/types'
import { RecordReader } from '../components/RecordReader'
import { useAwardPersona } from '../hooks/usePersona'
import { AWARD_STAGES, atAwardDecision, awardStageIndex, isAwarded } from '../lib/award'
import type { AwardDataset } from '../lib/award'
import { useScopedAwardData } from '../lib/data'
import { AwardCard } from './Awards'
import { myTasks } from './MyTasks'

const to = (s: Solicitation) => `/a/${encodeURIComponent(s.SolicitationId)}`

/** Top-level section header, as on Source Selection's home. */
function SectionHeader({ title, description, link }: { title: string; description: string; link?: { to: string; label: string } }) {
  return (
    <div className="flex items-end justify-between gap-2">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {link && <Link to={link.to} className="shrink-0 text-sm text-muted-foreground hover:text-primary">{link.label} →</Link>}
    </div>
  )
}

/** The Award phase in numbers, from the record: who is still owed a notice, who asked for a debriefing, what's protested. */
function counts(d: AwardDataset, t: Terms) {
  const awarded = d.solicitations.filter(isAwarded)
  const awardOf = (s: Solicitation) => d.awards.find((a) => a.SolicitationId === s.SolicitationId)
  const inProgress = awarded.filter((s) => awardStageIndex(awardOf(s), t.id) < AWARD_STAGES[t.id].length)
  const unsuccessful = d.offerors.filter((o) => awarded.some((s) => s.SolicitationId === o.SolicitationId && s.AwardeeName !== o.Name))
  const delivered = (kind: RegExp) => (o: { OfferorId: string }) => d.correspondence.some((c) => c.OfferorId === o.OfferorId && kind.test(c.Kind) && c.Status === 'Delivered')
  const requested = d.correspondence.filter((c) => c.Kind === 'DebriefRequest')
  return {
    awarded, inProgress, awardOf,
    notStarted: inProgress.filter((s) => !awardOf(s)),
    toNotify: unsuccessful.filter((o) => !delivered(/Notice/)(o)).length,
    debriefsOpen: requested.filter((r) => !delivered(/^Debriefing$/)({ OfferorId: r.OfferorId })).length,
    debriefsDelivered: d.correspondence.filter((c) => c.Kind === 'Debriefing' && c.Status === 'Delivered').length,
    protestsOpen: d.protests.filter((p) => !p.Outcome).length,
    reportsDue: d.protests.filter((p) => !p.Outcome && !p.ReportFiledAt).length,
    signed: d.decisions.filter((x) => x.Kind === 'Award' && awarded.some((s) => s.SolicitationId === x.SolicitationId)).length,
  }
}

function tiles(c: ReturnType<typeof counts>, p: Persona, waiting: number, t: Terms): { icon: ReactNode; label: string; value: number; sub: string }[] {
  const awards = { icon: <Gavel className="h-3.5 w-3.5" />, label: 'Awards', value: c.inProgress.length, sub: c.notStarted.length ? `${c.notStarted.length} not started` : 'all under way' }
  if (p.id === 'counsel') {
    return [
      { icon: <ShieldAlert className="h-3.5 w-3.5" />, label: 'Protests', value: c.protestsOpen, sub: 'open' },
      { icon: <Scale className="h-3.5 w-3.5" />, label: 'Reports due', value: c.reportsDue, sub: 'agency reports to file' },
      { icon: <MessagesSquare className="h-3.5 w-3.5" />, label: t.sled ? 'Notices sent' : 'Debriefings', value: c.debriefsDelivered, sub: 'delivered, on the record' },
      awards,
    ]
  }
  if (p.id === 'ssa') {
    return [
      { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: t.sled ? 'Recommendations' : 'Decisions', value: c.signed, sub: t.sled ? 'you signed for the Board' : 'you signed' },
      awards,
      { icon: <MessagesSquare className="h-3.5 w-3.5" />, label: t.sled ? 'Notices sent' : 'Debriefings', value: c.debriefsDelivered, sub: 'citing your decision' },
      { icon: <ShieldAlert className="h-3.5 w-3.5" />, label: 'Protests', value: c.protestsOpen, sub: 'against your awards' },
    ]
  }
  return [
    awards,
    { icon: <Mail className="h-3.5 w-3.5" />, label: 'To notify', value: c.toNotify, sub: 'owed a notice' },
    { icon: <Users className="h-3.5 w-3.5" />, label: t.sled ? 'Protests' : 'Debriefings', value: t.sled ? c.protestsOpen : c.debriefsOpen, sub: t.sled ? 'in the protest period' : 'requested, open' },
    { icon: <Inbox className="h-3.5 w-3.5" />, label: 'Waiting on you', value: waiting, sub: 'actions to take' },
  ]
}

/** Personal home: the signed-in official's awards, what's waiting on them, and what the record shows so far. */
export function Home() {
  const { data, tasks } = useScopedAwardData()
  const { persona } = useAwardPersona()
  const t = useTerms()
  if (!data) return null
  const c = counts(data, t)
  const open = myTasks(tasks, persona)
  // Begin award is the Contracting Officer's first step on each award; once it runs, the process's tasks take over.
  const toBegin = persona.id === 'co' ? c.notStarted : []
  const waiting = open.length + toBegin.length
  const coming = data.solicitations.filter(atAwardDecision)
  const awardIds = new Set(c.awarded.map((s) => s.SolicitationId))
  // The award's milestones, not every rating along the way: the decision, the filed record, and each Award-phase step.
  const activity = data.audit.filter((e) => awardIds.has(e.SolicitationId) && /Award|Notice|Debrief|Protest|Report|Contract/.test(e.Action)).sort((a, b) => b.OccurredAt.localeCompare(a.OccurredAt)).slice(0, 8)
  const title = (id: string) => data.solicitations.find((s) => s.SolicitationId === id)?.Title ?? id

  const message = persona.id === 'counsel'
    ? (c.protestsOpen ? <><span className="font-semibold text-white">{c.protestsOpen} protest{c.protestsOpen > 1 ? 's' : ''}</span> need{c.protestsOpen > 1 ? '' : 's'} the agency's position.</> : <>No protests filed. A task reaches you the moment one is.</>)
    : waiting
      ? <><span className="font-semibold text-white">{waiting} item{waiting > 1 ? 's' : ''}</span> waiting on you across {c.inProgress.length} award{c.inProgress.length === 1 ? '' : 's'}.</>
      : <>You're caught up. {c.inProgress.length ? `${c.inProgress.length} award${c.inProgress.length > 1 ? 's' : ''} in progress around you.` : ''}</>

  return (
    <div className="space-y-6">
      <section className="ss-hero sheen rounded-2xl px-6 py-5 md:px-8">
        <div className="relative z-10 flex flex-col items-center gap-8 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="ss-rise flex items-center gap-3" style={{ ['--d' as string]: '0.05s' }}>
              <PersonaAvatar id={persona.id} short={persona.short} size={60} />
              <div className="min-w-0">
                <p className="text-sm text-white/80">{greeting()} · My workspace</p>
                <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{persona.name}</h1>
                <p className="truncate text-xs text-white/75">{persona.role}</p>
              </div>
            </div>
            <p className="ss-rise max-w-xl text-lg text-white/90" style={{ ['--d' as string]: '0.15s' }}>{message}</p>
            {/* Four across only on the widest screens: beside the robot, narrower tiles would cut their labels short. */}
            <div className="ss-rise grid grid-cols-2 gap-3 pt-1 2xl:grid-cols-4" style={{ ['--d' as string]: '0.3s' }}>
              {tiles(c, persona, waiting, t).map((x) => <HeroTile key={x.label} icon={x.icon} label={x.label} value={<CountUp value={x.value} />} sub={x.sub} />)}
            </div>
          </div>
          {/* Below the text on tablets; beside it from xl, as on Source Selection's home. */}
          <div className="ss-rise hidden md:block lg:hidden xl:block" style={{ ['--d' as string]: '0.2s' }}><RecordReader /></div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <div className="space-y-3">
            <SectionHeader title="My awards" link={{ to: '/awards', label: 'All awards' }}
              description={persona.id === 'counsel' ? 'Awards you may be asked to defend' : `Awards ${persona.id === 'ssa' ? 'you decided' : 'you manage'}, from contract award to close`} />
            {c.inProgress.length ? (
              <div className="space-y-3">
                {c.inProgress.map((s, n) => <AwardCard key={s.SolicitationId} s={s} n={n} award={c.awardOf(s)} />)}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No awards in progress. An evaluation arrives here once its {t.sled ? 'recommendation of award' : 'source selection decision'} is signed.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <SectionHeader title="My tasks" link={{ to: '/tasks', label: 'All tasks' }} description="Waiting on you across your awards" />
            <ul className="space-y-2">
              {toBegin.map((s) => (
                <li key={s.SolicitationId} className="relative flex flex-wrap items-center gap-3 overflow-hidden rounded-2xl border border-primary/40 bg-card p-4 pl-5"><span className="ss-accent absolute inset-y-0 left-0 w-1" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">Begin the award phase</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.Title} · {s.SolicitationId}</span>
                  </span>
                  <Button size="sm" asChild><Link to={to(s)}>Open<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button>
                </li>
              ))}
              {open.slice(0, 5).map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{x.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">Assigned {when(x.createdTime)}</span>
                  </span>
                  <Button size="sm" asChild><Link to="/tasks">Open<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button>
                </li>
              ))}
              {!waiting && <li className="flex items-center gap-2 rounded-2xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-[var(--ss-good)]" />Nothing waiting on you. New work appears here when an award reaches your step.</li>}
            </ul>
          </div>

          {coming.length > 0 && (
            <div className="space-y-3">
              <SectionHeader title={t.sled ? 'At the award recommendation' : 'At the award decision'}
                description={`Still with the ${t.ssa} in ${t.sled ? 'RFP Evaluation' : 'Source Selection'}. Each arrives here once it's signed.`} />
              <ul className="space-y-2">
                {coming.map((s) => (
                  <li key={s.SolicitationId}>
                    <a href={appUrl('source-selection', `/s/${encodeURIComponent(s.SolicitationId)}`)} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-muted/50">
                      <AgencyMark agency={s.Agency} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.Title}</span>
                        <span className="block truncate text-xs text-muted-foreground"><span className="font-mono">{s.SolicitationId}</span> · {s.Agency}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><span className="hidden sm:inline">Open in {t.sled ? 'RFP Evaluation' : 'Source Selection'}</span><ArrowUpRight className="h-3.5 w-3.5" /></span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="space-y-3 xl:sticky xl:top-6 xl:self-start">
          <SectionHeader title="Live activity" description="The latest on your awards' record" />
          <ol className="space-y-3 rounded-2xl border border-border bg-card p-4">
            {activity.map((e) => (
              <li key={e.EventId} className="text-sm">
                <p className="font-medium">{e.Action.replace(/([a-z])([A-Z])/g, '$1 $2')}</p>
                <p className="truncate text-xs text-muted-foreground">{actorName(e.Actor)} · {when(e.OccurredAt)}</p>
                <p className="truncate text-xs text-muted-foreground">{title(e.SolicitationId)}</p>
              </li>
            ))}
            {!activity.length && <li className="text-sm text-muted-foreground">Nothing yet. Steps on your awards show here as they happen.</li>}
          </ol>
        </aside>
      </div>
    </div>
  )
}
