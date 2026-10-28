import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, FileSignature, ListChecks, Loader2, PenLine, Scale } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { AgentMark, Field, FormShell, Panel, actorOf, auditRow, nowIso, textareaCls, useForm } from '@forms/forms/common'
import { PersonaAvatar } from '@forms/components/Flair'
import { titled, useTerms } from '@forms/lib/terms'
import { persona } from '@forms/lib/types'
import { dayOf } from '../lib/clocks'
import { signLetter } from '../lib/record'
import { DETERMINATION_FILL, FUNDS_FILL, choicesFor, determinationText, endAfter, fillDetermination, fundsAllow, fundsFinding, linesFor,
  modificationText, money, noticeLetter, showDay, totalOf } from '../lib/options'
import type { OptionDecisionRecord, Outcome } from '../lib/options'
import { CheckList, Deadline, LineTable, NoPackage, Proposal, usePackage } from './OptionParts'

const longDate = (d: Date) => d.toLocaleDateString('en-US', { dateStyle: 'long' })

/**
 * The Contracting Officer decides an option or the 52.217-8 extension and signs. The robot gathered every check
 * FAR 17.204-1(b) and DFARS 217.207(c) ask for and the agent drafted the findings that need judgment; the Resource
 * Manager certified the funds. The CO edits the determination, chooses, and signs: the form writes the signed
 * determination, the notice and (on exercise) the modification, and AW_Robots files them and updates the contract.
 */
