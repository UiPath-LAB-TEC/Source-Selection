import { useEffect, useRef, useState } from 'react'
import { BadgeDollarSign, Check, ChevronsUpDown, ClipboardCheck, FileSearch, Gavel, Inbox, Landmark, Loader2, LockKeyhole, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { Alert, AlertDescription } from '@uipath/apollo-wind/components/ui/alert'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@uipath/apollo-wind/components/ui/popover'
import robot from '../assets/uipath-robot.png'
import { ProductOrbit } from './ProductOrbit'
import { PersonaAvatar } from './Flair'
import { rememberPersona, storedPersona } from '../hooks/usePersona'
import { FrameworkSwitch } from './FrameworkSwitch'
import { stageName, titled, useTerms } from '@forms/lib/terms'
import { ALL_PERSONAS, STAGES } from '../lib/types'
import type { PersonaId } from '../lib/types'

const ICONS = [Inbox, ClipboardCheck, Users, BadgeDollarSign, Gavel]

/** Horizontal stage track for the dark brand panel; the robot hops station to station. */
function HeroJourney() {
  const t = useTerms()
  const WHO = [t.co, 'Evaluators', t.chair, t.co, t.ssa]
  const [i, setI] = useState(0)
  const [hop, setHop] = useState(0)
  const reduced = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    if (reduced.current) return
    const t = setTimeout(() => { setI((n) => (n + 1) % STAGES.length); setHop((h) => h + 1) }, 2200)
    return () => clearTimeout(t)
  }, [i])
  const pct = (n: number) => 10 + (n * 80) / (STAGES.length - 1)
  return (
    <div className="ss-hj relative h-[140px] w-full max-w-2xl">
      <div className="ss-track"><div className="ss-track-fill" style={{ width: `${(i / (STAGES.length - 1)) * 100}%` }} /></div>
      <div className="ss-runner" style={{ left: `${pct(i)}%` }} aria-hidden="true">
        <div key={hop} className={hop ? 'hop' : 'idle'}><img src={robot} alt="" /><div className="ss-runner-shadow" /></div>
      </div>
      <ol className="absolute inset-x-0 top-[14px] flex">
        {STAGES.map((s, n) => {
          const Icon = ICONS[n]
          const on = n === i
          return (
            <li key={s} className="flex min-w-0 flex-1 flex-col items-center text-center">
              <span className={`ss-station ${on ? 'on bg-white text-[var(--ss-brand-1)]' : n < i ? 'bg-white/35 text-white' : 'bg-white/12 text-white/70'}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className={`mt-2 w-full text-balance px-1 text-xs leading-tight ${on ? 'font-semibold text-white' : 'text-white/75'}`}>{stageName(s, t.id)}</span>
              <span className={`mt-0.5 w-full text-balance px-1 text-[10px] leading-tight transition-colors ${on ? 'text-white/85' : 'text-white/0'}`}>{WHO[n]}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Demo: one UiPath account plays every role — pick the persona to start as. */
function PersonaPicker({ value, onChange, disabled }: { value: PersonaId; onChange: (id: PersonaId) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const t = useTerms()
  const people = ALL_PERSONAS.map((p) => titled(p, t.id))
  const current = people.find((p) => p.id === value)!
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" id="ss-signin-as">Sign in as</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" disabled={disabled} aria-labelledby="ss-signin-as"
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2.5 text-left hover:bg-muted/60 disabled:opacity-60">
            <PersonaAvatar id={current.id} short={current.short} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{current.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{current.label}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-1.5">
          {people.map((p) => (
            <button key={p.id} type="button" onClick={() => { onChange(p.id); setOpen(false) }}
              className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted ${p.id === value ? 'bg-muted' : ''}`}>
              <PersonaAvatar id={p.id} short={p.short} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.label}</span>
              </span>
              {p.id === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  )
}

/**
 * `still` skips the entrance animations: on the way back from the UiPath redirect the page should look exactly as it
 * did when you left it, not replay its intro. `status` replaces "Signing you in…" while busy.
 */
export function LoginScreen({ onLogin, error, busy = false, still = false, status }: {
  onLogin: () => void; error: string | null; busy?: boolean; still?: boolean; status?: string
}) {
  const [as, setAs] = useState<PersonaId>(storedPersona)
  const who = ALL_PERSONAS.find((p) => p.id === as)!
  const choose = (id: PersonaId) => { setAs(id); rememberPersona(id) }
  const t = useTerms()
  return (
    <div className={`grid min-h-screen bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_480px] ${still ? 'ss-still' : ''}`}>
      <section className="ss-hero sheen flex flex-col justify-between gap-10 p-8 md:p-12">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/30"><Landmark className="h-5 w-5" /></div>
          <div className="leading-tight">
            <div className="font-semibold">{t.sled ? 'RFP Evaluation' : 'Source Selection'}</div>
            <div className="text-xs text-white/75">{t.sled ? 'Agentic Procurement' : 'Agentic Acquisition'} on UiPath</div>
          </div>
        </div>

        <div className="relative z-10 grid items-center gap-10 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-5">
            <p className="ss-rise inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/25"><Sparkles className="h-3.5 w-3.5" />Agentic {t.process}</p>
            <h1 className="ss-rise max-w-xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl" style={{ ['--d' as string]: '.08s' }}>
              {t.sled ? 'Scored, defensible awards your Board can approve.' : 'Best-value awards with a protest-ready record.'}
            </h1>
            <p className="ss-rise max-w-lg text-lg text-white/85" style={{ ['--d' as string]: '.16s' }}>
              Agents draft findings cited to the proposal page. Evaluators, the {t.chair} and the {t.ssa} decide. Every {t.rating} traces back to the evidence.
            </p>
          </div>
          <div className="ss-rise hidden xl:block" style={{ ['--d' as string]: '.2s' }}><ProductOrbit /></div>
        </div>

        <div className="ss-rise relative z-10" style={{ ['--d' as string]: '.3s' }}><HeroJourney /></div>
      </section>

      <section className="flex items-center justify-center p-8">
        <div className="ss-in w-full max-w-sm space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">Use your UiPath account, then work the {t.process} as the persona you pick.</p>
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Workspace</span>
            <FrameworkSwitch disabled={busy} />
          </div>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <PersonaPicker value={as} onChange={choose} disabled={busy} />
          <Button onClick={onLogin} disabled={busy} aria-busy={busy} className="h-11 w-full text-base">
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{status ?? 'Signing you in…'}</> : <><LockKeyhole className="mr-2 h-4 w-4" />Sign in as {who.name}</>}
          </Button>
          <ul className="space-y-3 border-t border-border pt-6 text-sm">
            {[
              { icon: FileSearch, t: 'Agent drafts with page citations', d: `Findings for every ${t.offeror} and ${t.factor}, ready to accept or edit.` },
              { icon: Users, t: t.sled ? 'Independent scoring, then consensus' : 'Independent evaluation, then consensus', d: `Disagreements surfaced for the ${t.chair} automatically.` },
              { icon: ShieldCheck, t: 'Protest-ready trace', d: `${t.Rating} → evaluator → finding → proposal page, all recorded.` },
            ].map((x) => (
              <li key={x.t} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><x.icon className="h-4 w-4" /></span>
                <span><span className="block font-medium">{x.t}</span><span className="block text-muted-foreground">{x.d}</span></span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Demo environment · synthetic {t.offerors} and proposals.</p>
        </div>
      </section>
    </div>
  )
}
