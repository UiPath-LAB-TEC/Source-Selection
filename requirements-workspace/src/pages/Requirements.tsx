import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { RequirementCard } from '../components/RequirementCard'
import { useScopedData } from '../lib/data'

const FILTERS = ['In progress', 'Completed'] as const

/** Every requirement, in progress or completed (accepted by contracting, or cancelled), newest first. */
export function Requirements() {
  const { data } = useScopedData()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('In progress')
  if (!data) return null
  const done = (s: string) => s === 'Accepted' || s === 'Cancelled'
  const rows = data.requirements.filter((r) => (filter === 'Completed') === done(r.Status)).sort((a, b) => (b.UpdatedAt ?? '').localeCompare(a.UpdatedAt ?? ''))
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Requirements</h1>
          <p className="text-sm text-muted-foreground">From the first description of a need to the package contracting accepts.</p>
        </div>
        <Button asChild><Link to="/new"><Plus className="mr-1.5 h-4 w-4" />Start a requirement</Link></Button>
      </div>
      <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label="Filter requirements">
        {FILTERS.map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-sm ${filter === f ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
            {f} <span className="tabular-nums text-muted-foreground">{data.requirements.filter((r) => (f === 'Completed') === done(r.Status)).length}</span>
          </button>
        ))}
      </div>
      {rows.length
        ? <div className="space-y-3">{rows.map((r, i) => <RequirementCard key={r.RequirementId} r={r} docs={data.docs} n={i} />)}</div>
        : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{filter === 'In progress' ? 'No requirements in progress.' : 'None accepted yet.'}</p>}
    </div>
  )
}
