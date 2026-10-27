import { useState } from 'react'
import { FileStack } from 'lucide-react'
import { Card, CardContent } from '@uipath/apollo-wind/components/ui/card'
import { EmptyState } from '@uipath/apollo-wind/components/ui/empty-state'
import { Section } from '@ss/components/Bits'
import type { Solicitation } from '@ss/lib/types'
import { ContractCard } from '../components/ContractCard'
import { isLive } from '../lib/award'
import type { AwardDataset } from '../lib/award'
import { grouped } from '../lib/alerts'
import { useScopedAwardData } from '../lib/data'
import { statusOf } from '../lib/status'

type Show = 'active' | 'closed'

/** Signed contracts, the ones needing action first, then the soonest to end. */
export function contractsOf(d: AwardDataset) {
  const needs = (s: Solicitation) => grouped(d.alerts.filter((a) => a.SolicitationId === s.SolicitationId && isLive(a))).needs.length
  const ends = (s: Solicitation) => d.awards.find((a) => a.SolicitationId === s.SolicitationId)?.PeriodEnd ?? '9999'
  const sort = (a: Solicitation, b: Solicitation) => needs(b) - needs(a) || ends(a).localeCompare(ends(b))
  return {
    active: d.solicitations.filter((s) => statusOf(d, s) === 'active').sort(sort),
    closed: d.solicitations.filter((s) => statusOf(d, s) === 'closed'),
  }
}

/** Contracts: everything signed, whether awarded here or brought in, from the first day of performance to closeout. */
export function Contracts() {
  const { data } = useScopedAwardData()
  const [show, setShow] = useState<Show>('active')
  if (!data) return null
  const { active, closed } = contractsOf(data)
  const rows = show === 'active' ? active : closed
  const awardOf = (s: Solicitation) => data.awards.find((a) => a.SolicitationId === s.SolicitationId)
  const tab = (id: Show, label: string, n: number) => (
    <button type="button" role="tab" aria-selected={show === id} onClick={() => setShow(id)}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${show === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
      {label}<span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{n}</span>
    </button>
  )
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contracts</h1>
        <p className="text-sm text-muted-foreground">Signed contracts, from the first day of performance to closeout. The contract watch checks each one every morning.</p>
      </div>
      <Section title={show === 'active' ? 'Active' : 'Closed'} description={show === 'active' ? 'Performing now. The ones needing action come first.' : 'Closed out.'}
        actions={<div role="tablist" aria-label="Show contracts" className="inline-flex rounded-xl border border-border bg-muted/50 p-1">
          {tab('active', 'Active', active.length)}{tab('closed', 'Closed', closed.length)}
        </div>}>
        {rows.length
          ? <div className="space-y-3">{rows.map((s, n) => <ContractCard key={s.SolicitationId} s={s} n={n} award={awardOf(s)} />)}</div>
          : <Card><CardContent className="p-8"><EmptyState icon={<FileStack className="h-6 w-6" />} title={show === 'active' ? 'No active contracts' : 'No closed contracts'}
              description={show === 'active' ? 'A contract appears here the day its award is signed.' : 'Contracts appear here once they close out.'} /></CardContent></Card>}
      </Section>
    </div>
  )
}
