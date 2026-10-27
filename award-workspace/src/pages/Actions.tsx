import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Section } from '@ss/components/Bits'
import { when } from '@ss/lib/eval'
import { ActionGroups } from '../components/ActionItems'
import { useAwardPersona } from '../hooks/usePersona'
import { actionsFor, lastWatched, useRunWatch } from '../lib/alerts'
import { useAwardData, useScopedAwardData } from '../lib/data'

type Who = 'mine' | 'all'

/**
 * Action items across the contracts, from the daily contract watch: what needs action now, then what's in hand and
 * what's coming up, folded away. The signed-in person's own first; the whole team's one tab away.
 */
export function Actions() {
  const { data } = useScopedAwardData()
  const { preview } = useAwardData()
  const { persona } = useAwardPersona()
  const { running, run } = useRunWatch()
  const [who, setWho] = useState<Who>('mine')
  if (!data) return null
  const mine = actionsFor(data, persona)
  const everyone = actionsFor(data, persona, true)
  const groups = who === 'mine' ? mine : everyone
  const watched = lastWatched(data)
  const tab = (id: Who, label: string, n: number) => (
    <button type="button" role="tab" aria-selected={who === id} onClick={() => setWho(id)}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${who === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
      {label}<span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{n}</span>
    </button>
  )
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Action items</h1>
          <p className="text-sm text-muted-foreground">
            Deadlines, money running short and work that's late, found by the contract watch{watched ? `, last run ${when(watched)}` : ' every morning'}.
          </p>
        </div>
        {persona.id === 'co' && (
          <Button variant="outline" onClick={run} disabled={running || preview} title={preview ? 'Not available in the preview' : undefined}>
            {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}Check now
          </Button>
        )}
      </div>
      <Section title="Needs action" description="Not picked up yet, and overdue or due within 14 days."
        actions={<div role="tablist" aria-label="Whose action items" className="inline-flex rounded-xl border border-border bg-muted/50 p-1">
          {tab('mine', 'Mine', mine.needs.length)}{tab('all', 'Everyone', everyone.needs.length)}
        </div>}>
        <ActionGroups groups={groups} showContract empty={who === 'mine' ? 'Nothing needs your action right now.' : 'Nothing needs action on any contract.'} />
      </Section>
    </div>
  )
}
