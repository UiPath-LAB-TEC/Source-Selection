import { useMemo, useState } from 'react'
import { AlertTriangle, CircleAlert, CircleCheck, CircleDashed, CircleMinus, FileText, Loader2, Undo2 } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { AgentMark, Field, FormShell, Panel, actorOf, auditRow, nowIso, textareaCls, useForm } from '@forms/forms/common'
import { COR } from '@forms/lib/types'
import { dayOf } from '../lib/clocks'
import type { AwardRow } from '../lib/record'
import type { ScheduleRow } from '../lib/admin'

/** The review the robot prepared (AW_Robots admin.checked_review): every requirement held to the report's own words. */
interface Review {
  requirements: { requirement: string; status: 'Met' | 'Partly met' | 'Missing' | 'Not checked'; evidence: string; note: string }[]
  summary?: string
  recommendation?: 'Accept' | 'Accept with comments' | 'Reject' | null
  issues?: string[]
  agent?: boolean
  file?: string
  history?: { decision: string; reason?: string; by?: string; at?: string }[]
}

const fmt = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—')

const STATUS = {
  Met: { icon: CircleCheck, tone: 'text-[var(--ss-good)]' },
  'Partly met': { icon: CircleMinus, tone: 'text-[var(--ss-warn)]' },
  Missing: { icon: CircleAlert, tone: 'text-[var(--ss-critical)]' },
  'Not checked': { icon: CircleDashed, tone: 'text-muted-foreground' },
} as const

const parse = (s?: string) => { try { return s ? (JSON.parse(s) as Review) : undefined } catch { return undefined } }

/**
 * The COR reviews a deliverable the contractor submitted, such as the monthly status report. The reviewer agent has
 * checked it against what the contract requires, quoting the report for each element; the COR reads the report,
 * accepts it, or rejects it with the reasons the contractor will receive. The robot then files the result: an accepted
 * deliverable clears its action item, and a rejected one goes back with a notice and a new due day.
 */