export function OptionDecision() {
  const { backend, task, data, sol, update } = useForm()
  const t = useTerms()
  const co = titled(persona('co'), t.id)
  const { row, pkg } = usePackage()
  const draft = data.decisions.find((d) => d.DecisionId === pkg?.ids.decision)
  const choices = pkg ? choicesFor(pkg) : []
  const funds = pkg?.funds
  const certifiedMonths = pkg?.kind === 'extension' && funds?.status === 'Certified' ? funds.months ?? 0 : 0
  const [outcome, setOutcome] = useState<Outcome | undefined>()
  const [months, setMonths] = useState(() => Math.max(1, Math.min(pkg?.writer?.recommendedMonths || pkg?.proposal.months || 1, certifiedMonths || 6)))
  const [reason, setReason] = useState('')
  const [memo, setMemo] = useState(draft?.DocumentText ?? '')
  const [showDocs, setShowDocs] = useState(false)
  const [signature, setSignature] = useState('')
  const [busy, setBusy] = useState(false)
  const bilateral = !!pkg?.late
  const lines = useMemo(() => (pkg ? linesFor(pkg, months) : []), [pkg, months])
  if (!row || !pkg) return <NoPackage eyebrow="Option decision" who={co} />

  const choice = choices.find((c) => c.outcome === outcome)
  const amount = outcome === 'Exercised' ? totalOf(lines) : pkg.proposal.amount
  // An extension needs funds certified for at least a month (the length is held to them below); an option, for its price.
  const allowed = (o: Outcome) => (o === 'Exercised' && pkg.kind === 'extension'
    ? funds?.status === 'Certified' && certifiedMonths >= 1
    : fundsAllow(funds, choices.find((c) => c.outcome === o)?.needs, pkg.proposal.amount))
  const monthsOk = pkg.kind !== 'extension' || outcome !== 'Exercised' || (months >= 1 && months <= Math.min(pkg.extension?.remaining ?? 0, certifiedMonths))
  const ready = !task.isReadOnly && !!choice && allowed(choice.outcome) && monthsOk && (outcome !== 'Not exercised' || reason.trim().length > 10)
    && signature.trim().length > 2 && memo.includes(FUNDS_FILL) && memo.includes(DETERMINATION_FILL)

  const letter = outcome ? noticeLetter(pkg, outcome, months, bilateral) : undefined
  const mod = outcome === 'Exercised' ? modificationText(pkg, months, funds, bilateral) : undefined
  const determination = outcome ? determinationText(pkg, outcome, months, bilateral, reason) : ''
  const signedMemo = outcome ? fillDetermination(memo, fundsFinding(funds, pkg), determination) : memo

  const sign = async () => {
    if (!ready || !outcome || !letter) return
    setBusy(true)
    try {
      const by = signature.trim()
      const date = longDate(new Date())
      const now = nowIso()
      const id = sol.SolicitationId
      const start = pkg.proposal.start
      const end = outcome === 'Exercised' && pkg.kind === 'extension' ? endAfter(start, months) : pkg.proposal.end
      const what = pkg.kind === 'extension' ? 'Extension of services' : pkg.name
      const summary = outcome === 'Exercised' ? `${what} exercised: ${pkg.kind === 'extension' ? `${months} month${months === 1 ? '' : 's'}, ` : ''}${showDay(start)} to ${showDay(end)}, ${money(amount, true)}${bilateral ? ' (bilateral)' : ''}`
        : outcome === 'Notice sent' ? `${pkg.name}: preliminary notice of intent sent` : `${what} not exercised: ${reason.trim()}`
      await backend.upsert('decisions', 'DecisionId', [{ DecisionId: pkg.ids.decision, SolicitationId: id, Kind: pkg.kind === 'extension' ? 'Extension' : 'OptionExercise',
        Outcome: outcome, Rationale: summary.slice(0, 1000), DecidedBy: actorOf(co, t.id), DecidedAt: now, DocumentText: signLetter(signedMemo, by, date) }])
      await backend.upsert('correspondence', 'CorrespondenceId', [{ CorrespondenceId: pkg.ids.letter, SolicitationId: id, OfferorId: `${id}-CONTRACTOR`, Kind: letter.kind,
        Status: 'Approved', Text: signLetter(letter.text, by, date), AgentText: letter.text, Author: actorOf(co, t.id) }])
      if (outcome === 'Exercised' && mod) {
        await backend.upsert('modifications', 'ModificationId', [{ ModificationId: pkg.ids.modification, SolicitationId: id, Number: pkg.modification,
          Kind: pkg.kind === 'extension' ? 'Extension of services' : 'Option exercise', Authority: pkg.kind === 'extension' ? 'FAR 52.217-8' : 'FAR 52.217-9',
          Bilateral: bilateral, ScheduleId: row.ScheduleId, EffectiveDay: dayOf(now), Amount: amount, Status: 'Signed', Text: signLetter(mod, by, date), SignedBy: by, SignedAt: now }])
      }
      const decision: OptionDecisionRecord = { outcome, period: pkg.name, months: outcome === 'Exercised' ? (pkg.kind === 'extension' ? months : pkg.proposal.months) : 0,
        start, end, amount: outcome === 'Exercised' ? amount : 0, bilateral, decisionId: pkg.ids.decision, letterId: pkg.ids.letter,
        modificationId: outcome === 'Exercised' ? pkg.ids.modification : undefined, number: outcome === 'Exercised' ? pkg.modification : undefined,
        appropriation: funds?.appropriation, document: funds?.document, reason: reason.trim().slice(0, 300) || undefined, by, at: now }
      await backend.upsert('schedule', 'ScheduleId', [{ ScheduleId: row.ScheduleId, SolicitationId: id, ReviewJson: JSON.stringify({ ...pkg, decision }) }])
      await backend.upsert('audit', 'EventId', [auditRow(id, row.ScheduleId, 'OptionDecisionSigned', actorOf(co, t.id), summary)])
      const patch = { decision: outcome, notes: reason.trim() }
      update(patch)
      await backend.complete('Submit', { ...task.data, ...patch })
      backend.notify(outcome === 'Exercised' ? `Signed. The notice and modification ${pkg.modification} go out now.` : outcome === 'Notice sent' ? 'Signed. The preliminary notice goes out now.' : 'Signed. The decision is filed now.', 'success')
    } catch (e) { backend.notify(`Could not sign: ${(e as Error).message}`, 'error') } finally { setBusy(false) }
  }

  const w = pkg.writer
  const footerNote = !outcome ? 'Choose what to do.' : !allowed(outcome) ? (funds?.status === 'Planned' ? 'Funds are planned, not certified: an exercise needs certified funds.' : 'The funds the Resource Manager gave don’t cover this.')
    : !monthsOk ? `Funds are certified for ${certifiedMonths} month${certifiedMonths === 1 ? '' : 's'}.` : outcome === 'Not exercised' && reason.trim().length <= 10 ? 'Give the reason.'
      : signature.trim().length <= 2 ? 'Type your name to sign.' : `Signing ${outcome === 'Exercised' ? `issues modification ${pkg.modification} and the notice` : 'sends the notice'}, dated today.`

  return (
    <FormShell eyebrow="Option decision" title={`${pkg.title}${pkg.stage === 'preliminary' ? ': preliminary notice' : ''}`} subtitle={`${pkg.contract.number} · ${pkg.contract.contractor}`}
      who={co} readOnly={task.isReadOnly} certify={false}
      footer={<>
        <span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">{footerNote}</span>
        <Button disabled={!ready || busy} onClick={sign}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PenLine className="mr-1.5 h-4 w-4" />}Sign and issue</Button>
      </>}>
      {pkg.late && (
        <div className="flex gap-3 rounded-2xl border border-[var(--ss-critical)]/40 bg-[var(--ss-critical)]/8 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ss-critical)]" />
          <p>The notice window closed {showDay(pkg.noticeBy)}. A unilateral exercise is no longer available: an exercise now is a bilateral modification that needs {pkg.contract.contractor}'s agreement, and counsel should check whether part 6 then applies.</p>
        </div>
      )}

      <Panel title="What you're deciding" icon={<Scale className="h-4 w-4 text-[var(--ss-brand-2)]" />} actions={<Deadline pkg={pkg} />}
        description={pkg.clauseText ?? row.ClauseText}>
        <div className="space-y-4">
          <Proposal pkg={pkg} />
          {w?.recommendation && (
            <div className="flex gap-3 rounded-xl bg-muted/50 p-3 text-sm">
              <AgentMark />
              <div className="min-w-0 space-y-1">
                <p><span className="font-medium">The agent recommends: {w.recommendation.toLowerCase()}{w.recommendedMonths ? `, ${w.recommendedMonths} month${w.recommendedMonths === 1 ? '' : 's'}` : ''}.</span> {w.reason}</p>
                {w.summary && <p className="text-muted-foreground">{w.summary}</p>}
                {(w.risks ?? []).length > 0 && <ul className="list-disc pl-5 text-muted-foreground">{w.risks!.map((r) => <li key={r}>{r}</li>)}</ul>}
              </div>
            </div>
          )}
          {w && !w.agent && <p className="text-sm text-muted-foreground">The writer agent was unavailable, so each finding is the robot's own reading of its check.</p>}
        </div>
      </Panel>

      <Panel title="Before exercising" icon={<ListChecks className="h-4 w-4 text-[var(--ss-brand-2)]" />}
        description={`What FAR 17.204-1(b)${pkg.contract.dod ? ' and DFARS 217.207(c)' : ''} ask you to confirm, gathered by the robot with its source.`}>
        <CheckList pkg={pkg} />
      </Panel>

      <Panel title="Determination and findings" icon={<FileSignature className="h-4 w-4 text-primary" />}
        description={`Drafted from the checks; the agent wrote the existing need, performance and price findings. Edit any of it. ${FUNDS_FILL} and ${DETERMINATION_FILL} are filled in when you sign.`}>
        <textarea className={`${textareaCls} ss-doc leading-6`} rows={18} value={memo} disabled={task.isReadOnly} onChange={(e) => setMemo(e.target.value)} aria-label="Determination and findings" />
        {(!memo.includes(FUNDS_FILL) || !memo.includes(DETERMINATION_FILL)) && <p className="mt-2 text-xs text-[var(--ss-critical)]">Keep {FUNDS_FILL} and {DETERMINATION_FILL} in the text: they're filled from the certification and your decision.</p>}
      </Panel>

      <Panel title="Your decision" description="You decide. The robot files what you sign.">
        <div className="space-y-4">
          <div role="radiogroup" aria-label="Decision" className="flex flex-wrap gap-2">
            {choices.map((c) => (
              <button key={c.outcome} type="button" role="radio" aria-checked={outcome === c.outcome} disabled={task.isReadOnly || !allowed(c.outcome)} onClick={() => setOutcome(c.outcome)}
                title={allowed(c.outcome) ? undefined : c.needs === 'Planned' ? 'Needs funds at least planned' : 'Needs certified funds'}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${outcome === c.outcome ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/50'}`}>
                {c.label}{c.outcome === 'Exercised' && bilateral ? ' (bilateral)' : ''}
              </button>
            ))}
          </div>
          {outcome === 'Exercised' && pkg.kind === 'extension' && (
            <Field label="Length" hint={`Funds are certified for ${certifiedMonths} month${certifiedMonths === 1 ? '' : 's'}; ${pkg.extension?.remaining} remain under the clause.`}>
              <select className={`${textareaCls} max-w-[16rem]`} value={months} disabled={task.isReadOnly} onChange={(e) => setMonths(Number(e.target.value))}>
                {Array.from({ length: Math.max(1, Math.min(pkg.extension?.remaining ?? 0, certifiedMonths)) }, (_, i) => i + 1).map((n) =>
                  <option key={n} value={n}>{n} month{n === 1 ? '' : 's'}, to {showDay(endAfter(pkg.proposal.start, n))}</option>)}
              </select>
            </Field>
          )}
          {outcome === 'Exercised' && <LineTable pkg={pkg} months={months} />}
          {outcome && (
            <Field label={outcome === 'Not exercised' ? 'Reason' : 'Note (optional)'} hint={outcome === 'Not exercised' ? 'It goes into the determination and the record.' : undefined}>
              <textarea className={textareaCls} rows={3} value={reason} disabled={task.isReadOnly} onChange={(e) => setReason(e.target.value)}
                placeholder={outcome === 'Not exercised' ? 'The follow-on contractor takes over Jan 1, 2027, so the services are not needed past Dec 31.' : ''} />
            </Field>
          )}
          {outcome && (
            <div>
              <Button size="sm" variant="outline" onClick={() => setShowDocs(!showDocs)} aria-expanded={showDocs}>
                {showDocs ? 'Hide' : 'Show'} what you'll sign<ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${showDocs ? 'rotate-180' : ''}`} />
              </Button>
              {showDocs && (
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <pre className="ss-doc whitespace-pre-wrap rounded-xl border border-border bg-background p-4 text-xs leading-5">{letter?.text}</pre>
                  {mod && <pre className="ss-doc whitespace-pre-wrap rounded-xl border border-border bg-background p-4 text-xs leading-5">{mod}</pre>}
                  <pre className="ss-doc whitespace-pre-wrap rounded-xl border border-border bg-background p-4 text-xs leading-5 lg:col-span-2">{signedMemo}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Signature">
        <div className="flex flex-wrap items-center gap-4">
          <PersonaAvatar id={co.id} short={co.short} size={44} />
          <div className="min-w-0 flex-1">
            <Field label="Type your full name to sign" hint="Signing dates and signs the determination, the notice and any modification with your name.">
              <input className={`${textareaCls} max-w-md font-[cursive] text-lg`} value={signature} maxLength={120} disabled={task.isReadOnly} onChange={(e) => setSignature(e.target.value)} placeholder={co.name} />
            </Field>
          </div>
        </div>
      </Panel>
    </FormShell>
  )
}
