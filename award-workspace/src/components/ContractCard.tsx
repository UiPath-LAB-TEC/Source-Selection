import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ArrowRight, Building2, CalendarClock, Check, CircleCheck, Flag, Link2 } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { AgencyMark } from '@ss/components/Flair'
import { money, moneyShort } from '@ss/lib/eval'
import type { Solicitation } from '@ss/lib/types'
import { useAwardPersona } from '../hooks/usePersona'
import { alertOwners, isLive } from '../lib/award'
import type { AwardRow } from '../lib/award'
import { grouped } from '../lib/alerts'
import { useAwardData } from '../lib/data'
import { fmtDay, periodNow, postAward, signedOn } from '../lib/status'
import { DueChip, itemTitle } from './ActionItems'

/** "Active · final option year": the one status a contract carries, in the same words everywhere. */
export function ActiveChip({ word, onDark }: { word: string; onDark?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${onDark ? 'bg-white/15 text-white ring-1 ring-white/30' : 'bg-[var(--ss-lvl-0)]/12 text-[var(--ss-lvl-0)]'}`}>
      <CircleCheck className="h-3.5 w-3.5" aria-hidden />Active · {word}
    </span>
  )
}

/** How far through its current period a contract is: a plain bar, the day count and the end date. */
export function PeriodBar({ day, total, label }: { day: number; total: number; label: string }) {
  const pct = total ? Math.round((day / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-[var(--ss-lvl-0)]" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

/**
 * A signed contract on a list: what it is, where it is in its period, its money this period, and the one thing to look at
 * next (what needs action, else what's coming up). Built to look nothing like an award card: no step tracker.
 */
export function ContractCard({ s, award, n = 0 }: { s: Solicitation; award?: AwardRow; n?: number }) {
  const { data } = useAwardData()
  const { persona } = useAwardPersona()
  if (!data) return null
  const id = s.SolicitationId
  const of = <T extends { SolicitationId: string }>(rows: T[]) => rows.filter((r) => r.SolicitationId === id)
  const p = periodNow(of(data.schedule), award)
  const groups = grouped(of(data.alerts).filter(isLive))
  const top = groups.needs[0] ?? groups.coming[0]
  // "That's you" only for the item's own owner; the CO sees everyone's items but isn't told each one is hers.
  const topYours = !!top && alertOwners(top).includes(persona.taskLabel)
  const after = postAward(award, of(data.correspondence), of(data.protests))
  const successor = data.awards.find((a) => a.AwardId === award?.SuccessorId)
  const predecessor = data.awards.find((a) => a.AwardId === award?.PredecessorId)
  const to = `/a/${encodeURIComponent(id)}`
  return (
    <article style={{ animationDelay: `${80 + n * 70}ms` }} className="ss-in ss-lift relative overflow-hidden rounded-2xl border border-border bg-card">
      <span className="absolute inset-y-0 left-0 w-1 bg-[var(--ss-lvl-0)]" />
      <div className="space-y-4 p-5 pl-6">
        <div className="flex flex-wrap items-start gap-4">
          <AgencyMark agency={s.Agency} />
          <div className="min-w-0 flex-1 basis-64 space-y-1">
            {/* The chip sits beside the title on wider screens and drops under it on a phone, so the title is never cut short. */}
            <div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:gap-2">
              <Link to={to} title={s.Title} className="line-clamp-2 min-w-0 flex-1 text-lg font-semibold leading-snug hover:underline">{s.Title}</Link>
              <span className="sm:mt-0.5"><ActiveChip word={p.word} /></span>
            </div>
            <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
              <span className="font-mono text-xs">{award?.ContractNumber ?? id}</span>
              <span className="font-medium text-foreground">{s.AwardeeName ?? award?.AwardeeName}</span>
              <span>{moneyShort(award?.ContractValue)}</span>
              <span>Signed {fmtDay(signedOn(data, s, award))}</span>
            </p>
            {(successor || predecessor) && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                {successor ? <>Incumbent, replaced by {successor.ContractNumber} ({successor.AwardeeName})</> : <>Replaces {predecessor?.ContractNumber} ({predecessor?.AwardeeName})</>}
              </p>
            )}
          </div>
          <Button asChild className="shrink-0"><Link to={to}>Open<ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <PeriodBar day={p.day} total={p.total} label={p.current
            ? `${p.word[0].toUpperCase()}${p.word.slice(1)}: day ${p.day} of ${p.total} · ends ${fmtDay(p.current.EndDay)}${p.left <= 90 ? ` (${p.left} days left)` : ''}`
            : 'Not started'} />
          <div className="space-y-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-[var(--ss-brand-2)]" style={{ width: `${p.obligated ? Math.min(100, Math.round((p.invoiced / p.obligated) * 100)) : 0}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{p.obligated ? `${money(Math.round(p.invoiced))} invoiced of ${money(p.obligated)} obligated this period` : 'No funds forecast yet'}</p>
          </div>
        </div>

        {after?.open && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Flag className="h-3.5 w-3.5" aria-hidden /><span className="font-medium text-foreground">Post-award</span>
            {after.lines.map((l) => <span key={l.text} className="inline-flex items-center gap-1">{l.open ? <CalendarClock className="h-3 w-3" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />}{l.text}</span>)}
          </p>
        )}

        <Link to={to} className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2 text-sm ${groups.needs.length && topYours ? 'bg-primary/10 text-foreground' : 'bg-muted/50 text-muted-foreground'}`}>
          {top ? <DueChip a={top} /> : <CircleCheck className="h-4 w-4 shrink-0 text-[var(--ss-good)]" />}
          <span className="min-w-0 flex-1 basis-40 truncate">{top ? itemTitle(top) : 'Nothing coming due'}{groups.needs.length > 0 && topYours && <span className="font-semibold"> — that’s you</span>}</span>
          <span className="shrink-0 text-xs">
            {groups.needs.length ? `${groups.needs.length} need${groups.needs.length === 1 ? 's' : ''} action` : groups.inHand.length ? `${groups.inHand.length} in hand` : ''}
          </span>
        </Link>
      </div>
    </article>
  )
}

/** A compact row for lists that point elsewhere (awaiting decision, recently awarded). */
export function CompactRow({ href, to, agency, title, sub, right }: { href?: string; to?: string; agency: string; title: string; sub: ReactNode; right: ReactNode }) {
  const body = (
    <>
      <AgencyMark agency={agency} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground"><Building2 className="h-3 w-3 shrink-0" aria-hidden />{sub}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">{right}</span>
    </>
  )
  const cls = 'flex items-center gap-3 px-4 py-3 hover:bg-muted/50'
  return to ? <Link to={to} className={cls}>{body}</Link> : <a href={href} className={cls}>{body}</a>
}