export function ReviewDeliverable() {
  const { backend, task, data, sol } = useForm()
  const schedule = (data.schedule ?? []) as unknown as ScheduleRow[]
  const row = schedule.find((r) => r.ScheduleId === task.data.scheduleId)
  const award = (data.awards ?? [])[0] as unknown as AwardRow | undefined
  const review = useMemo(() => parse(row?.ReviewJson) ?? parse(task.data.reviewDraft), [row?.ReviewJson, task.data.reviewDraft])
  const gaps = (review?.requirements ?? []).filter((x) => x.status === 'Missing' || x.status === 'Partly met')
  const [decision, setDecision] = useState<'Accept' | 'Reject' | undefined>()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(false)
  const contractor = award?.AwardeeName ?? sol.AwardeeName ?? 'The contractor'
  const number = award?.ContractNumber ?? sol.SolicitationId

  if (!row) {
    return (
      <FormShell eyebrow="Deliverable review" title="Deliverable not found" subtitle={number} who={COR} readOnly={task.isReadOnly} footer={null} certify={false}>
        <Panel title="Nothing to review" icon={<AlertTriangle className="h-4 w-4 text-[var(--ss-warn)]" />}>
          <p className="text-sm text-muted-foreground">The deliverable this task is about ({task.data.scheduleId ?? 'none given'}) isn't on {number}'s schedule.</p>
        </Panel>
      </FormShell>
    )
  }

  const choose = (d: 'Accept' | 'Reject') => {
    setDecision(d)
    // Rejecting starts from the gaps the review found; the COR edits them into the reasons the contractor receives.
    if (d === 'Reject' && !reason.trim() && gaps.length) setReason(gaps.map((g) => `- ${g.requirement}: ${g.note || g.status.toLowerCase()}`).join('\n'))
  }
  const ready = !task.isReadOnly && !!decision && (decision === 'Accept' || reason.trim().length > 10)

  const openReport = async () => {
    if (!row.FilePath || !backend.recordUrl) return
    setOpening(true)
    try { window.open(await backend.recordUrl(row.FilePath), '_blank', 'noopener') }
    catch (e) { backend.notify(`Could not open the report: ${(e as Error).message}`, 'error') }
    finally { setOpening(false) }
  }

  const submit = async () => {
    if (!ready || !decision) return
    setBusy(true)
    try {
      const accepted = decision === 'Accept'
      await backend.upsert('schedule', 'ScheduleId', [{ ScheduleId: row.ScheduleId, SolicitationId: sol.SolicitationId, Status: accepted ? 'Accepted' : 'Rejected',
        AcceptedDay: accepted ? dayOf(nowIso()) : null, ReviewedBy: COR.name, ReviewedAt: nowIso(), Reason: reason.trim() }])
      await backend.upsert('audit', 'EventId', [auditRow(sol.SolicitationId, row.ScheduleId, accepted ? 'DeliverableAccepted' : 'DeliverableRejected', actorOf(COR),
        `${row.Name} from ${contractor}${accepted ? ' accepted' : ' returned'}${reason.trim() ? `: ${reason.trim().slice(0, 600)}` : ''}`)])
      await backend.complete('Submit', { ...task.data, decision: accepted ? 'Accepted' : 'Rejected', notes: reason.trim() })
      backend.notify(accepted ? `${row.Name} accepted.` : `${row.Name} returned to ${contractor}. The notice goes out now.`, 'success')
    } catch (e) { backend.notify(`Could not file the review: ${(e as Error).message}`, 'error') } finally { setBusy(false) }
  }

  return (
    <FormShell eyebrow="Deliverable review" title={row.Name} subtitle={`${number} · ${contractor}`} who={COR} readOnly={task.isReadOnly} certify={false}
      footer={<>
        {decision === 'Reject' && reason.trim().length <= 10 && <span className="mr-auto text-sm text-muted-foreground">Give the reasons the contractor will receive.</span>}
        <Button disabled={!ready || busy} onClick={submit}>
          {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{decision === 'Reject' ? 'Reject and return' : 'Accept deliverable'}
        </Button>
      </>}>
      <Panel title="The deliverable" icon={<FileText className="h-4 w-4 text-[var(--ss-brand-2)]" />}
        actions={row.FilePath && backend.recordUrl ? <Button size="sm" variant="outline" onClick={openReport} disabled={opening}>{opening ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}Open the report</Button> : undefined}>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted-foreground">Deliverable</dt><dd>{row.Code ? `${row.Code} · ` : ''}{row.Name}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Due</dt><dd>{fmt(row.DueDay)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Received</dt><dd>{fmt(row.ReceivedDay)}</dd></div>
        </dl>
        {(review?.history ?? []).length > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Undo2 className="h-3.5 w-3.5" />Resubmitted: returned {review!.history!.length} time{review!.history!.length > 1 ? 's' : ''} before, last for: {review!.history!.at(-1)?.reason}</p>
        )}
      </Panel>

      <Panel title="Checked against the contract" icon={<AgentMark />}
        description={review?.agent ? 'The reviewer agent checked each element the contract requires and quoted the report. Every quote is in the report; the robot dropped any that weren’t.' : 'The reviewer agent was unavailable. Check each element against the report yourself.'}>
        <ul className="divide-y divide-border">
          {(review?.requirements ?? []).map((x) => {
            const s = STATUS[x.status] ?? STATUS['Not checked']
            const Icon = s.icon
            return (
              <li key={x.requirement} className="flex gap-3 py-2.5">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.tone}`} aria-label={x.status} />
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p><span className="font-medium">{x.requirement}</span> <span className="text-xs text-muted-foreground">· {x.status}</span></p>
                  {x.evidence && <p className="border-l-2 border-border pl-2 text-xs italic text-muted-foreground">“{x.evidence}”</p>}
                  {x.note && <p className="text-xs text-muted-foreground">{x.note}</p>}
                </div>
              </li>
            )
          })}
        </ul>
        {review?.summary && <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">{review.summary}{review.recommendation ? <> <span className="font-medium">The agent suggests: {review.recommendation.toLowerCase()}.</span></> : null}</p>}
      </Panel>

      {(review?.issues ?? []).length > 0 && (
        <Panel title="To raise" icon={<CircleAlert className="h-4 w-4 text-[var(--ss-serious)]" />} description="What the report doesn't say but the contract record does. Raise them with the contractor or the Contracting Officer.">
          <ul className="list-disc space-y-1 pl-5 text-sm">{review!.issues!.map((i) => <li key={i}>{i}</li>)}</ul>
        </Panel>
      )}

      <Panel title="Your decision" description="You decide. Acceptance clears the action item; a rejection goes to the contractor with your reasons and a new due date five business days out.">
        <div role="radiogroup" aria-label="Decision" className="flex flex-wrap gap-2">
          {(['Accept', 'Reject'] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={decision === d} disabled={task.isReadOnly} onClick={() => choose(d)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${decision === d ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/50'}`}>
              {d === 'Accept' ? 'Accept' : 'Reject and return'}
            </button>
          ))}
        </div>
        {decision && (
          <div className="mt-3">
            <Field label={decision === 'Reject' ? 'Reasons for the contractor' : 'Comments for the contractor (optional)'}
              hint={decision === 'Reject' ? 'Started from the gaps the review found. Edit them to say what a corrected copy must contain.' : 'For example, what to add next month.'}>
              <textarea className={textareaCls} rows={5} value={reason} onChange={(e) => setReason(e.target.value)} disabled={task.isReadOnly} />
            </Field>
          </div>
        )}
      </Panel>
    </FormShell>
  )
}
