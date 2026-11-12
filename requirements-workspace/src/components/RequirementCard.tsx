import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Building2, CalendarClock, ClipboardList, Package, Wallet } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { AgencyMark, PersonaAvatar } from '@ss/components/Flair'
import { appUrl } from '@ss/lib/apps'
import { day } from '@ss/lib/eval'
import { onDay } from '../lib/package'
import { REQ_PERSONAS, useReqPersona } from '../hooks/usePersona'
import { initials } from '../lib/profiles'
import { nextOf, statusLabel } from '../lib/next'
import { usd, valueOf } from '../lib/package'
import type { DocRow, RequirementRow } from '../lib/types'
import { analysisOf } from '../lib/types'
import { StageBar } from './StageBar'

export const reqPath = (r: Pick<RequirementRow, 'RequirementId'>) => `/r/${encodeURIComponent(r.RequirementId)}`
export const buildPath = (r: Pick<RequirementRow, 'RequirementId'>) => `/r/${encodeURIComponent(r.RequirementId)}/build`

/** "Draft · Clarify", "In review", "Accepted": a requirement's status, in the app's crimson outline. */
export function StatusChip({ r }: { r: RequirementRow }) {
  const accepted = r.Status === 'Accepted'
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${accepted ? 'bg-[var(--ss-brand-2)] text-white' : 'border border-dashed border-[var(--ss-brand-2)] rq-brand-text'}`}>
      <ClipboardList className="h-3.5 w-3.5" aria-hidden />{statusLabel(r)}
    </span>
  )
}

/**
 * A requirement, laid out like the other apps' evaluation and award cards: identity, kind and value, the six-step
 * tracker, and whose move it is.
 */
export function RequirementCard({ r, docs, n = 0 }: { r: RequirementRow; docs: DocRow[]; n?: number }) {
  const { persona, isMine, profileFor } = useReqPersona()
  const a = analysisOf(r)
  const value = valueOf(r, a)
  const next = nextOf(r, docs)
  const yours = !!next?.who.includes(persona.id) && isMine(r)
  // A Program Manager requirement shows the requester who owns it.
  const role = REQ_PERSONAS.find((p) => p.id === (r.OwnerPersona || 'pm'))
  const who = role?.id === 'pm' ? profileFor(r.RequestedBy) : undefined
  const owner = role && (who ? { ...role, name: who.Name, short: initials(who.Name), label: who.Title || role.label } : role)
  const draft = r.Status === 'Draft' || r.Status === 'Returned'
  return (
    <article style={{ animationDelay: `${80 + n * 70}ms` }} className="ss-in ss-lift relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="flex flex-wrap items-start gap-4">
          <AgencyMark agency={r.Agency} />
          <div className="min-w-0 flex-1 basis-64 space-y-1">
            <div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:gap-2">
              <Link to={reqPath(r)} title={r.Title} className="line-clamp-2 min-w-0 flex-1 text-lg font-semibold leading-snug hover:underline">{r.Title || 'Untitled requirement'}</Link>
              <span className="sm:mt-0.5"><StatusChip r={r} /></span>
            </div>
            <div className="flex min-w-0 items-center gap-x-4 text-sm text-muted-foreground">
              <span className="shrink-0 font-mono text-xs">{r.RequirementId}</span>
              <span className="flex min-w-0 items-center gap-1" title={r.Office || r.Agency}><Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{r.Office || r.Agency}</span></span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {(a?.kind || r.Kind) && <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{a?.kind || r.Kind}</span>}
              {value > 0 && <span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5" />about {usd(value)}</span>}
              {r.NeedBy && <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />Needed by {onDay(r.NeedBy)}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {owner && <PersonaAvatar id={owner.id} short={owner.short} size={30} title={`${owner.name} · ${owner.label}`} />}
            {r.SolicitationId && (
              <Button size="sm" variant="outline" asChild><a href={appUrl('source-selection', `/s/${encodeURIComponent(r.SolicitationId)}`)}>Open in Source Selection<ArrowUpRight className="ml-1.5 h-3.5 w-3.5" /></a></Button>
            )}
            <Button size="sm" asChild><Link to={draft ? buildPath(r) : reqPath(r)}>{draft ? 'Continue' : 'Open'}<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button>
          </div>
        </div>
        <StageBar stage={r.Status === 'Accepted' ? 'Accepted' : r.Status === 'Submitted' ? 'Review' : r.Stage} />
      </div>
      {next && (
        <div className={`border-t border-border px-5 py-2.5 text-sm ${yours ? 'bg-primary/5' : 'bg-muted/40'}`}>
          <span className="text-muted-foreground">Next: </span>{next.label}
          <span className="text-muted-foreground"> · {next.whoLabel}</span>{yours && <span className="font-semibold"> — that's you</span>}
        </div>
      )}
      {!next && r.Status === 'Accepted' && (
        <div className="border-t border-border bg-muted/40 px-5 py-2.5 text-sm text-muted-foreground">Accepted by contracting {day(r.UpdatedAt)}{r.SolicitationId ? ` · now solicitation ${r.SolicitationId}` : ''}</div>
      )}
    </article>
  )
}
