import { useEffect, useState } from 'react'
import { ProcessInstances } from '@uipath/uipath-typescript/maestro-processes'
import { AWARD_PROCESS_FOLDER } from '@ss/lib/apps'
import { RUNNING, loadRuns, maestroUrl } from '@ss/lib/maestro'
import type { LiveCase, TaskKind } from '@ss/lib/maestro'
import type { AwardRow } from './award'
import { useAwardData } from './data'

/** The Award process as designed (AwardProcess.bpmn): each step's element, its name and who does it. Slices add steps. */
export const AWARD_PLAN: { id: string; name: string; kind: TaskKind; who?: string }[] = [
  { id: 'Task_StartAward', name: 'Open the award phase', kind: 'robot' },
  { id: 'Task_PrepareAwardDocument', name: 'Draft the contract award and notices', kind: 'robot' },
  { id: 'Task_ExecuteAward', name: 'Sign the award and release the notices', kind: 'human', who: 'Contracting Officer' },
  { id: 'Task_IssueNotices', name: 'File the notices and set the deadlines', kind: 'robot' },
]

/**
 * The award's Maestro run, as Source Selection follows its own: the instance its SSAward row records, every element's
 * runs, and Maestro's instance page. Polls while the run is going, so each step ticks over as Maestro reports it.
 */
export function useAwardRun(award: AwardRow | undefined) {
  const { sdk, preview } = useAwardData()
  const id = award?.CaseInstanceId
  const [state, setState] = useState<{ id?: string; live?: LiveCase | null; error?: string }>({})
  useEffect(() => {
    if (!id || preview) return
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const inst = await new ProcessInstances(sdk).getById(id, AWARD_PROCESS_FOLDER.folderKey)
        const runs = await loadRuns(sdk, inst)
        if (stop) return
        setState({ id, live: { instanceId: inst.instanceId, folderKey: inst.folderKey, status: inst.latestRunStatus, startedTime: inst.startedTime,
          completedTime: inst.completedTime || undefined, url: maestroUrl(inst), stages: [], alerts: [], runs } })
        if (RUNNING.has(inst.latestRunStatus)) timer = setTimeout(tick, 15000)
      } catch (e) {
        if (!stop) setState((s) => ({ id, live: s.id === id ? s.live : undefined, error: (e as Error).message }))
      }
    }
    void tick()
    return () => { stop = true; clearTimeout(timer) }
  }, [sdk, id, preview])
  const mine = state.id === id
  const live = mine ? state.live : undefined
  return { live, error: mine ? state.error : undefined, running: !!live && RUNNING.has(live.status) }
}
