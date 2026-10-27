import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { UiPath } from '@uipath/uipath-typescript/core'
import { Entities } from '@uipath/uipath-typescript/entities'
import { Tasks } from '@uipath/uipath-typescript/tasks'
import type { TaskGetResponse } from '@uipath/uipath-typescript/tasks'
import { all, loadDataset, withTaskContext } from '@ss/lib/data'
import { AWARD_ENTITY } from '@ss/lib/apps'
import { frameworkOfSolicitation, useFrameworkMode } from '@ss/hooks/useFramework'
import { importedHeader, isImported } from './award'
import type { AlertRow, AwardDataset, AwardRow, Correspondence, FundingRow, Protest, ScheduleRow } from './award'

/**
 * The Award process's Action Center tasks, tagged "award", land in the Award solution's folder (Source Selection/Award),
 * where the Award action app is deployed. Listing one folder by id is fast, as in Source Selection.
 */
export const AWARD_TASK_FOLDER_ID = 2214981

/**
 * Every contract gets a header the pages can read: Source Selection's solicitation row, or, for a contract awarded
 * elsewhere (Origin Imported), one built from its SSAward row.
 */
export function withContractHeaders(d: AwardDataset): AwardDataset {
  const known = new Set(d.solicitations.map((s) => s.SolicitationId))
  const imported = d.awards.filter((a) => isImported(a) && !known.has(a.SolicitationId)).map(importedHeader)
  return { ...d, schedule: d.schedule ?? [], funding: d.funding ?? [], alerts: d.alerts ?? [], solicitations: [...d.solicitations, ...imported] }
}

/** One load: every Source Selection entity (the record the award stands on), the award phase's own, and the administration's. */
export async function loadAwardDataset(sdk: UiPath): Promise<AwardDataset> {
  const e = new Entities(sdk)
  const [base, awards, correspondence, protests, schedule, funding, alerts] = await Promise.all([
    loadDataset(sdk),
    all<AwardRow>(e, AWARD_ENTITY.awards),
    all<Correspondence>(e, AWARD_ENTITY.correspondence),
    all<Protest>(e, AWARD_ENTITY.protests),
    all<ScheduleRow>(e, AWARD_ENTITY.schedule),
    all<FundingRow>(e, AWARD_ENTITY.funding),
    all<AlertRow>(e, AWARD_ENTITY.alerts),
  ])
  return withContractHeaders({ ...base, awards, correspondence, protests, schedule, funding, alerts })
}

async function loadAwardTasks(sdk: UiPath): Promise<TaskGetResponse[]> {
  const t = new Tasks(sdk)
  const out: TaskGetResponse[] = []
  let page = await t.getAll({ pageSize: 100, folderId: AWARD_TASK_FOLDER_ID })
  out.push(...page.items)
  while (page.hasNextPage && page.nextCursor) {
    page = await t.getAll({ pageSize: 100, folderId: AWARD_TASK_FOLDER_ID, cursor: page.nextCursor })
    out.push(...page.items)
  }
  return out.filter((x) => x.tags?.some((g) => g.name === 'award'))
}

interface Ctx {
  sdk: UiPath
  /** Dev-only snapshot mode: no sign-in, nothing written. */
  preview: boolean
  data?: AwardDataset
  tasks: TaskGetResponse[]
  error?: string
  loading: boolean
  reload: () => Promise<void>
}

const DataCtx = createContext<Ctx | undefined>(undefined)

export function AwardDataProvider({ sdk, children, preview }: { sdk: UiPath; children: ReactNode; preview?: boolean }) {
  const [data, setData] = useState<AwardDataset>()
  const [tasks, setTasks] = useState<TaskGetResponse[]>([])
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      // Dev-only preview: the awarded evaluations from a Data Fabric snapshot (tools/export_snapshot.py --only), no sign-in.
      const [d, t] = preview && import.meta.env.DEV
        ? [withContractHeaders((await import('../dev/snapshot.json')).default as unknown as AwardDataset), []]
        : await Promise.all([loadAwardDataset(sdk), loadAwardTasks(sdk).catch(() => [])])
      setData(d)
      setTasks(t)
      setError(undefined)
      if (t.length) void withTaskContext(sdk, t).then(setTasks, () => undefined)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [sdk, preview])

  useEffect(() => { reload() }, [reload])

  return <DataCtx.Provider value={{ sdk, preview: !!preview && import.meta.env.DEV, data, tasks, error, loading, reload }}>{children}</DataCtx.Provider>
}

export function useAwardData() {
  const c = useContext(DataCtx)
  if (!c) throw new Error('useAwardData must be used within AwardDataProvider')
  return c
}

/** useAwardData() narrowed to the framework in use, as Source Selection's lists are. */
export function useScopedAwardData() {
  const ctx = useAwardData()
  const { framework } = useFrameworkMode()
  const data = useMemo(() => {
    if (!ctx.data) return undefined
    const ids = new Set(ctx.data.solicitations.filter((s) => frameworkOfSolicitation(s) === framework).map((s) => s.SolicitationId))
    return Object.fromEntries(Object.entries(ctx.data).map(([k, rows]) => [k, (rows as { SolicitationId: string }[]).filter((r) => ids.has(r.SolicitationId))])) as unknown as AwardDataset
  }, [ctx.data, framework])
  return { ...ctx, data }
}
