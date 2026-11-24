import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import { termsFor } from '@forms/lib/terms'
import { planOf, startCase, useData } from './data'
import { askRunner, RunnerCancelled } from './runner'

/** Starts the SourceSelection case for a solicitation and refreshes the dataset. */
export function useStartCase() {
  const { data, reload } = useData()
  const { sdk } = useAuth()
  const [starting, setStarting] = useState<string>()
  const start = async (id: string) => {
    setStarting(id)
    try {
      const sol = data?.solicitations.find((s) => s.SolicitationId === id)
      if (!sol) throw new Error(`${id} is not loaded yet.`)
      const plan = planOf(sol)
      // Every task in the run goes to whoever is running the demo (asked once, then remembered).
      await startCase(sdk, plan, await askRunner())
      toast.success(`${termsFor(plan).Process} started for ${id}`)
      await reload()
    } catch (e) {
      if (e instanceof RunnerCancelled) return
      const msg = (e as Error).message
      toast.error(/could not be found/i.test(msg)
        ? 'The evaluation process is not deployed yet.'
        : `Could not start the case: ${msg}`)
    } finally {
      setStarting(undefined)
    }
  }
  return { starting, start }
}
