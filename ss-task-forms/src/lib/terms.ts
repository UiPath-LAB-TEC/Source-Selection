/**
 * Two procurement frameworks, one process. Federal evaluations follow FAR Part 15 source selection; State & Local
 * (K-12 school district) evaluations follow a district RFP: an evaluation committee scores proposals out of 100 points,
 * cost points come from a formula, and the committee's recommendation of award goes to the Board for approval.
 * A plan's `framework` picks the words an evaluation is shown in. Shared with ss-workspace through the @forms alias.
 */
import { createContext, createElement, useContext } from 'react'
import type { ReactNode } from 'react'

export type Framework = 'federal' | 'sled'

export const FRAMEWORKS: { id: Framework; label: string; hint: string }[] = [
  { id: 'federal', label: 'Federal', hint: 'FAR Part 15 source selection' },
  { id: 'sled', label: 'State & Local', hint: 'K-12 district RFP, scored out of 100 points' },
]

export const frameworkOf = (plan?: { framework?: string } | null): Framework => (plan?.framework === 'sled' ? 'sled' : 'federal')

export interface Terms {
  id: Framework
  sled: boolean
  /** The buyer, in a sentence ("the Government") and as a label ("Government"). */
  buyer: string
  Buyer: string
  agencyLabel: string
  offeror: string
  offerors: string
  Offeror: string
  Offerors: string
  solicitation: string
  Solicitation: string
  solicitationNo: string
  /** The whole evaluation, in a sentence ("source selection") and as a heading ("Source selection"). */
  process: string
  Process: string
  /** The evaluation team, in a sentence ("the SSEB") and as a label ("SSEB"). */
  theBoard: string
  board: string
  boardLong: string
  co: string
  coShort: string
  chair: string
  ssa: string
  ssaShort: string
  factor: string
  factors: string
  Factor: string
  Factors: string
  rating: string
  ratings: string
  Rating: string
  Ratings: string
  price: string
  Price: string
  clin: string
  estimate: string
  estimateLong: string
  criteriaDoc: string
  criteriaDocLong: string
  decisionDoc: string
  decisionShort: string
  consensusReport: string
  registration: string
  exclusions: string
  references: string
  award: string
  rulesCite: string
}

const FEDERAL: Terms = {
  id: 'federal', sled: false,
  buyer: 'the Government', Buyer: 'Government', agencyLabel: 'Agency',
  offeror: 'offeror', offerors: 'offerors', Offeror: 'Offeror', Offerors: 'Offerors',
  solicitation: 'solicitation', Solicitation: 'Solicitation', solicitationNo: 'Solicitation number',
  process: 'source selection', Process: 'Source selection',
  theBoard: 'the SSEB', board: 'SSEB', boardLong: 'Source Selection Evaluation Board',
  co: 'Contracting Officer', coShort: 'CO', chair: 'SSEB Chair', ssa: 'Source Selection Authority', ssaShort: 'SSA',
  factor: 'factor', factors: 'factors', Factor: 'Factor', Factors: 'Factors',
  rating: 'rating', ratings: 'ratings', Rating: 'Rating', Ratings: 'Ratings',
  price: 'price', Price: 'Price', clin: 'CLIN',
  estimate: 'IGCE', estimateLong: 'Independent Government Cost Estimate',
  criteriaDoc: 'Section M', criteriaDocLong: 'Section M (evaluation factors for award)',
  decisionDoc: 'Source Selection Decision Document', decisionShort: 'SSDD', consensusReport: 'SSEB Consensus Report',
  registration: 'SAM', exclusions: 'FAPIIS', references: 'CPARS',
  award: 'award decision', rulesCite: 'FAR 15.308',
}

