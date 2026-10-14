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
}

export const STAGES = ['Proposal Intake', 'Individual Evaluation', 'Consensus', 'Price Evaluation', 'Award Decision'] as const

export type PersonaId = 'evaluator1' | 'evaluator2' | 'evaluator3' | 'chair' | 'co' | 'ssa'

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

export const persona = (id: PersonaId) => PERSONAS.find((p) => p.id === id)!
export const evaluatorBySlot = (slot?: number) => PERSONAS.find((p) => p.slot === slot)

/**
 * How a factor stands in the plan: its weight ("40% weight · most important") when the plan has weights, else its
 * order of importance, or (State & Local) its maximum points. `all` is every plan factor, Price included.
 * `useWeights: false` shows the order even when weights are recorded (see weightsStated).
 */
export function factorImportance(f: Factor, all: Factor[], fw: Framework = 'federal', useWeights = true): string {
  // State & Local plans score out of 100: a criterion's weight is its maximum points.
  if (fw === 'sled' && f.weight != null) return `${f.weight} points`
  if (f.weight == null || !useWeights) {
    // Recorded weights still give the order (equal weights are equal importance); plans without them use `order`.
    const rated = all.filter((x) => !x.evaluatedNotRated)
    const key = (x: Factor) => (x.weight != null ? x.weight : -x.order)
    const place = rated.filter((x) => key(x) > key(f)).length + 1
    const tie = rated.filter((x) => x !== f && key(x) === key(f)).map((x) => x.name)
    const where = place === 1 ? 'Most important' : `${nth(place)} in importance`
    return tie.length ? `${where} · equal to ${tie.join(', ')}` : where
  }
  const weights = all.map((x) => x.weight ?? 0)
  if (weights.every((w) => w === weights[0])) return `${f.weight}% weight · all equal`
  return f.weight === Math.max(...weights) ? `${f.weight}% weight · most important` : `${f.weight}% weight`
}

const nth = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

/**
 * Whether the solicitation itself states numeric weights. FAR 15.304(d) only requires relative importance; when Section
 * M is written that way ("more important than…"), showing the plan's internal percentages would invent precision the
 * solicitation doesn't have. State & Local RFPs always publish their points.
 */
export function weightsStated(plan: Pick<Plan, 'framework' | 'relativeImportance'>) {
  return plan.framework === 'sled' || /\d\s*(%|percent|points?\b)|\bweighted\b/i.test(plan.relativeImportance ?? '')
}

/** How Price stands against the non-price factors combined, as the plan's relative-importance wording puts it. */
function priceImportance(text: string) {
  if (/significantly more important than (the )?(total evaluated )?price/i.test(text)) return 'Significantly less important than the non-price factors combined'
  if (/(approximately |about )?equal (in importance )?to (the )?(total evaluated )?price/i.test(text)) return 'About equal to the non-price factors combined'
  if (/less important than (the )?(total evaluated )?price/i.test(text)) return 'More important than the non-price factors combined'
  if (/more important than (the )?(total evaluated )?price/i.test(text)) return 'Less important than the non-price factors combined'
  return undefined
}

/** A factor's importance as the solicitation states it: weights when it publishes them, else its relative order. */
export function importanceOf(f: Factor, plan: Plan, fw: Framework = 'federal') {
  const stated = weightsStated({ framework: fw === 'sled' ? 'sled' : plan.framework, relativeImportance: plan.relativeImportance })
  if (!stated && f.evaluatedNotRated) return priceImportance(plan.relativeImportance) ?? factorImportance(f, plan.factors, fw, false)
  return factorImportance(f, plan.factors, fw, stated)
}
