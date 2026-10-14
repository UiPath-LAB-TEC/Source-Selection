import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { TermsProvider, frameworkOf } from '@forms/lib/terms'
import type { Framework } from '@forms/lib/terms'
import { planOf, taskSolicitation, useData } from '../lib/data'
import type { Dataset, Solicitation } from '../lib/types'

const KEY = 'ss.framework'
const Ctx = createContext<{ framework: Framework; setFramework: (f: Framework) => void } | undefined>(undefined)

/** The framework chosen last (on the sign-in page or from the sidebar switch). */
export function storedFramework(): Framework {
  try { return localStorage.getItem(KEY) === 'sled' ? 'sled' : 'federal' } catch { return 'federal' }
}

export function rememberFramework(f: Framework) {
  try { localStorage.setItem(KEY, f) } catch { /* storage unavailable */ }
}

/**
 * Federal or State & Local: which evaluations the workspace lists and the words it uses. Opening an evaluation of the
 * other framework (from a link or a task) switches the workspace to it, so the screen and the record always agree.
 */
export function FrameworkProvider({ children }: { children: ReactNode }) {
  const [framework, set] = useState<Framework>(storedFramework)
  const setFramework = (f: Framework) => {
    set(f)
    rememberFramework(f)
  }
  return (
    <Ctx.Provider value={{ framework, setFramework }}>
      <TermsProvider framework={framework}>{children}</TermsProvider>
    </Ctx.Provider>
  )
}

export function useFrameworkMode() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useFrameworkMode must be used within FrameworkProvider')
  return c
}

/** A solicitation's framework, from its plan (federal when the plan can't be read). */
export function frameworkOfSolicitation(s: Solicitation): Framework {
  try { return frameworkOf(planOf(s)) } catch { return 'federal' }
}

/**
 * useData() narrowed to the framework in use: its evaluations, their records, and the tasks that belong to them.
 * Lists, counts and home pages read this; an evaluation's own page and the admin page read everything.
 */
export function useScopedData() {
  const ctx = useData()
  const { framework } = useFrameworkMode()
  const scoped = useMemo(() => {
    if (!ctx.data) return { data: undefined, tasks: ctx.tasks }
    const all = ctx.data.solicitations
    const ids = new Set(all.filter((s) => frameworkOfSolicitation(s) === framework).map((s) => s.SolicitationId))
    const data = Object.fromEntries(Object.entries(ctx.data).map(([k, rows]) => [k, (rows as { SolicitationId: string }[]).filter((r) => ids.has(r.SolicitationId))])) as unknown as Dataset
    // A task whose evaluation isn't known yet (or was deleted) stays; stillOpen() decides whether it's worth showing.
    const tasks = ctx.tasks.filter((t) => { const s = taskSolicitation(t, all); return !s || ids.has(s.SolicitationId) })
    return { data, tasks }
  }, [ctx.data, ctx.tasks, framework])
  return { ...ctx, ...scoped }
}
