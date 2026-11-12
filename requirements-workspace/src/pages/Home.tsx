import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ClipboardCheck, ClipboardList, MessageSquareText, Plus, Send, Sparkles } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { HeroTile, PersonaAvatar } from '@ss/components/Flair'
import { CountUp } from '@ss/components/ProductOrbit'
import { when } from '@ss/lib/eval'
import { greeting } from '@ss/lib/roles'
import { actorName } from '@ss/lib/types'
import { NeedReader } from '../components/NeedReader'
import { RequirementCard } from '../components/RequirementCard'
import { useReqPersona } from '../hooks/usePersona'
import { useScopedData } from '../lib/data'
import { nextOf } from '../lib/next'
import { fiscalYear } from '../lib/save'
import { analysisOf } from '../lib/types'
import type { Dataset, RequirementRow } from '../lib/types'

/** Top-level section header, as on the other apps' homes. */
function SectionHeader({ title, description, link }: { title: string; description: string; link?: { to: string; label: string } }) {
  return (
    <div className="flex items-end justify-between gap-2">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {link && <Link to={link.to} className="shrink-0 text-sm text-muted-foreground hover:text-primary">{link.label} →</Link>}
    </div>
  )
}

const inProgress = (r: RequirementRow) => r.Status === 'Draft' || r.Status === 'Returned'
const openQuestions = (r: RequirementRow) => analysisOf(r)?.questions.filter((q) => !q.answer?.trim() && !q.skipped).length ?? 0

/** Example starting points, opened in the builder with the need filled in. */
const STARTS = [
  { n: 0, title: 'Rugged tablets', sub: 'A product, with a brand named' },
  { n: 1, title: 'Help desk support', sub: 'A service, with controlled information' },
  { n: 2, title: 'Training simulators', sub: 'Products and services together' },
]

function tiles(d: Dataset, mine: RequirementRow[]): { icon: ReactNode; label: string; value: number; sub: string }[] {
  const fy = fiscalYear()
  return [
    { icon: <ClipboardList className="h-3.5 w-3.5" />, label: 'In progress', value: mine.filter(inProgress).length, sub: 'drafts you’re building' },
    { icon: <MessageSquareText className="h-3.5 w-3.5" />, label: 'Open questions', value: mine.reduce((s, r) => s + openQuestions(r), 0), sub: 'from the agent, to answer' },
    { icon: <Send className="h-3.5 w-3.5" />, label: 'In review', value: d.requirements.filter((r) => r.Status === 'Submitted').length, sub: 'funds, small business, contracting' },
    { icon: <ClipboardCheck className="h-3.5 w-3.5" />, label: 'Accepted', value: d.requirements.filter((r) => r.Status === 'Accepted' && r.RequirementId.startsWith(`RQ-${fy}`)).length, sub: `by contracting in FY${fy}` },
  ]
}

