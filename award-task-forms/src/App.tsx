import { TaskApp } from '@forms/host'
import { AWARD_FORMS } from './forms'

/** The local preview renders on the Award app's snapshot of the awarded evaluations (left out of production builds). */
const loadSnapshot = () => (import.meta.env.DEV ? import('../../award-workspace/src/dev/snapshot.json') : Promise.resolve({ default: {} }))
const DEFAULTS = { form: 'executeAward', solicitationId: 'W52P1J-27-R-0023', simulatedForm: 'executeAward' }

export default function App() {
  return <TaskApp forms={AWARD_FORMS} loadSnapshot={loadSnapshot} defaults={DEFAULTS} record="award record" />
}
