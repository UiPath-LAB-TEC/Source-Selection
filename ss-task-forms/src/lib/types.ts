/** Record shapes — field names match the SS* Data Fabric entities verbatim. */
import type { Framework } from './terms'

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
  /** The Award phase's rows, typed in award-task-forms/src/lib/record.ts (Source Selection's forms don't read them). */
  awards?: Record<string, unknown>[]
  correspondence?: Record<string, unknown>[]
  protests?: Record<string, unknown>[]
  schedule?: Record<string, unknown>[]
  alerts?: Record<string, unknown>[]
  funding?: Record<string, unknown>[]
  modifications?: Record<string, unknown>[]
}

export const STAGES = ['Proposal Intake', 'Individual Evaluation', 'Consensus', 'Price Evaluation', 'Award Decision'] as const

export type PersonaId = 'evaluator1' | 'evaluator2' | 'evaluator3' | 'chair' | 'co' | 'ssa' | 'cor' | 'rm'

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

/** Demo panel — fictional officials, matching ss-workspace. */
export const PERSONAS: Persona[] = [
  { id: 'co', name: 'Dana Whitfield', label: 'Contracting Officer', role: 'Procuring Contracting Officer', short: 'DW', taskLabel: 'contracting-officer' },
  { id: 'evaluator1', name: 'Marcus Reyes', label: 'Evaluator', role: 'SSEB evaluator · Technical and Management', short: 'MR', slot: 1, taskLabel: 'evaluator' },
  { id: 'evaluator2', name: 'Priya Natarajan', label: 'Evaluator', role: 'SSEB evaluator · Technical and Management', short: 'PN', slot: 2, taskLabel: 'evaluator' },
  { id: 'evaluator3', name: 'Tom Okafor', label: 'Evaluator', role: 'SSEB evaluator · Technical and Past Performance', short: 'TO', slot: 3, taskLabel: 'evaluator' },
  { id: 'chair', name: 'Rebecca Hale', label: 'SSEB Chair', role: 'Source Selection Evaluation Board Chair', short: 'RH', taskLabel: 'sseb-chair' },
  { id: 'ssa', name: 'James Thornton', label: 'Source Selection Authority', role: 'Makes and signs the award decision', short: 'JT', taskLabel: 'ssa' },
]

/**
 * The Contracting Officer's Representative, who works a contract after award (Contract Management's forms). Not on the
 * source selection panel, so kept out of PERSONAS. Fictional.
 */
export const COR: Persona = {
  id: 'cor', name: 'Owen Mercer', label: "Contracting Officer's Representative", role: 'Monitors performance, deliverables and invoices', short: 'OM', taskLabel: 'cor',
}

/** The Resource Manager, who certifies funds for an option or extension (Contract Management's forms). Fictional. */
export const RM: Persona = {
  id: 'rm', name: 'Nadia Sorensen', label: 'Resource Manager', role: 'Certifies funds and tracks obligations', short: 'NS', taskLabel: 'resource-manager',
}

export const persona = (id: PersonaId) => (id === 'cor' ? COR : id === 'rm' ? RM : PERSONAS.find((p) => p.id === id)!)
export const evaluatorBySlot = (slot?: number) => PERSONAS.find((p) => p.slot === slot)

/**
 * How a factor stands in the plan: its weight ("40% weight") when the plan has weights, else its
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
  return weights.every((w) => w === weights[0]) ? `${f.weight}% weight · all equal` : `${f.weight}% weight`
}
