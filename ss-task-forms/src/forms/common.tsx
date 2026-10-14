import { createContext, useContext, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Check, Lock, ShieldCheck } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import robot from '../assets/uipath-robot.png'
import { PersonaAvatar } from '../components/Flair'
import { ratingTip } from '../components/Bits'
import type { Backend, LoadedTask, TaskData } from '../lib/backend'
import { look, lookOf, methodOf, scaleOf } from '../lib/ratings'
import { TermsProvider, frameworkOf, titled, useTerms } from '../lib/terms'
import type { Framework } from '../lib/terms'
import { evaluatorBySlot } from '../lib/types'
import type { Dataset, Factor, Persona, Plan, Solicitation } from '../lib/types'

export interface FormCtx {
  backend: Backend
  task: LoadedTask
  data: Dataset
  sol: Solicitation
  plan: Plan
  update: (patch: Partial<TaskData>) => void
  reload: () => Promise<void>
}

const Ctx = createContext<FormCtx | undefined>(undefined)

/** The task, its record and plan for the forms inside, shown in the plan's framework (federal or State & Local). */
export function FormProvider({ value, children }: { value: FormCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}><TermsProvider framework={frameworkOf(value.plan)}>{children}</TermsProvider></Ctx.Provider>
}
export function useForm() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useForm outside FormProvider')
  return c
}

export const nowIso = () => new Date().toISOString()

/**
 * Agent-drafted text names evaluators by panel slot (E1–E3) and findings by id, because the agents work from a compact
 * hand-off (CompileEvaluations keeps it under Orchestrator's 10k input cap). Show people's names and drop the ids.
 */
export function withEvaluatorNames(text?: string | null) {
  if (!text) return ''
  return text
    .replace(/\s*\((?:[A-Za-z0-9]+-)+[A-Za-z0-9]+(?:\s*[,;]\s*(?:[A-Za-z0-9]+-)+[A-Za-z0-9]+)*\)/g, '')
    .replace(/\bE([1-3])\b/g, (_, n: string) => evaluatorBySlot(Number(n))?.name ?? `Evaluator ${n}`)
}

export function auditRow(sol: string, ref: string, action: string, actor: string, detail: string) {
  return { EventId: `${sol}-${ref}-${action}-${Date.now()}`, SolicitationId: sol, EntityRef: ref, Action: action, Actor: actor, OccurredAt: nowIso(), Detail: detail }
}

/** How a person is named in the audit trail: evaluators by slot ("Evaluator 2"), officials by their title in the framework. */
export const actorOf = (p: Persona, fw: Framework = 'federal') => (p.slot != null ? `Evaluator ${p.slot}` : titled(p, fw).label)

/**
 * The per-solicitation certification, signed by the person themselves before any proposal content is shown: no
 * conflict of interest with these offerors, and source selection information protected (FAR 3.104). Asked once per
 * person per solicitation and kept in the audit trail. Annual certifications live on the person's profile instead.
 */
