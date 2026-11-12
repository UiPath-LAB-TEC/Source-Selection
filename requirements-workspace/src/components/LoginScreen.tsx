import { useState } from 'react'
import { Archive, Bot, Check, ChevronsUpDown, ClipboardCheck, ClipboardList, Cpu, Database, FileStack, ListChecks, Loader2, LockKeyhole, MessageSquareText, PenLine, Send, ShieldCheck, Sparkles, Workflow } from 'lucide-react'
import { Alert, AlertDescription } from '@uipath/apollo-wind/components/ui/alert'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@uipath/apollo-wind/components/ui/popover'
import { titled, useTerms } from '@forms/lib/terms'
import { FrameworkSwitch } from '@ss/components/FrameworkSwitch'
import { PersonaAvatar } from '@ss/components/Flair'
import { ProductOrbit } from '@ss/components/ProductOrbit'
import type { OrbitProduct } from '@ss/components/ProductOrbit'
import { StageJourney } from '@ss/components/StageJourney'
import { rememberPersona } from '@ss/hooks/usePersona'
import { ADMIN } from '@ss/lib/types'
import type { PersonaId } from '@ss/lib/types'
import { REQ_PERSONAS, storedReqPersona, TEAM } from '../hooks/usePersona'
import { cachedProfiles, rememberRequester, requesterLine, requesterPersona, requestersFor, storedRequester } from '../lib/profiles'

/** One entry in the sign-in list: a requester profile (as the Program Manager) or a role. */
interface Signer { key: string; id: PersonaId; name: string; short: string; label: string; group: string; profileId?: string; photo?: string }

/** The UiPath products the Requirements phase runs on, circling the robot as on the other apps' sign-in. */
const PRODUCTS: OrbitProduct[] = [
  { label: 'Agents', icon: Bot, title: 'Agents ask the questions a Contracting Officer would, then draft the package' },
  { label: 'Data Fabric', icon: Database, title: 'Data Fabric holds the requirement, the same record the later phases build on' },
  { label: 'Maestro', icon: Workflow, title: 'Maestro routes the package for funds, small business review and acceptance' },
  { label: 'Actions', icon: ClipboardCheck, title: 'Action Center carries the Resource Manager’s, Small Business Professional’s and Contracting Officer’s reviews' },
  { label: 'Robots', icon: Cpu, title: 'Robots assemble the package and check it’s complete' },
  { label: 'Storage', icon: Archive, title: 'Storage files the accepted package with the record' },
]

