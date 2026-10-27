import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, FileClock, FileStack, Gavel, Inbox, Landmark, ListChecks, MessagesSquare, Receipt, Scale, ShieldAlert, Wallet } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { useTerms } from '@forms/lib/terms'
import type { Terms } from '@forms/lib/terms'
import { HeroTile, PersonaAvatar } from '@ss/components/Flair'
import { CountUp } from '@ss/components/ProductOrbit'
import { when } from '@ss/lib/eval'
import { greeting } from '@ss/lib/roles'
import { actorName } from '@ss/lib/types'
import type { Persona, Solicitation } from '@ss/lib/types'
import { ActionGroups } from '../components/ActionItems'
import { ContractCard } from '../components/ContractCard'
import { RecordReader } from '../components/RecordReader'
import { useAwardPersona } from '../hooks/usePersona'
import { fundsOf } from '../lib/award'
import type { AwardDataset } from '../lib/award'
import { useScopedAwardData } from '../lib/data'
import { actionsFor } from '../lib/alerts'
import { fmtDay, shortMoney } from '../lib/status'
import { AwardCard, AwaitingList, awardsOf } from './Awards'
import { contractsOf } from './Contracts'
import { myTasks } from './MyTasks'
import { OpenAwardTask, taskSolicitationId } from '../components/AwardTask'

const to = (s: Solicitation) => `/a/${encodeURIComponent(s.SolicitationId)}`

/**
 * What the live activity panel shows: the record's milestones (decision, contract signed, notices out, options
 * exercised, administration opened). Not the daily watch runs or anyone picking up an action item; those would bury
 * the milestones within a week.
 */
const MILESTONE = /Award|Notice|Debrief|Protest|Report|Contract|Administration|Option/
const NOT_A_MILESTONE = /^ContractWatched$|^Alert/

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

/** The record in numbers, from what the robots and people wrote: awards, contracts, action items, money, the award phase. */
function counts(d: AwardDataset, p: Persona) {
  const awards = awardsOf(d)
  const contracts = contractsOf(d)
  const actions = actionsFor(d, p)
  const activeIds = new Set(contracts.active.map((s) => s.SolicitationId))
  const lines = d.awards.filter((a) => activeIds.has(a.SolicitationId)).flatMap((a) => fundsOf(a)?.lines ?? [])
  const soonest = d.awards.filter((a) => activeIds.has(a.SolicitationId) && a.CurrentPeriod).map((a) => d.schedule.find((r) => r.SolicitationId === a.SolicitationId && r.Name === a.CurrentPeriod)?.EndDay ?? '').filter(Boolean).sort()[0]
  return {
    awards, contracts, actions, soonest,
    notStarted: awards.inProgress.filter((s) => !d.awards.some((a) => a.SolicitationId === s.SolicitationId)),
    shortfall: lines.filter((l) => l.runOut && l.runOut < l.periodEnd).reduce((s, l) => s + Math.max(0, l.atPeriodEnd - l.obligated), 0),
    obligated: lines.reduce((s, l) => s + l.obligated, 0),
    invoicesWaiting: new Set(d.funding.filter((f) => f.Kind === 'Invoice' && f.Status === 'Received' && activeIds.has(f.SolicitationId)).map((f) => f.Reference)).size,
    deliverablesDue: d.schedule.filter((r) => activeIds.has(r.SolicitationId) && r.Kind === 'Deliverable' && r.Status === 'Due' && !!r.DueDay && !r.ReceivedDay
      && r.DueDay <= new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)).length,
    debriefsOpen: d.correspondence.filter((c) => c.Kind === 'DebriefRequest').filter((r) => !d.correspondence.some((c) => c.OfferorId === r.OfferorId && c.Kind === 'Debriefing' && c.Status === 'Delivered')).length,
    debriefsDelivered: d.correspondence.filter((c) => c.Kind === 'Debriefing' && c.Status === 'Delivered').length,
    protestsOpen: d.protests.filter((x) => !x.Outcome).length,
    reportsDue: d.protests.filter((x) => !x.Outcome && !x.ReportFiledAt).length,
    signed: d.decisions.filter((x) => x.Kind === 'Award').length,
  }
}

type Tile = { icon: ReactNode; label: string; value: number | string; sub: string }

