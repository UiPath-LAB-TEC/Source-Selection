/** Persona routing rules shared by the workspace, evaluations list, sidebar and task inbox. */
import type { TaskGetResponse } from '@uipath/uipath-typescript/tasks'
import { frameworkOf } from '@forms/lib/terms'
import type { Framework } from '@forms/lib/terms'
import { planOf } from './data'
import type { Persona, PersonaId, Plan, Solicitation } from './types'

/** Which persona owns each stage's next action, in each framework's words. */
export const STAGE_OWNER: Record<string, { who: PersonaId[]; label: string; sled: string }> = {
  'Proposal Intake': { who: ['co'], label: 'Contracting Officer releases proposals', sled: 'Procurement Officer releases proposals' },
  'Individual Evaluation': { who: ['evaluator1', 'evaluator2', 'evaluator3'], label: 'Evaluators complete independent reviews', sled: 'Evaluators complete independent scoring' },
  Consensus: { who: ['chair'], label: 'SSEB Chair sets consensus ratings', sled: 'Committee Chair sets consensus scores' },
  'Price Evaluation': { who: ['co'], label: 'Contracting Officer determines price reasonableness', sled: 'Procurement Officer evaluates cost' },
  'Award Decision': { who: ['ssa'], label: 'Source Selection Authority signs the decision', sled: 'Award Authority signs the recommendation of award' },
}

const frameworkOfSol = (s: Solicitation): Framework => { try { return frameworkOf(planOf(s)) } catch { return 'federal' } }

/** Awarded or cancelled: the source selection is over, so it leaves everyone's queue for the Evaluations list. */
export const isClosed = (s: Solicitation) => s.Status === 'Awarded' || s.Status === 'Cancelled'
/** Started and not yet over. */
export const inEvaluation = (s: Solicitation) => s.Status !== 'Proposals Received' && !isClosed(s)

/** Evaluator slots on a plan's SSEB panel (1–3); the process opens a review only for these. */
export const panelSlots = (plan: Plan) => plan.panel.evaluators.map((e) => e.slot).filter((n) => n >= 1 && n <= 3).sort()

/** The solicitation's panel slots, or undefined when its plan can't be read. */
export function solicitationSlots(s: Solicitation) {
  try { return panelSlots(planOf(s)) } catch { return undefined }
}

export function ownerOf(s: Solicitation) {
  if (isClosed(s)) return undefined
  const sled = frameworkOfSol(s) === 'sled'
  if (s.Status === 'Proposals Received') return { who: ['co'] as PersonaId[], label: sled ? 'Procurement Officer starts the RFP evaluation' : 'Contracting Officer starts the source selection' }
  const stage = STAGE_OWNER[s.Stage]
  const owner = stage && { who: stage.who, label: sled ? stage.sled : stage.label }
  const slots = s.Stage === 'Individual Evaluation' ? solicitationSlots(s) : undefined
  // Only the evaluators on this panel have a review open.
  return owner && slots ? { ...owner, who: slots.map((n) => `evaluator${n}` as PersonaId) } : owner
}

export const waitingOn = (s: Solicitation, p: Persona) => !!ownerOf(s)?.who.includes(p.id)

/** Factors this persona evaluates on a plan. Officials outside the SSEB panel see every factor. */
export function myFactors(plan: Plan, p: Persona) {
  if (p.slot == null) return plan.factors.map((f) => f.id)
  return plan.panel.evaluators.find((e) => e.slot === p.slot)?.factors ?? []
}

/** Action Center tasks routed to this persona (task label, plus evaluator slot for evaluators). */
export function tasksFor(tasks: TaskGetResponse[], p: Persona) {
  return tasks.filter((t) => {
    if (!t.tags?.some((g) => g.name === p.taskLabel)) return false
    if (p.slot == null) return true
    // Task lists come back without task data, so fall back to the slot in the title ("… - evaluator 2").
    const fromData = Number((t.data as Record<string, unknown> | null | undefined)?.evaluatorSlot ?? NaN)
    const fromTitle = Number(/evaluator\s*(\d+)\b/i.exec(t.title ?? '')?.[1] ?? NaN)
    const slot = Number.isNaN(fromData) ? fromTitle : fromData
    return Number.isNaN(slot) || slot === p.slot
  })
}

export function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
