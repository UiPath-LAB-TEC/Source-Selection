import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { UiPath } from '@uipath/uipath-typescript/core'
import { Entities } from '@uipath/uipath-typescript/entities'
import { all, ENTITY } from '@ss/lib/data'
import { REQUIREMENT_ENTITY } from '@ss/lib/apps'
import { useFrameworkMode } from '@ss/hooks/useFramework'
import type { AuditRow, Dataset, DocRow, RequesterProfile, RequirementRow } from './types'

/**
 * One load: every requirement and package document, the audit rows they wrote, the solicitations they became, and the
 * requester profiles. Profiles are optional: if they can't be read, Grace Lindqvist stands in (profiles.ts).
 */
export async function loadRequirements(sdk: UiPath): Promise<Dataset> {
  const e = new Entities(sdk)
  const [requirements, docs, audit, solicitations, profiles] = await Promise.all([
    all<RequirementRow>(e, REQUIREMENT_ENTITY.requirements),
    all<DocRow>(e, REQUIREMENT_ENTITY.docs),
    all<AuditRow>(e, ENTITY.audit),
    all<Dataset['solicitations'][number]>(e, ENTITY.solicitations),
    all<RequesterProfile>(e, REQUIREMENT_ENTITY.profiles).catch(() => [] as RequesterProfile[]),
  ])
  const ids = new Set(requirements.map((r) => r.RequirementId))
  return {
    requirements,
    profiles,
    docs,
    audit: audit.filter((x) => ids.has(x.SolicitationId)),
    solicitations: solicitations.map(({ SolicitationId, Title, Status, Stage }) => ({ SolicitationId, Title, Status, Stage })),
  }
}

interface Ctx {
  sdk: UiPath
  /** Dev-only snapshot mode: no sign-in, nothing written, agents answered from canned results. */
  preview: boolean
  data?: Dataset
  error?: string
  loading: boolean
  reload: () => Promise<void>
  /** Preview only: keep a change in memory so the builder can be walked through without a tenant. */
  patch: (fn: (d: Dataset) => Dataset) => void
}

const DataCtx = createContext<Ctx | undefined>(undefined)

export function RequirementsDataProvider({ sdk, children, preview }: { sdk: UiPath; children: ReactNode; preview?: boolean }) {
  const [data, setData] = useState<Dataset>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const isPreview = !!preview && import.meta.env.DEV

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      if (isPreview) {
        // Keep in-memory changes across reloads in the preview; load the snapshot only the first time.
        if (!data) {
          const snap = (await import('../dev/snapshot.json')).default as unknown as Dataset
          setData({ ...snap, profiles: snap.profiles ?? [] })
        }
      } else {
        setData(await loadRequirements(sdk))
      }
      setError(undefined)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
    // `data` is read only to skip the snapshot reload in the preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, isPreview])

  useEffect(() => { reload() }, [reload])

  const patch = useCallback((fn: (d: Dataset) => Dataset) => setData((d) => (d ? fn(d) : d)), [])

  return <DataCtx.Provider value={{ sdk, preview: isPreview, data, error, loading, reload, patch }}>{children}</DataCtx.Provider>
}

export function useRequirementsData() {
  const c = useContext(DataCtx)
  if (!c) throw new Error('useRequirementsData must be used within RequirementsDataProvider')
  return c
}

/** The data narrowed to the framework in use (a requirement saved before the switch existed is federal). */
export function useScopedData() {
  const ctx = useRequirementsData()
  const { framework } = useFrameworkMode()
  const data = useMemo(() => {
    if (!ctx.data) return undefined
    const reqs = ctx.data.requirements.filter((r) => (r.Framework || 'federal') === framework)
    const ids = new Set(reqs.map((r) => r.RequirementId))
    return { ...ctx.data, requirements: reqs, docs: ctx.data.docs.filter((d) => ids.has(d.RequirementId)), audit: ctx.data.audit.filter((x) => ids.has(x.SolicitationId)) }
  }, [ctx.data, framework])
  return { ...ctx, data }
}