function tiles(c: ReturnType<typeof counts>, p: Persona, waiting: number, t: Terms): Tile[] {
  const needs: Tile = { icon: <ListChecks className="h-3.5 w-3.5" />, label: 'Needs action', value: c.actions.needs.length, sub: `${c.actions.inHand.length} in hand · ${c.actions.coming.length} coming up` }
  const active: Tile = { icon: <FileStack className="h-3.5 w-3.5" />, label: 'Active contracts', value: c.contracts.active.length, sub: c.soonest ? `next period ends ${fmtDay(c.soonest, false)}` : 'none performing' }
  const awards: Tile = { icon: <Gavel className="h-3.5 w-3.5" />, label: 'Awards in progress', value: c.awards.inProgress.length, sub: c.awards.awaiting.length ? `${c.awards.awaiting.length} awaiting decision` : 'none waiting on a decision' }
  if (p.id === 'cor') {
    return [needs,
      { icon: <Receipt className="h-3.5 w-3.5" />, label: 'Invoices', value: c.invoicesWaiting, sub: 'waiting on your approval' },
      { icon: <FileClock className="h-3.5 w-3.5" />, label: 'Deliverables', value: c.deliverablesDue, sub: 'due in 14 days or late' },
      active]
  }
  if (p.id === 'rm') {
    return [{ icon: <Wallet className="h-3.5 w-3.5" />, label: 'Funds short', value: shortMoney(c.shortfall), sub: 'more needed to reach period ends' },
      needs,
      { icon: <Landmark className="h-3.5 w-3.5" />, label: 'Obligated', value: shortMoney(c.obligated), sub: 'this period, across contracts' },
      active]
  }
  if (p.id === 'counsel') {
    return [
      { icon: <ShieldAlert className="h-3.5 w-3.5" />, label: 'Protests', value: c.protestsOpen, sub: 'open' },
      { icon: <Scale className="h-3.5 w-3.5" />, label: 'Reports due', value: c.reportsDue, sub: 'agency reports to file' },
      { icon: <MessagesSquare className="h-3.5 w-3.5" />, label: t.sled ? 'Notices sent' : 'Debriefings', value: c.debriefsDelivered, sub: 'delivered, on the record' },
      awards]
  }
  if (p.id === 'ssa') {
    return [
      { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: t.sled ? 'Recommendations' : 'Decisions', value: c.signed, sub: t.sled ? 'you signed for the Board' : 'you signed' },
      awards, active,
      { icon: <ShieldAlert className="h-3.5 w-3.5" />, label: 'Protests', value: c.protestsOpen, sub: 'against your awards' }]
  }
  return [needs, { icon: <Inbox className="h-3.5 w-3.5" />, label: 'Waiting on you', value: waiting, sub: 'tasks to take' }, active, awards]
}

/**
 * Personal home: what needs the signed-in person's action, then their awards (not yet contracts) and their active
 * contracts as two distinct lists, their tasks, and the record's milestones.
 */
