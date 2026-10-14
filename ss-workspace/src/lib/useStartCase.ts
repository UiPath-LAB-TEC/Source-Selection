import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import { termsFor } from '@forms/lib/terms'
import { DEMO_PANEL_EMAIL, PROCESS_FOLDER, planOf, startCase, useData } from './data'

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
      await startCase(sdk, plan, DEMO_PANEL_EMAIL)
      toast.success(`${termsFor(plan).Process} started for ${id}`)
      await reload()
    } catch (e) {
      const msg = (e as Error).message
      toast.error(/could not be found/i.test(msg)
        ? `The SourceSelection case is not deployed to the ${PROCESS_FOLDER} folder yet.`
        : `Could not start the case: ${msg}`)
    } finally {
      setStarting(undefined)
    }
  }
  return { starting, start }
}
