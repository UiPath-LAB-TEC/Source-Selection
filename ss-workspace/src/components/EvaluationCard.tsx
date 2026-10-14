import { Link } from 'react-router-dom'
import { useBackState } from '../lib/backlink'
import { ArrowRight, Building2, CircleCheck, CircleX, Clock, Play } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Pill } from './Bits'
import { AgencyMark, PersonaAvatar } from './Flair'
import { StageTracker } from './StageTracker'
import { usePersona } from '../hooks/usePersona'
import { planOf, useData } from '../lib/data'
import { day, moneyShort, stageIndex } from '../lib/eval'
import { isClosed, ownerOf } from '../lib/roles'
import { titled, useTerms } from '@forms/lib/terms'
import { PERSONAS, STAGES } from '../lib/types'
import type { Solicitation } from '../lib/types'

/**
 * One source selection: identity, offerors, stage tracker and whose move it is (or how it ended).
 * Every card has the same rows — one-line title, two meta lines, tracker, status bar — and fills its grid cell,
 * so cards side by side or in a list are always the same height.
 */
export function EvaluationCard({ s, n = 0, starting, onStart, footer }: {
  s: Solicitation; n?: number; starting?: string; onStart?: (id: string) => void; footer?: React.ReactNode
}) {
  const backState = useBackState()
  const { data } = useData()
  const { persona } = usePersona()
  const t = useTerms()
  if (!data) return null
  const plan = planOf(s)
  const idx = stageIndex(s)
  const notStarted = s.Status === 'Proposals Received'
  const owner = ownerOf(s)
  const yours = owner?.who.includes(persona.id)
  const ended = isClosed(s)
  const cancelled = ended && s.Status === 'Cancelled'
  const cancelledAt = cancelled ? data.decisions.find((d) => d.SolicitationId === s.SolicitationId && /cancel/i.test(`${d.Kind} ${d.Outcome}`))?.DecidedAt : undefined
  const evaluators = plan.panel.evaluators.filter((e) => e.factors.length)
    .map((e) => PERSONAS.find((p) => p.slot === e.slot)).filter((p) => p != null).map((p) => titled(p, t.id))
  return (
    <article style={{ animationDelay: `${80 + n * 70}ms` }}
      className="ss-in ss-lift relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <span className="ss-accent absolute inset-y-0 left-0 w-1" />
      <div className="flex flex-1 flex-col gap-5 p-5 pl-6">
        <div className="flex flex-wrap items-start gap-4">
          <AgencyMark agency={s.Agency} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <Link to={`/s/${encodeURIComponent(s.SolicitationId)}`} state={backState} title={s.Title} className="min-w-0 truncate text-lg font-semibold hover:underline">{s.Title}</Link>
              <span className="shrink-0"><Pill>{s.Status}</Pill></span>
            </div>
            <div className="flex min-w-0 items-center gap-x-4 text-sm text-muted-foreground">
              <span className="shrink-0 font-mono text-xs">{s.SolicitationId}</span>
              <span className="flex min-w-0 items-center gap-1" title={s.Agency}><Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{s.Agency}</span></span>
            </div>
            <div className="flex items-center gap-x-4 text-sm text-muted-foreground">
              <span>{t.sled ? 'Estimate' : 'IGCE'} {moneyShort(plan.igce.total)}</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{s.StartedAt ? `Started ${day(s.StartedAt)}` : 'Not started'}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            {evaluators.length > 0 && (
              <span className="hidden items-center gap-2 sm:flex" aria-label={`Evaluators: ${evaluators.map((p) => p.name).join(', ')}`}>
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Evaluators</span>
                {/* The hovered face comes to the front so the overlap never hides the one you're pointing at. */}
                <span className="flex -space-x-2 [&>*:hover]:z-10 [&>*]:relative">
                  {evaluators.map((p) => <PersonaAvatar key={p.id} id={p.id} short={p.short} size={30} title={`${p.name} · ${p.label}`} />)}
                </span>
              </span>
            )}
            {notStarted && persona.id === 'co' && onStart
              ? <Button onClick={() => onStart(s.SolicitationId)} disabled={!!starting}><Play className="mr-1.5 h-4 w-4" />{starting === s.SolicitationId ? 'Starting…' : `Start ${t.process}`}</Button>
              : <Button asChild><Link to={`/s/${encodeURIComponent(s.SolicitationId)}`} state={backState}>Open<ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>}
          </div>
        </div>
        <div className="pt-5"><StageTracker index={notStarted ? -1 : idx} perch /></div>
        {ended ? (
          <div className="mt-auto flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {cancelled ? <CircleX className="h-4 w-4 shrink-0" /> : <CircleCheck className="h-4 w-4 shrink-0 text-[var(--ss-good)]" />}
            <span className="min-w-0 truncate">
              {cancelled ? <span className="font-medium text-foreground">Cancelled</span>
                : <><span className="font-medium text-foreground">Awarded</span>{s.AwardeeName ? <> to {s.AwardeeName}</> : null}</>}
            </span>
            {(cancelled ? cancelledAt : s.AwardedAt) && <span className="ml-auto shrink-0 text-xs">{day((cancelled ? cancelledAt : s.AwardedAt)!)}</span>}
          </div>
        ) : (
          <div className={`mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${yours ? 'bg-primary/10 text-foreground' : 'bg-muted/50 text-muted-foreground'}`}>
            <ArrowRight className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate"><span className="font-medium">Next:</span> {owner?.label ?? 'No action pending'}{yours && <span className="font-semibold"> — that’s you</span>}</span>
            <span className="ml-auto shrink-0 text-xs">{STAGES.length - Math.max(0, idx)} stage{STAGES.length - Math.max(0, idx) === 1 ? '' : 's'} left</span>
          </div>
        )}
        {footer}
      </div>
    </article>
  )
}
