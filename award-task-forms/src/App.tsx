import { TaskApp } from '@forms/host'
import type { FormMap } from '@forms/host'

/**
 * The Award process's human tasks, by actionType (action-schema.json). Each slice adds its forms here:
 *  - slice 1: executeAward (CO)
 *  - slice 2: recordDebriefRequests, deliverDebriefings, followUpQuestions (CO)
 *  - slice 3: protestWindow (CO), agencyPosition (Agency Counsel), recordDecision (CO)
 */
const FORMS: FormMap = {}

/** The local preview renders on the Award app's snapshot of the awarded evaluations (left out of production builds). */
const loadSnapshot = () => (import.meta.env.DEV ? import('../../award-workspace/src/dev/snapshot.json') : Promise.resolve({ default: {} }))
const DEFAULTS = { form: 'executeAward', solicitationId: 'W52P1J-27-R-0023', simulatedForm: 'executeAward' }

export default function App() {
  return <TaskApp forms={FORMS} loadSnapshot={loadSnapshot} defaults={DEFAULTS} />
}