/** Sign-in for Requirements: the same look, motion and persona choice as the other apps, with its own steps and products. */
export function LoginScreen({ onLogin, error, busy = false, still = false, status }: {
  onLogin: () => void; error: string | null; busy?: boolean; still?: boolean; status?: string
}) {
  const t = useTerms()
  const [open, setOpen] = useState(false)
  // Requesters come from the profiles this browser loaded last (nothing can be read before sign-in); Grace otherwise.
  const pm = titled(REQ_PERSONAS[0], t.id)
  const people: Signer[] = [
    ...requestersFor(cachedProfiles(), t.id).map((r) => ({ ...requesterPersona(r, pm), key: `pm:${r.ProfileId}`, label: requesterLine(r, pm.label), group: 'Program offices', profileId: r.ProfileId })),
    ...TEAM.map((raw) => ({ ...titled(raw, t.id), key: raw.id, group: 'Acquisition team' })),
    { ...ADMIN, key: ADMIN.id, group: 'Workspace' },
  ]
  const [as, setAs] = useState(() => {
    const id = storedReqPersona()
    return id === 'pm' ? (people.find((p) => p.profileId === storedRequester()) ?? people[0]).key : id
  })
  const stages = [
    { name: 'Describe the need', icon: PenLine, who: 'Program Manager' },
    { name: 'Answer the agent', icon: MessageSquareText, who: 'Program Manager and the agent' },
    { name: 'Requirement', icon: ListChecks, who: 'Program Manager' },
    { name: 'Package', icon: FileStack, who: 'The agent drafts, you edit' },
    { name: 'Review', icon: Send, who: 'Resource Manager · Small Business' },
    { name: 'Accepted', icon: ClipboardCheck, who: t.co },
  ]
  const signer = people.find((p) => p.key === as) ?? people[0]
  const choose = (p: Signer) => {
    setAs(p.key)
    rememberPersona(p.id)
    if (p.profileId) rememberRequester(p.profileId)
    setOpen(false)
  }
  return (
    <div className={`grid min-h-screen bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_480px] ${still ? 'ss-still' : ''}`}>
      <section className="ss-hero sheen flex flex-col justify-between gap-10 p-8 md:p-12">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/30"><ClipboardList className="h-5 w-5" /></div>
          <div className="leading-tight">
            <div className="font-semibold">Requirements</div>
            <div className="text-xs text-white/75">{t.sled ? 'Agentic Procurement' : 'Agentic Acquisition'} on UiPath</div>
          </div>
        </div>

        <div className="relative z-10 grid items-center gap-10 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-5">
            <p className="ss-rise inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/25"><Sparkles className="h-3.5 w-3.5" />Before the solicitation</p>
            <h1 className="ss-rise max-w-xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl" style={{ ['--d' as string]: '.08s' }}>
              From a need to a package {t.sled ? 'purchasing' : 'contracting'} accepts the first time.
            </h1>
            <p className="ss-rise max-w-lg text-lg text-white/85" style={{ ['--d' as string]: '.16s' }}>
              Describe what you need in plain words. The agent asks what a {t.co} would ask, then drafts the requirement and the package around your answers.
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
            <p className="text-sm text-muted-foreground">Select a user role, then build or review requirements as the persona you pick.</p>
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Workspace</span>
            <FrameworkSwitch disabled={busy} />
          </div>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" id="rq-signin-as">User Role</label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <button type="button" disabled={busy} aria-labelledby="rq-signin-as"
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2.5 text-left hover:bg-muted/60 disabled:opacity-60">
                  <PersonaAvatar id={signer.id} short={signer.short} size={34} photo={signer.photo} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{signer.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{signer.label}</span>
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="max-h-[60vh] w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1.5">
                {people.map((p, i) => (
                  <div key={p.key}>
                    {p.group !== people[i - 1]?.group && <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{p.group}</p>}
                    <button type="button" onClick={() => choose(p)}
                      className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted ${p.key === as ? 'bg-muted' : ''}`}>
                      <PersonaAvatar id={p.id} short={p.short} size={28} photo={p.photo} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{p.label}</span>
                      </span>
                      {p.key === as && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          </div>
          <Button onClick={onLogin} disabled={busy} aria-busy={busy} className="h-11 w-full text-base">
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{status ?? 'Signing you in…'}</> : <><LockKeyhole className="mr-2 h-4 w-4" />Sign in as {signer.name}</>}
          </Button>
          <ul className="space-y-3 border-t border-border pt-6 text-sm">
            {[
              { icon: MessageSquareText, t: 'The questions come first', d: `What a ${t.co} would send the package back for, asked while you write it.` },
              { icon: FileStack, t: 'A package, not a form', d: 'The requirement, the surveillance plan and the justifications, drafted from your answers.' },
              { icon: ShieldCheck, t: 'One record, start to finish', d: `The same record ${t.sled ? 'RFP Evaluation' : 'Source Selection'} and Contract Management build on.` },
            ].map((x) => (
              <li key={x.t} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><x.icon className="h-4 w-4" /></span>
                <span><span className="block font-medium">{x.t}</span><span className="block text-muted-foreground">{x.d}</span></span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Demo environment · synthetic people, offices and vendors.</p>
        </div>
      </section>
    </div>
  )
}
