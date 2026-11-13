import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ArrowRight, Bot, Check, CircleDashed, FilePen, Loader2, MessageSquareText, Plus, RotateCcw, Save, SkipForward, Sparkles, Trash2, UserCheck, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@uipath/apollo-wind/components/ui/dialog'
import { Input } from '@uipath/apollo-wind/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@uipath/apollo-wind/components/ui/select'
import { Stepper } from '@uipath/apollo-wind/components/ui/stepper'
import { Textarea } from '@uipath/apollo-wind/components/ui/textarea'
import { Info } from '@forms/components/Bits'
import { useFrameworkMode } from '@ss/hooks/useFramework'
import { when } from '@ss/lib/eval'
import { useReqPersona } from '../hooks/usePersona'
import { AGENT_LABEL, analyze, draftDoc, sectionsToText, warmAgents } from '../lib/agents'
import { useRequirementsData } from '../lib/data'
import { DOC_LABEL, packageFor, progressOf, usd, valueFlags, valueOf } from '../lib/package'
import type { PackageItem } from '../lib/package'
import { prefill } from '../lib/profiles'
import { blankRequirement, nextRequirementId, saveDoc, saveRequirement } from '../lib/save'
import type { Event } from '../lib/save'
import { analysisOf, isProduct, isService, parse, specOf, STAGES } from '../lib/types'
import type { Analysis, DocRow, Item, RequesterProfile, RequirementRow, Spec, Stage } from '../lib/types'
import { UNITS, unitOf } from '../lib/units'
import { buildPath, reqPath } from '../components/RequirementCard'
import { DocEditor } from '../components/DocEditor'

const STEPS = [
  { title: 'Need', description: 'In your own words' },
  { title: 'Clarify', description: 'The agent’s questions' },
  { title: 'Requirement', description: 'What gets bought' },
  { title: 'Package', description: 'The documents' },
]
const STEP_STAGE: Stage[] = ['Need', 'Clarify', 'Requirement', 'Package']

/** Example needs, as a program office would write them on a first pass. */
const EXAMPLES = [
  { label: 'Rugged tablets for flight line maintainers', office: '42nd Aircraft Maintenance Squadron', budget: 500_000,
    need: 'Our maintainers need about 120 rugged tablets to read technical orders and record their work on the flight line, in sun, rain and cold. The laptops we use now are too heavy to carry around the aircraft and the screens wash out outside. We have been using Panasonic Toughbooks in the back shops. We would like them in about 90 days, before the next inspection cycle.' },
  { label: 'Help desk support for 2,000 users at three bases', office: '81st Communications Squadron', budget: 3_200_000,
    need: 'We need a contractor to run tier 1 and tier 2 IT help desk support for about 2,000 users across three installations, 24 hours a day, including walk-up support at the main base. The current contract ends in September and response times have been slipping. Some users work with controlled unclassified information.' },
  { label: 'Training simulators for a new airframe', office: 'Aircrew Training Systems Division', budget: 0,
    need: 'We need two part-task training devices so maintainers can practice engine run procedures for the new airframe before it arrives at the base, plus instructor training and two years of sustainment.' },
]

const label = 'text-sm font-medium'
const hint = 'text-xs text-muted-foreground'

function Field({ id, title, children, info }: { id: string; title: string; children: ReactNode; info?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={`${label} flex items-center gap-1`}>{title}{info && <Info label={title}>{info}</Info>}</label>
      {children}
    </div>
  )
}

/** One line per entry: how the builder edits lists (tasks, standards, characteristics). */
const lines = (xs: string[]) => xs.join('\n')
const unlines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

export function Builder() {
  const { id } = useParams()
  const { data } = useRequirementsData()
  if (!data) return null
  const existing = id ? data.requirements.find((r) => r.RequirementId === id) : undefined
  if (id && !existing) return <p className="text-sm text-muted-foreground">No requirement {id}. <Link to="/requirements" className="underline">See all requirements</Link></p>
  return <Wizard key={existing?.RequirementId ?? 'new'} existing={existing} />
}

interface Work { row: RequirementRow; analysis?: Analysis; spec: Spec }

