import type { ReactNode } from 'react'
import { useScopedData } from '../hooks/useFramework'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ClipboardCheck, FileSearch, Gavel, Inbox, Scale, Sparkles, UserPen, Users } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { ActivityFeed } from '../components/ActivityFeed'
import { EvaluationCard } from '../components/EvaluationCard'
import { HeroTile, PersonaAvatar } from '../components/Flair'
import { CountUp } from '../components/ProductOrbit'
import { RobotReader } from '../components/RobotReader'
import { usePersona } from '../hooks/usePersona'
import { planOf } from '../lib/data'
import { OpenTaskButton, TaskContextLine, stillOpen } from '../components/TaskDialog'
import { cell, forSolicitation, rated } from '../lib/eval'
import { greeting, inEvaluation, isClosed, myFactors, ownerOf, tasksFor, waitingOn } from '../lib/roles'
import { useStartCase } from '../lib/useStartCase'
import { AdminHome } from './AdminHome'
import type { Dataset, Persona, Solicitation } from '../lib/types'
import { taskTitle, useTerms } from '@forms/lib/terms'
import type { Terms } from '@forms/lib/terms'

const to = (s: Solicitation) => `/s/${encodeURIComponent(s.SolicitationId)}`

/** Top-level section header shared by every home-page section. */
function SectionHeader({ title, description, to: href, link }: { title: string; description: string; to: string; link: string }) {
  return (
    <div className="flex items-end justify-between gap-2">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Link to={href} className="shrink-0 text-sm text-muted-foreground hover:text-primary">{link} →</Link>
    </div>
  )
}



/** Open solicitations this persona takes part in: evaluators only where they sit on the panel. Finished ones live under Evaluations. */
function involved(data: Dataset, p: Persona) {
  return data.solicitations
    .filter((s) => myFactors(planOf(s), p).length > 0 && !isClosed(s))
    .filter((s) => p.id === 'co' || s.Status !== 'Proposals Received')
    .sort((a, b) => Number(waitingOn(b, p)) - Number(waitingOn(a, p)) || (b.StartedAt ?? '').localeCompare(a.StartedAt ?? ''))
}

// ── Role stats for the hero tiles ───────────────────────────────────────────

function evaluatorStats(data: Dataset, p: Persona, sols: Solicitation[]) {
  const rows = sols.flatMap((s) => {
    const plan = planOf(s)
    const d = forSolicitation(data, s.SolicitationId)
    return rated(plan).filter((f) => myFactors(plan, p).includes(f.id)).map((f) => {
      const mine = d.ratings.filter((r) => r.Level === 'Individual' && r.EvaluatorSlot === p.slot && r.FactorId === f.id)
      const reviewed = d.findings.filter((x) => x.Origin === 'Evaluator' && x.EvaluatorSlot === p.slot && x.FactorId === f.id)
      const drafts = d.findings.filter((x) => x.Origin === 'Agent' && x.FactorId === f.id)
      return { s, plan, f, rated: mine.length, offerors: d.offerors.length, reviewed: reviewed.length, edited: reviewed.filter((x) => x.Status === 'Edited').length, drafts: drafts.length }
    })
  })
  const sum = (k: 'rated' | 'offerors' | 'reviewed' | 'edited' | 'drafts') => rows.reduce((n, r) => n + r[k], 0)
  return { rows, rated: sum('rated'), cells: sum('offerors'), reviewed: sum('reviewed'), edited: sum('edited'), drafts: sum('drafts') }
}


function chairStats(data: Dataset, sols: Solicitation[]) {
  const cells = sols.flatMap((s) => {
    const plan = planOf(s)
    const d = forSolicitation(data, s.SolicitationId)
    return rated(plan).flatMap((f) => d.offerors.map((o) => ({ s, plan, f, o, c: cell(plan, f, d.ratings, o.OfferorId) })))
  }).filter((x) => x.c.individual.length)
  return { cells, set: cells.filter((x) => x.c.consensus).length, split: cells.filter((x) => x.c.spread >= 1) }
}




// ── Page ────────────────────────────────────────────────────────────────────

