/** The requirement record: SSRequirement (one row per requirement) and SSRequirementDoc (one row per package document). */

export type Kind = 'Product' | 'Service' | 'Product and service'
export type Status = 'Draft' | 'Submitted' | 'Returned' | 'Accepted' | 'Cancelled'

/** Where a requirement is. The first four are the builder's steps; Review and Accepted come after it's submitted. */
export const STAGES = ['Need', 'Clarify', 'Requirement', 'Package', 'Review', 'Accepted'] as const
export type Stage = (typeof STAGES)[number]

export interface RequirementRow {
  Id?: string
  RequirementId: string
  Title: string
  Kind: Kind | ''
  Framework: string
  Status: Status
  Stage: Stage
  Agency: string
  Office: string
  ContractingOffice: string
  Need: string
  NeedBy: string
  Budget?: number | null
  EstimatedValue?: number | null
  Psc: string
  Naics: string
  RequirementJson: string
  AnalysisJson: string
  StrategyJson: string
  SolicitationId: string
  OwnerPersona: string
  /** The requester profile (ProfileId) that owns a Program Manager requirement. Empty on rows saved before profiles: 'pm'. */
  RequestedBy?: string
  CreatedAt: string
  UpdatedAt: string
}

export type DocKind =
  | 'purchaseDescription' | 'pws' | 'qasp' | 'marketResearch' | 'igce' | 'acquisitionStrategy'
  | 'smallBusiness' | 'brandName' | 'ja' | 'section508' | 'funds'

export type DocStatus = 'Agent draft' | 'Edited' | 'Final'

export interface DocRow {
  Id?: string
  DocId: string
  RequirementId: string
  Kind: DocKind
  Title: string
  Status: DocStatus
  Text: string
  DataJson: string
  DraftedBy: string
  EditedBy: string
  UpdatedAt: string
}

export interface AuditRow {
  Id?: string
  EventId: string
  SolicitationId: string
  EntityRef: string
  Action: string
  Actor: string
  OccurredAt: string
  Detail: string
}

/** Facts the agent can recognize in a need. The value-based rules (thresholds) are added by package.ts, not the agent. */
export type FlagId = 'brandName' | 'ict' | 'cui' | 'classified' | 'onBase' | 'soleSource' | 'urgent' | 'hazmat'

export interface Flag { id: FlagId | string; label: string; reason: string }

export interface Question {
  id: string
  question: string
  /** Why a Contracting Officer would ask it. */
  why: string
  /** Suggested answers, shown as chips. */
  options: string[]
  answer?: string
  skipped?: boolean
}

/** The agent's latest read of the need, with the person's answers merged in. Stored as AnalysisJson. */
export interface Analysis {
  kind: Kind
  title: string
  summary: string
  psc: { code: string; name: string }
  naics: { code: string; name: string; sizeStandard: string }
  commercial: { likely: boolean; reason: string }
  value: { low: number; high: number; basis: string }
  flags: Flag[]
  questions: Question[]
  /** Questions from earlier rounds, answered or skipped, so the next round doesn't ask them again. */
  answered: Question[]
  round: number
  at: string
  /** Fingerprints of the requirement fields as the agent last wrote them (agents.ts mergeSpec), so a field the person changed is kept. */
  drafted?: Record<string, string>
}

export interface Item { name: string; quantity: number; unit: string; characteristics: string[] }
export interface Deliverable { name: string; due: string; format: string }
export interface PerformanceStandard { standard: string; aql: string; method: string }

/**
 * The structured requirement (RequirementJson). Products use the first group, services the second; a requirement for
 * both uses both.
 */
export interface Spec {
  items: Item[]
  standards: string[]
  deliveryPlace: string
  deliveryDate: string
  warranty: string
  packaging: string
  inspection: string
  support: string

  objective: string
  background: string
  scope: string
  tasks: string[]
  deliverables: Deliverable[]
  performanceStandards: PerformanceStandard[]
  placeOfPerformance: string
  periodOfPerformance: string
  security: string
  gfp: string
  keyPersonnel: string
}

export const emptySpec = (): Spec => ({
  items: [], standards: [], deliveryPlace: '', deliveryDate: '', warranty: '', packaging: '', inspection: '', support: '',
  objective: '', background: '', scope: '', tasks: [], deliverables: [], performanceStandards: [], placeOfPerformance: '',
  periodOfPerformance: '', security: '', gfp: '', keyPersonnel: '',
})

/** A drafted document's sections, as RQ_Drafter returns them and the editor shows them. Stored as Text (markdown-ish). */
export interface Section { heading: string; text: string }

/**
 * A program office person who builds requirements (SSRequesterProfile). Each one plays the Program Manager role; their
 * agency, office, location and contracting office fill in a new requirement. The admin edits them on the Settings page.
 */
export interface RequesterProfile {
  Id?: string
  ProfileId: string
  Name: string
  Title: string
  Agency: string
  /** The parent department when the agency sits under one, e.g. Department of Defense. */
  Department: string
  Office: string
  /** Where things are delivered or work is done, by default. */
  Location: string
  ContractingOffice: string
  /** federal or sled: which workspace the requester belongs to. */
  Framework: string
  Active: boolean
  UpdatedAt?: string
}

export interface Dataset {
  requirements: RequirementRow[]
  /** Requester profiles, active or not. Empty when the entity can't be read: Grace Lindqvist then stands in. */
  profiles: RequesterProfile[]
  docs: DocRow[]
  audit: AuditRow[]
  /** Source Selection's solicitations, to link an accepted requirement to its evaluation. */
  solicitations: { SolicitationId: string; Title: string; Status: string; Stage: string }[]
}

export const isProduct = (k?: string) => k === 'Product' || k === 'Product and service'
export const isService = (k?: string) => k === 'Service' || k === 'Product and service'

export function parse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try { return { ...fallback, ...JSON.parse(json) } as T } catch { return fallback }
}

export const specOf = (r: Pick<RequirementRow, 'RequirementJson'>) => parse<Spec>(r.RequirementJson, emptySpec())
export const analysisOf = (r: Pick<RequirementRow, 'AnalysisJson'>): Analysis | undefined => {
  if (!r.AnalysisJson) return undefined
  try { return JSON.parse(r.AnalysisJson) as Analysis } catch { return undefined }
}