function Wizard({ existing }: { existing?: RequirementRow }) {
  const { sdk, preview, data, patch } = useRequirementsData()
  const { persona, requester } = useReqPersona()
  const { framework } = useFrameworkMode()
  const nav = useNavigate()
  // A requester's own profile fills in a new requirement (only one from this workspace).
  const profile = persona.id === 'pm' && (requester.Framework || 'federal') === framework ? requester : undefined
  const [params] = useSearchParams()
  const writer = { sdk, preview, patch }

  const initial = useMemo<Work>(() => {
    if (existing) return { row: existing, analysis: analysisOf(existing), spec: specOf(existing) }
    const fill = profile ? prefill(profile) : undefined
    const row = { ...blankRequirement(persona.id === 'co' ? 'co' : 'pm', framework), ...fill?.row }
    const ex = EXAMPLES[Number(params.get('example') ?? -1)]
    const start = ex ? { ...row, Need: ex.need, Office: row.Office || ex.office, Budget: ex.budget || null } : row
    return { row: start, spec: { ...specOf(start), ...fill?.spec } }
    // The starting point is read once; the wizard owns the state after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [w, setW] = useState<Work>(initial)
  const [clean, setClean] = useState(() => JSON.stringify(existing ? initial : {}))
  const dirty = JSON.stringify(w) !== clean && (!!existing || !!w.row.Need.trim())
  const [step, setStep] = useState(() => Math.max(0, STEP_STAGE.indexOf(existing?.Stage ?? 'Need')))
  const reached = Math.max(step, STEP_STAGE.indexOf(w.row.Stage))
  const [busy, setBusy] = useState<string>()
  const [agentState, setAgentState] = useState('')
  const [tried, setTried] = useState(false)
  const leaving = useRef(false)

  const setRow = (p: Partial<RequirementRow>) => setW((x) => ({ ...x, row: { ...x.row, ...p } }))
  const setSpec = (p: Partial<Spec>) => setW((x) => ({ ...x, spec: { ...x.spec, ...p } }))
  /** Functional, so quick successive answers (chip clicks) never overwrite each other. */
  const updateAnalysis = (fn: (a: Analysis) => Analysis) => setW((x) => (x.analysis ? { ...x, analysis: fn(x.analysis) } : x))
  const goTo = (n: number) => { setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  useEffect(() => { if (!preview) warmAgents(sdk) }, [sdk, preview])
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const hold = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', hold)
    return () => window.removeEventListener('beforeunload', hold)
  }, [dirty])

  /** The row as it is stored: the analysis, the structured requirement and the fields other pages list by. */
  const toRow = (x: Work, stage: Stage): RequirementRow => {
    const a = x.analysis
    return {
      ...x.row,
      RequirementId: x.row.RequirementId || nextRequirementId(data?.requirements ?? []),
      Stage: STAGES.indexOf(stage) > STAGES.indexOf(x.row.Stage) ? stage : x.row.Stage,
      Title: x.row.Title || a?.title || x.row.Need.split(/[.\n]/)[0].slice(0, 80),
      Kind: a?.kind ?? x.row.Kind,
      Psc: a?.psc.code ?? x.row.Psc,
      Naics: a?.naics.code ?? x.row.Naics,
      EstimatedValue: x.row.EstimatedValue || (a && a.value.high ? Math.round((a.value.low + a.value.high) / 2) : null),
      RequirementJson: JSON.stringify(x.spec),
      AnalysisJson: a ? JSON.stringify(a) : '',
    }
  }

  /** Save the work (moving the stage forward when `stage` is later), and go to the requirement's own URL once it has one. */
  const persist = async (x: Work, stage: Stage, events: Event[]) => {
    const stored = await saveRequirement(writer, toRow(x, stage), events)
    const next = { ...x, row: stored }
    setW(next)
    setClean(JSON.stringify(next))
    if (!existing) { leaving.current = true; nav(buildPath(stored), { replace: true }) }
    return stored
  }

  const ask = async () => {
    if (!w.row.Need.trim()) { setTried(true); return }
    setBusy('ask'); setAgentState('Starting')
    try {
      const base = { ...w.row, RequirementId: w.row.RequirementId || nextRequirementId(data?.requirements ?? []) }
      const first = !w.analysis
      const answeredNow = (w.analysis?.questions ?? []).filter((q) => q.answer?.trim() || q.skipped).length
      const out = await analyze(sdk, base, w.analysis, w.spec, setAgentState, preview)
      const events: Event[] = [
        ...(first && !existing ? [{ action: 'RequirementStarted', actor: persona.name, detail: base.Need.slice(0, 300) }] : []),
        ...(answeredNow ? [{ action: 'QuestionsAnswered', actor: persona.name, detail: `${answeredNow} answered or skipped` }] : []),
        { action: 'NeedAnalyzed', actor: 'RQ_RequirementsAnalyst', detail: `${out.analysis.kind}: ${out.analysis.title}. ${out.analysis.questions.length} question${out.analysis.questions.length === 1 ? '' : 's'}.` },
      ]
      await persist({ row: base, analysis: out.analysis, spec: out.spec }, 'Clarify', events)
      if (step === 0) goTo(1)
      if (out.specNote) toast.info(out.specNote)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(undefined); setAgentState('')
    }
  }

  const saveDraft = async (stage: Stage = STEP_STAGE[step], move?: number) => {
    if (!w.row.Need.trim()) { setTried(true); goTo(0); return false }
    setBusy('save')
    try {
      await persist(w, stage, [move != null ? { action: 'StageChanged', actor: persona.name, detail: STEP_STAGE[move] } : { action: 'RequirementSaved', actor: persona.name }])
      if (move != null) goTo(move)
      else toast.success('Saved to the requirement record.')
      return true
    } catch (e) {
      toast.error(`Could not save: ${(e as Error).message}`)
      return false
    } finally {
      setBusy(undefined)
    }
  }

  const docs = (data?.docs ?? []).filter((d) => d.RequirementId === w.row.RequirementId)
  const savedAt = w.row.UpdatedAt

  return (
    <div className="space-y-5 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{w.row.RequirementId ? <span className="font-mono text-xs">{w.row.RequirementId}</span> : 'New requirement'}</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{w.row.Title || w.analysis?.title || 'Start a requirement'}</h1>
        </div>
        {w.row.RequirementId && <Link to={reqPath(w.row)} className="text-sm text-muted-foreground hover:text-primary">View the record →</Link>}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card px-4 py-4">
        <Stepper steps={STEPS} currentStep={step} clickableSteps onStepClick={(n) => { if (n <= reached) goTo(n) }} className="min-w-[640px]" />
      </div>

      {step === 0 && <NeedStep w={w} setRow={setRow} tried={tried} profile={profile} />}
      {step === 1 && w.analysis && <ClarifyStep w={w} update={updateAnalysis} setRow={setRow} />}
      {step === 2 && <RequirementStep w={w} setSpec={setSpec} />}
      {step === 3 && <PackageStep w={w} docs={docs} />}

      {busy === 'ask' && <AgentWorking state={agentState} first={!w.analysis} />}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/90 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">{!dirty && savedAt ? `Saved ${when(savedAt)}` : dirty ? 'Unsaved changes' : ''}</div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => nav(-1)}>Cancel</Button>
          {step > 0 && <Button variant="ghost" onClick={() => saveDraft()} disabled={!dirty || !!busy}>{busy === 'save' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}Save draft</Button>}
          {step > 0 && <Button variant="outline" onClick={() => goTo(step - 1)} disabled={!!busy}><ArrowLeft className="mr-1 h-4 w-4" />Back</Button>}
          {step === 0 && (
            w.analysis
              ? <>
                  <Button variant="outline" onClick={ask} disabled={!!busy}><RotateCcw className="mr-1.5 h-4 w-4" />Ask the agent again</Button>
                  <Button onClick={() => (dirty ? saveDraft('Clarify', 1) : goTo(1))} disabled={!!busy}>Next<ArrowRight className="ml-1 h-4 w-4" /></Button>
                </>
              : <Button onClick={ask} disabled={!!busy}>{busy === 'ask' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}Ask the agent</Button>
          )}
          {step === 1 && (
            <>
              <Button variant="outline" onClick={ask} disabled={!!busy}>{busy === 'ask' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <MessageSquareText className="mr-1.5 h-4 w-4" />}Send answers</Button>
              <Button onClick={() => saveDraft('Requirement', 2)} disabled={!!busy}>Next: requirement<ArrowRight className="ml-1 h-4 w-4" /></Button>
            </>
          )}
          {step === 2 && <Button onClick={() => saveDraft('Package', 3)} disabled={!!busy}>Next: package<ArrowRight className="ml-1 h-4 w-4" /></Button>}
          {step === 3 && <Button onClick={async () => { if (!dirty || await saveDraft()) { leaving.current = true; nav(reqPath(w.row)) } }} disabled={!!busy}><Check className="mr-1.5 h-4 w-4" />Save and close</Button>}
        </div>
      </div>

      <Dialog open={blocker.state === 'blocked'} onOpenChange={(open) => { if (!open && blocker.state === 'blocked') blocker.reset() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save your progress before leaving?</DialogTitle>
            <DialogDescription>This requirement has changes that aren't saved. Save them to the record to pick up where you left off, or leave and lose them.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-wrap gap-2 sm:justify-end">
            <Button variant="ghost" onClick={() => blocker.reset?.()}>Stay</Button>
            <Button variant="outline" onClick={() => blocker.proceed?.()}>Leave without saving</Button>
            <Button onClick={async () => { if (await saveDraft()) blocker.proceed?.() }}><Save className="mr-1.5 h-4 w-4" />Save and leave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** While the analyst runs: what it's doing, in plain words, and the job state for anyone curious. */
function AgentWorking({ state, first }: { state: string; first: boolean }) {
  return (
    <div className="ss-in flex items-center gap-3 rounded-2xl border border-[var(--ss-brand-2)]/40 bg-card p-4 text-sm">
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ss-brand-2)] text-white"><span className="ss-pulse" aria-hidden /><Bot className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{first ? 'Reading the need' : 'Reading your answers'}</span>
        <span className="block text-muted-foreground">{AGENT_LABEL} · {first ? 'deciding what it is and what a Contracting Officer would ask' : 'updating the draft and narrowing the questions'}{state ? ` · ${state === 'Pending' ? 'waiting for a robot' : state.toLowerCase()}` : ''}</span>
      </span>
    </div>
  )
}

// ── Step 1: the need ─────────────────────────────────────────────────────────

function NeedStep({ w, setRow, tried, profile }: { w: Work; setRow: (p: Partial<RequirementRow>) => void; tried: boolean; profile?: RequesterProfile }) {
  const r = w.row
  const missing = tried && !r.Need.trim()
  const fromProfile = !!profile && r.RequestedBy === profile.ProfileId
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <Field id="rq-need" title="What do you need, and why?">
          <Textarea id="rq-need" value={r.Need} onChange={(e) => setRow({ Need: e.target.value })} rows={9} aria-invalid={missing}
            placeholder="Say it the way you would to a colleague: what it is, how many or how much, where, by when, and the problem it solves." />
          {missing ? <p className="text-xs text-[var(--ss-critical)]">Describe the need first. A few sentences is enough.</p> : <p className={hint}>Plain words are fine. The agent turns them into a requirement and asks about anything a Contracting Officer would need.</p>}
        </Field>
        <div>
          <p className={`${hint} mb-1.5`}>Or start from an example</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((x) => (
              <button key={x.label} type="button" onClick={() => setRow({ Need: x.need, Office: r.Office || x.office, Budget: x.budget || null })}
                className="rounded-full border border-border px-3 py-1 text-xs hover:border-[var(--ss-brand-2)] hover:bg-muted">{x.label}</button>
            ))}
          </div>
        </div>
      </section>
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        {fromProfile && (
          <p className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ss-brand-2)]" />
            <span>Filled in from {profile.Name}’s profile: the agency, the offices{profile.Location ? ` and the location, ${profile.Location}` : ''}. Change anything that’s different for this need.</span>
          </p>
        )}
        <Field id="rq-agency" title="Agency"><Input id="rq-agency" value={r.Agency} onChange={(e) => setRow({ Agency: e.target.value })} /></Field>
        <Field id="rq-office" title="Requiring office"><Input id="rq-office" value={r.Office} onChange={(e) => setRow({ Office: e.target.value })} placeholder="e.g. 42nd Aircraft Maintenance Squadron" /></Field>
        <Field id="rq-co-office" title="Contracting office" info="The contracting office that will receive the package and run the buy.">
          <Input id="rq-co-office" value={r.ContractingOffice} onChange={(e) => setRow({ ContractingOffice: e.target.value })} placeholder="e.g. 23rd Contracting Squadron" />
        </Field>
        <Field id="rq-needby" title="Needed by"><Input id="rq-needby" type="date" value={r.NeedBy} onChange={(e) => setRow({ NeedBy: e.target.value })} /></Field>
        <Field id="rq-budget" title="Rough budget (optional)" info="What the program office expects to spend, if known. The agent's estimate and, later, the IGCE replace it.">
          <Input id="rq-budget" inputMode="numeric" value={r.Budget ? `$${r.Budget.toLocaleString('en-US')}` : ''} onChange={(e) => { const n = Number(e.target.value.replace(/[^\d.]/g, '')); setRow({ Budget: n || null }) }} placeholder="$" />
        </Field>
      </section>
    </div>
  )
}

