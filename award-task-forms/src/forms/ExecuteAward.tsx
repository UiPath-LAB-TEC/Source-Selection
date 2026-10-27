import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, Check, ChevronDown, CircleAlert, FileSignature, Mail, PenLine } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Field, FormShell, Panel, actorOf, auditRow, nowIso, textareaCls, useForm } from '@forms/forms/common'
import { OfferorAvatar, PersonaAvatar } from '@forms/components/Flair'
import { Pill } from '@forms/components/Bits'
import { titled, useTerms } from '@forms/lib/terms'
import { persona } from '@forms/lib/types'
import type { Offeror } from '@forms/lib/types'
import { addCalendarDays, dayOf } from '../lib/clocks'
import { AWARD_STAGES, KIND, kindLabel, noticeChecks, signLetter } from '../lib/record'
import type { Correspondence } from '../lib/record'

const money = (n?: number) => (n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }))
const longDate = (d: Date) => d.toLocaleDateString('en-US', { dateStyle: 'long' })
const shortDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const cover = (o: Offeror) => { try { return (JSON.parse((o as unknown as { ExtractionJson?: string }).ExtractionJson ?? '{}').cover ?? {}) as { address?: string } } catch { return {} } }
const lines = (o: Offeror) => { try { return JSON.parse(o.PriceLinesJson ?? '[]') as { clin: string; description: string; amount: number }[] } catch { return [] } }

/**
 * The Contracting Officer executes the contract award and releases the notices in one signature. The award robot drafted
 * both from the record (an SSDecision of Kind Contract and one SSCorrespondence notice per offeror); the CO reviews and
 * may edit each notice, every notice must still carry its required contents, and signing dates and signs every document.
 * The notices robot then files them and starts the clocks.
 */
