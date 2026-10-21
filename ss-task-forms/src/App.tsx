import { TaskApp } from './host'
import type { FormMap } from './host'
import { EvaluationWorksheet } from './forms/EvaluationWorksheet'
import { ConsensusBoard } from './forms/ConsensusBoard'
import { AwardDecision, ClarificationForm, PriceForm, ReleaseForm } from './forms/OfficialForms'

const FORMS: FormMap = {
  releaseToEvaluation: { label: 'Release to evaluation (CO)', render: () => <ReleaseForm /> },
  individualEvaluation: { label: 'Individual evaluation (Evaluator)', render: () => <EvaluationWorksheet /> },
  consensus: { label: 'Consensus (SSEB Chair)', render: () => <ConsensusBoard /> },
  priceDetermination: { label: 'Price determination (CO)', render: () => <PriceForm /> },
  awardDecision: { label: 'Award decision (SSA)', render: () => <AwardDecision /> },
  clarification: { label: 'Clarification (Evaluator)', render: () => <ClarificationForm /> },
}

const loadSnapshot = () => import('./dev/snapshot.json')
const DEFAULTS = { form: 'individualEvaluation', solicitationId: 'FA8771-27-R-0012', simulatedForm: 'consensus' }

export default function App() {
  return <TaskApp forms={FORMS} loadSnapshot={loadSnapshot} defaults={DEFAULTS} />
}