export function Home() {
  const { data, tasks } = useScopedAwardData()
  const { persona } = useAwardPersona()
  const t = useTerms()
  if (!data) return null
  const c = counts(data, persona)
  const open = myTasks(tasks, persona)
  // Begin award is the Contracting Officer's first step on each award; once it runs, the process's tasks take over.
  const toBegin = persona.id === 'co' ? c.notStarted : []
  const waiting = open.length + toBegin.length
  const contractWork = ['co', 'cor', 'rm'].includes(persona.id)
  const awardWork = ['co', 'counsel', 'ssa'].includes(persona.id)
  const ids = new Set([...c.awards.inProgress, ...c.contracts.active, ...c.contracts.closed].map((s) => s.SolicitationId))
  const activity = data.audit.filter((e) => ids.has(e.SolicitationId) && MILESTONE.test(e.Action) && !NOT_A_MILESTONE.test(e.Action))
    .sort((a, b) => b.OccurredAt.localeCompare(a.OccurredAt)).slice(0, 8)
  const title = (id: string) => data.solicitations.find((s) => s.SolicitationId === id)?.Title ?? id
  const awardOf = (s: Solicitation) => data.awards.find((a) => a.SolicitationId === s.SolicitationId)
  const n = c.actions.needs.length
  const count = (k: number, one: string, many: string) => `${k || 'no'} ${k === 1 ? one : many}`
  const summary = `${count(c.contracts.active.length, 'active contract', 'active contracts')}${awardWork ? `, ${count(c.awards.inProgress.length, 'award', 'awards')} in progress` : ''}.`
    .replace(/^no/, 'No')

  const message = persona.id === 'counsel'
    ? (c.protestsOpen ? <><span className="font-semibold text-white">{c.protestsOpen} protest{c.protestsOpen > 1 ? 's' : ''}</span> need{c.protestsOpen > 1 ? '' : 's'} the agency's position.</> : <>No protests filed. A task reaches you the moment one is.</>)
    : <>
        {n ? <><span className="font-semibold text-white">{n} thing{n > 1 ? 's' : ''}</span> need{n > 1 ? '' : 's'} your action</> : <>Nothing needs your action right now</>}
        {waiting ? <>, and <span className="font-semibold text-white">{waiting} task{waiting > 1 ? 's' : ''}</span> {waiting > 1 ? 'are' : 'is'} waiting</> : null}. {summary}
      </>

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
              {tiles(c, persona, waiting, t).map((x) => <HeroTile key={x.label} icon={x.icon} label={x.label} value={typeof x.value === 'number' ? <CountUp value={x.value} /> : x.value} sub={x.sub} />)}
            </div>
          </div>
          {/* Below the text on tablets; beside it from xl, as on Source Selection's home. */}
          <div className="ss-rise hidden md:block lg:hidden xl:block" style={{ ['--d' as string]: '0.2s' }}><RecordReader /></div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-8">
          {contractWork && (
            <div className="space-y-3">
              <SectionHeader title="Needs action" link={{ to: '/actions', label: 'All action items' }}
                description={persona.id === 'co' ? 'Across your contracts: not picked up yet, and overdue or due within 14 days' : 'Yours: not picked up yet, and overdue or due within 14 days'} />
              <ActionGroups groups={c.actions} showContract empty="Nothing needs your action right now." />
            </div>
          )}

          {(open.length > 0 || toBegin.length > 0) && (
            <div className="space-y-3">
              <SectionHeader title="My tasks" link={{ to: '/tasks', label: 'All tasks' }} description="Waiting on you in Action Center" />
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
                      <span className="block truncate text-xs text-muted-foreground">{taskSolicitationId(x) ? `${title(taskSolicitationId(x)!)} · ` : ''}Assigned {when(x.createdTime)}</span>
                    </span>
                    <OpenAwardTask task={x} size="sm" />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {awardWork && (
            <div className="space-y-3">
              <SectionHeader title="Awards in progress" link={{ to: '/awards', label: 'All awards' }} description="Decisions on their way to a signed contract" />
              {c.awards.inProgress.length > 0 && <div className="space-y-3">{c.awards.inProgress.map((s, i) => <AwardCard key={s.SolicitationId} s={s} n={i} award={awardOf(s)} />)}</div>}
              {c.awards.awaiting.length > 0 && <AwaitingList rows={c.awards.awaiting} />}
              {!c.awards.inProgress.length && !c.awards.awaiting.length && (
                <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No awards in progress. An evaluation arrives here once its {t.sled ? 'recommendation of award' : 'source selection decision'} is signed.</p>
              )}
            </div>
          )}

          <div className="space-y-3">
            <SectionHeader title="Active contracts" link={{ to: '/contracts', label: 'All contracts' }} description="Signed and performing, the ones needing action first" />
            {c.contracts.active.length
              ? <div className="space-y-3">{c.contracts.active.map((s, i) => <ContractCard key={s.SolicitationId} s={s} n={i} award={awardOf(s)} />)}</div>
              : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No active contracts. A contract appears here the day its award is signed.</p>}
          </div>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-6 xl:self-start">
          <SectionHeader title="Milestones" description="The latest on the record" />
          <ol className="space-y-3 rounded-2xl border border-border bg-card p-4">
            {activity.map((e) => (
              <li key={e.EventId} className="text-sm">
                <p className="font-medium">{e.Action.replace(/([a-z])([A-Z])/g, '$1 $2')}</p>
                <p className="truncate text-xs text-muted-foreground">{actorName(e.Actor)} · {when(e.OccurredAt)}</p>
                <p className="truncate text-xs text-muted-foreground">{title(e.SolicitationId)}</p>
              </li>
            ))}
            {!activity.length && <li className="text-sm text-muted-foreground">Nothing yet. Milestones on your contracts show here as they happen.</li>}
          </ol>
        </aside>
      </div>
    </div>
  )
}
