import { useState } from 'react'
import { CheckCircle2, ExternalLink, Inbox } from 'lucide-react'
import type { TaskGetResponse } from '@uipath/uipath-typescript/tasks'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Card, CardContent } from '@uipath/apollo-wind/components/ui/card'
import { EmptyState } from '@uipath/apollo-wind/components/ui/empty-state'
import { ACTION_CENTER } from '@ss/lib/data'
import { when } from '@ss/lib/eval'
import { tasksFor } from '@ss/lib/roles'
import type { Persona } from '@ss/lib/types'
import { useAwardPersona } from '../hooks/usePersona'
import { useScopedAwardData } from '../lib/data'

/** A persona's open Award tasks (routed by task label, as in Source Selection). */
export const myTasks = (tasks: TaskGetResponse[], p: Persona) => tasksFor(tasks, p).filter((t) => !t.isCompleted)

type Show = 'open' | 'done'

/** The Award process's Action Center tasks for the selected persona: open first, completed behind their own filter. */
export function MyTasks() {
  const { tasks } = useScopedAwardData()
  const { persona } = useAwardPersona()
  const mine = tasksFor(tasks, persona)
  const open = mine.filter((t) => !t.isCompleted).sort((a, b) => b.createdTime.localeCompare(a.createdTime))
  const done = mine.filter((t) => t.isCompleted).sort((a, b) => (b.completedTime ?? b.createdTime).localeCompare(a.completedTime ?? a.createdTime))
  const [show, setShow] = useState<Show>('open')
  const rows = show === 'open' ? open : done

  const tab = (id: Show, label: string, n: number) => (
    <button type="button" role="tab" aria-selected={show === id} onClick={() => setShow(id)}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${show === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
      {label}
      <span className={`rounded-full px-1.5 text-xs tabular-nums ${show === id ? (id === 'open' && n ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground') : 'bg-muted/70'}`}>{n}</span>
    </button>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My tasks</h1>
          <p className="text-sm text-muted-foreground">Award work assigned to {persona.name}, {persona.label}, in Action Center.</p>
        </div>
        <div role="tablist" aria-label="Show tasks" className="inline-flex rounded-xl border border-border bg-muted/50 p-1">
          {tab('open', 'In progress', open.length)}
          {tab('done', 'Completed', done.length)}
        </div>
      </div>

      {!rows.length ? (
        <Card><CardContent className="p-8">
          <EmptyState icon={show === 'open' ? <Inbox className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
            title={show === 'open' ? 'Nothing assigned' : 'Nothing completed yet'}
            description="Tasks appear here when an award reaches a step for this role." />
        </CardContent></Card>
      ) : (
        <Card><CardContent className="divide-y divide-border p-0">
          {rows.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">{t.isCompleted ? `Completed ${when(t.completedTime ?? t.createdTime)}` : `Assigned ${when(t.createdTime)}`}</p>
              </div>
              <Button size="sm" variant="outline" asChild>
                <a href={`${ACTION_CENTER}/${t.id}`} target="_blank" rel="noopener"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open in Action Center</a>
              </Button>
            </div>
          ))}
        </CardContent></Card>
      )}
    </div>
  )
}