const SLED: Terms = {
  id: 'sled', sled: true,
  buyer: 'the District', Buyer: 'District', agencyLabel: 'District',
  offeror: 'proposer', offerors: 'proposers', Offeror: 'Proposer', Offerors: 'Proposers',
  solicitation: 'RFP', Solicitation: 'RFP', solicitationNo: 'RFP number',
  process: 'RFP evaluation', Process: 'RFP evaluation',
  theBoard: 'the evaluation committee', board: 'Evaluation committee', boardLong: 'Evaluation Committee',
  co: 'Procurement Officer', coShort: 'Procurement Officer', chair: 'Committee Chair', ssa: 'Award Authority', ssaShort: 'Award Authority',
  factor: 'criterion', factors: 'criteria', Factor: 'Criterion', Factors: 'Criteria',
  rating: 'score', ratings: 'scores', Rating: 'Score', Ratings: 'Scores',
  price: 'cost', Price: 'Cost', clin: 'Line item',
  estimate: 'cost estimate', estimateLong: 'District cost estimate',
  criteriaDoc: 'Evaluation criteria', criteriaDocLong: 'Evaluation criteria and scoring',
  decisionDoc: 'Recommendation of Award', decisionShort: 'recommendation', consensusReport: 'Evaluation Committee Report',
  registration: 'Vendor registration', exclusions: 'debarment list', references: 'references',
  award: 'award recommendation', rulesCite: 'District purchasing policy',
}

export const TERMS: Record<Framework, Terms> = { federal: FEDERAL, sled: SLED }
export const termsFor = (plan?: { framework?: string } | null) => TERMS[frameworkOf(plan)]

/** What a solicitation number looks like: a federal PIID, or a District RFP number. */
export const NUMBER_FORMAT: Record<Framework, { re: RegExp; example: string }> = {
  federal: { re: /^[A-Z0-9]{4,8}-\d{2}-[A-Z]-\d{4}$/, example: 'FA8771-27-R-0012' },
  sled: { re: /^[A-Z]{2,6}-(?:RFP|RFQ|ITB)-\d{2}-\d{3,4}$/, example: 'WUSD-RFP-27-014' },
}
export const isSolicitationNumber = (id: string) => Object.values(NUMBER_FORMAT).some((f) => f.re.test(id))

/** Persona titles under each framework. The people are the same; the District calls their jobs something else. */
const PERSONA_TITLES: Record<Framework, Record<string, { label: string; role: string }>> = {
  federal: {
    co: { label: 'Contracting Officer', role: 'Procuring Contracting Officer' },
    evaluator1: { label: 'Evaluator', role: 'SSEB evaluator · Technical and Management' },
    evaluator2: { label: 'Evaluator', role: 'SSEB evaluator · Technical and Management' },
    evaluator3: { label: 'Evaluator', role: 'SSEB evaluator · Technical and Past Performance' },
    chair: { label: 'SSEB Chair', role: 'Source Selection Evaluation Board Chair' },
    ssa: { label: 'Source Selection Authority', role: 'Makes and signs the award decision' },
  },
  sled: {
    co: { label: 'Procurement Officer', role: 'District Purchasing Department' },
    evaluator1: { label: 'Evaluator', role: 'Evaluation committee member · Functional and Implementation' },
    evaluator2: { label: 'Evaluator', role: 'Evaluation committee member · Functional and Implementation' },
    evaluator3: { label: 'Evaluator', role: 'Evaluation committee member · Functional and References' },
    chair: { label: 'Committee Chair', role: 'Chairs the evaluation committee' },
    ssa: { label: 'Award Authority', role: 'Signs the recommendation of award to the Board' },
  },
}

/** A persona's title under a framework (unknown personas, e.g. the System Admin, keep their own). */
export function titled<P extends { id: string; label: string; role: string }>(p: P, fw: Framework): P {
  const t = PERSONA_TITLES[fw][p.id]
  return t ? { ...p, ...t } : p
}

/**
 * Stage and step names are stored the federal way (the process writes them); the District names some differently.
 * Covers the five stages and the process steps the live case panel shows.
 */
