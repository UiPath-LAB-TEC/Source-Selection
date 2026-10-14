import { useMemo, useState } from 'react'
import { useTerms } from '@forms/lib/terms'
import { Link } from 'react-router-dom'
import { useBackState } from '../lib/backlink'
import { Sparkles, Check } from 'lucide-react'
import { KindBadge } from './Bits'
import { OfferorAvatar } from './Flair'
import { KIND_ORDER } from '../lib/eval'
import type { Factor, Finding, Offeror } from '../lib/types'

const KIND_GROUPS = [
  { id: 'strength', label: 'Strengths', match: (k: string) => k.includes('Strength') },
  { id: 'weakness', label: 'Weaknesses', match: (k: string) => k.includes('Weakness') },
  { id: 'deficiency', label: 'Deficiencies', match: (k: string) => k === 'Deficiency' },
  { id: 'risk', label: 'Risks', match: (k: string) => k === 'Risk' },
] as const

const VOL_SHORT: Record<string, string> = { technical: 'Technical', management: 'Management', pastPerformance: 'Past Perf.', price: 'Price', cover: 'Cover' }

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground'}`}>
      {on && <Check className="h-3 w-3" aria-hidden="true" />}{children}
    </button>
  )
}

/** Agent-drafted findings, filterable by factor, offeror and kind; one column per offeror. */
// (Named for the framework in use: criterion and proposer in a State & Local RFP.)
export function FindingsBoard({ findings, offerors, factors, sol }: { findings: Finding[]; offerors: Offeror[]; factors: Factor[]; sol: string }) {
  const backState = useBackState()
  const terms = useTerms()
  const [factor, setFactor] = useState<string>('all')
  const [offeror, setOfferor] = useState<string>('all')
  const [kind, setKind] = useState<string>('all')

  const byFactor = (fid: string) => findings.filter((f) => fid === 'all' || f.FactorId === fid)
  const shown = useMemo(() => findings
    .filter((f) => factor === 'all' || f.FactorId === factor)
    .filter((f) => offeror === 'all' || f.OfferorId === offeror)
    .filter((f) => kind === 'all' || KIND_GROUPS.find((g) => g.id === kind)!.match(f.Kind))
    .sort((a, b) => KIND_ORDER.indexOf(a.Kind) - KIND_ORDER.indexOf(b.Kind)), [findings, factor, offeror, kind])

  if (!findings.length) return <p className="text-sm text-muted-foreground">The evaluation assistant has not drafted findings yet.</p>
  const columns = offerors.filter((o) => offeror === 'all' || o.OfferorId === offeror)
  const factorsShown = factors.filter((f) => factor === 'all' || f.id === factor)

  return (
    <div className="space-y-4">
      <div className="space-y-2.5 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs font-medium text-muted-foreground">{terms.Factor}</span>
          <Chip on={factor === 'all'} onClick={() => setFactor('all')}>All {terms.factors} <span className="opacity-70">{findings.length}</span></Chip>
          {factors.map((f) => <Chip key={f.id} on={factor === f.id} onClick={() => setFactor(f.id)}>{f.name} <span className="opacity-70">{byFactor(f.id).length}</span></Chip>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs font-medium text-muted-foreground">{terms.Offeror}</span>
          <Chip on={offeror === 'all'} onClick={() => setOfferor('all')}>All {terms.offerors}</Chip>
          {offerors.map((o) => <Chip key={o.OfferorId} on={offeror === o.OfferorId} onClick={() => setOfferor(o.OfferorId)}>{o.Name}</Chip>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs font-medium text-muted-foreground">Type</span>
          <Chip on={kind === 'all'} onClick={() => setKind('all')}>All types</Chip>
          {KIND_GROUPS.map((g) => {
            const n = byFactor(factor).filter((f) => g.match(f.Kind)).length
            return n ? <Chip key={g.id} on={kind === g.id} onClick={() => setKind(g.id)}>{g.label} <span className="opacity-70">{n}</span></Chip> : null
          })}
        </div>
        <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-primary" />Drafted by the evaluation assistant, each cited to a proposal page. Evaluators accept, edit or reject them in their worksheets.</p>
      </div>

      <div className={`grid gap-4 ${columns.length > 2 ? 'lg:grid-cols-2 xl:grid-cols-3' : columns.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {columns.map((o) => {
          const mine = shown.filter((f) => f.OfferorId === o.OfferorId)
          return (
            <section key={o.OfferorId} className="ss-in flex flex-col rounded-2xl border border-border bg-card">
              <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
                <OfferorAvatar name={o.Name} index={offerors.indexOf(o)} size={30} />
                <span className="min-w-0 flex-1 truncate font-semibold">{o.Name}</span>
                <span className="text-xs text-muted-foreground">{mine.length} finding{mine.length === 1 ? '' : 's'}</span>
              </header>
              <div className="space-y-4 p-4">
                {!mine.length && <p className="text-sm text-muted-foreground">No findings match these filters.</p>}
                {factorsShown.map((f) => {
                  const rows = mine.filter((x) => x.FactorId === f.id)
                  if (!rows.length) return null
                  return (
                    <div key={f.id} className="space-y-2">
                      {factor === 'all' && <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{f.name}</h3>}
                      <ul className="space-y-2">
                        {rows.map((x) => (
                          <li key={x.FindingId}>
                            <Link to={`/s/${encodeURIComponent(sol)}/trace/${encodeURIComponent(x.OfferorId)}/${x.FactorId}?finding=${encodeURIComponent(x.FindingId)}`} state={backState}
                              className="group block space-y-1.5 rounded-xl border border-border px-3 py-2.5 hover:border-primary">
                              <span className="flex items-center justify-between gap-2">
                                <KindBadge kind={x.Kind} />
                                <span className="shrink-0 text-[11px] text-muted-foreground group-hover:text-primary">{VOL_SHORT[x.CitationVolume] ?? x.CitationVolume} p.{x.CitationPage} →</span>
                              </span>
                              <span className="block text-sm leading-snug">{x.FindingText}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
