import { useState } from 'react'
import { useScopedData } from '../hooks/useFramework'
import { CheckCircle2, Inbox, PartyPopper } from 'lucide-react'
import { Card, CardContent } from '@uipath/apollo-wind/components/ui/card'
import { EmptyState } from '@uipath/apollo-wind/components/ui/empty-state'
import { Pill } from '../components/Bits'
import { usePersona } from '../hooks/usePersona'
import { OpenTaskButton, TaskContextLine, stillOpen } from '../components/TaskDialog'
import { tasksFor } from '../lib/roles'
import { taskTitle, useTerms } from '@forms/lib/terms'

type Show = 'open' | 'done'

/**
 * Action Center tasks routed to the selected persona (by task label, and evaluator slot for evaluators). Open work
 * comes first; completed tasks sit behind their own filter and read as done, so a long history never looks like a
 * to-do list.
 */
export function MyTasks() {
  const { tasks, data } = useScopedData()
  const { persona } = usePersona()
  const terms = useTerms()
  const mine = tasksFor(tasks, persona)
  const open = mine.filter((t) => stillOpen(t, data?.solicitations)).sort((a, b) => b.createdTime.localeCompare(a.createdTime))
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
          <p className="text-sm text-muted-foreground">Work assigned to {persona.name}, {persona.label}, in Action Center. Tasks open right here.</p>
        </div>
        {mine.length > 0 && (
          <div role="tablist" aria-label="Show tasks" className="inline-flex rounded-xl border border-border bg-muted/50 p-1">
            {tab('open', 'Open', open.length)}
            {tab('done', 'Completed', done.length)}
          </div>
        )}
      </div>

      {!mine.length && (
        <Card><CardContent className="p-8">
          <EmptyState icon={<Inbox className="h-6 w-6" />} title="Nothing assigned"
            description={`Tasks appear here when the ${terms.process} case reaches a step for this role.`} />
        </CardContent></Card>
      )}

      {mine.length > 0 && show === 'open' && !open.length && (
        <Card><CardContent className="p-8">
          <EmptyState icon={<PartyPopper className="h-6 w-6" />} title="You're all caught up"
            description={`Nothing is waiting on ${persona.name.split(' ')[0]} right now. New work appears here when ${terms.sled ? 'an' : 'a'} ${terms.process} reaches a step for this role.`}
            secondaryAction={done.length ? { label: `View ${done.length} completed task${done.length === 1 ? '' : 's'}`, onClick: () => setShow('done') } : undefined} />
        </CardContent></Card>
      )}

      {rows.length > 0 && (
        <ul className="space-y-2" aria-label={show === 'open' ? 'Open tasks' : 'Completed tasks'}>
          {rows.map((t) => show === 'open' ? (
            <li key={t.id}>
              <Card className="border-primary/40">
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{taskTitle(t.title, terms.id)}</div>
                    <TaskContextLine task={t} />
                  </div>
                  <Pill>{t.priority}</Pill>
                  <OpenTaskButton task={t} />
                </CardContent>
              </Card>
            </li>
          ) : (
            <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ss-good)]" aria-label="Completed" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-muted-foreground">{taskTitle(t.title, terms.id)}</div>
                <TaskContextLine task={t} done />
              </div>
              <OpenTaskButton task={t} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
