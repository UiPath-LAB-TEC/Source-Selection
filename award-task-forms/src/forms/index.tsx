import type { FormMap } from '@forms/host'
import { CertifyFunds } from './CertifyFunds'
import { ExecuteAward } from './ExecuteAward'
import { OptionDecision } from './OptionDecision'
import { ReviewDeliverable } from './ReviewDeliverable'

/**
 * The Award process's human tasks, by actionType (action-schema.json): rendered by Action Center through this app, and
 * inside the Contract Management web app's task dialog from source. Each slice adds its forms here:
 *  - slice 1: executeAward (CO)
 *  - slice 2: recordDebriefRequests, deliverDebriefings, followUpQuestions (CO)
 *  - slice 3: protestWindow (CO), agencyPosition (Agency Counsel), recordDecision (CO)
 *  - administration: reviewDeliverable (COR), from DeliverableReviewProcess; certifyFunds (Resource Manager) and
 *    optionDecision (CO), from OptionExerciseProcess
 */
export const AWARD_FORMS: FormMap = {
  executeAward: { label: 'Contract award and notices (CO)', render: () => <ExecuteAward /> },
  reviewDeliverable: { label: 'Deliverable review (COR)', render: () => <ReviewDeliverable /> },
  certifyFunds: { label: 'Funds for an option or extension (Resource Manager)', render: () => <CertifyFunds /> },
  optionDecision: { label: 'Option or extension decision (CO)', render: () => <OptionDecision /> },
}
