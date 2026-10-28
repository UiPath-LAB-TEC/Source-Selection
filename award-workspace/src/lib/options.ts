import { useState } from 'react'
import { toast } from 'sonner'
import { Entities } from '@uipath/uipath-typescript/entities'
import { Processes } from '@uipath/uipath-typescript/processes'
import { useAuth } from '@ss/hooks/useAuth'
import { AWARD_ENTITY, AWARD_PROCESS_FOLDER } from '@ss/lib/apps'
import { DEMO_PANEL_EMAIL, ENTITY } from '@ss/lib/data'
import { useAwardPersona } from '../hooks/usePersona'
import type { AlertRow, ScheduleRow } from './award'
import { useAwardData } from './data'

/** The Maestro BPMN process that runs an option package: the checks and drafts, the funds, the CO's decision (Award solution). */
export const OPTION_PROCESS = 'OptionExerciseProcess'

/**
 * The schedule row an option or extension item is about. Items the watch raised before slice B carry no scheduleId in
 * their evidence, so those fall back to the row their subject names.
 */
export function optionRowId(a: AlertRow): string | undefined {
  if (a.Kind !== 'option' && a.Kind !== 'extension') return undefined
  try {
    const id = (JSON.parse(a.EvidenceJson ?? '{}') as { scheduleId?: string }).scheduleId
    if (id) return id
  } catch { /* fall back below */ }
  return a.Kind === 'extension' ? `${a.SolicitationId}-extension-EXT` : `${a.SolicitationId}-period-${a.Subject}`
}

/**
 * Start package: the option package starts in Maestro for an option or the extension. The robot gathers the checks and
 * the writer agent drafts the findings; then the Resource Manager certifies the funds and the CO decides, both in
 * Action Center. The item moves to In hand while it runs. Every role is the signed-in demo user, as elsewhere.
 */
export function useStartPackage() {
  const { sdk } = useAuth()
  const { reload, preview } = useAwardData()
  const { persona } = useAwardPersona()
  const [busy, setBusy] = useState<string>()
  const start = async (row: ScheduleRow, alert?: AlertRow) => {
    if (preview) { toast.info('The preview can’t start a run.'); return }
    setBusy(row.ScheduleId)
    try {
      const started = await new Processes(sdk).start({ name: OPTION_PROCESS }, { ...AWARD_PROCESS_FOLDER, inputArguments: JSON.stringify({
        solicitationId: row.SolicitationId, scheduleId: row.ScheduleId, contractingOfficer: DEMO_PANEL_EMAIL, resourceManager: DEMO_PANEL_EMAIL }) })
      const key = started[0]?.key
      const e = new Entities(sdk)
      const now = new Date().toISOString()
      if (key) await e.updateRecord({ name: AWARD_ENTITY.schedule }, row.Id, { ProcessInstanceId: key })
      if (alert) await e.updateRecord({ name: AWARD_ENTITY.alerts }, alert.Id, { Status: 'Acknowledged', ActedBy: persona.name, ActedAt: now, Reason: 'Option package started' })
      await e.insertRecords({ name: ENTITY.audit }, [{ EventId: `${row.SolicitationId}-${row.ScheduleId}-OptionPackageStarted-${Date.now()}`, SolicitationId: row.SolicitationId,
        EntityRef: row.ScheduleId, Action: 'OptionPackageStarted', Actor: persona.name, OccurredAt: now, Detail: `${row.Name}: the option package has started` }])
      toast.success('Package started. The robot gathers the checks and the agent drafts the findings; the funds task follows in a minute or two.')
      await reload()
    } catch (err) {
      const msg = (err as Error).message
      toast.error(/could not be found/i.test(msg) ? 'The option exercise process is not deployed yet.' : `Could not start the package: ${msg}`)
    } finally {
      setBusy(undefined)
    }
  }
  return { busy, start }
}
