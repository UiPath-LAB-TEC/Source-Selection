import { useState } from 'react'
import { Landmark, Loader2 } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { AgentMark, Field, FormShell, Panel, actorOf, auditRow, nowIso, textareaCls, useForm } from '@forms/forms/common'
import { RM } from '@forms/lib/types'
import { endAfter, linesFor, money, showDay, totalOf } from '../lib/options'
import type { FundsCertification } from '../lib/options'
import { Deadline, LineTable, NoPackage, Proposal, usePackage } from './OptionParts'

type Status = FundsCertification['status']

const STATUSES: { id: Status; label: string; hint: string }[] = [
  { id: 'Certified', label: 'Certify funds', hint: 'The funds are available now, on the funding document below.' },
  { id: 'Planned', label: 'Funds are planned', hint: 'In the budget but not yet available. Enough for a preliminary notice, not for an exercise.' },
  { id: 'Not available', label: 'Not available', hint: "The Contracting Officer can't exercise without funds. Say why." },
]

/**
 * The Resource Manager certifies the funds for an option or extension before the Contracting Officer decides
 * (FAR 17.204-1(b)(2)). The package proposes the period and the price; for an extension she can certify another
 * length. Her certification goes on the package and into the determination the CO signs.
 */
export function CertifyFunds() {
  const { backend, task, sol } = useForm()
  const { row, pkg } = usePackage()
  const [months, setMonths] = useState(() => Math.max(1, pkg?.proposal.months ?? 1))
  const [status, setStatus] = useState<Status>(pkg?.stage === 'preliminary' ? 'Planned' : 'Certified')
  const [document, setDocument] = useState('')
  const [appropriation, setAppropriation] = useState(pkg?.appropriation ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  if (!row || !pkg) return <NoPackage eyebrow="Funds certification" who={RM} />

  const amount = totalOf(linesFor(pkg, months))
  const remaining = pkg.extension?.remaining ?? 0
  const ready = !task.isReadOnly && (status === 'Not available' ? note.trim().length > 5 : appropriation.trim().length > 3 && (status === 'Planned' || document.trim().length > 3))

  const submit = async () => {
    if (!ready) return
    setBusy(true)
    try {
      const funds: FundsCertification = { status, months: pkg.kind === 'extension' ? months : undefined, amount, appropriation: appropriation.trim(),
        document: document.trim().slice(0, 60) || undefined, note: note.trim().slice(0, 300) || undefined, by: RM.name, at: nowIso() }
      await backend.upsert('schedule', 'ScheduleId', [{ ScheduleId: row.ScheduleId, SolicitationId: sol.SolicitationId, ReviewJson: JSON.stringify({ ...pkg, funds }) }])
      const action = status === 'Certified' ? 'FundsCertified' : status === 'Planned' ? 'FundsPlanned' : 'FundsNotAvailable'
      await backend.upsert('audit', 'EventId', [auditRow(sol.SolicitationId, row.ScheduleId, action, actorOf(RM),
        `${pkg.name}: ${status === 'Not available' ? `funds not available: ${note.trim()}` : `${money(amount, true)} ${status === 'Certified' ? 'certified' : 'planned'}, ${appropriation.trim()}${document.trim() ? `, ${document.trim()}` : ''}`}`)])
      await backend.complete('Submit', { ...task.data, decision: status, notes: note.trim() })
      backend.notify(status === 'Not available' ? 'Recorded. The Contracting Officer decides next.' : `Funds ${status === 'Certified' ? 'certified' : 'confirmed as planned'}. The Contracting Officer decides next.`, 'success')
    } catch (e) { backend.notify(`Could not save: ${(e as Error).message}`, 'error') } finally { setBusy(false) }
  }

  return (
    <FormShell eyebrow="Funds certification" title={`${pkg.title}${pkg.kind === 'option' ? '' : `: ${pkg.name}`}`} subtitle={`${pkg.contract.number} · ${pkg.contract.contractor}`}
      who={RM} readOnly={task.isReadOnly} certify={false}
      footer={<>
        <span className="mr-auto text-sm text-muted-foreground">{!ready ? (status === 'Not available' ? 'Say why funds aren’t available.' : 'Give the appropriation and the funding document.')
          : status === 'Not available' ? 'The Contracting Officer sees why.' : `${status === 'Certified' ? 'Certifies' : 'Confirms as planned'} ${money(amount, true)}, with your name and today's date.`}</span>
        <Button disabled={!ready || busy} onClick={submit}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{STATUSES.find((s) => s.id === status)!.label}</Button>
      </>}>
      <Panel title="What's being funded" icon={<Landmark className="h-4 w-4 text-[var(--ss-brand-2)]" />} actions={<Deadline pkg={pkg} />}
        description={pkg.kind === 'extension' ? `Under 52.217-8 at the contract's current rates (${pkg.extension?.ratesFrom?.toLowerCase()}), by the month.` : `${pkg.name} at the prices in the contract.`}>
        <div className="space-y-4">
          <Proposal pkg={pkg} />
          {pkg.kind === 'extension' && (
            <Field label="Months to fund" hint={pkg.proposal.months ? `The package proposes ${pkg.proposal.months}. You can fund more, up to the ${remaining} that remain, so the Contracting Officer can choose.` : 'The package proposes no extension. Fund it only if the Contracting Officer may extend anyway.'}>
              <select className={`${textareaCls} max-w-[12rem]`} value={months} disabled={task.isReadOnly} onChange={(e) => setMonths(Number(e.target.value))}>
                {Array.from({ length: Math.max(1, remaining) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} month{n === 1 ? '' : 's'} (to {showDay(endAfter(pkg.proposal.start, n))})</option>)}
              </select>
            </Field>
          )}
          <LineTable pkg={pkg} months={months} />
        </div>
      </Panel>

      {pkg.writer?.summary && (
        <Panel title="The agent's read" icon={<AgentMark />} description="From the option package the robot prepared. The Contracting Officer decides after you.">
          <p className="text-sm">{pkg.writer.summary}</p>
        </Panel>
      )}

      <Panel title="Your certification" description="Recorded with your name and today's date, and stated in the Contracting Officer's determination (FAR 17.204-1(b)(2)).">
        <div className="space-y-4">
          <div role="radiogroup" aria-label="Funds" className="grid gap-2 sm:grid-cols-3">
            {STATUSES.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={status === s.id} disabled={task.isReadOnly} onClick={() => setStatus(s.id)}
                className={`rounded-xl border p-3 text-left text-sm transition ${status === s.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}>
                <span className="block font-medium">{s.label}</span><span className="block text-xs text-muted-foreground">{s.hint}</span>
              </button>
            ))}
          </div>
          {status !== 'Not available' && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Appropriation" hint="The fiscal year the period's funds come from.">
                <input className={textareaCls} value={appropriation} disabled={task.isReadOnly} onChange={(e) => setAppropriation(e.target.value)} />
              </Field>
              <Field label={status === 'Certified' ? 'Funding document' : 'Funding document (optional)'} hint="The purchase request or other document that commits the funds.">
                <input className={textareaCls} value={document} disabled={task.isReadOnly} onChange={(e) => setDocument(e.target.value)} placeholder="PR 0012345678" />
              </Field>
            </div>
          )}
          <Field label={status === 'Not available' ? 'Why not' : 'Note (optional)'}>
            <textarea className={textareaCls} rows={3} value={note} disabled={task.isReadOnly} onChange={(e) => setNote(e.target.value)}
              placeholder={status === 'Not available' ? 'The FY2027 operating budget is not yet apportioned for this line.' : ''} />
          </Field>
          {status !== 'Not available' && <p className="text-sm"><span className="text-muted-foreground">Amount: </span><span className="font-semibold tabular-nums">{money(amount, true)}</span></p>}
        </div>
      </Panel>
    </FormShell>
  )
}
