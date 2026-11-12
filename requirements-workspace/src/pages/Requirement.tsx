import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Bot, Building2, CalendarClock, Check, ChevronDown, CircleDashed, FilePen, Package, UserCheck, Wallet } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { AgencyMark } from '@ss/components/Flair'
import { appUrl } from '@ss/lib/apps'
import { when } from '@ss/lib/eval'
import { actorName } from '@ss/lib/types'
import { StageBar } from '../components/StageBar'
import { StatusChip, buildPath } from '../components/RequirementCard'
import { useRequirementsData } from '../lib/data'
import { nextOf } from '../lib/next'
import { onDay, packageFor, usd, valueFlags, valueOf } from '../lib/package'
import { analysisOf, isProduct, isService, specOf } from '../lib/types'
import type { DocRow, Spec } from '../lib/types'
import { textToSections } from '../lib/agents'

function Card({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-base font-semibold">{title}</h2>{description && <p className="text-sm text-muted-foreground">{description}</p>}</div>
        {actions}
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">{children}</div>
    </section>
  )
}

/** A drafted document: "## " lines as headings, "- " lines as bullets, the rest as paragraphs. */
export function DocText({ text }: { text: string }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      {textToSections(text).map((s, i) => (
        <div key={i} className="space-y-1.5">
          {s.heading && <h3 className="font-semibold">{s.heading}</h3>}
          {s.text.split(/\n(?=- )|\n\n/).map((p, j) => (/^- /.test(p)
            ? <ul key={j} className="list-disc space-y-0.5 pl-5">{p.split('\n').filter(Boolean).map((l, k) => <li key={k}>{l.replace(/^- /, '')}</li>)}</ul>
            : <p key={j} className="whitespace-pre-line">{p}</p>))}
        </div>
      ))}
    </div>
  )
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  if (!children || (Array.isArray(children) && !children.length)) return null
  return <><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0">{children}</dd></>
}

function SpecView({ s, kind }: { s: Spec; kind?: string }) {
  const list = (xs: string[]) => xs.length ? <ul className="list-disc pl-5">{xs.map((x, i) => <li key={i}>{x}</li>)}</ul> : null
  return (
    <div className="space-y-5 text-sm">
      {isProduct(kind) && s.items.map((it, i) => (
        <div key={i} className="space-y-1">
          <p className="font-medium">{it.quantity} {it.unit} · {it.name}</p>
          {list(it.characteristics)}
        </div>
      ))}
      <dl className="grid grid-cols-[minmax(0,160px)_minmax(0,1fr)] gap-x-4 gap-y-2">
        {isProduct(kind) && <>
          <Row k="Standards">{s.standards.join(' · ')}</Row>
          <Row k="Deliver to">{s.deliveryPlace}</Row>
          <Row k="Delivery">{s.deliveryDate}</Row>
          <Row k="Warranty">{s.warranty}</Row>
          <Row k="Support">{s.support}</Row>
          <Row k="Inspection">{s.inspection}</Row>
        </>}
        {isService(kind) && <>
          <Row k="Objective">{s.objective}</Row>
          <Row k="Scope">{s.scope}</Row>
          <Row k="Tasks">{list(s.tasks)}</Row>
          <Row k="Performance standards">{s.performanceStandards.length ? list(s.performanceStandards.map((p) => `${p.standard} · ${p.aql} · ${p.method}`)) : null}</Row>
          <Row k="Deliverables">{s.deliverables.length ? list(s.deliverables.map((d) => `${d.name} · ${d.due}`)) : null}</Row>
          <Row k="Place">{s.placeOfPerformance}</Row>
          <Row k="Period">{s.periodOfPerformance}</Row>
          <Row k="Security">{s.security}</Row>
        </>}
      </dl>
    </div>
  )
}

