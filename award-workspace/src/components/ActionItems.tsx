import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, CalendarClock, Check, ChevronDown, CircleAlert, FileUp, Loader2, RotateCcw, UserCheck } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@uipath/apollo-wind/components/ui/dialog'
import { Textarea } from '@uipath/apollo-wind/components/ui/textarea'
import { PersonaAvatar } from '@ss/components/Flair'
import { when } from '@ss/lib/eval'
import { useAwardPersona } from '../hooks/usePersona'
import { ALERT_KIND_LABEL, AWARD_PERSONAS, alertOwners } from '../lib/award'
import type { AlertRow } from '../lib/award'
import { groupOf, useAlertActions } from '../lib/alerts'
import type { ActionGroup } from '../lib/alerts'
import { useAwardData } from '../lib/data'
import { fmtDay } from '../lib/status'
import { useRecordReceipt } from '../lib/receipt'
import type { ScheduleRow } from '../lib/award'
import { OpenAwardTask } from './AwardTask'

/** An item's title without a trailing "due Nov 10": the due chip beside it already carries the date. */
export const itemTitle = (a: AlertRow) => (a.DueDay ? a.Title.replace(/\s+due [A-Z][a-z]{2} \d{1,2}(, \d{4})?$/, '') : a.Title)

/**
 * When an item is due, as a word and a date. Only items that need action carry a warning tone (red overdue, amber due
 * soon), with an icon so the tone is never the only cue; items in hand or coming up stay neutral.
 */
export function DueChip({ a }: { a: AlertRow }) {
  const g = groupOf(a)
  const day = a.DueDay ? fmtDay(a.DueDay, false) : undefined
  if (g === 'needs' && a.Severity === 'Overdue') {
    return <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--ss-critical)]/12 px-2 py-0.5 text-[11px] font-semibold text-[var(--ss-critical)]"><CircleAlert className="h-3.5 w-3.5" aria-hidden />Overdue{day ? ` · ${day}` : ''}</span>
  }
  if (g === 'needs') {
    return <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--ss-serious)]/12 px-2 py-0.5 text-[11px] font-semibold text-[var(--ss-serious)]"><AlarmClock className="h-3.5 w-3.5" aria-hidden />Due {day}</span>
  }
  if (g === 'inHand') {
    return <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><UserCheck className="h-3.5 w-3.5" aria-hidden />In hand</span>
  }
  return <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" aria-hidden />{day ? `Due ${day}` : 'Coming up'}</span>
}

function DismissDialog({ item, open, onOpenChange }: { item: AlertRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { dismiss, busy } = useAlertActions()
  const [reason, setReason] = useState('')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dismiss this item?</DialogTitle>
          <DialogDescription>{item.Title}. It stays dismissed unless it gets more urgent. The reason goes on the record.</DialogDescription>
        </DialogHeader>
        <label className="space-y-1.5 text-sm font-medium">
          <span>Reason</span>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Funding modification P00012 is in routing" />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!reason.trim() || busy === item.AlertId} onClick={async () => { await dismiss(item, reason.trim()); onOpenChange(false) }}>Dismiss</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Record receipt of a deliverable: pick the PDF the contractor sent, file it with the record, and start the review. */
function RecordReceipt({ row, item }: { row: ScheduleRow; item: AlertRow }) {
  const { record, busy } = useRecordReceipt()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File>()
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><FileUp className="mr-1.5 h-3.5 w-3.5" />Record receipt</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record receipt: {row.Name}</DialogTitle>
            <DialogDescription>Add the PDF the contractor sent. It's filed with the contract record, the reviewer agent checks it against what the contract requires, and the review task comes to you.</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Deliverable (PDF)</span>
            <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0])}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground" />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!file || busy === row.ScheduleId} onClick={async () => { if (file && await record(row, file, item)) setOpen(false) }}>
              {busy === row.ScheduleId && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}File it and start the review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * One action item on one line: when it's due, what it is, which contract, who owns it, and what to do. The numbers and
 * the rule behind it open under Details.
 */