const SLED_STAGES: Record<string, string> = {
  'Individual Evaluation': 'Individual Scoring',
  'Price Evaluation': 'Cost Evaluation',
  'Award Decision': 'Award Recommendation',
  'Compliance and Responsibility Screen': 'Responsiveness and Vendor Screen',
  'SSEB Chair Consensus': 'Committee Chair Consensus',
  'Analyze Price Proposals': 'Analyze Cost Proposals',
  'Price Determination': 'Cost Evaluation',
  'Prepare Decision Package': 'Prepare Recommendation Package',
  'Draft Source Selection Decision': 'Draft Recommendation of Award',
  'SSA Award Decision': 'Award Authority Recommendation',
  'Solicitation Cancelled': 'RFP Cancelled',
}
export const stageName = (stage: string, fw: Framework) => (fw === 'sled' ? SLED_STAGES[stage] ?? stage : stage)

/** Task titles come from the process the federal way; show them in the evaluation's own words. */
const SLED_TASK_TITLES: [RegExp, string][] = [
  [/Release proposals to the SSEB/i, 'Release proposals to the evaluation committee'],
  [/Answer SSEB Chair consensus questions/i, 'Answer the Committee Chair’s questions'],
  [/Set SSEB consensus ratings/i, 'Set the committee’s consensus scores'],
  [/Determine price reasonableness/i, 'Evaluate cost and confirm cost points'],
  [/Make and sign the source selection decision/i, 'Sign the recommendation of award'],
]
export function taskTitle(title: string | undefined, fw: Framework) {
  if (!title || fw !== 'sled') return title ?? ''
  return SLED_TASK_TITLES.reduce((s, [from, to]) => s.replace(from, to), title)
}

/** Proposal volume names: a federal proposal comes in volumes, a District RFP response in sections. */
const VOLUMES: Record<Framework, Record<string, string>> = {
  federal: {
    cover: 'Cover Letter and Certifications', technical: 'Volume I — Technical', management: 'Volume II — Management',
    pastPerformance: 'Volume III — Past Performance', price: 'Volume IV — Price',
  },
  sled: {
    cover: 'Transmittal Letter and Required Forms', technical: 'Section 1 — Functional and Technical Response', management: 'Section 2 — Implementation and Support',
    pastPerformance: 'Section 3 — Experience and References', price: 'Section 4 — Cost Proposal',
  },
}
export const volumeName = (v: string, fw: Framework) => VOLUMES[fw][v] ?? v

// ------------------------------------------------------------------------------------------ points (State & Local)

/** Share of a criterion's points each step of the scoring guide earns, best first (Excellent … Unacceptable). */
export const POINT_SHARES = [1, 0.8, 0.6, 0.4, 0]

/** Points a scale step earns on a criterion worth `max` points. */
export const pointsAt = (max: number, step: number) => Math.round(max * (POINT_SHARES[Math.max(0, Math.min(4, step))] ?? 0) * 10) / 10

/** Cost points by formula: the lowest cost earns every point, the rest (lowest ÷ theirs) × max. */
export function costPoints(max: number, cost: number | undefined, lowest: number | undefined) {
  if (!cost || !lowest) return undefined
  return Math.round(max * (lowest / cost) * 10) / 10
}

export const pts = (n?: number) => (n == null ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(1))

// ------------------------------------------------------------------------------------------ React

const Ctx = createContext<Framework>('federal')

/** The framework the forms and screens inside are shown in. Forms set it from their plan. */
export function TermsProvider({ framework, children }: { framework: Framework; children: ReactNode }) {
  return createElement(Ctx.Provider, { value: framework }, children)
}

export const useFramework = () => useContext(Ctx)
export const useTerms = () => TERMS[useContext(Ctx)]
/** volumeName for the framework in use. */
export function useVolumeLabel() {
  const fw = useContext(Ctx)
  return (v: string) => volumeName(v, fw)
}