function ConflictGate({ who, onCertified }: { who: Persona; onCertified: () => void }) {
  const { backend, data, sol } = useForm()
  const t = useTerms()
  const protect = t.sled
    ? `Proposal contents and scores will be kept confidential until the Board acts on the award (${t.rulesCite}).`
    : 'Source selection information will be protected (FAR 3.104).'
  const [busy, setBusy] = useState(false)
  const offerors = data.offerors.filter((o) => o.SolicitationId === sol.SolicitationId).map((o) => o.Name).sort()
  const certify = async () => {
    setBusy(true)
    try {
      await backend.upsert('audit', 'EventId', [auditRow(sol.SolicitationId, 'case', 'ConflictCertified', actorOf(who, t.id),
        `No conflict of interest with ${offerors.join(', ')}. ${protect}`)])
      onCertified()
    } catch (e) {
      backend.notify(`Could not record your certification: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel title="Before you open the proposals" icon={<ShieldCheck className="h-4 w-4 text-[var(--ss-good)]" />}
      description={`Confirm once for this ${t.process}. Your answer is recorded in the audit trail.`}>
      <div className="space-y-4 text-sm">
        <p>I, <span className="font-semibold">{who.name}</span>, certify that I have no financial interest in, employment discussions with, or other conflict of interest involving these {t.offerors}:</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {offerors.map((n) => <li key={n} className="rounded-lg border border-border px-3 py-2 font-medium">{n}</li>)}
        </ul>
        <p className="text-muted-foreground">{t.sled
          ? <>I will keep proposal contents and scores confidential under the {t.rulesCite.toLowerCase()} and the confidentiality agreement for {sol.SolicitationId}, </>
          : <>I will protect source selection information under FAR 3.104 and the non-disclosure agreement for {sol.SolicitationId}, </>}
          {who.id === 'co' ? 'and I’ll disclose any conflict that arises and step aside.' : `and I’ll tell the ${t.co} at once if a conflict arises.`}</p>
        <Button onClick={certify} disabled={busy}><ShieldCheck className="mr-1.5 h-4 w-4" />{busy ? 'Recording…' : 'Certify and continue'}</Button>
      </div>
    </Panel>
  )
}

/** Gradient header with who the task is for, scrollable body, sticky outcome footer. */
export function FormShell({ eyebrow, title, subtitle, who: person, children, footer, readOnly }: {
  eyebrow: string; title: string; subtitle: string; who: Persona; children: ReactNode; footer: ReactNode; readOnly?: boolean
}) {
  const { data, sol } = useForm()
  const t = useTerms()
  const who = titled(person, t.id)
  const [certified, setCertified] = useState(false)
  const onFile = data.audit.some((e) => e.SolicitationId === sol.SolicitationId && e.Action === 'ConflictCertified' && e.Actor === actorOf(who, t.id))
  // Completed (read-only) tasks never ask; open ones ask once per person per solicitation.
  const gated = !readOnly && !onFile && !certified
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="ss-hero sheen px-6 py-5">
        <div className="relative z-10 mx-auto flex max-w-6xl items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="ss-rise text-xs font-semibold uppercase tracking-[0.14em] text-white/75">{eyebrow}</p>
            <h1 className="ss-rise truncate text-xl font-semibold tracking-tight md:text-2xl" style={{ ['--d' as string]: '.08s' }}>{title}</h1>
            <p className="ss-rise truncate text-sm text-white/80" style={{ ['--d' as string]: '.16s' }}>{subtitle}</p>
          </div>
          <div className="ss-hero-tile ss-rise flex shrink-0 items-center gap-3 rounded-2xl py-2 pl-2 pr-4" style={{ ['--d' as string]: '.2s' }}>
            <PersonaAvatar id={who.id} short={who.short} size={42} />
            <div className="hidden min-w-0 sm:block">
              <div className="truncate text-sm font-semibold">{who.name}</div>
              <div className="flex items-center gap-1 truncate text-xs text-white/80">{readOnly && <Lock className="h-3 w-3" />}{readOnly ? 'Read only' : who.label}</div>
            </div>
          </div>
        </div>
      </header>
      <main className="ss-backdrop flex-1">
        <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-6">{gated ? <ConflictGate who={who} onCertified={() => setCertified(true)} /> : children}</div>
      </main>
      <footer className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-2 px-4 py-3 md:px-6">{gated ? <span className="text-sm text-muted-foreground">Certify above to open this task.</span> : footer}</div>
      </footer>
    </div>
  )
}

/** The robot stands in for an agent wherever its work is shown next to people's. */
export function AgentMark({ size = 22 }: { size?: number }) {
  return <img src={robot} alt="" className="shrink-0 object-contain" style={{ width: size, height: size }} />
}

export function Panel({ title, description, icon, actions, children, className = '' }: {
  title: string; description?: string; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`ss-in rounded-2xl border border-border bg-card ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

export const textareaCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60'

/**
 * Arrow-key movement for a radio group or tab list (roving focus): Left/Up and Right/Down step, Home/End jump.
 * Returns the index to select, or undefined for other keys.
 */
export function rovingKey(e: KeyboardEvent<HTMLElement>, index: number, count: number): number | undefined {
  const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (index + 1) % count
    : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (index - 1 + count) % count
    : e.key === 'Home' ? 0 : e.key === 'End' ? count - 1 : undefined
  if (next === undefined) return undefined
  e.preventDefault()
  const items = e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"], [role="tab"]')
  requestAnimationFrame(() => items?.[next]?.focus())
  return next
}

/** Single-choice pill: the chosen one is checked, ringed in primary, bold and raised; the rest recede once a choice exists. */
export const choiceCls = (on: boolean, chosen: boolean) => on
  ? 'border-transparent font-bold shadow-md -translate-y-px ring-2 ring-primary ring-offset-2 ring-offset-background'
  : `border-border bg-background font-medium hover:bg-muted ${chosen ? 'opacity-70 hover:opacity-100 focus-visible:opacity-100' : ''}`

/** The factor's scale as selectable pills, best first, shown in the plan's rating method. Stores the scale label. */
export function RatingPicker({ plan, factor, value, onChange, disabled, note }: {
  plan: Plan; factor: Factor; value?: string; onChange: (v: string) => void; disabled?: boolean; note?: (official: string) => ReactNode
}) {
  const m = methodOf(plan)
  const t = useTerms()
  const scale = scaleOf(plan, factor)
  const chosen = !!value && scale.includes(value)
  return (
    <div className="flex flex-wrap gap-2 py-1" role="radiogroup" aria-label={`${factor.name} ${t.rating}`}>
      {scale.map((official, i) => {
        const l = look(m, i, official, lookOf(plan, factor))
        const on = official === value
        return (
          <button key={official} type="button" role="radio" aria-checked={on} disabled={disabled} title={ratingTip(m, l, factor.weight)}
            tabIndex={on || (!chosen && i === 0) ? 0 : -1}
            onClick={() => onChange(official)}
            onKeyDown={(e) => { const k = rovingKey(e, i, scale.length); if (k !== undefined && !disabled) onChange(scale[k]) }}
            className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-1.5 text-xs transition ${choiceCls(on, chosen)}`}
            style={on ? { background: l.bg, color: l.fg } : undefined}>
            <span className="flex items-center gap-1.5">
              {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.bg, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)' }} aria-hidden />}
              {m === 'points' ? <>{l.word}<span className="font-normal tabular-nums opacity-90">{l.text} pts</span></> : <>
                {l.text}
                {m !== 'adjectival' && <span className="font-normal opacity-90">{l.word}</span>}
              </>}
            </span>
            {note?.(official)}
          </button>
        )
      })}
    </div>
  )
}

/** A plain single-choice pill group (e.g. finding kind), styled like the rating picker. */
export function ChoiceGroup({ label, options, value, onChange, disabled }: {
  label: string; options: string[]; value?: string; onChange: (v: string) => void; disabled?: boolean
}) {
  const chosen = !!value && options.includes(value)
  return (
    <div className="flex flex-wrap gap-2 py-1" role="radiogroup" aria-label={label}>
      {options.map((o, i) => {
        const on = o === value
        return (
          <button key={o} type="button" role="radio" aria-checked={on} disabled={disabled} tabIndex={on || (!chosen && i === 0) ? 0 : -1}
            onClick={() => onChange(o)} onKeyDown={(e) => { const k = rovingKey(e, i, options.length); if (k !== undefined && !disabled) onChange(options[k]) }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${choiceCls(on, chosen)} ${on ? 'bg-primary text-primary-foreground' : ''}`}>
            {on && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}{o}
          </button>
        )
      })}
    </div>
  )
}