export function ExecuteAward() {
  const { backend, task, data, sol, plan, update } = useForm()
  const t = useTerms()
  const co = titled(persona('co'), t.id)
  const contract = data.decisions.find((d) => d.Kind === 'Contract')
  const awardee = data.offerors.find((o) => o.Name === sol.AwardeeName)
  const notices = useMemo(() => ((data.correspondence ?? []) as unknown as Correspondence[])
    .filter((c) => c.Kind === KIND.awardNotice || c.Kind === KIND.notice)
    .sort((a, b) => Number(b.Kind === KIND.awardNotice) - Number(a.Kind === KIND.awardNotice) || a.OfferorId.localeCompare(b.OfferorId)), [data.correspondence])
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(notices.map((c) => [c.CorrespondenceId, c.Text ?? ''])))
  const [approved, setApproved] = useState<Set<string>>(() => new Set(notices.filter((c) => c.Status !== 'Draft').map((c) => c.CorrespondenceId)))
  const [open, setOpen] = useState<string | undefined>(notices.find((c) => c.Kind === KIND.notice)?.CorrespondenceId)
  const [showDoc, setShowDoc] = useState(false)
  const [signature, setSignature] = useState('')
  const [busy, setBusy] = useState(false)
  // The day the CO opened the task: the clocks this form previews start today if they sign now.
  const [today] = useState(() => dayOf(new Date().toISOString()))

  if (!contract?.DocumentText || !awardee || !notices.length) {
    return (
      <FormShell eyebrow="Contract award" title={plan.title} subtitle={sol.SolicitationId} who={co} readOnly={task.isReadOnly} footer={null}>
        <Panel title="Nothing to sign yet" icon={<CircleAlert className="h-4 w-4 text-[var(--ss-warn)]" />}>
          <p className="text-sm text-muted-foreground">The award robot drafts the contract award and the notices before this task opens, and none are on the record for {sol.SolicitationId}. Retry the award step in Maestro, then reopen the task.</p>
        </Panel>
      </FormShell>
    )
  }

  const contractNumber = /Contract number:\s*(\S+)/.exec(contract.DocumentText)?.[1] ?? ''
  const name = (id: string) => data.offerors.find((o) => o.OfferorId === id)?.Name ?? id
  const unsuccessful = notices.filter((c) => c.Kind === KIND.notice).map((c) => name(c.OfferorId))
  const checks = (c: Correspondence) => noticeChecks(c.Kind, texts[c.CorrespondenceId] ?? '', { name: awardee.Name, address: cover(awardee).address ?? '' },
    contractNumber, c.Kind === KIND.notice ? unsuccessful.filter((n) => n !== name(c.OfferorId)) : [])
  const failing = notices.filter((c) => checks(c).some((x) => !x.ok))
  const pending = notices.filter((c) => !approved.has(c.CorrespondenceId))
  const ready = !task.isReadOnly && !failing.length && !pending.length && signature.trim().length > 2

  const toggle = (id: string) => setApproved((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const edit = (id: string, text: string) => {
    setTexts((x) => ({ ...x, [id]: text }))
    setApproved((s) => { const n = new Set(s); n.delete(id); return n }) // an edited notice is approved again after the edit
  }

  const sign = async () => {
    if (!ready) return
    setBusy(true)
    try {
      const date = longDate(new Date())
      const by = signature.trim()
      const id = sol.SolicitationId
      await backend.upsert('decisions', 'DecisionId', [{ DecisionId: contract.DecisionId, SolicitationId: id, Kind: 'Contract', Outcome: 'Awarded',
        Rationale: contract.Rationale, DecidedBy: actorOf(co, t.id), DecidedAt: nowIso(), DocumentText: signLetter(contract.DocumentText!, by, date) }])
      await backend.upsert('correspondence', 'CorrespondenceId', notices.map((c) => ({ CorrespondenceId: c.CorrespondenceId, SolicitationId: id,
        Text: signLetter(texts[c.CorrespondenceId], by, date), Status: 'Approved' })))
      await backend.upsert('awards', 'AwardId', [{ AwardId: `${id}-award`, SolicitationId: id, Stage: AWARD_STAGES.federal[1] }])
      await backend.upsert('audit', 'EventId', [auditRow(id, 'award', 'ContractAwardSigned', actorOf(co, t.id),
        `Contract ${contractNumber} to ${awardee.Name}, ${money(awardee.TotalEvaluatedPrice)}; ${notices.length} notices approved for release`)])
      const patch = { decision: 'Signed', payload: contractNumber }
      update(patch)
      await backend.complete('Submit', { ...task.data, ...patch })
      backend.notify('Contract award signed. The notices go out now.', 'success')
    } catch (e) { backend.notify(`Could not sign: ${(e as Error).message}`, 'error') } finally { setBusy(false) }
  }

  const footerNote = failing.length
    ? <><AlertTriangle className="h-3.5 w-3.5 text-[var(--ss-critical)]" />{failing.length} notice{failing.length > 1 ? 's are' : ' is'} missing required contents.</>
    : pending.length ? <>Approve {pending.length === notices.length ? 'each notice' : `the ${pending.length} remaining notice${pending.length > 1 ? 's' : ''}`} to sign.</>
      : <>Signing executes the contract and releases every notice, dated today.</>

  return (
    <FormShell eyebrow="Contract award" title={plan.title} who={co} readOnly={task.isReadOnly}
      subtitle={`${sol.SolicitationId} → contract ${contractNumber}`}
      footer={<>
        <span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">{footerNote}</span>
        <Button disabled={!ready || busy} onClick={sign}><PenLine className="mr-1.5 h-4 w-4" />Sign award and release notices</Button>
      </>}>
      <Panel title="Contract award" icon={<FileSignature className="h-4 w-4 text-primary" />}
        description="Drafted by the award robot from the signed source selection decision and the awardee's price proposal."
        actions={<Button size="sm" variant="outline" onClick={() => setShowDoc(!showDoc)} aria-expanded={showDoc}>
          {showDoc ? 'Hide' : 'Show'} the award document<ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${showDoc ? 'rotate-180' : ''}`} />
        </Button>}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <dl className="grid content-start gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Contract number</dt><dd className="font-mono text-base font-semibold">{contractNumber}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Contractor</dt>
              <dd className="font-medium">{awardee.Name}</dd><dd className="text-muted-foreground">{cover(awardee).address}</dd>
              <dd className="text-xs text-muted-foreground">UEI {awardee.UEI} · CAGE {awardee.CAGE}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Contract type</dt><dd>{plan.contractType}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Total contract price</dt><dd className="text-2xl font-semibold tabular-nums">{money(awardee.TotalEvaluatedPrice)}</dd></div>
          </dl>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[360px] text-sm">
              <thead><tr className="bg-muted/40 text-left text-xs text-muted-foreground"><th className="px-3 py-2 font-medium">CLIN</th><th className="px-3 py-2 font-medium">Description</th><th className="px-3 py-2 text-right font-medium">Amount</th></tr></thead>
              <tbody>
                {lines(awardee).map((l) => <tr key={l.clin} className="border-t border-border"><td className="px-3 py-2 font-mono text-xs">{l.clin}</td><td className="px-3 py-2">{l.description}</td><td className="px-3 py-2 text-right tabular-nums">{money(l.amount)}</td></tr>)}
                <tr className="border-t border-border font-semibold"><td className="px-3 py-2" colSpan={2}>Total</td><td className="px-3 py-2 text-right tabular-nums">{money(awardee.TotalEvaluatedPrice)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        {showDoc && <pre className="ss-doc mt-4 whitespace-pre-wrap rounded-xl border border-border bg-background p-4 text-sm leading-6">{contract.DocumentText}</pre>}
      </Panel>

      <Panel title="Notices to offerors" icon={<Mail className="h-4 w-4 text-primary" />}
        description="Due within 3 days after award (FAR 15.207-2). Edit the wording if you need to; every notice must keep its required contents, and you approve each one.">
        <div className="space-y-3">
          {notices.map((c, i) => {
            const list = checks(c)
            const ok = list.every((x) => x.ok)
            const isOpen = open === c.CorrespondenceId
            const on = approved.has(c.CorrespondenceId)
            return (
              <div key={c.CorrespondenceId} className={`rounded-xl border ${on ? 'border-[var(--ss-good)]/50' : 'border-border'} bg-background/60`}>
                <div className="flex flex-wrap items-center gap-3 p-3">
                  <button type="button" onClick={() => setOpen(isOpen ? undefined : c.CorrespondenceId)} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <OfferorAvatar name={name(c.OfferorId)} index={i} size={30} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{name(c.OfferorId)}</span>
                      <span className="block text-xs text-muted-foreground">{kindLabel(c.Kind)}{c.Kind === KIND.notice ? ` · debriefing requests due ${shortDay(addCalendarDays(today, 3))} if sent today` : ''}</span>
                    </span>
                    <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {!ok && <Pill icon={<AlertTriangle className="h-3 w-3" />} color="var(--ss-critical)">Missing contents</Pill>}
                  <Button size="sm" variant={on ? 'default' : 'outline'} disabled={task.isReadOnly || !ok} onClick={() => toggle(c.CorrespondenceId)} aria-pressed={on}>
                    {on ? <><Check className="mr-1 h-3.5 w-3.5" />Approved</> : 'Approve'}
                  </Button>
                </div>
                {isOpen && (
                  <div className="space-y-3 border-t border-border p-3">
                    <ul className="flex flex-wrap gap-1.5" aria-label="Required contents">
                      {list.map((x) => (
                        <li key={x.label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${x.ok ? 'bg-[var(--ss-good)]/12 text-foreground' : 'bg-[var(--ss-critical)]/12 font-medium text-[var(--ss-critical)]'}`}>
                          {x.ok ? <Check className="h-3 w-3 text-[var(--ss-good)]" /> : <AlertTriangle className="h-3 w-3" />}{x.label}
                        </li>
                      ))}
                    </ul>
                    <textarea className={`${textareaCls} ss-doc leading-6`} rows={14} value={texts[c.CorrespondenceId]} disabled={task.isReadOnly}
                      onChange={(e) => edit(c.CorrespondenceId, e.target.value)} aria-label={`${kindLabel(c.Kind)} to ${name(c.OfferorId)}`} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel title="What starts when you sign" icon={<CalendarClock className="h-4 w-4 text-primary" />}
        description="Counted in calendar days; a deadline on a weekend or federal holiday moves to the next business day (FAR 33.102(a)).">
        <ul className="grid gap-3 text-sm sm:grid-cols-3">
          <li><span className="block text-xs text-muted-foreground">Notices delivered</span><span className="font-medium">Today, {shortDay(today)}</span></li>
          <li><span className="block text-xs text-muted-foreground">Debriefing requests due</span><span className="font-medium">{shortDay(addCalendarDays(today, 3))}</span><span className="block text-xs text-muted-foreground">3 days after the notice (FAR 15.301-1)</span></li>
          <li><span className="block text-xs text-muted-foreground">Protest window for a stay</span><span className="font-medium">{shortDay(addCalendarDays(today, 10))}</span><span className="block text-xs text-muted-foreground">10 days after award, or later after a debriefing (31 U.S.C. 3553(d)(4))</span></li>
        </ul>
      </Panel>

      <Panel title="Signature">
        <div className="flex flex-wrap items-center gap-4">
          <PersonaAvatar id={co.id} short={co.short} size={44} />
          <div className="min-w-0 flex-1">
            <Field label="Type your full name to sign" hint="Signing records the contract award and each notice, with your name and today's date, in the award record.">
              <input className={`${textareaCls} max-w-md font-[cursive] text-lg`} value={signature} maxLength={120} disabled={task.isReadOnly} onChange={(e) => setSignature(e.target.value)} placeholder={co.name} />
            </Field>
          </div>
        </div>
      </Panel>
    </FormShell>
  )
}
