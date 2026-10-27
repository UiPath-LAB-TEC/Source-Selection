import { useState } from 'react'
import { toast } from 'sonner'
import { Buckets } from '@uipath/uipath-typescript/buckets'
import { Entities } from '@uipath/uipath-typescript/entities'
import { Processes } from '@uipath/uipath-typescript/processes'
import { useAuth } from '@ss/hooks/useAuth'
import { AWARD_ENTITY, AWARD_PROCESS_FOLDER } from '@ss/lib/apps'
import { DEMO_PANEL_EMAIL, ENTITY, FOLDER } from '@ss/lib/data'
import { dayOf } from '@award/lib/clocks'
import { useAwardPersona } from '../hooks/usePersona'
import type { AlertRow, ScheduleRow } from './award'
import { useAwardData } from './data'

/** The Maestro BPMN process that reviews a deliverable: the reviewer agent, then the COR's task (Award solution). */
export const REVIEW_PROCESS = 'DeliverableReviewProcess'

/** Where a received deliverable is filed with the record: SS-Records <sol>/deliverables/<code>-<month>.pdf. */
export const deliverablePath = (r: ScheduleRow) => `${r.SolicitationId}/deliverables/${r.ScheduleId.replace(`${r.SolicitationId}-deliverable-`, '')}.pdf`

/**
 * Record receipt: the contractor's deliverable (the PDF they sent) is filed with the record, the schedule row marks it
 * received, and the review starts in Maestro: the reviewer agent checks it against the contract, then the COR gets the
 * task. Its action item moves to In hand while the review runs. Every role is the signed-in demo user, as elsewhere.
 */
export function useRecordReceipt() {
  const { sdk } = useAuth()
  const { reload, preview } = useAwardData()
  const { persona } = useAwardPersona()
  const [busy, setBusy] = useState<string>()
  const record = async (row: ScheduleRow, file: File, alert?: AlertRow) => {
    if (preview) { toast.info('The preview doesn’t save changes.'); return false }
    setBusy(row.ScheduleId)
    try {
      const path = deliverablePath(row)
      await new Buckets(sdk).uploadFile({ name: 'SS-Records' }, path, file, FOLDER)
      const e = new Entities(sdk)
      const now = new Date().toISOString()
      await e.updateRecord({ name: AWARD_ENTITY.schedule }, row.Id, { ReceivedDay: dayOf(now), Status: 'Received', FilePath: `SS-Records/${path}` })
      const started = await new Processes(sdk).start({ name: REVIEW_PROCESS }, { ...AWARD_PROCESS_FOLDER,
        inputArguments: JSON.stringify({ solicitationId: row.SolicitationId, scheduleId: row.ScheduleId, cor: DEMO_PANEL_EMAIL }) })
      const key = started[0]?.key
      if (key) await e.updateRecord({ name: AWARD_ENTITY.schedule }, row.Id, { ProcessInstanceId: key })
      if (alert) await e.updateRecord({ name: AWARD_ENTITY.alerts }, alert.Id, { Status: 'Acknowledged', ActedBy: persona.name, ActedAt: now, Reason: 'Received; under review' })
      await e.insertRecords({ name: ENTITY.audit }, [{ EventId: `${row.SolicitationId}-${row.ScheduleId}-DeliverableReceived-${Date.now()}`, SolicitationId: row.SolicitationId,
        EntityRef: row.ScheduleId, Action: 'DeliverableReceived', Actor: persona.name, OccurredAt: now, Detail: `${row.Name}: ${file.name} filed; the review has started` }])
      toast.success(`${row.Name} filed. The agent is checking it against the contract; the review task follows in a minute or two.`)
      await reload()
      return true
    } catch (err) {
      const msg = (err as Error).message
      toast.error(/could not be found/i.test(msg) ? 'The deliverable review process is not deployed yet.' : `Could not record it: ${msg}`)
      return false
    } finally {
      setBusy(undefined)
    }
  }
  return { busy, record }
}
