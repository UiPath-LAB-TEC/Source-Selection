import { AlertTriangle, CalendarClock, CircleAlert, CircleCheck, CircleDashed, CircleMinus } from 'lucide-react'
import { AgentMark, FormShell, Panel, useForm } from '@forms/forms/common'
import type { Persona } from '@forms/lib/types'
import { fundsFinding, linesFor, money, parsePackage, showDay, totalOf } from '../lib/options'
import type { CheckStatus, OptionCheck, OptionPackage } from '../lib/options'
import type { ScheduleRow } from '../lib/admin'

/** The option or extension a task is about, and the package the robot prepared for it (on the row; the task's copy as a fallback). */
export function usePackage() {
  const { task, data } = useForm()
  const schedule = (data.schedule ?? []) as unknown as ScheduleRow[]
  const row = schedule.find((r) => r.ScheduleId === task.data.scheduleId)
  const pkg = parsePackage(row?.ReviewJson) ?? parsePackage(task.data.packageDraft)
  return { row, pkg }
}

/** When the package isn't on the record (the robot step didn't run, or the row moved on): say so, with nothing to sign. */
export function NoPackage({ eyebrow, who }: { eyebrow: string; who: Persona }) {
  const { task, sol } = useForm()
  return (
    <FormShell eyebrow={eyebrow} title="Option package not found" subtitle={sol.SolicitationId} who={who} readOnly={task.isReadOnly} footer={null} certify={false}>
      <Panel title="Nothing to decide" icon={<AlertTriangle className="h-4 w-4 text-[var(--ss-warn)]" />}>
        <p className="text-sm text-muted-foreground">The option package for {task.data.scheduleId ?? 'this task'} isn't on {sol.SolicitationId}'s schedule. Retry the package step in Maestro, then reopen the task.</p>
      </Panel>
    </FormShell>
  )
}

const STATUS: Record<CheckStatus, { icon: typeof CircleCheck; tone: string }> = {
  Met: { icon: CircleCheck, tone: 'text-[var(--ss-good)]' },
  'Not met': { icon: CircleAlert, tone: 'text-[var(--ss-critical)]' },
  'To confirm': { icon: CircleMinus, tone: 'text-[var(--ss-warn)]' },
  'Not required': { icon: CircleDashed, tone: 'text-muted-foreground' },
}

/** The notice deadline, as a word and a date: days left, or closed. */
export function Deadline({ pkg }: { pkg: OptionPackage }) {
  return pkg.late
    ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ss-critical)]/12 px-2 py-0.5 text-xs font-semibold text-[var(--ss-critical)]"><CircleAlert className="h-3.5 w-3.5" />Notice window closed {showDay(pkg.noticeBy)}</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ss-serious)]/12 px-2 py-0.5 text-xs font-semibold text-[var(--ss-serious)]"><CalendarClock className="h-3.5 w-3.5" />Notice by {showDay(pkg.noticeBy)} · {pkg.daysLeft} day{pkg.daysLeft === 1 ? '' : 's'} left</span>
}

/** The line items for a length, with the total. */
export function LineTable({ pkg, months }: { pkg: OptionPackage; months: number }) {
  const lines = linesFor(pkg, months)
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[420px] text-sm">
        <thead><tr className="bg-muted/40 text-left text-xs text-muted-foreground">
          <th className="px-3 py-2 font-medium">CLIN</th><th className="px-3 py-2 font-medium">Description</th>
          {pkg.kind === 'extension' && <th className="px-3 py-2 text-right font-medium">A month</th>}<th className="px-3 py-2 text-right font-medium">Amount</th>
        </tr></thead>
        <tbody>
          {lines.map((x) => (
            <tr key={x.clin} className="border-t border-border">
              <td className="px-3 py-2 font-mono text-xs">{x.clin}</td>
              <td className="px-3 py-2">{x.description}<span className="block text-xs text-muted-foreground">{x.type}</span></td>
              {pkg.kind === 'extension' && <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{money(x.monthly, true)}</td>}
              <td className="px-3 py-2 text-right tabular-nums">{money(x.amount, true)}</td>
            </tr>
          ))}
          <tr className="border-t border-border font-semibold">
            <td className="px-3 py-2" colSpan={pkg.kind === 'extension' ? 3 : 2}>Total{pkg.kind === 'extension' ? `, ${months} month${months === 1 ? '' : 's'}` : ''}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(totalOf(lines), true)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/** Every check before exercising, with its source. Funds read the Resource Manager's certification once it's in. */
export function CheckList({ pkg }: { pkg: OptionPackage }) {
  return (
    <ul className="divide-y divide-border">
      {pkg.checks.map((x: OptionCheck) => {
        const funds = x.id === 'funds' && pkg.funds
        const status: CheckStatus = funds ? (pkg.funds!.status === 'Certified' ? 'Met' : pkg.funds!.status === 'Planned' ? 'To confirm' : 'Not met') : x.status
        const s = STATUS[status] ?? STATUS['To confirm']
        const Icon = s.icon
        const agent = pkg.writer?.drafted?.[x.id]
        return (
          <li key={x.id} className="flex gap-3 py-2.5">
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.tone}`} aria-label={status} />
            <div className="min-w-0 flex-1 space-y-0.5 text-sm">
              <p><span className="font-medium">{x.label}</span> <span className="text-xs text-muted-foreground">· {status} · {x.rule}</span></p>
              <p className="text-muted-foreground">{funds ? fundsFinding(pkg.funds, pkg) : x.finding}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">{agent && <AgentMark size={14} />}{funds ? "The Resource Manager's certification" : x.source}{agent ? ' · the agent’s finding is in the determination below' : ''}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** What the package proposes and why, with the follow-on contract's status. */
export function Proposal({ pkg }: { pkg: OptionPackage }) {
  const p = pkg.proposal
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
      <div><dt className="text-xs text-muted-foreground">{pkg.kind === 'extension' ? 'Proposed' : 'Period'}</dt>
        <dd className="font-medium">{pkg.kind === 'extension' ? (p.months ? `${p.months} month${p.months === 1 ? '' : 's'}, ${showDay(p.start)} to ${showDay(p.end)}` : 'No extension') : `${showDay(p.start)} to ${showDay(p.end)}`}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Price</dt><dd className="font-medium tabular-nums">{money(p.amount)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Contract ends</dt><dd>{showDay(pkg.contract.end)}{pkg.extension ? ` · ${pkg.extension.remaining} of ${pkg.extension.cap} extension months left` : ''}</dd></div>
      <div className="sm:col-span-3"><dt className="text-xs text-muted-foreground">{pkg.kind === 'extension' ? 'Why this length' : 'Terms'}</dt><dd className="text-muted-foreground">{p.reason}</dd></div>
    </dl>
  )
}