function tiles(data: Dataset, p: Persona, sols: Solicitation[], waiting: number, t: Terms): { icon: ReactNode; label: string; value: number; suffix?: string; sub: string }[] {
  const active = sols.filter(inEvaluation)
  if (p.slot != null) {
    const e = evaluatorStats(data, p, active)
    return [
      { icon: <FileSearch className="h-3.5 w-3.5" />, label: t.sled ? 'My committees' : 'My panels', value: active.length, sub: `${e.rows.length} ${t.factor} assignments` },
      { icon: <ClipboardCheck className="h-3.5 w-3.5" />, label: t.Ratings, value: e.rated, sub: `of ${e.cells} submitted` },
      { icon: <Sparkles className="h-3.5 w-3.5" />, label: 'Drafts reviewed', value: e.reviewed, sub: `${e.drafts} agent drafts` },
      { icon: <UserPen className="h-3.5 w-3.5" />, label: 'My edits', value: e.reviewed ? Math.round((e.edited / e.reviewed) * 100) : 0, suffix: '%', sub: 'of drafts changed' },
    ]
  }
  if (p.id === 'chair') {
    const c = chairStats(data, active)
    return [
      { icon: <FileSearch className="h-3.5 w-3.5" />, label: t.sled ? 'Committees' : 'Boards', value: active.length, sub: t.sled ? 'committees you chair' : 'SSEBs you chair' },
      { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Reconciled', value: c.set, sub: `of ${c.cells.length} ${t.ratings}` },
      { icon: <Users className="h-3.5 w-3.5" />, label: 'Splits', value: c.split.length, sub: 'evaluators differed' },
      { icon: <Scale className="h-3.5 w-3.5" />, label: 'Disagreements', value: c.split.filter((x) => x.c.spread >= 2).length, sub: 'two or more levels apart' },
    ]
  }
  const offerors = data.offerors.filter((o) => sols.some((s) => s.SolicitationId === o.SolicitationId))
  if (p.id === 'co') {
    return [
      { icon: <FileSearch className="h-3.5 w-3.5" />, label: t.sled ? 'RFPs' : 'Solicitations', value: sols.length, sub: `${active.length} in evaluation` },
      { icon: <Users className="h-3.5 w-3.5" />, label: t.Offerors, value: offerors.length, sub: 'proposals received' },
      { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: t.sled ? 'Responsive' : 'Compliant', value: offerors.filter((o) => o.ComplianceStatus === 'Compliant').length, sub: t.sled ? 'registered and not debarred' : 'passed SAM and FAPIIS' },
      { icon: <Inbox className="h-3.5 w-3.5" />, label: 'Waiting on you', value: waiting, sub: 'actions to take' },
    ]
  }
  const signed = data.decisions.filter((d) => d.Kind === 'Award').length
  return [
    { icon: <FileSearch className="h-3.5 w-3.5" />, label: 'In evaluation', value: active.length, sub: 'reporting to you' },
    { icon: <Gavel className="h-3.5 w-3.5" />, label: t.sled ? 'Ready to recommend' : 'Ready to decide', value: active.filter((s) => s.Stage === 'Award Decision').length, sub: t.sled ? 'recommendations awaiting signature' : 'SSDDs awaiting signature' },
    { icon: <Users className="h-3.5 w-3.5" />, label: t.Offerors, value: offerors.length, sub: 'in the competition' },
    { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: t.sled ? 'Recommendations signed' : 'Decisions signed', value: signed, sub: t.sled ? 'sent to the Board' : 'awards made' },
  ]
}

/** Personal home: what the signed-in official owns, what's waiting on them, and how their work is going. */
export function Workspace() {
  const { persona } = usePersona()
  // The System Admin runs the workspace rather than an evaluation: their home is the administration view.
  return persona.id === 'admin' ? <AdminHome /> : <OfficialWorkspace />
}

function OfficialWorkspace() {
  const { data, tasks } = useScopedData()
  const { persona } = usePersona()
  const { starting, start } = useStartCase()
  const terms = useTerms()
  if (!data) return null

  const sols = involved(data, persona)
  const finished = data.solicitations.some((s) => isClosed(s) && myFactors(planOf(s), persona).length > 0)
  const open = tasksFor(tasks, persona).filter((t) => stillOpen(t, data.solicitations))
  // A running process puts real tasks in Action Center, so only those count. The stage alone stands in where no task
  // can exist yet: an evaluation waiting to be started, or a seeded one with no Maestro run behind it.
  const waiting = sols.filter((s) => waitingOn(s, persona) && (s.Status === 'Proposals Received' || !s.CaseInstanceId)
    && !open.some((t) => (t.data as Record<string, unknown> | null)?.solicitationId === s.SolicitationId))
  const nWaiting = open.length + waiting.length

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
            <p className="ss-rise max-w-xl text-lg text-white/90" style={{ ['--d' as string]: '0.15s' }}>
              {nWaiting
                ? <><span className="font-semibold text-white">{nWaiting} item{nWaiting > 1 ? 's' : ''}</span> waiting on you across {sols.length} evaluation{sols.length === 1 ? '' : 's'}.</>
                : <>You're caught up. {sols.length ? `${sols.length} evaluation${sols.length > 1 ? 's' : ''} in progress around you.` : ''}</>}
            </p>
            <div className="ss-rise grid grid-cols-2 gap-3 pt-1 xl:grid-cols-4" style={{ ['--d' as string]: '0.3s' }}>
              {tiles(data, persona, sols, nWaiting, terms).map((t) => (
                <HeroTile key={t.label} icon={t.icon} label={t.label} value={<CountUp value={t.value} suffix={t.suffix} />} sub={t.sub} />
              ))}
            </div>
          </div>
          {/* Below the text on tablets; beside it from xl. In between the side-by-side hero is too narrow for it. */}
          <div className="ss-rise hidden md:block lg:hidden xl:block" style={{ ['--d' as string]: '0.2s' }}><RobotReader /></div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <div className="space-y-3">
            <SectionHeader title="My evaluations" to="/evaluations" link="All evaluations"
              description={terms.sled
                ? (persona.slot != null ? 'RFP evaluations where you sit on the evaluation committee' : `RFP evaluations you oversee as ${persona.label}`)
                : persona.slot != null ? 'Source selections where you sit on the SSEB' : `Source selections you oversee as ${persona.label}`} />
            {sols.map((s, n) => <EvaluationCard key={s.SolicitationId} s={s} n={n} starting={starting} onStart={start} />)}
            {!sols.length && (
              <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                {finished ? <>No evaluations in progress. Finished ones are under <Link to="/evaluations" className="font-medium text-foreground underline underline-offset-2">Evaluations</Link>.</> : "You're not assigned to any evaluation yet."}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <SectionHeader title="My tasks" to="/tasks" link="All tasks" description="Waiting on you across your evaluations" />
            <ul className="space-y-2">
              {open.slice(0, 5).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{taskTitle(t.title, terms.id)}</span>
                    <TaskContextLine task={t} />
                  </span>
                  <OpenTaskButton task={t} size="sm" />
                </li>
              ))}
              {waiting.map((s) => {
                const notStarted = s.Status === 'Proposals Received'
                return (
                  <li key={s.SolicitationId} className="relative flex flex-wrap items-center gap-3 overflow-hidden rounded-2xl border border-primary/40 bg-card p-4 pl-5"><span className="ss-accent absolute inset-y-0 left-0 w-1" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{ownerOf(s)?.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{s.Title} · {s.SolicitationId}</span>
                    </span>
                    {notStarted && persona.id === 'co'
                      ? <Button size="sm" onClick={() => start(s.SolicitationId)} disabled={!!starting}>{starting === s.SolicitationId ? 'Starting…' : 'Start'}</Button>
                      : <Button size="sm" asChild><Link to={to(s)} state={{ from: '/' }}>Open<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button>}
                  </li>
                )
              })}
              {!nWaiting && <li className="flex items-center gap-2 rounded-2xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-[var(--ss-good)]" />Nothing waiting on you. New work appears here when the case reaches your step.</li>}
            </ul>
          </div>
        </div>
        <aside className="xl:sticky xl:top-6 xl:self-start"><ActivityFeed /></aside>
      </div>
    </div>
  )
}
