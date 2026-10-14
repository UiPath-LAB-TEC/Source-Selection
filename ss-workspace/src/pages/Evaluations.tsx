import { useState } from 'react'
import { useScopedData } from '../hooks/useFramework'
import { Link } from 'react-router-dom'
import { Archive, FolderOpen, Plus } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Card, CardContent } from '@uipath/apollo-wind/components/ui/card'
import { EmptyState } from '@uipath/apollo-wind/components/ui/empty-state'
import { EvaluationCard } from '../components/EvaluationCard'
import { usePersona } from '../hooks/usePersona'
import { isClosed } from '../lib/roles'
import type { Solicitation } from '../lib/types'
import { useStartCase } from '../lib/useStartCase'
import { useTerms } from '@forms/lib/terms'

type Show = 'active' | 'done'

const newest = (a: Solicitation, b: Solicitation) => (b.StartedAt ?? '').localeCompare(a.StartedAt ?? '') || a.SolicitationId.localeCompare(b.SolicitationId)

/**
 * Every source selection in the tenant, regardless of who is signed in. In-progress work shows first; completed ones
 * (awarded or cancelled) sit behind their own filter, the same way My tasks separates open and completed tasks.
 */
export function Evaluations() {
  const { data } = useScopedData()
  const { starting, start } = useStartCase()
  const { persona } = usePersona()
  const t = useTerms()
  const many = t.sled ? 'RFP evaluations' : 'Source selections'
  const [show, setShow] = useState<Show>('active')
  if (!data) return null
  const active = data.solicitations.filter((s) => !isClosed(s)).sort(newest)
  const done = data.solicitations.filter(isClosed).sort(newest)
  const rows = show === 'active' ? active : done

  const tab = (id: Show, label: string, n: number) => (
    <button type="button" role="tab" aria-selected={show === id} onClick={() => setShow(id)}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${show === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
      {label}
      <span className={`rounded-full px-1.5 text-xs tabular-nums ${show === id ? (id === 'active' && n ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground') : 'bg-muted/70'}`}>{n}</span>
    </button>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Evaluations</h1>
          <p className="text-sm text-muted-foreground">
            {show === 'active' ? `${many} underway, or ready for the ${t.co} to start.` : 'Awarded or cancelled. The full record stays open to read.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Show evaluations" className="inline-flex rounded-xl border border-border bg-muted/50 p-1">
            {tab('active', 'In progress', active.length)}
            {tab('done', 'Completed', done.length)}
          </div>
          {persona.id === 'co' && <Button asChild><Link to="/new" state={{ from: '/evaluations' }}><Plus className="mr-1.5 h-4 w-4" />New {t.process}</Link></Button>}
        </div>
      </div>

      {!rows.length && (
        <Card><CardContent className="p-8">
          {show === 'active'
            ? <EmptyState icon={<FolderOpen className="h-6 w-6" />} title={`No ${many.toLowerCase()} in progress`}
                description={`${t.sled ? 'An RFP evaluation' : 'A source selection'} shows here once the ${t.co} creates it.`}
                secondaryAction={done.length ? { label: `View ${done.length} completed`, onClick: () => setShow('done') } : undefined} />
            : <EmptyState icon={<Archive className="h-6 w-6" />} title="Nothing completed yet"
                description={`Awarded and cancelled ${many.toLowerCase()} move here, with their full record.`} />}
        </CardContent></Card>
      )}

      {rows.length > 0 && (
        <div className="grid gap-4 2xl:grid-cols-2" role="tabpanel" aria-label={show === 'active' ? 'In progress' : 'Completed'}>
          {rows.map((s, i) => <div key={s.SolicitationId} className="min-w-0"><EvaluationCard s={s} n={i} starting={starting} onStart={start} /></div>)}
        </div>
      )}
    </div>
  )
}
