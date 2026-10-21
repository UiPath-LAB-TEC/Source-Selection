import { useState } from 'react'
import { Archive, Bot, Check, ChevronsUpDown, ClipboardCheck, Cpu, Database, FileSignature, FileStack, Gavel, Landmark, Loader2, LockKeyhole, Mail, MessagesSquare, ShieldAlert, ShieldCheck, Sparkles, Vote, Workflow } from 'lucide-react'
import { Alert, AlertDescription } from '@uipath/apollo-wind/components/ui/alert'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@uipath/apollo-wind/components/ui/popover'
import { useTerms } from '@forms/lib/terms'
import { FrameworkSwitch } from '@ss/components/FrameworkSwitch'
import { PersonaAvatar } from '@ss/components/Flair'
import { ProductOrbit } from '@ss/components/ProductOrbit'
import type { OrbitProduct } from '@ss/components/ProductOrbit'
import { StageJourney } from '@ss/components/StageJourney'
import { rememberPersona } from '@ss/hooks/usePersona'
import type { PersonaId } from '@ss/lib/types'
import { awardTitled, storedAwardPersona } from '../hooks/usePersona'
import { AWARD_PERSONAS, AWARD_STAGES } from '../lib/award'

/** The UiPath products the Award phase runs on, circling the robot as they do on Source Selection's sign-in. */
const PRODUCTS: OrbitProduct[] = [
  { label: 'Maestro', icon: Workflow, title: 'Maestro runs the award process, from contract award to close' },
  { label: 'Agents', icon: Bot, title: 'Agents draft debriefings, answer follow-up questions and map protest grounds to the record' },
  { label: 'Actions', icon: ClipboardCheck, title: 'Action Center carries every Contracting Officer and counsel decision' },
  { label: 'Storage', icon: Archive, title: 'Storage files every notice, debriefing and agency report with the award record' },
  { label: 'Data Fabric', icon: Database, title: 'Data Fabric holds the one record Source Selection and Contract Award share' },
  { label: 'Robots', icon: Cpu, title: 'Robots issue notices, check every debriefing for disclosures and assemble the agency report' },
]

const ICONS = { federal: [FileSignature, Mail, MessagesSquare, ShieldAlert, Gavel], sled: [Mail, ShieldAlert, Vote, FileSignature, Landmark] }

/** Sign-in for Contract Award: the same look, motion, framework switch and persona choice as Source Selection's, with its own steps and products. */
export function LoginScreen({ onLogin, error, busy = false, still = false, status }: {
  onLogin: () => void; error: string | null; busy?: boolean; still?: boolean; status?: string
}) {
  const t = useTerms()
  const [as, setAs] = useState<PersonaId>(storedAwardPersona)
  const [open, setOpen] = useState(false)
  const people = AWARD_PERSONAS.map((p) => awardTitled(p, t.id))
  const counsel = t.sled ? 'District Counsel' : 'Agency Counsel'
  const who = { federal: [t.co, t.co, `${t.co} and the agent`, counsel, t.co], sled: [t.co, counsel, 'Board of Education', t.co, t.co] }[t.id]
  const stages = AWARD_STAGES[t.id].map((name, n) => ({ name, icon: ICONS[t.id][n], who: who[n] }))
  const signer = people.find((p) => p.id === as)!
  const choose = (id: PersonaId) => { setAs(id); rememberPersona(id); setOpen(false) }
  return (
    <div className={`grid min-h-screen bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_480px] ${still ? 'ss-still' : ''}`}>
      <section className="ss-hero sheen flex flex-col justify-between gap-10 p-8 md:p-12">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/30"><Gavel className="h-5 w-5" /></div>
          <div className="leading-tight">
            <div className="font-semibold">Contract Award</div>
            <div className="text-xs text-white/75">{t.sled ? 'Agentic Procurement' : 'Agentic Acquisition'} on UiPath</div>
          </div>
        </div>

        <div className="relative z-10 grid items-center gap-10 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-5">
            <p className="ss-rise inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/25"><Sparkles className="h-3.5 w-3.5" />After the {t.sled ? 'recommendation' : 'award decision'}</p>
            <h1 className="ss-rise max-w-xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl" style={{ ['--d' as string]: '.08s' }}>
              {t.sled ? 'Notices, protests and Board approval, from one record.' : 'Notices, debriefings and protests, answered from the record.'}
            </h1>
            <p className="ss-rise max-w-lg text-lg text-white/85" style={{ ['--d' as string]: '.16s' }}>
              The same record {t.sled ? 'RFP Evaluation' : 'Source Selection'} built. Agents draft from it, and the {t.co} and counsel decide what goes out.
            </p>
          </div>
          <div className="ss-rise hidden xl:block" style={{ ['--d' as string]: '.2s' }}><ProductOrbit products={PRODUCTS} /></div>
        </div>

        <div className="ss-rise relative z-10" style={{ ['--d' as string]: '.3s' }}><StageJourney stages={stages} /></div>
      </section>

      <section className="flex items-center justify-center p-8">
        <div className="ss-in w-full max-w-sm space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">Select a user role, then work the award as the persona you pick.</p>
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Workspace</span>
            <FrameworkSwitch disabled={busy} />
          </div>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" id="aw-signin-as">User Role</label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <button type="button" disabled={busy} aria-labelledby="aw-signin-as"
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2.5 text-left hover:bg-muted/60 disabled:opacity-60">
                  <PersonaAvatar id={signer.id} short={signer.short} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{signer.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{signer.label}</span>
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-1.5">
                {people.map((p) => (
                  <button key={p.id} type="button" onClick={() => choose(p.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted ${p.id === as ? 'bg-muted' : ''}`}>
                    <PersonaAvatar id={p.id} short={p.short} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{p.label}</span>
                    </span>
                    {p.id === as && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
          <Button onClick={onLogin} disabled={busy} aria-busy={busy} className="h-11 w-full text-base">
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{status ?? 'Signing you in…'}</> : <><LockKeyhole className="mr-2 h-4 w-4" />Sign in as {signer.name}</>}
          </Button>
          <ul className="space-y-3 border-t border-border pt-6 text-sm">
            {[
              { icon: MessagesSquare, t: t.sled ? 'Notices drafted from the record' : 'Debriefings drafted from the record', d: `Each ${t.offeror} sees its own evaluation, never another's proposal.` },
              { icon: FileStack, t: 'Protest file in minutes', d: 'Every document the report needs, indexed from the record.' },
              { icon: ShieldCheck, t: 'One audit trail', d: `From the first proposal page to the final ${t.sled ? 'Board vote' : 'protest decision'}.` },
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