function ActionItem({ item: a, contract }: { item: AlertRow; contract?: { id: string; title: string; number?: string } }) {
  const { persona } = useAwardPersona()
  const { data, tasks } = useAwardData()
  const { acknowledge, reopen, busy } = useAlertActions()
  const [open, setOpen] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const g = groupOf(a)
  // A deliverable's item does its own work: record the receipt, then open the review task once the agent has checked it.
  const scheduleId = a.Kind === 'deliverable' ? (() => { try { return (JSON.parse(a.EvidenceJson ?? '{}') as { scheduleId?: string }).scheduleId } catch { return undefined } })() : undefined
  const row = scheduleId ? data?.schedule.find((r) => r.ScheduleId === scheduleId) : undefined
  const review = row ? tasks.find((t) => !t.isCompleted && (t.data as { scheduleId?: string } | null)?.scheduleId === row.ScheduleId) : undefined
  const owners = AWARD_PERSONAS.filter((p) => alertOwners(a).includes(p.taskLabel))
  const mine = persona.id === 'co' || owners.some((p) => p.id === persona.id)
  const quiet = g !== 'needs'
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <DueChip a={a} />
        <div className="min-w-0 flex-1 basis-56">
          <p className={`text-sm leading-snug ${quiet ? 'text-muted-foreground' : 'font-medium'}`}>{itemTitle(a)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {contract && <Link to={`/a/${encodeURIComponent(contract.id)}`} className="hover:text-primary">{contract.number ?? contract.title}</Link>}
            {contract && ' · '}{ALERT_KIND_LABEL[a.Kind] ?? a.Kind}
            {g === 'inHand' && a.DueDay ? ` · ${a.Severity === 'Overdue' ? 'was due' : 'due'} ${fmtDay(a.DueDay, false)}` : ''}
            {g === 'inHand' && a.ActedBy ? ` · ${a.ActedBy} is on it` : ''}
          </p>
        </div>
        <span className="flex shrink-0 -space-x-2" aria-label={`Owner: ${owners.map((p) => p.name).join(', ')}`}>
          {owners.map((p) => <PersonaAvatar key={p.id} id={p.id} short={p.short} size={24} title={`${p.name} · ${p.label}`} />)}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {row && mine && !row.ReceivedDay && <RecordReceipt row={row} item={a} />}
          {row && row.ReceivedDay && review && (mine || persona.id === 'cor') && <OpenAwardTask task={review} label="Review report" size="sm" />}
          {row && row.ReceivedDay && !review && <Button size="sm" variant="ghost" disabled><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Review starting</Button>}
          {!row && mine && g === 'needs' && <Button size="sm" variant="outline" disabled={busy === a.AlertId} onClick={() => acknowledge(a)}><Check className="mr-1.5 h-3.5 w-3.5" />I'm on it</Button>}
          {!row && mine && g === 'inHand' && <Button size="sm" variant="ghost" disabled={busy === a.AlertId} onClick={() => reopen(a)}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reopen</Button>}
          <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>Details<ChevronDown className={`ml-1 h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} /></Button>
        </div>
      </div>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {a.Detail && <p>{a.Detail}</p>}
          <p className="text-xs">{a.Rule} · found by the daily contract watch {when(a.RaisedAt)}{a.ActedBy && g === 'inHand' ? ` · picked up by ${a.ActedBy} ${when(a.ActedAt)}` : ''}</p>
          {mine && g !== 'inHand' && (
            <div className="-ml-2 flex flex-wrap gap-1">
              {row && g === 'needs' && <Button size="sm" variant="ghost" disabled={busy === a.AlertId} onClick={() => acknowledge(a)}><Check className="mr-1.5 h-3.5 w-3.5" />I'm on it</Button>}
              <Button size="sm" variant="ghost" onClick={() => setDismissing(true)}>Dismiss with a reason</Button>
            </div>
          )}
          {row?.ReviewedBy && <p className="text-xs">Last reviewed by {row.ReviewedBy}{row.Reason ? `: ${row.Reason}` : ''}</p>}
        </div>
      )}
      <DismissDialog item={a} open={dismissing} onOpenChange={setDismissing} />
    </li>
  )
}

/** A list of action items in one bordered card, divided rows. */
export function ActionList({ items, showContract }: { items: AlertRow[]; showContract?: boolean }) {
  const { data } = useAwardData()
  const contractOf = (id: string) => {
    const s = data?.solicitations.find((x) => x.SolicitationId === id)
    const a = data?.awards.find((x) => x.SolicitationId === id)
    return { id, title: s?.Title ?? a?.Title ?? id, number: a?.ContractNumber }
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {items.map((a) => <ActionItem key={a.AlertId} item={a} contract={showContract ? contractOf(a.SolicitationId) : undefined} />)}
    </ul>
  )
}

function Fold({ icon, label, hint, items, showContract, startOpen }: { icon: ReactNode; label: string; hint: string; items: AlertRow[]; showContract?: boolean; startOpen?: boolean }) {
  const [open, setOpen] = useState(!!startOpen)
  if (!items.length) return null
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted/40">
        {icon}
        <span className="font-medium text-foreground">{label} · {items.length}</span>
        <span className="min-w-0 flex-1 truncate text-xs">{hint}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <ActionList items={items} showContract={showContract} />}
    </div>
  )
}

/**
 * The three groups: what needs action now (open, due within 14 days or overdue), then folded away, what's in hand
 * (acknowledged) and what's coming up (further out). Only the first is ever counted on badges and headlines.
 */
export function ActionGroups({ groups, showContract, empty, expand }: {
  groups: Record<ActionGroup, AlertRow[]>; showContract?: boolean; empty?: string; expand?: boolean
}) {
  const next = groups.coming[0]
  return (
    <div className="space-y-2">
      {groups.needs.length
        ? <ActionList items={groups.needs} showContract={showContract} />
        : <p className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground"><Check className="h-4 w-4 text-[var(--ss-good)]" />{empty ?? 'Nothing needs action right now.'}</p>}
      <Fold icon={<UserCheck className="h-4 w-4 shrink-0" />} label="In hand" hint="picked up, someone is on it" items={groups.inHand} showContract={showContract} startOpen={expand} />
      <Fold icon={<CalendarClock className="h-4 w-4 shrink-0" />} label="Coming up" hint={next?.DueDay ? `next on ${fmtDay(next.DueDay, false)}` : 'more than 14 days out'} items={groups.coming} showContract={showContract} startOpen={expand} />
    </div>
  )
}