// ── Step 2: clarify ──────────────────────────────────────────────────────────

function ClarifyStep({ w, update, setRow }: { w: Work; update: (fn: (a: Analysis) => Analysis) => void; setRow: (p: Partial<RequirementRow>) => void }) {
  const a = w.analysis!
  const value = valueOf(toValueRow(w), a)
  const applies = [...a.flags, ...valueFlags(value, w.row.Agency)]
  const setQ = (id: string, p: { answer?: string; skipped?: boolean }) => update((x) => ({ ...x, questions: x.questions.map((q) => (q.id === id ? { ...q, ...p } : q)) }))
  const open = a.questions.filter((q) => !q.answer?.trim() && !q.skipped).length
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">What the agent needs to know</h2>
            <p className="text-sm text-muted-foreground">{!a.questions.length ? 'Nothing more to ask. Review what the agent found, then go on to the requirement.'
              : open ? `${open} of ${a.questions.length} to answer. Pick a suggestion or write your own; skip what you don't know yet.`
              : `All ${a.questions.length} answered. Send your answers so the agent can update the draft.`}</p>
          </div>
          <span className="text-xs text-muted-foreground">Round {a.round} · {when(a.at)}</span>
        </div>
        {a.questions.map((q, i) => (
          <article key={q.id} className={`ss-in rounded-2xl border bg-card p-4 ${q.skipped ? 'border-dashed border-border opacity-70' : q.answer?.trim() ? 'border-[var(--ss-good)]/50' : 'border-border'}`} style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${q.answer?.trim() ? 'bg-[var(--ss-good)] text-white' : 'bg-muted text-muted-foreground'}`}>{q.answer?.trim() ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <label htmlFor={`rq-q-${q.id}`} className="block font-medium">{q.question}</label>
                  {q.why && <p className="text-xs text-muted-foreground">{q.why}</p>}
                </div>
                {q.options.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {q.options.map((o) => (
                      <button key={o} type="button" onClick={() => setQ(q.id, { answer: o, skipped: false })}
                        className={`rounded-full border px-2.5 py-1 text-xs ${q.answer === o ? 'border-[var(--ss-brand-2)] bg-[var(--ss-brand-2)] text-white' : 'border-border hover:bg-muted'}`}>{o}</button>
                    ))}
                  </div>
                )}
                <Textarea id={`rq-q-${q.id}`} rows={2} value={q.answer ?? ''} disabled={q.skipped} onChange={(e) => setQ(q.id, { answer: e.target.value })} placeholder="Your answer" />
                <button type="button" onClick={() => setQ(q.id, { skipped: !q.skipped, answer: q.skipped ? q.answer : '' })} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  {q.skipped ? <><RotateCcw className="h-3 w-3" />Answer this after all</> : <><SkipForward className="h-3 w-3" />Skip for now: it stays open on the package</>}
                </button>
              </div>
            </div>
          </article>
        ))}
        {a.answered.length > 0 && (
          <details className="rounded-2xl border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">Answered in earlier rounds ({a.answered.length})</summary>
            <ul className="mt-3 space-y-2 text-sm">
              {a.answered.map((q) => <li key={q.id}><span className="text-muted-foreground">{q.question}</span><br />{q.skipped ? <em className="text-muted-foreground">Skipped</em> : q.answer}</li>)}
            </ul>
          </details>
        )}
      </section>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Bot className="h-3.5 w-3.5" />What it is</div>
          <Field id="rq-title" title="Title"><Input id="rq-title" value={w.row.Title || a.title} onChange={(e) => setRow({ Title: e.target.value })} /></Field>
          <p className="text-sm">{a.summary}</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Kind</dt><dd>{a.kind}</dd>
            {a.psc.code && <><dt className="text-muted-foreground">PSC</dt><dd><span className="font-mono text-xs">{a.psc.code}</span> {a.psc.name}</dd></>}
            {a.naics.code && <><dt className="text-muted-foreground">NAICS</dt><dd><span className="font-mono text-xs">{a.naics.code}</span> {a.naics.name}{a.naics.sizeStandard && <span className="text-muted-foreground"> · small if under {a.naics.sizeStandard}</span>}</dd></>}
            <dt className="text-muted-foreground">Commercial</dt><dd>{a.commercial.likely ? 'Likely' : 'Unlikely'}<span className="text-muted-foreground"> · {a.commercial.reason}</span></dd>
            {a.value.high > 0 && <><dt className="text-muted-foreground">Value</dt><dd>{usd(a.value.low)} to {usd(a.value.high)}<span className="block text-xs text-muted-foreground">{a.value.basis}</span></dd></>}
          </dl>
          <p className="text-[11px] text-muted-foreground">Codes and value are the agent's suggestions. Market research and the IGCE confirm them.</p>
        </section>
        {applies.length > 0 && (
          <section className="space-y-2 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" />What applies</div>
            <ul className="space-y-2.5">
              {applies.map((f) => (
                <li key={f.id} className="flex gap-2 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--ss-warn)]" aria-hidden />
                  <span><span className="font-medium">{f.label}</span><span className="block text-xs text-muted-foreground">{f.reason}</span></span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  )
}

const toValueRow = (w: Work) => ({ EstimatedValue: w.row.EstimatedValue, Budget: w.row.Budget })

// ── Step 3: the requirement ──────────────────────────────────────────────────

function Group({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div><h2 className="text-base font-semibold">{title}</h2>{description && <p className="text-sm text-muted-foreground">{description}</p>}</div>
      {children}
    </section>
  )
}

function TextField({ id, title, value, onChange, rows, placeholder, info }: { id: string; title: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; info?: ReactNode }) {
  return (
    <Field id={id} title={title} info={info}>
      {rows ? <Textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /> : <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}
    </Field>
  )
}

/** The unit of issue, picked from the standard ones; a unit the agent wrote that isn't one of them stays as a choice. */
function UnitField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const v = unitOf(value)
  const units: string[] = (UNITS as readonly string[]).includes(v) ? [...UNITS] : [v, ...UNITS]
  return (
    <Field id={id} title="Unit">
      <Select value={v} onValueChange={onChange}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>{units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
  )
}

/** A list edited one entry per line, kept as typed until the field loses focus (so blank lines can be added). */
function LinesField({ id, title, value, onChange, rows = 4, placeholder, info }: { id: string; title: string; value: string[]; onChange: (v: string[]) => void; rows?: number; placeholder?: string; info?: ReactNode }) {
  const [text, setText] = useState(lines(value))
  useEffect(() => { setText((t) => (JSON.stringify(unlines(t)) === JSON.stringify(value) ? t : lines(value))) }, [value])
  return (
    <Field id={id} title={title} info={info}>
      <Textarea id={id} rows={rows} value={text} onChange={(e) => { setText(e.target.value); onChange(unlines(e.target.value)) }} placeholder={placeholder} />
      <p className={hint}>One per line.</p>
    </Field>
  )
}

function RequirementStep({ w, setSpec }: { w: Work; setSpec: (p: Partial<Spec>) => void }) {
  const s = w.spec
  const kind = w.analysis?.kind ?? w.row.Kind
  const setItem = (i: number, p: Partial<Item>) => setSpec({ items: s.items.map((x, n) => (n === i ? { ...x, ...p } : x)) })
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">The agent's draft from the need and your answers. Change anything; your words are kept when you ask the agent again.</p>
      {isProduct(kind) && (
        <>
          <Group title="Items" description="Describe each by what it must do and meet, not by brand, so any product that meets it can compete.">
            {s.items.map((it, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-border p-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_120px_auto] sm:items-end">
                  <TextField id={`rq-item-${i}`} title="Item" value={it.name} onChange={(v) => setItem(i, { name: v })} />
                  <Field id={`rq-qty-${i}`} title="Quantity"><Input id={`rq-qty-${i}`} inputMode="numeric" value={String(it.quantity || '')} onChange={(e) => setItem(i, { quantity: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Field>
                  <UnitField id={`rq-unit-${i}`} value={it.unit} onChange={(v) => setItem(i, { unit: v })} />
                  <Button variant="ghost" size="icon" aria-label={`Remove ${it.name || 'item'}`} onClick={() => setSpec({ items: s.items.filter((_, n) => n !== i) })}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <LinesField id={`rq-chars-${i}`} title="Salient characteristics" value={it.characteristics} onChange={(v) => setItem(i, { characteristics: v })} rows={5}
                  info="The features an offered product must have. Stated as performance, so a 'brand name or equal' purchase can be judged against them." />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setSpec({ items: [...s.items, { name: '', quantity: 1, unit: 'each', characteristics: [] }] })}><Plus className="mr-1.5 h-4 w-4" />Add an item</Button>
          </Group>
          <Group title="Standards, delivery and support">
            <LinesField id="rq-standards" title="Standards the items must meet" value={s.standards} onChange={(v) => setSpec({ standards: v })} rows={3} placeholder="MIL-STD-810H" />
            <div className="grid gap-4 md:grid-cols-2">
              <TextField id="rq-dplace" title="Deliver to" value={s.deliveryPlace} onChange={(v) => setSpec({ deliveryPlace: v })} />
              <TextField id="rq-ddate" title="Delivery" value={s.deliveryDate} onChange={(v) => setSpec({ deliveryDate: v })} placeholder="e.g. within 60 days after award" />
              <TextField id="rq-warranty" title="Warranty" value={s.warranty} onChange={(v) => setSpec({ warranty: v })} />
              <TextField id="rq-support" title="Support" value={s.support} onChange={(v) => setSpec({ support: v })} />
              <TextField id="rq-packaging" title="Packaging and marking" value={s.packaging} onChange={(v) => setSpec({ packaging: v })} />
              <TextField id="rq-inspection" title="Inspection and acceptance" value={s.inspection} onChange={(v) => setSpec({ inspection: v })} />
            </div>
          </Group>
        </>
      )}
      {isService(kind) && (
        <>
          <Group title="The work" description="What the contractor must achieve and how well, not how to do it.">
            <TextField id="rq-objective" title="Objective" value={s.objective} onChange={(v) => setSpec({ objective: v })} rows={3} />
            <TextField id="rq-background" title="Background" value={s.background} onChange={(v) => setSpec({ background: v })} rows={3} />
            <TextField id="rq-scope" title="Scope" value={s.scope} onChange={(v) => setSpec({ scope: v })} rows={3} />
            <LinesField id="rq-tasks" title="Tasks" value={s.tasks} onChange={(v) => setSpec({ tasks: v })} rows={6} />
          </Group>
          <Group title="Performance standards" description="Each with the acceptable quality level and how the government will check it. The surveillance plan is built from these.">
            {s.performanceStandards.map((p, i) => (
              <div key={i} className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                <TextField id={`rq-ps-${i}`} title="Standard" value={p.standard} onChange={(v) => setSpec({ performanceStandards: s.performanceStandards.map((x, n) => (n === i ? { ...x, standard: v } : x)) })} />
                <TextField id={`rq-aql-${i}`} title="Acceptable quality level" value={p.aql} onChange={(v) => setSpec({ performanceStandards: s.performanceStandards.map((x, n) => (n === i ? { ...x, aql: v } : x)) })} />
                <TextField id={`rq-method-${i}`} title="How it's checked" value={p.method} onChange={(v) => setSpec({ performanceStandards: s.performanceStandards.map((x, n) => (n === i ? { ...x, method: v } : x)) })} />
                <Button variant="ghost" size="icon" aria-label="Remove standard" onClick={() => setSpec({ performanceStandards: s.performanceStandards.filter((_, n) => n !== i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setSpec({ performanceStandards: [...s.performanceStandards, { standard: '', aql: '', method: '' }] })}><Plus className="mr-1.5 h-4 w-4" />Add a standard</Button>
          </Group>
          <Group title="Deliverables">
            {s.deliverables.map((d, i) => (
              <div key={i} className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                <TextField id={`rq-del-${i}`} title="Deliverable" value={d.name} onChange={(v) => setSpec({ deliverables: s.deliverables.map((x, n) => (n === i ? { ...x, name: v } : x)) })} />
                <TextField id={`rq-due-${i}`} title="Due" value={d.due} onChange={(v) => setSpec({ deliverables: s.deliverables.map((x, n) => (n === i ? { ...x, due: v } : x)) })} />
                <TextField id={`rq-fmt-${i}`} title="Format" value={d.format} onChange={(v) => setSpec({ deliverables: s.deliverables.map((x, n) => (n === i ? { ...x, format: v } : x)) })} />
                <Button variant="ghost" size="icon" aria-label="Remove deliverable" onClick={() => setSpec({ deliverables: s.deliverables.filter((_, n) => n !== i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setSpec({ deliverables: [...s.deliverables, { name: '', due: '', format: '' }] })}><Plus className="mr-1.5 h-4 w-4" />Add a deliverable</Button>
          </Group>
          <Group title="Where, when and who">
            <div className="grid gap-4 md:grid-cols-2">
              <TextField id="rq-pop-place" title="Place of performance" value={s.placeOfPerformance} onChange={(v) => setSpec({ placeOfPerformance: v })} />
              <TextField id="rq-pop" title="Period of performance" value={s.periodOfPerformance} onChange={(v) => setSpec({ periodOfPerformance: v })} />
              <TextField id="rq-security" title="Security" value={s.security} onChange={(v) => setSpec({ security: v })} placeholder="Clearances, CUI, base access" />
              <TextField id="rq-gfp" title="Government-furnished property" value={s.gfp} onChange={(v) => setSpec({ gfp: v })} />
              <TextField id="rq-kp" title="Key personnel" value={s.keyPersonnel} onChange={(v) => setSpec({ keyPersonnel: v })} />
            </div>
          </Group>
        </>
      )}
    </div>
  )
}

// ── Step 4: the package ──────────────────────────────────────────────────────

const STATUS_TONE: Record<string, string> = { 'Agent draft': 'text-[var(--ss-rate-2)]', Edited: 'text-foreground', Final: 'text-[var(--ss-good)]' }

function PackageStep({ w, docs }: { w: Work; docs: DocRow[] }) {
  const row = w.row
  const items = packageFor(row, w.analysis)
  const p = progressOf(items, docs)
  const open = [...(w.analysis?.questions ?? []), ...(w.analysis?.answered ?? [])].filter((q) => q.skipped || !q.answer?.trim())
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">The requirements package</h2>
          <p className="text-sm text-muted-foreground">What this requirement needs, from its kind, its value and what the agent flagged. {p.done} of {p.total} drafted.</p>
        </div>
      </div>
      {open.length > 0 && (
        <div className="flex gap-2 rounded-xl border border-[var(--ss-warn)]/60 bg-[var(--ss-warn)]/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ss-warn)]" />
          <div className="min-w-0">
            <p className="font-medium">{open.length} question{open.length > 1 ? 's' : ''} still open</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">{open.map((q, i) => <li key={`${q.id}-${i}`}>{q.question}</li>)}</ul>
          </div>
        </div>
      )}
      <ul className="space-y-3">
        {items.map((it, i) => <DocItem key={it.kind} it={it} n={i} w={w} doc={docs.find((d) => d.Kind === it.kind)} />)}
      </ul>
    </div>
  )
}

function DocItem({ it, n, w, doc }: { it: PackageItem; n: number; w: Work; doc?: DocRow }) {
  const { sdk, preview, patch } = useRequirementsData()
  const { persona } = useReqPersona()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(doc?.Text ?? '')
  const [busy, setBusy] = useState<string>()
  const [confirmRedraft, setConfirmRedraft] = useState(false)
  useEffect(() => { setText(doc?.Text ?? '') }, [doc?.Text])
  const writer = { sdk, preview, patch }
  const r = w.row
  const openQuestions = parse<{ openQuestions: string[] }>(doc?.DataJson, { openQuestions: [] }).openQuestions
  const changed = text !== (doc?.Text ?? '')

  const draft = async () => {
    if (doc && doc.Status !== 'Agent draft' && !confirmRedraft) { setConfirmRedraft(true); return }
    setConfirmRedraft(false); setBusy('draft')
    try {
      const out = await draftDoc(sdk, it.kind, r, w.analysis, w.spec, () => undefined, preview)
      const next: DocRow = {
        ...(doc ?? { DocId: `${r.RequirementId}-${it.kind}`, RequirementId: r.RequirementId, Kind: it.kind, EditedBy: '' }),
        Title: out.title || `${DOC_LABEL[it.kind]}: ${r.Title}`, Status: 'Agent draft', Text: sectionsToText(out.sections),
        DataJson: JSON.stringify({ openQuestions: out.openQuestions }), DraftedBy: 'RQ_Drafter', EditedBy: '', UpdatedAt: '',
      } as DocRow
      await saveDoc(writer, next, [{ action: 'DocumentDrafted', actor: 'RQ_Drafter', detail: DOC_LABEL[it.kind] }])
      setOpen(true)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(undefined)
    }
  }

  const save = async (final?: boolean) => {
    setBusy(final ? 'final' : 'save')
    try {
      const base: DocRow = doc ?? { DocId: `${r.RequirementId}-${it.kind}`, RequirementId: r.RequirementId, Kind: it.kind, Title: `${DOC_LABEL[it.kind]}: ${r.Title}`, Status: 'Edited', Text: '', DataJson: '', DraftedBy: persona.name, EditedBy: '', UpdatedAt: '' }
      await saveDoc(writer, { ...base, Text: text, Status: final ? 'Final' : changed || base.Status === 'Final' ? 'Edited' : base.Status, EditedBy: persona.name },
        [{ action: final ? 'DocumentMarkedFinal' : doc ? 'DocumentEdited' : 'DocumentWritten', actor: persona.name, detail: DOC_LABEL[it.kind] }])
      toast.success(final ? `${DOC_LABEL[it.kind]} marked final.` : 'Saved to the package.')
    } catch (e) {
      toast.error(`Could not save: ${(e as Error).message}`)
    } finally {
      setBusy(undefined)
    }
  }

  const status = doc?.Text.trim() ? doc.Status : 'Not started'
  const reviewer = it.producer === 'reviewer'
  return (
    <li className="ss-in overflow-hidden rounded-2xl border border-border bg-card" style={{ animationDelay: `${n * 50}ms` }}>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${status === 'Final' ? 'bg-[var(--ss-good)] text-white' : reviewer ? 'bg-muted text-muted-foreground' : 'bg-[var(--ss-brand-2)]/10 rq-brand-text'}`}>
          {status === 'Final' ? <Check className="h-4 w-4" /> : reviewer ? <UserCheck className="h-4 w-4" /> : status === 'Not started' ? <CircleDashed className="h-4 w-4" /> : <FilePen className="h-4 w-4" />}
        </span>
        <button type="button" className="min-w-0 flex-1 basis-56 text-left" onClick={() => !reviewer && setOpen((o) => !o)} disabled={reviewer}>
          <span className="block font-medium">{it.label}</span>
          <span className="block text-xs text-muted-foreground">{it.why}</span>
        </button>
        <Info label={`Why ${it.label.toLowerCase()}`}>{it.cite}</Info>
        <span className={`shrink-0 text-xs font-medium ${STATUS_TONE[status] ?? 'text-muted-foreground'}`}>
          {reviewer ? `After you submit · ${it.who}` : status}{doc?.UpdatedAt && !reviewer && status !== 'Not started' ? <span className="font-normal text-muted-foreground"> · {when(doc.UpdatedAt)}</span> : null}
        </span>
        {!reviewer && (
          <div className="flex shrink-0 items-center gap-2">
            {it.producer === 'agent' && (
              <Button size="sm" variant={doc ? 'outline' : 'default'} onClick={draft} disabled={!!busy}>
                {busy === 'draft' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
                {confirmRedraft ? 'Replace your edits?' : doc ? 'Redraft' : 'Draft with agent'}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? 'Close' : doc ? 'Open' : 'Write'}</Button>
          </div>
        )}
      </div>
      {busy === 'draft' && <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground"><Bot className="mr-1.5 inline h-4 w-4" />{AGENT_LABEL} is drafting the {it.label.toLowerCase()} from the requirement…</div>}
      {open && !reviewer && (
        <div className="space-y-3 border-t border-border p-4">
          {openQuestions.length > 0 && (
            <div className="flex gap-2 rounded-lg bg-[var(--ss-warn)]/10 p-2.5 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ss-warn)]" />
              <div className="min-w-0">
                <p className="font-medium">Still needed for this draft</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">{openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
              </div>
            </div>
          )}
          <DocEditor id={`rq-doc-${it.kind}`} label={it.label} value={text} onChange={setText}
            placeholder={it.producer === 'person' ? `Write the ${it.label.toLowerCase()} here.` : 'Draft it with the agent, or write it here.'} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={hint}>{doc?.DraftedBy === 'RQ_Drafter' ? `Drafted by the ${AGENT_LABEL}${doc.EditedBy ? `, edited by ${doc.EditedBy}` : ''}. Both are on the record.` : 'Each section is a heading and its text. Start a line with "- " for a list.'}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => save()} disabled={!!busy || (!changed && !!doc) || !text.trim()}>{busy === 'save' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}Save</Button>
              <Button size="sm" onClick={() => save(true)} disabled={!!busy || !text.trim() || (doc?.Status === 'Final' && !changed)}>{busy === 'final' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}Mark final</Button>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}
