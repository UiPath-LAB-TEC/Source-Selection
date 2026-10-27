import { useState } from 'react'
import { SquareArrowOutUpRight } from 'lucide-react'
import type { TaskGetResponse } from '@uipath/uipath-typescript/tasks'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { AWARD_FORMS } from '@award/forms'
import { TaskDialogView, taskRun } from '@ss/components/TaskDialog'
import type { TaskForms } from '@ss/components/TaskDialog'
import type { Persona } from '@ss/lib/types'
import { useAwardPersona } from '../hooks/usePersona'
import { AWARD_PERSONAS } from '../lib/award'
import type { AwardRow } from '../lib/award'
import { useAwardData } from '../lib/data'

/** The Contract Management forms, as the shared task dialog renders them (the same ones Action Center shows). */
const FORMS: TaskForms = Object.fromEntries(Object.entries(AWARD_FORMS).map(([k, f]) => [k, f.render]))

/** The solicitation a task is about, once its context is read (withTaskContext). */
export const taskSolicitationId = (t: TaskGetResponse) => {
  const id = (t.data as Record<string, unknown> | null | undefined)?.solicitationId
  return typeof id === 'string' ? id : undefined
}

/** Who a task is routed to, by its label (contracting-officer, agency-counsel). */
export const taskOwner = (t: TaskGetResponse): Persona | undefined => AWARD_PERSONAS.find((p) => t.tags?.some((g) => g.name === p.taskLabel))

/** An award's open tasks from its current run: a task left by a cancelled or earlier run of the same number never shows. */
export function openAwardTasks(tasks: TaskGetResponse[], solicitationId: string, award?: AwardRow) {
  return tasks.filter((t) => {
    if (t.isCompleted || taskSolicitationId(t) !== solicitationId) return false
    const run = taskRun(t)
    return !award?.CaseInstanceId || !run || run === award.CaseInstanceId
  })
}

/** "Open task": the real form in a dialog, submitted straight to Action Center; the awards reload once it's done. */
export function OpenAwardTask({ task, label, size }: { task: TaskGetResponse; label?: string; size?: 'sm' | 'default' }) {
  const { reload } = useAwardData()
  const { persona } = useAwardPersona()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size={size} variant={task.isCompleted ? 'outline' : 'default'} onClick={() => setOpen(true)}>
        {label ?? (task.isCompleted ? 'View' : 'Open task')}<SquareArrowOutUpRight className="ml-1.5 h-3.5 w-3.5" />
      </Button>
      <TaskDialogView task={task} open={open} onOpenChange={setOpen} onCompleted={() => { void reload() }} forms={FORMS} actor={persona.name} record="award record" />
    </>
  )
}
