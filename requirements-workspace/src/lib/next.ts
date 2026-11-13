/** Whose move it is on a requirement, and what the move is: the "Next: … — that's you" bar. */
import type { PersonaId } from '@ss/lib/types'
import { packageFor, progressOf } from './package'
import type { DocRow, RequirementRow } from './types'
import { analysisOf } from './types'

export interface Next { label: string; who: PersonaId[]; whoLabel: string }

export function nextOf(r: RequirementRow, docs: DocRow[]): Next | undefined {
  const owner = (r.OwnerPersona || 'pm') as PersonaId
  const ownerLabel = owner === 'co' ? 'Contracting Officer' : 'Program Manager'
  const a = analysisOf(r)
  if (r.Status === 'Accepted' || r.Status === 'Cancelled') return undefined
  if (r.Status === 'Submitted') return { label: 'Funds certification and small business review', who: ['rm', 'sbp'], whoLabel: 'Resource Manager · Small Business Professional' }
  if (r.Status === 'Returned') return { label: 'Fix what contracting returned, then resubmit', who: [owner], whoLabel: ownerLabel }
  if (r.Stage === 'Need' || !a) return { label: 'Describe the need and ask the agent', who: [owner], whoLabel: ownerLabel }
  const open = a.questions.filter((q) => !q.answer?.trim() && !q.skipped).length
  if (r.Stage === 'Clarify') return { label: open ? `Answer the agent’s ${open} question${open > 1 ? 's' : ''}` : 'Review what the agent found', who: [owner], whoLabel: ownerLabel }
  if (r.Stage === 'Requirement') return { label: 'Finish the requirement', who: [owner], whoLabel: ownerLabel }
  const p = progressOf(packageFor(r, a), docs.filter((d) => d.RequirementId === r.RequirementId))
  return { label: p.done < p.total ? `Draft the package: ${p.done} of ${p.total} documents` : 'Package drafted: review and submit', who: [owner], whoLabel: ownerLabel }
}

export const statusLabel = (r: RequirementRow) =>
  r.Status === 'Draft' ? `Draft · ${r.Stage === 'Need' ? 'Need' : r.Stage}` : r.Status === 'Submitted' ? 'In review' : r.Status
