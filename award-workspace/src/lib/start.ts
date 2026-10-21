import { useState } from 'react'
import { toast } from 'sonner'
import { Entities } from '@uipath/uipath-typescript/entities'
import { Processes } from '@uipath/uipath-typescript/processes'
import { useAuth } from '@ss/hooks/useAuth'
import { AWARD_ENTITY, AWARD_PROCESS_FOLDER } from '@ss/lib/apps'
import { DEMO_PANEL_EMAIL, all } from '@ss/lib/data'
import type { AwardRow } from './award'
import { useAwardData } from './data'

/** The Maestro BPMN process that runs the Award phase (Award solution). */
export const AWARD_PROCESS = 'AwardProcess'

/** Begin award starts a real run, so the snapshot preview can't. */
export function useCanBeginAward() {
  return !useAwardData().preview
}

/**
 * Starts the Award process for an awarded solicitation and records the run on its SSAward row (the robot's first step
 * fills in the rest of the row, whichever lands first). Every role is the signed-in demo user, as in Source Selection.
 */
export function useBeginAward() {
  const { sdk } = useAuth()
  const { reload } = useAwardData()
  const [starting, setStarting] = useState<string>()
  const begin = async (solicitationId: string) => {
    setStarting(solicitationId)
    try {
      const args = { solicitationId, contractingOfficer: DEMO_PANEL_EMAIL, agencyCounsel: DEMO_PANEL_EMAIL, sourceSelectionAuthority: DEMO_PANEL_EMAIL }
      const started = await new Processes(sdk).start({ name: AWARD_PROCESS }, { ...AWARD_PROCESS_FOLDER, inputArguments: JSON.stringify(args) })
      const key = started[0]?.key
      if (key) {
        const e = new Entities(sdk)
        const row = (await all<AwardRow>(e, AWARD_ENTITY.awards)).find((r) => r.SolicitationId === solicitationId)
        if (row) await e.updateRecord({ name: AWARD_ENTITY.awards }, row.Id, { CaseInstanceId: key })
        else await e.insertRecords({ name: AWARD_ENTITY.awards }, [{ AwardId: `${solicitationId}-award`, SolicitationId: solicitationId, CaseInstanceId: key }])
      }
      toast.success(`Award phase started for ${solicitationId}`)
      await reload()
    } catch (e) {
      const msg = (e as Error).message
      toast.error(/could not be found/i.test(msg) ? 'The Award process is not deployed yet.' : `Could not start the award: ${msg}`)
    } finally {
      setStarting(undefined)
    }
  }
  return { starting, begin }
}
