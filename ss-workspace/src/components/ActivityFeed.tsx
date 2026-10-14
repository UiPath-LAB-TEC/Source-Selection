import { useState } from 'react'
import { useScopedData } from '../hooks/useFramework'
import { Link } from 'react-router-dom'
import { useBackState } from '../lib/backlink'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Bot, CheckCircle2, FileSearch, Gavel, PenLine, Scale, ShieldCheck, Sparkles, UserPen, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { when } from '../lib/eval'
import { useTerms } from '@forms/lib/terms'
import { actorName } from '../lib/types'

const ICON: Record<string, LucideIcon> = {
  ProposalsIngested: FileSearch, ComplianceScreened: CheckCircle2, ProposalsReleased: CheckCircle2,
  FindingDrafted: Sparkles, FindingAccepted: UserPen, FindingEdited: PenLine, FindingAdded: PenLine, FindingRejected: UserPen,
  RatingAssigned: Scale, ConsensusRatingSet: Users, PriceDetermined: Scale, AwardDecisionSigned: Gavel, ConflictCertified: ShieldCheck,
}

const VERB: Record<string, string> = {
  ProposalsIngested: 'ingested proposals', ComplianceScreened: 'screened compliance and responsibility', ProposalsReleased: 'released proposals to the SSEB',
  FindingDrafted: 'drafted a finding', FindingAccepted: 'accepted a finding', FindingEdited: 'edited a finding', FindingAdded: 'added a finding', FindingRejected: 'rejected a finding',
  RatingAssigned: 'assigned a rating', ConsensusRatingSet: 'set a consensus rating', PriceDetermined: 'determined price reasonableness', AwardDecisionSigned: 'signed the award decision',
  ConflictCertified: 'certified no conflict of interest with the offerors',
}
/** The same events, in a District RFP's words. */
const SLED_VERB: Record<string, string> = {
  ComplianceScreened: 'screened responsiveness and vendor registration', ProposalsReleased: 'released proposals to the evaluation committee',
  RatingAssigned: 'assigned a score', ConsensusRatingSet: 'set a consensus score', PriceDetermined: 'evaluated cost', AwardDecisionSigned: 'signed the recommendation of award',
  ConflictCertified: 'certified no conflict of interest with the proposers',
}

/** Most recent audit events across all source selections, attributed to named officials and agents. */
export function ActivityFeed() {
  const backState = useBackState()
  const { data } = useScopedData()
  const t = useTerms()
  const [page, setPage] = useState(0)
  if (!data) return null
  const offerorName = (ref: string) => data.offerors.find((o) => ref.includes(o.OfferorId))?.Name
  const all = [...data.audit].sort((a, b) => b.OccurredAt.localeCompare(a.OccurredAt))
  const PAGE = 5
  const pages = Math.max(1, Math.ceil(all.length / PAGE))
  const current = Math.min(page, pages - 1)
  const events = all.slice(current * PAGE, current * PAGE + PAGE)
  return (
    // The heading sits above the card, like the home page's other sections (My evaluations, My tasks).
    <section className="space-y-3" aria-label="Live activity">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          Live activity
          <span className="relative flex h-2.5 w-2.5" aria-hidden><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--ss-brand-3)] opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--ss-brand-3)]" /></span>
        </h2>
        <p className="text-sm text-muted-foreground">Every action is recorded for the protest file</p>
      </div>
      <div className="ss-in rounded-2xl border border-border bg-card p-5" style={{ animationDelay: '160ms' }}>
      <ol className="space-y-3">
        {events.map((e) => {
          const Icon = ICON[e.Action] ?? (e.Actor.startsWith('SS_') ? Bot : UserPen)
          const agent = e.Actor.startsWith('SS_')
          const who = actorName(e.Actor)
          const off = offerorName(e.EntityRef)
          return (
            <li key={e.EventId}>
              <Link to={`/s/${encodeURIComponent(e.SolicitationId)}`} state={backState} className="flex gap-3 rounded-lg p-1 hover:bg-muted/50">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${agent ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 text-sm">
                  <span className="font-medium">{who}</span> <span className="text-muted-foreground">{(t.sled ? SLED_VERB[e.Action] : undefined) ?? VERB[e.Action] ?? e.Action.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}</span>
                  {off && <span className="text-muted-foreground"> · {off}</span>}
                  <span className="block truncate text-xs text-muted-foreground">{e.Detail}</span>
                  <span className="block text-[11px] text-muted-foreground">{when(e.OccurredAt)}</span>
                </span>
              </Link>
            </li>
          )
        })}
        {!events.length && <li className="text-sm text-muted-foreground">No activity yet.</li>}
      </ol>
      {all.length > PAGE && (
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="tabular-nums">{current * PAGE + 1}–{Math.min(all.length, (current + 1) * PAGE)} of {all.length}</span>
          <span className="flex items-center gap-1">
            <button className="rounded-md p-1 hover:bg-muted disabled:opacity-40" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Newer activity"><ChevronLeft className="h-4 w-4" /></button>
            <span className="tabular-nums">Page {current + 1} of {pages}</span>
            <button className="rounded-md p-1 hover:bg-muted disabled:opacity-40" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Older activity"><ChevronRight className="h-4 w-4" /></button>
          </span>
        </div>
      )}
      </div>
    </section>
  )
}