function DocLine({ label, why, doc, reviewer }: { label: string; why: string; doc?: DocRow; reviewer?: string }) {
  const [open, setOpen] = useState(false)
  const has = !!doc?.Text.trim()
  return (
    <li className="border-b border-border last:border-0">
      <button type="button" disabled={!has} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 py-3 text-left disabled:cursor-default">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${doc?.Status === 'Final' ? 'bg-[var(--ss-good)] text-white' : reviewer ? 'bg-muted text-muted-foreground' : 'bg-[var(--ss-brand-2)]/10 rq-brand-text'}`}>
          {doc?.Status === 'Final' ? <Check className="h-3.5 w-3.5" /> : reviewer ? <UserCheck className="h-3.5 w-3.5" /> : has ? <FilePen className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{label}</span><span className="block truncate text-xs text-muted-foreground">{why}</span></span>
        <span className="shrink-0 text-xs text-muted-foreground">{reviewer ? `After submission · ${reviewer}` : has ? `${doc!.Status}${doc!.EditedBy ? ` · ${doc!.EditedBy}` : ''}` : 'Not started'}</span>
        {has && <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && doc && <div className="pb-4 pl-10"><DocText text={doc.Text} /></div>}
    </li>
  )
}

/** One requirement's record: the need, what the agent found, the requirement, the package, and the trail. */
export function Requirement() {
  const { id } = useParams()
  const { data } = useRequirementsData()
  if (!data) return null
  const r = data.requirements.find((x) => x.RequirementId === id)
  if (!r) return <p className="text-sm text-muted-foreground">No requirement {id}. <Link to="/requirements" className="underline">See all requirements</Link></p>
  const a = analysisOf(r)
  const s = specOf(r)
  const docs = data.docs.filter((d) => d.RequirementId === r.RequirementId)
  const items = packageFor(r, a)
  const value = valueOf(r, a)
  const applies = [...(a?.flags ?? []), ...valueFlags(value, r.Agency)]
  const trail = data.audit.filter((e) => e.SolicitationId === r.RequirementId).sort((x, y) => y.OccurredAt.localeCompare(x.OccurredAt))
  const next = nextOf(r, data.docs)
  const draft = r.Status === 'Draft' || r.Status === 'Returned'
  const sol = r.SolicitationId ? data.solicitations.find((x) => x.SolicitationId === r.SolicitationId) : undefined
  const stage = r.Status === 'Accepted' ? 'Accepted' : r.Status === 'Submitted' ? 'Review' : r.Stage

  return (
    <div className="space-y-6">
      <section className="ss-hero sheen rounded-2xl px-6 py-5 md:px-8">
        <div className="relative z-10 space-y-5">
          <div className="flex flex-wrap items-start gap-4">
            <AgencyMark agency={r.Agency} size={52} />
            <div className="min-w-0 flex-1 basis-72 space-y-1">
              <p className="font-mono text-xs text-white/75">{r.RequirementId}</p>
              <h1 className="text-2xl font-semibold leading-tight tracking-tight md:text-3xl">{r.Title || 'Untitled requirement'}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/85">
                <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{r.Office || r.Agency}</span>
                {(a?.kind || r.Kind) && <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{a?.kind || r.Kind}</span>}
                {value > 0 && <span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5" />about {usd(value)}</span>}
                {r.NeedBy && <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />Needed by {onDay(r.NeedBy)}</span>}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/90 px-0.5 py-0.5"><StatusChip r={r} /></span>
              {r.SolicitationId && <Button variant="secondary" size="sm" asChild><a href={appUrl('source-selection', `/s/${encodeURIComponent(r.SolicitationId)}`)}>Open in Source Selection<ArrowUpRight className="ml-1.5 h-3.5 w-3.5" /></a></Button>}
              {draft && <Button size="sm" variant="secondary" asChild><Link to={buildPath(r)}>Continue building<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link></Button>}
            </div>
          </div>
          <StageBar stage={stage} onDark />
          {next && <p className="text-sm text-white/85">Next: <span className="font-medium text-white">{next.label}</span> · {next.whoLabel}</p>}
          {sol && <p className="text-sm text-white/85">Now solicitation <span className="font-mono text-xs">{sol.SolicitationId}</span>, {sol.Title}: {sol.Status === 'Awarded' ? 'awarded' : `${sol.Stage.toLowerCase()} in Source Selection`}.</p>}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card title="The need" description="As the program office wrote it">
            <p className="whitespace-pre-line text-sm leading-relaxed">{r.Need}</p>
            {r.Budget ? <p className="mt-3 text-xs text-muted-foreground">Rough budget: {usd(r.Budget)}</p> : null}
          </Card>
          {(s.items.length > 0 || s.objective) && <Card title="Requirement" description="What gets bought, as the program office confirmed it"><SpecView s={s} kind={a?.kind || r.Kind} /></Card>}
          <Card title="Package" description={`${items.filter((i) => i.producer !== 'reviewer' && docs.some((d) => d.Kind === i.kind && d.Text.trim())).length} of ${items.filter((i) => i.producer !== 'reviewer').length} drafted`}>
            <ul>{items.map((i) => <DocLine key={i.kind} label={i.label} why={i.why} doc={docs.find((d) => d.Kind === i.kind)} reviewer={i.producer === 'reviewer' ? i.who : undefined} />)}</ul>
          </Card>
        </div>
        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          {a && (
            <Card title="What the agent found" description={`Round ${a.round} · ${when(a.at)}`}>
              <p className="text-sm">{a.summary}</p>
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                {a.psc.code && <><dt className="text-muted-foreground">PSC</dt><dd><span className="font-mono text-xs">{a.psc.code}</span> {a.psc.name}</dd></>}
                {a.naics.code && <><dt className="text-muted-foreground">NAICS</dt><dd><span className="font-mono text-xs">{a.naics.code}</span> {a.naics.name}{a.naics.sizeStandard ? ` · ${a.naics.sizeStandard}` : ''}</dd></>}
                <dt className="text-muted-foreground">Commercial</dt><dd>{a.commercial.likely ? 'Likely' : 'Unlikely'}</dd>
              </dl>
              {applies.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-border pt-4">
                  {applies.map((f) => <li key={f.id} className="flex gap-2 text-sm"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--ss-warn)]" aria-hidden /><span><span className="font-medium">{f.label}</span><span className="block text-xs text-muted-foreground">{f.reason}</span></span></li>)}
                </ul>
              )}
            </Card>
          )}
          <Card title="Record" description="Every save, agent draft and review">
            <ol className="space-y-3">
              {trail.slice(0, 20).map((e) => (
                <li key={e.EventId} className="flex gap-2.5 text-sm">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${/_/.test(e.Actor) ? 'bg-[var(--ss-brand-2)] text-white' : 'bg-muted text-muted-foreground'}`}>{/_/.test(e.Actor) ? <Bot className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}</span>
                  <span className="min-w-0">
                    <span className="block font-medium">{e.Action.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^(\w)(.*)$/, (_, x: string, y: string) => x + y.toLowerCase())}{e.Detail ? <span className="font-normal text-muted-foreground"> · {e.Detail}</span> : null}</span>
                    <span className="block text-xs text-muted-foreground">{actorName(e.Actor)} · {when(e.OccurredAt)}</span>
                  </span>
                </li>
              ))}
              {!trail.length && <li className="text-sm text-muted-foreground">Nothing on the record yet.</li>}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  )
}