/** Personal home: the requirements on the person's desk, a quick start, and the latest on the record. */
export function Home() {
  const { data } = useScopedData()
  const { persona, isMine } = useReqPersona()
  if (!data) return null
  const builder = persona.id === 'pm' || persona.id === 'co'
  const yours = data.requirements.filter((r) => nextOf(r, data.docs)?.who.includes(persona.id) && isMine(r))
  const mine = data.requirements.filter((r) => (r.OwnerPersona || 'pm') === persona.id && isMine(r))
  const active = data.requirements.filter((r) => r.Status !== 'Cancelled').sort((a, b) => (b.UpdatedAt ?? '').localeCompare(a.UpdatedAt ?? ''))
  const shown = (builder ? active.filter((r) => r.Status !== 'Accepted') : active).slice(0, 6)
  const title = (id: string) => data.requirements.find((r) => r.RequirementId === id)?.Title || id
  const activity = [...data.audit].sort((a, b) => b.OccurredAt.localeCompare(a.OccurredAt)).slice(0, 8)
  const n = yours.length
  const message = builder
    ? n ? <><span className="font-semibold text-white">{n} requirement{n > 1 ? 's' : ''}</span> {n > 1 ? 'are' : 'is'} waiting on you. Describe a new need any time; the agent asks the rest.</>
      : <>Nothing is waiting on you. Describe a new need and the agent asks what contracting will need to know.</>
    : <>Packages reach you for review once they're submitted. {n ? <><span className="font-semibold text-white">{n}</span> waiting now.</> : 'None are waiting now.'}</>

  return (
    <div className="space-y-6">
      <section className="ss-hero sheen rounded-2xl px-6 py-5 md:px-8">
        <div className="relative z-10 flex flex-col items-center gap-8 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="ss-rise flex items-center gap-3" style={{ ['--d' as string]: '0.05s' }}>
              <PersonaAvatar id={persona.id} short={persona.short} size={60} />
              <div className="min-w-0">
                <p className="text-sm text-white/80">{greeting()} · My workspace</p>
                <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{persona.name}</h1>
                <p className="truncate text-xs text-white/75">{persona.role}</p>
              </div>
            </div>
            <p className="ss-rise max-w-xl text-lg text-white/90" style={{ ['--d' as string]: '0.15s' }}>{message}</p>
            <div className="ss-rise grid grid-cols-2 gap-3 pt-1 2xl:grid-cols-4" style={{ ['--d' as string]: '0.3s' }}>
              {tiles(data, persona.id === 'pm' || mine.length ? mine : data.requirements).map((x) => <HeroTile key={x.label} icon={x.icon} label={x.label} value={<CountUp value={x.value} />} sub={x.sub} />)}
            </div>
          </div>
          <div className="ss-rise hidden md:block lg:hidden xl:block" style={{ ['--d' as string]: '0.2s' }}><NeedReader /></div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-8">
          {builder && (
            <div className="space-y-3">
              <SectionHeader title="Start a requirement" description="Describe the need in your own words, or start from an example" />
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                <Link to="/new" className="ss-lift group flex items-center gap-3 rounded-2xl border border-[var(--ss-brand-2)]/50 bg-card p-4">
                  <span className="ss-hero flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><Plus className="relative z-10 h-5 w-5" /></span>
                  <span className="min-w-0"><span className="block font-semibold">New requirement</span><span className="block text-xs text-muted-foreground">A good or a service your organization needs</span></span>
                </Link>
                {STARTS.map((s) => (
                  <Link key={s.n} to={`/new?example=${s.n}`} className="ss-lift flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                    <Sparkles className="h-4 w-4 shrink-0 rq-brand-text" />
                    <span className="min-w-0"><span className="block text-sm font-medium">{s.title}</span><span className="block text-xs text-muted-foreground">{s.sub}</span></span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <SectionHeader title={builder ? 'Requirements in progress' : 'Requirements'} description={builder ? 'Drafts and packages on their way to contracting' : 'What the program offices are building'} link={{ to: '/requirements', label: 'All requirements' }} />
            {shown.length
              ? <div className="space-y-3">{shown.map((r, i) => <RequirementCard key={r.RequirementId} r={r} docs={data.docs} n={i} />)}</div>
              : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No requirements in progress. <Link to="/new" className="underline">Start one</Link>.</p>}
          </div>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-6 xl:self-start">
          <SectionHeader title="Latest on the record" description="Who did what, people and agents" />
          <ol className="space-y-3 rounded-2xl border border-border bg-card p-4">
            {activity.map((e) => (
              <li key={e.EventId} className="text-sm">
                <p className="font-medium">{e.Action.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^(\w)(.*)$/, (_, a: string, b: string) => a + b.toLowerCase())}</p>
                <p className="truncate text-xs text-muted-foreground">{actorName(e.Actor)} · {when(e.OccurredAt)}</p>
                <p className="truncate text-xs text-muted-foreground">{title(e.SolicitationId)}</p>
              </li>
            ))}
            {!activity.length && <li className="text-sm text-muted-foreground">Nothing yet. Every save, agent draft and review shows here.</li>}
          </ol>
          {builder && <Button asChild variant="outline" className="w-full"><Link to="/new">Start a requirement<ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>}
        </aside>
      </div>
    </div>
  )
}
