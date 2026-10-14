/** Record shapes — field names match the SS* Data Fabric entities verbatim. */
import { titled } from '@forms/lib/terms'
import type { Framework } from '@forms/lib/terms'

export interface Factor {
  id: string
  name: string
  order: number
  scale?: 'technical' | 'confidence'
  volume: string
  subfactors?: string[]
  criteria: string
  evaluatedNotRated?: boolean
  /** Share of the evaluation, in percent; the factors total 100. Absent on plans made before weights. */
  weight?: number
}

/**
 * How ratings are displayed: adjectival words, DoD-style colors, a 5-point number, or (State & Local) the points a
 * scale step earns on the criterion. Storage is always the scale label.
 */
export type RatingMethod = 'adjectival' | 'color' | 'numeric' | 'points'

export interface PanelMember {
  slot: number
  title: string
  factors: string[]
  personaId?: string
}

export interface Plan {
  solicitationId: string
  /** Federal (FAR Part 15) when absent; 'sled' is a State & Local (K-12 district) RFP scored out of 100 points. */
  framework?: Framework
  ratingMethod?: RatingMethod
  title: string
  agency: string
  office: string
  contractType: string
  basisForAward: string
  relativeImportance: string
  factors: Factor[]
  scales: Record<'technical' | 'confidence', string[]>
  findingKinds: string[]
  panel: { evaluators: PanelMember[]; chair?: string; ssa?: string; co?: string }
  igce: { total: number; lines: Record<string, number> }
  submission: { volumes: string[]; pageLimits: Record<string, number> }
  offerors: string[]
}

export interface Solicitation {
  Id: string
  SolicitationId: string
  Title: string
  Agency: string
  PlanJson: string
  Status: string
  Stage: string
  CaseInstanceId?: string
  AwardeeName?: string
  StartedAt?: string
  AwardedAt?: string
}

export interface Offeror {
  Id: string
  OfferorId: string
  SolicitationId: string
  OfferorCode: string
  Name: string
  UEI: string
  CAGE: string
  SamStatus?: string
  Exclusion?: boolean
  ComplianceStatus?: string
  ComplianceNotes?: string
  PriceLinesJson?: string
  TotalEvaluatedPrice?: number
  IgceVariancePct?: number
}

export interface ProposalPage {
  Id: string
  PageId: string
  SolicitationId: string
  OfferorId: string
  Volume: string
  PageNumber: number
  PageText: string
}

export interface Finding {
  Id: string
  FindingId: string
  SolicitationId: string
  OfferorId: string
  FactorId: string
  Kind: string
  FindingText: string
  AgentText?: string
  CitationVolume: string
  CitationPage: number
  CitationQuote: string
  Author: string
  Origin: 'Agent' | 'Evaluator'
  Status: string
  EvaluatorSlot: number
  Revision: number
}

export interface Rating {
  Id: string
  RatingId: string
  SolicitationId: string
  OfferorId: string
  FactorId: string
  Level: 'Individual' | 'Consensus'
  EvaluatorSlot: number
  Rating: string
  Rationale: string
  RatedBy: string
  RatedAt: string
}

export interface Decision {
  Id: string
  DecisionId: string
  SolicitationId: string
  Kind: string
  Outcome: string
  Rationale: string
  DecidedBy: string
  DecidedAt: string
  DocumentText?: string
}

export interface AuditEvent {
  Id: string
  EventId: string
  SolicitationId: string
  EntityRef: string
  Action: string
  Actor: string
  OccurredAt: string
  Detail: string
}

export interface Dataset {
  solicitations: Solicitation[]
  offerors: Offeror[]
  pages: ProposalPage[]
  findings: Finding[]
  ratings: Rating[]
  decisions: Decision[]
  audit: AuditEvent[]
}

export const STAGES = ['Proposal Intake', 'Individual Evaluation', 'Consensus', 'Price Evaluation', 'Award Decision'] as const

export type PersonaId = 'evaluator1' | 'evaluator2' | 'evaluator3' | 'chair' | 'co' | 'ssa' | 'admin'

export interface Persona {
  id: PersonaId
  name: string
  label: string
  role: string
  short: string
  slot?: number
  /** Action Center task label that routes work to this persona. */
  taskLabel: string
}

/**
 * Annual certifications every source selection participant keeps on their profile — not re-entered per evaluation.
 * The per-solicitation no-conflict certification is signed by each person in their own task (task forms' FormShell).
 */
export const ANNUAL_CERTIFICATIONS = ['Financial disclosure (OGE Form 450)', 'Procurement integrity training']
/** The District's equivalents: an annual conflict of interest statement and procurement ethics training. */
export const SLED_CERTIFICATIONS = ['Statement of economic interests (annual)', 'Procurement ethics training']
export const annualCertifications = (fw: Framework) => (fw === 'sled' ? SLED_CERTIFICATIONS : ANNUAL_CERTIFICATIONS)
export const CERTIFIED_THROUGH = 'Dec 31, 2026'

/** Demo panel — fictional officials, one signed-in user plays each. */
export const PERSONAS: Persona[] = [
  { id: 'co', name: 'Dana Whitfield', label: 'Contracting Officer', role: 'Procuring Contracting Officer', short: 'DW', taskLabel: 'contracting-officer' },
  { id: 'evaluator1', name: 'Marcus Reyes', label: 'Evaluator', role: 'SSEB evaluator · Technical and Management', short: 'MR', slot: 1, taskLabel: 'evaluator' },
  { id: 'evaluator2', name: 'Priya Natarajan', label: 'Evaluator', role: 'SSEB evaluator · Technical and Management', short: 'PN', slot: 2, taskLabel: 'evaluator' },
  { id: 'evaluator3', name: 'Tom Okafor', label: 'Evaluator', role: 'SSEB evaluator · Technical and Past Performance', short: 'TO', slot: 3, taskLabel: 'evaluator' },
  { id: 'chair', name: 'Rebecca Hale', label: 'SSEB Chair', role: 'Source Selection Evaluation Board Chair', short: 'RH', taskLabel: 'sseb-chair' },
  { id: 'ssa', name: 'James Thornton', label: 'Source Selection Authority', role: 'Makes and signs the award decision', short: 'JT', taskLabel: 'ssa' },
]

/**
 * Runs the demo workspace rather than a source selection: no tasks, not on any evaluation team, and the only one who
 * can delete an evaluation (so its number and documents can be used again).
 */
export const ADMIN: Persona = { id: 'admin', name: 'Jordan Ellis', label: 'System Admin', role: 'Workspace administrator', short: 'JE', taskLabel: 'system-admin' }
/** Everyone the persona switcher offers: the source selection officials, then the admin. */
export const ALL_PERSONAS: Persona[] = [...PERSONAS, ADMIN]

export const evaluatorBySlot = (slot: number) => PERSONAS.find((p) => p.slot === slot)

/**
 * Agent-drafted text names evaluators by panel slot (E1–E3) and findings by id, because the consensus analyst works
 * from a compact hand-off. Show people's names and drop the ids wherever such text is displayed.
 */
export const withEvaluatorNames = (text?: string | null) => (text ?? '')
  .replace(/\s*\((?:[A-Za-z0-9]+-)+[A-Za-z0-9]+(?:\s*[,;]\s*(?:[A-Za-z0-9]+-)+[A-Za-z0-9]+)*\)/g, '')
  .replace(/\bE([1-3])\b/g, (_, n: string) => evaluatorBySlot(Number(n))?.name ?? `Evaluator ${n}`)

/** Display name for an audit actor or RatedBy value. */
export function actorName(actor: string) {
  const m = /^Evaluator (\d)$/.exec(actor)
  if (m) return evaluatorBySlot(Number(m[1]))?.name ?? actor
  // Officials are recorded by title, federal ("Contracting Officer") or State & Local ("Procurement Officer").
  const byLabel = PERSONAS.find((p) => p.label === actor || titled(p, 'sled').label === actor || (actor === 'Contracting Officer' && p.id === 'co') || (actor === 'Source Selection Authority' && p.id === 'ssa'))
  if (byLabel) return byLabel.name
  // Robots are robots; every other internal actor is an agent (e.g. SS_EvaluationAssistant → Evaluation Assistant (agent)).
  if (actor === 'SS_Robots') return 'UiPath Robot'
  if (actor.startsWith('SS_')) return actor.replace(/^SS_/, '').replace(/([a-z])([A-Z])/g, '$1 $2') + ' (agent)'
  return actor
}

/**
 * How a factor stands in the plan: its weight ("40% weight · most important") when the plan has weights, else its
 * order of importance (plans made before weights), or (State & Local) its maximum points. `all` is every plan factor, Price included.
 */
export function factorImportance(f: Factor, all: Factor[], fw: Framework = 'federal'): string {
  // State & Local plans score out of 100: a criterion's weight is its maximum points.
  if (fw === 'sled' && f.weight != null) return `${f.weight} points`
  const top = Math.min(...all.map((x) => x.order))
  if (f.weight == null) {
    const tie = all.filter((x) => x.order === f.order).length > 1 ? ' · equal' : ''
    return `${f.order === top ? 'Most important' : `Importance rank ${f.order}`}${tie}`
  }
  const weights = all.map((x) => x.weight ?? 0)
  if (weights.every((w) => w === weights[0])) return `${f.weight}% weight · all equal`
  return f.weight === Math.max(...weights) ? `${f.weight}% weight · most important` : `${f.weight}% weight`
}
