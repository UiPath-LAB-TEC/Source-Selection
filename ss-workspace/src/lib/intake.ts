/** Intake wizard model: draft ⇄ evaluation plan, Section M agent, proposal files, create + start. */
import type { UiPath } from '@uipath/uipath-typescript/core'
import { Buckets } from '@uipath/uipath-typescript/buckets'
import { Entities } from '@uipath/uipath-typescript/entities'
import { Jobs } from '@uipath/uipath-typescript/jobs'
import { Processes } from '@uipath/uipath-typescript/processes'
import { FOLDER, PROCESS_FOLDER } from './data'
import { NUMBER_FORMAT, volumeName } from '@forms/lib/terms'
import type { Framework } from '@forms/lib/terms'
import { SCORING_GUIDE } from '@forms/lib/ratings'
import { evaluatorBySlot } from './types'
import type { Factor, Plan, RatingMethod, Solicitation } from './types'

export const SECTION_M_AGENT = 'SS_SectionMAnalyst'
/** How the app names the agent to people: the Orchestrator process name stays out of the UI. */
export const SECTION_M_AGENT_LABEL = 'UiPath Agent'
export const PROPOSALS_BUCKET = 'SS-Proposals'
export const VOLUMES = ['cover', 'technical', 'management', 'pastPerformance', 'price'] as const
/** A volume's name in the framework's words (Volume I — Technical, or Section 1 — Functional and Technical Response). */
export const volumeLabelFor = (fw: Framework) => (v: string) => volumeName(v, fw)
export const SCALES: Plan['scales'] = {
  technical: ['Outstanding', 'Good', 'Acceptable', 'Marginal', 'Unacceptable'],
  confidence: ['Substantial Confidence', 'Satisfactory Confidence', 'Neutral Confidence', 'Limited Confidence', 'No Confidence'],
}
/** A District RFP scores every criterion on one five-step guide; each step earns a share of the criterion's points. */
export const SLED_SCALES: Plan['scales'] = { technical: [...SCORING_GUIDE], confidence: [...SCORING_GUIDE] }
const FINDING_KINDS = ['Strength', 'Significant Strength', 'Weakness', 'Significant Weakness', 'Deficiency', 'Risk']

export type RatingType = 'merit' | 'confidence' | 'price'

export interface DraftFactor {
  key: string
  name: string
  criteria: string
  subfactors: string
  ratingType: RatingType
  volume: string
  /** Share of the evaluation in percent; the draft's factors total 100. */
  weight: number
  /** Importance order derived from the weights (1 = heaviest); equal weights share a rank. */
  rank: number
  sourceQuote?: string
}

export interface Clin { clin: string; description: string; amount: number }

/** SSEB evaluators on the panel. The process opens an Individual Evaluation review only for slots 1..panelSize. */
export type PanelSize = 2 | 3
export const panelSlots = (size: PanelSize) => [1, 2, 3].filter((s) => s <= size)

export interface Draft {
  /** Federal (FAR Part 15) or State & Local (K-12 district RFP). Drafts saved before the toggle are federal. */
  framework?: Framework
  solicitationId: string
  title: string
  agency: string
  office: string
  contractType: string
  basisForAward: string
  clins: Clin[]
  template: 'dod' | 'civilian' | 'k12'
  ratingMethod: RatingMethod
  relativeImportance: string
  factors: DraftFactor[]
  /** Every factor carries the same weight (kept equal as factors are added or removed). */
  equalWeights?: boolean
  /** Proposal volumes the CO uploaded in this setup, by offeror code. */
  proposals?: Record<string, string[]>
  pageLimits: Record<string, number>
  panelSize: PanelSize
  /** evaluator slot -> factor keys */
  assignments: Record<number, string[]>
  sectionM?: { fileName: string; openQuestions: string; at: string }
}

let n = 0
const key = () => `f${Date.now().toString(36)}${n++}`

const factor = (name: string, ratingType: RatingType, volume: string, rank: number, criteria: string, subfactors = '', weight = 0): DraftFactor =>
  ({ key: key(), name, ratingType, volume, rank, weight, criteria, subfactors })

export const fwOf = (d: Pick<Draft, 'framework'>): Framework => (d.framework === 'sled' ? 'sled' : 'federal')

/** Whole percentages in proportion to `raw` that total exactly 100 (largest remainders get the leftover points). */
function toPercents(raw: number[]): number[] {
  const sum = raw.reduce((a, b) => a + b, 0) || 1
  const exact = raw.map((r) => (r * 100) / sum)
  const out = exact.map(Math.floor)
  let left = 100 - out.reduce((a, b) => a + b, 0)
  for (const [, i] of exact.map((e, i) => [e - out[i], i] as const).sort((a, b) => b[0] - a[0])) { if (left-- > 0) out[i]++ }
  return out
}

/** Equal shares of 100 for every factor. */
export const equalShares = (n: number) => toPercents(Array(n).fill(1))

/** Ranks (1 = heaviest) from weights: equal weights share a rank. */
export function rerank(fs: DraftFactor[]): DraftFactor[] {
  const distinct = [...new Set(fs.map((f) => f.weight))].sort((a, b) => b - a)
  return fs.map((f) => ({ ...f, rank: distinct.indexOf(f.weight) + 1 }))
}

/** Weights from importance ranks, for sources that only state an order (templates, Section M, older plans). */
export function weighFromRanks(fs: DraftFactor[]): DraftFactor[] {
  if (!fs.length) return fs
  const max = Math.max(...fs.map((f) => f.rank))
  const w = toPercents(fs.map((f) => max + 1 - f.rank))
  return rerank(fs.map((f, i) => ({ ...f, weight: w[i] })))
}

/** All factors at the same weight. */
export const weighEqually = (fs: DraftFactor[]) => { const w = equalShares(fs.length); return rerank(fs.map((f, i) => ({ ...f, weight: w[i] }))) }

export const totalWeight = (fs: DraftFactor[]) => fs.reduce((t, f) => t + (Number(f.weight) || 0), 0)

/** A relative importance statement that says what the weights say (State & Local: the points and the cost formula). */
export function describeWeights(fs: DraftFactor[], fw: Framework = 'federal') {
  const sorted = [...fs].sort((a, b) => b.weight - a.weight)
  const name = (f: DraftFactor) => f.name.trim() || (fw === 'sled' ? 'Untitled criterion' : 'Untitled factor')
  if (fw === 'sled') {
    const list = fs.map((f) => `${name(f)} ${f.weight}`)
    const cost = fs.find((f) => f.ratingType === 'price')
    const scored = `Proposals are scored out of 100 points: ${list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0]}.`
    return cost ? `${scored} Cost points are awarded by formula: the lowest total cost receives ${cost.weight} points and each other proposal receives (lowest cost ÷ its cost) × ${cost.weight}.` : scored
  }
  if (sorted.length > 1 && sorted.every((f) => f.weight === sorted[0].weight)) return 'All evaluation factors are of equal importance.'
  const parts = sorted.map((f) => `${name(f)} (${f.weight}%)`)
  return `The evaluation factors are weighted as follows: ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]}.`
}

export const TEMPLATES: Record<Draft['template'], { label: string; hint: string; framework: Framework; build: () => Pick<Draft, 'factors' | 'ratingMethod' | 'relativeImportance' | 'pageLimits'> }> = {
  dod: {
    label: 'DoD best-value tradeoff', hint: 'DoD Source Selection Procedures · color ratings', framework: 'federal',
    build: () => ({
      ratingMethod: 'color',
      relativeImportance: 'Technical is more important than Management, which is more important than Past Performance. All non-price factors combined are significantly more important than Price.',
      pageLimits: { technical: 25, management: 15, pastPerformance: 10 },
      factors: [
        factor('Technical Approach', 'merit', 'technical', 1, 'The Government will evaluate the soundness and feasibility of the offeror\'s technical approach.'),
        factor('Management Approach', 'merit', 'management', 2, 'The Government will evaluate the offeror\'s management, staffing and transition approach.'),
        factor('Past Performance', 'confidence', 'pastPerformance', 3, 'The Government will assess confidence based on recent and relevant past performance.', 'Recency; Relevancy; Quality'),
        factor('Price', 'price', 'price', 4, 'Price will be evaluated for reasonableness and balance.'),
      ],
    }),
  },
  civilian: {
    label: 'Civilian best-value tradeoff', hint: 'FAR 15.3 · adjectival ratings', framework: 'federal',
    build: () => ({
      ratingMethod: 'adjectival',
      relativeImportance: 'Technical Capability is more important than Past Performance. Non-price factors combined are approximately equal to Price.',
      pageLimits: { technical: 30, pastPerformance: 10 },
      factors: [
        factor('Technical Capability', 'merit', 'technical', 1, 'The Government will evaluate the offeror\'s technical capability to meet the requirement.'),
        factor('Past Performance', 'confidence', 'pastPerformance', 2, 'The Government will assess confidence based on recent and relevant past performance.', 'Recency; Relevancy; Quality'),
        factor('Price', 'price', 'price', 3, 'Price will be evaluated for reasonableness.'),
      ],
    }),
  },
  k12: {
    label: 'K-12 district RFP', hint: 'Points out of 100 · cost points by formula', framework: 'sled',
    build: () => {
      const factors = [
        factor('Functional and Technical Fit', 'merit', 'technical', 1, 'The District will evaluate how well the proposed solution meets the functional and technical requirements in the Scope of Work, including student data privacy (FERPA) and accessibility.', '', 40),
        factor('Implementation and Support', 'merit', 'management', 3, 'The District will evaluate the implementation schedule and its timing against the school year, data migration, training, and ongoing support and service levels.', '', 20),
        factor('Experience and References', 'merit', 'pastPerformance', 4, 'The District will evaluate the proposer\'s experience with K-12 districts of similar size within the last five years, based on the references provided.', '', 10),
        factor('Cost', 'price', 'price', 2, 'Cost points are awarded by formula on the total cost: the lowest total cost receives every cost point, and each other proposal receives (lowest cost ÷ its cost) × the cost points.', '', 30),
      ]
      return { ratingMethod: 'points', relativeImportance: describeWeights(factors, 'sled'), pageLimits: { technical: 30, management: 15, pastPerformance: 8 }, factors }
    },
  },
}

/** The acquisition approaches a framework offers. */
export const templatesFor = (fw: Framework) => (Object.keys(TEMPLATES) as Draft['template'][]).filter((k) => TEMPLATES[k].framework === fw)

/** How a District can award: the RFP's highest score, or the lowest responsive and responsible bid. */
export const BASES: Record<Framework, string[]> = {
  federal: ['Best value tradeoff (FAR 15.101-1)', 'Lowest price technically acceptable (FAR 15.101-2)'],
  sled: ['Most advantageous proposal — highest total score out of 100 points', 'Lowest responsive and responsible proposal'],
}

/** A template's starting factors, relative importance and page limits, for when there's no Section M to draft them. */
export function defaultFactors(t: Draft['template']): Pick<Draft, 'factors' | 'relativeImportance' | 'pageLimits' | 'equalWeights'> {
  const { factors, relativeImportance, pageLimits } = TEMPLATES[t].build()
  // A template with points (K-12) keeps them; the federal ones state an order and weights follow it.
  return { factors: factors.every((f) => f.weight > 0) ? rerank(factors) : weighFromRanks(factors), relativeImportance, pageLimits, equalWeights: false }
}

/** Criteria before Section M: the template's rating method, and no factors until Section M or the defaults supply them. */
export function blankCriteria(t: Draft['template']): Pick<Draft, 'ratingMethod' | 'factors' | 'equalWeights' | 'relativeImportance' | 'pageLimits' | 'assignments'> {
  return { ratingMethod: TEMPLATES[t].build().ratingMethod, factors: [], equalWeights: false, relativeImportance: '', pageLimits: {}, assignments: { 1: [], 2: [], 3: [] } }
}

export function emptyDraft(fw: Framework = 'federal'): Draft {
  const template = fw === 'sled' ? 'k12' : 'dod'
  return {
    framework: fw, solicitationId: '', title: '', agency: '', office: '', contractType: '', basisForAward: BASES[fw][0],
    clins: [{ clin: '0001', description: '', amount: 0 }], template, ...blankCriteria(template), panelSize: 3,
  }
}

/** Default panel: every evaluator on every merit factor; past performance to the last slot (3, or 2 on a two-evaluator panel). */
export function defaultAssignments(factors: DraftFactor[], size: PanelSize = 3): Record<number, string[]> {
  // Past performance (a federal confidence assessment, or a District's scored references) goes to the last slot.
  const pastPerformance = (f: DraftFactor) => f.ratingType === 'confidence' || f.volume === 'pastPerformance'
  const merit = factors.filter((f) => f.ratingType === 'merit' && !pastPerformance(f)).map((f) => f.key)
  const conf = factors.filter((f) => f.ratingType !== 'price' && pastPerformance(f)).map((f) => f.key)
  return size === 2
    ? { 1: merit, 2: [...merit, ...conf], 3: [] }
    : { 1: merit, 2: merit, 3: [...merit.slice(0, 1), ...conf] }
}

/** Change the panel size. Dropping Evaluator 3 clears their assignments and hands Evaluator 2 any factor nobody else rates. */
export function resizePanel(d: Draft, size: PanelSize): Pick<Draft, 'panelSize' | 'assignments'> {
  const a = { ...d.assignments }
  if (size === 2) {
    const orphans = (a[3] ?? []).filter((k) => !a[1]?.includes(k) && !a[2]?.includes(k))
    a[2] = [...new Set([...(a[2] ?? []), ...orphans])]
    a[3] = []
    return { panelSize: 2, assignments: a }
  }
  if (!a[3]?.length) a[3] = defaultAssignments(d.factors, 3)[3]
  return { panelSize: 3, assignments: a }
}

export const rated = (d: Draft) => d.factors.filter((f) => f.ratingType !== 'price')
export const ordered = (fs: DraftFactor[]) => [...fs].sort((a, b) => a.rank - b.rank)

/** Draft from an existing plan (resume a solicitation whose case has not started). */
export function draftFromPlan(plan: Plan): Draft {
  const keys = new Map<string, string>()
  const factors = plan.factors.slice().sort((a, b) => a.order - b.order).map((f) => {
    const k = key()
    keys.set(f.id, k)
    return { key: k, name: f.name, criteria: f.criteria, subfactors: (f.subfactors ?? []).join('; '), volume: f.volume, rank: f.order, weight: f.weight ?? 0,
      ratingType: (f.evaluatedNotRated ? 'price' : f.scale === 'confidence' ? 'confidence' : 'merit') as RatingType }
  })
  // Plans made before weights state only an order; derive weights from it.
  const weighed = factors.every((f) => f.weight > 0) ? rerank(factors) : weighFromRanks(factors)
  const sled = plan.framework === 'sled'
  return {
    framework: sled ? 'sled' : 'federal',
    solicitationId: plan.solicitationId, title: plan.title, agency: plan.agency, office: plan.office, contractType: plan.contractType,
    basisForAward: plan.basisForAward, template: sled ? 'k12' : /Air Force|Army|Navy|Defense/.test(plan.agency) ? 'dod' : 'civilian',
    ratingMethod: plan.ratingMethod ?? (sled ? 'points' : 'adjectival'), relativeImportance: plan.relativeImportance, factors: weighed,
    equalWeights: weighed.length > 1 && weighed.every((f) => f.weight === weighed[0].weight),
    clins: Object.entries(plan.igce.lines).map(([clin, amount]) => ({ clin, description: '', amount })),
    pageLimits: { ...plan.submission.pageLimits },
    panelSize: plan.panel.evaluators.some((e) => e.slot === 3) ? 3 : 2,
    assignments: { 1: [], 2: [], 3: [], ...Object.fromEntries(plan.panel.evaluators.map((e) => [e.slot, e.factors.map((id) => keys.get(id)!).filter(Boolean)])) },
  }
}

export function toPlan(d: Draft, offerors: string[]): Plan {
  let merit = 0
  const ids = new Map<string, string>()
  // Dense importance ranks: factors of equal importance share an order.
  const dense = new Map([...new Set(ordered(d.factors).map((f) => f.rank))].map((r, i) => [r, i + 1]))
  const factors: Factor[] = ordered(d.factors).map((f) => {
    const id = f.ratingType === 'price' ? 'PRICE' : `F${++merit}`
    ids.set(f.key, id)
    return {
      id, name: f.name.trim(), order: dense.get(f.rank)!, weight: f.weight, volume: f.volume, criteria: f.criteria.trim(),
      ...(f.ratingType === 'price' ? { evaluatedNotRated: true } : { scale: f.ratingType === 'confidence' ? 'confidence' as const : 'technical' as const }),
      ...(f.subfactors.trim() ? { subfactors: f.subfactors.split(/;\s*/).map((s) => s.trim()).filter(Boolean) } : {}),
    }
  })
  const volumes = [...new Set(['cover', ...factors.map((f) => f.volume)])]
  const sled = fwOf(d) === 'sled'
  return {
    ...(sled ? { framework: 'sled' as const } : {}),
    solicitationId: d.solicitationId.trim(), title: d.title.trim(), agency: d.agency.trim(), office: d.office.trim(),
    contractType: d.contractType.trim(), basisForAward: d.basisForAward, relativeImportance: d.relativeImportance.trim(),
    ratingMethod: sled ? 'points' : d.ratingMethod, factors, scales: sled ? SLED_SCALES : SCALES, findingKinds: FINDING_KINDS,
    panel: {
      evaluators: panelSlots(d.panelSize).filter((s) => d.assignments[s]?.length).map((s) => ({
        slot: s, title: sled ? 'Evaluation Committee Member' : `Evaluator ${s}`, factors: d.assignments[s].map((k) => ids.get(k)!).filter(Boolean), personaId: `evaluator${s}`,
      })),
      chair: 'chair', ssa: 'ssa', co: 'co',
    },
    igce: { total: d.clins.reduce((t, c) => t + (Number(c.amount) || 0), 0), lines: Object.fromEntries(d.clins.filter((c) => c.clin).map((c) => [c.clin, Number(c.amount) || 0])) },
    submission: { volumes, pageLimits: Object.fromEntries(Object.entries(d.pageLimits).filter(([v, n]) => volumes.includes(v) && n > 0)) },
    offerors,
  }
}

/** Blocking problems per step (empty = ok), plus advisory warnings. */
export function check(d: Draft, step: number, offerorCount: number): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const sled = fwOf(d) === 'sled'
  const factorWord = sled ? 'criterion' : 'factor'
  if (step === 0) {
    const fmt = NUMBER_FORMAT[fwOf(d)]
    if (!fmt.re.test(d.solicitationId.trim())) errors.push(`${sled ? 'RFP number' : 'Solicitation number'} should look like ${fmt.example}.`)
    if (!d.title.trim()) errors.push('Enter a title.')
    if (!d.agency.trim()) errors.push(sled ? 'Enter the district.' : 'Enter the agency.')
    if (!d.clins.some((c) => Number(c.amount) > 0)) errors.push(sled ? 'Enter the cost estimate for at least one price item.' : 'Enter the IGCE for at least one CLIN.')
  }
  if (step === 1) {
    if (!d.factors.length) errors.push(sled ? 'Upload the evaluation criteria so the UiPath Agent drafts them, or use the default criteria.' : 'Upload Section M so the UiPath Agent drafts the factors, or use the default factors.')
    else if (!rated(d).length) errors.push(sled ? 'Add at least one scored criterion.' : 'Add at least one rated factor.')
    if (d.factors.length && !d.factors.some((f) => f.ratingType === 'price')) {
      warnings.push(sled ? 'No Cost criterion — district purchasing policy requires cost to be scored in every RFP.' : 'No Price factor — FAR 15.304(c)(1) requires price or cost to be evaluated in every source selection.')
    }
    if (d.factors.some((f) => !f.name.trim() || !f.criteria.trim())) errors.push(`Every ${factorWord} needs a name and evaluation criteria.`)
    const total = totalWeight(d.factors)
    if (d.factors.length && d.factors.some((f) => !(Number(f.weight) > 0))) errors.push(sled ? 'Give every criterion more than 0 points.' : 'Give every factor a weight above 0%.')
    else if (d.factors.length && total !== 100) errors.push(sled ? `The criteria add up to ${total} points. Make them total 100.` : `The factor weights add up to ${total}%. Make them total 100%.`)
    if (d.factors.length && !d.relativeImportance.trim()) errors.push(sled ? 'State how proposals are scored, as the RFP does.' : 'State the relative importance of the factors (FAR 15.304(d)).')
  }
  if (step === 2) {
    const slots = panelSlots(d.panelSize)
    for (const f of rated(d)) {
      const n = slots.filter((s) => d.assignments[s]?.includes(f.key)).length
      if (!n) errors.push(`Assign at least one evaluator to ${f.name || `each ${factorWord}`}.`)
      else if (n === 1 && f.ratingType === 'merit') warnings.push(`${f.name} has one evaluator; consider two for consensus.`)
    }
    for (const s of slots) {
      const who = evaluatorBySlot(s)?.name ?? `Evaluator ${s}`
      if (!d.assignments[s]?.some((k) => rated(d).some((f) => f.key === k))) errors.push(`Assign at least one ${factorWord} to ${who}${d.panelSize === 3 && s === 3 ? `, or use a two-evaluator ${sled ? 'committee' : 'panel'}` : ''}.`)
    }
  }
  if (step === 3 && !offerorCount) errors.push(sled ? 'No proposals found yet — upload at least one proposer\'s sections.' : 'No proposals found yet — upload at least one offeror\'s volumes.')
  return { errors, warnings }
}

// ── Section M agent ─────────────────────────────────────────────────────────

export interface SectionMResult {
  basisForAward: string
  relativeImportance: string
  /** maxPoints: a points-scored RFP's maximum for the criterion (State & Local); absent for federal Section M. */
  factors: { name: string; criteria: string; subfactors: string[]; ratingType: string; volume: string; importanceRank: number; sourceQuote: string; maxPoints?: number }[]
  volumes: { volume: string; pageLimit: number }[]
  ratingMethod: string
  openQuestions: string
}

export function applySectionM(d: Draft, r: SectionMResult, fileName: string): Draft {
  const factors = r.factors.map((f) => factor(
    f.name, (['merit', 'confidence', 'price'].includes(f.ratingType) ? f.ratingType : 'merit') as RatingType,
    VOLUMES.includes(f.volume as never) ? f.volume : 'technical', Number(f.importanceRank) || 1, f.criteria, (f.subfactors ?? []).join('; ')))
  factors.forEach((f, i) => { f.sourceQuote = r.factors[i].sourceQuote })
  // A points-scored RFP states each criterion's points: keep them when they total 100. Otherwise Section M states an
  // order of importance; weights follow it (equal ranks, equal weights) and the officer can adjust them.
  const points = r.factors.map((f) => Math.round(Number(f.maxPoints) || 0))
  const scored = points.every((p) => p > 0) && points.reduce((a, b) => a + b, 0) === 100
  const weighed = scored ? rerank(factors.map((f, i) => ({ ...f, weight: points[i] }))) : weighFromRanks(factors)
  const method = (fwOf(d) === 'sled' ? 'points' : ['adjectival', 'color', 'numeric'].includes(r.ratingMethod) ? r.ratingMethod : d.ratingMethod) as RatingMethod
  return {
    ...d, factors: weighed, equalWeights: weighed.length > 1 && weighed.every((f) => f.weight === weighed[0].weight),
    ratingMethod: method, relativeImportance: r.relativeImportance || d.relativeImportance,
    basisForAward: BASES[fwOf(d)].includes(r.basisForAward) ? r.basisForAward : fwOf(d) === 'sled' ? d.basisForAward : r.basisForAward || d.basisForAward,
    pageLimits: Object.fromEntries((r.volumes ?? []).filter((v) => v.pageLimit > 0).map((v) => [v.volume, v.pageLimit])),
    assignments: defaultAssignments(weighed, d.panelSize),
    sectionM: { fileName, openQuestions: r.openQuestions, at: new Date().toISOString() },
  }
}

/** Agent outputs arrive PascalCased (BasisForAward, Factors[].ImportanceRank…); normalize to the schema's camelCase. */
export function camel<T>(v: unknown): T {
  if (Array.isArray(v)) return v.map((x) => camel(x)) as T
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k[0].toLowerCase() + k.slice(1), camel(x)])) as T
  if (typeof v === 'string' && /^\s*[[{]/.test(v)) { try { return camel(JSON.parse(v)) } catch { /* plain text */ } }
  return v as T
}

/**
 * Start a solution agent as an Orchestrator job and wait for its output. `what` names the document it reads, for messages
 * ("The UiPath Agent for Section M isn't deployed…").
 */
async function runAgent<T>(sdk: UiPath, agent: string, what: string, inputs: Record<string, string>, onState: (s: string) => void): Promise<T> {
  let started: Awaited<ReturnType<Processes['start']>>
  try {
    started = await new Processes(sdk).start({ name: agent }, { ...PROCESS_FOLDER, inputArguments: JSON.stringify(inputs) })
  } catch (e) {
    // Only a failed start means the agent is missing; errors once it is running say what actually went wrong.
    if (/could not be found|not found/i.test((e as Error).message)) throw new Error(`The ${SECTION_M_AGENT_LABEL} for ${what} isn't deployed yet — enter it below.`)
    throw e
  }
  const job = started[0]
  const jobs = new Jobs(sdk)
  const folderId = (job as unknown as { folderId: number }).folderId
  // Check often: the agent's own work is a few seconds, so a long gap between checks is most of the wait on a warm robot.
  const deadline = Date.now() + 6 * 60_000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    const j = await jobs.getById(job.key, folderId)
    onState(String(j.state))
    if (j.state === 'Successful') return camel<T>((await jobs.getOutput(job.key, folderId)) ?? {})
    if (j.state === 'Faulted' || j.state === 'Stopped') throw new Error(`The ${SECTION_M_AGENT_LABEL} ${String(j.state).toLowerCase()} reading ${what}: ${(j as unknown as { info?: string }).info ?? ''}`)
  }
  throw new Error(`The ${SECTION_M_AGENT_LABEL} did not finish reading ${what} within 6 minutes.`)
}

/** SS_SectionMAnalyst: the evaluation plan from RFP Section M. */
export function runSectionMAgent(sdk: UiPath, solicitationId: string, sectionMText: string, onState: (s: string) => void, what = 'Section M'): Promise<SectionMResult> {
  return runAgent<SectionMResult>(sdk, SECTION_M_AGENT, what, { solicitationId, sectionMText: sectionMText.slice(0, 9000) }, onState)
}

export const SOLICITATION_AGENT = 'SS_SolicitationAnalyst'
export interface SolicitationResult { solicitationId: string; title: string; agency: string; office: string; contractType: string; basisForAward: string; openQuestions?: string }

/** SS_SolicitationAnalyst: the solicitation's identifying details from its cover page (SF 33 / SF 1449) and Section B. */
export function runSolicitationAgent(sdk: UiPath, solicitationText: string, onState: (s: string) => void): Promise<SolicitationResult> {
  return runAgent<SolicitationResult>(sdk, SOLICITATION_AGENT, 'the solicitation', { solicitationText: solicitationText.slice(0, 9000) }, onState)
}

const WARM_KEY = 'ss.agentWarmAt'
const WARM_EVERY = 10 * 60_000

/**
 * Wake a cloud robot before the CO uploads anything. The agents' own work takes seconds, but a job that finds no
 * running robot waits up to ~30 s for one to start. One tiny solicitation-agent run (at most every 10 minutes) leaves
 * a robot running for the solicitation, IGCE and Section M uploads that follow; its result is ignored.
 */
export function warmAgents(sdk: UiPath) {
  try {
    if (Date.now() - Number(localStorage.getItem(WARM_KEY) ?? 0) < WARM_EVERY) return
    localStorage.setItem(WARM_KEY, String(Date.now()))
  } catch { /* no storage: warm anyway */ }
  void new Processes(sdk).start({ name: SOLICITATION_AGENT }, {
    ...PROCESS_FOLDER,
    inputArguments: JSON.stringify({ solicitationText: 'Warm-up run with no solicitation attached. Return empty values.' }),
  }).catch(() => undefined)
}

export const IGCE_AGENT = 'SS_IGCEAnalyst'
export interface IgceResult { clins: { clin: string; description: string; amount: number; sourceQuote?: string }[]; total: number; openQuestions?: string }

/** SS_IGCEAnalyst: the CLIN-level estimate from the Government's IGCE, for the Contracting Officer to review. */
export function runIgceAgent(sdk: UiPath, solicitationId: string, igceText: string, onState: (s: string) => void, what = 'the IGCE'): Promise<IgceResult> {
  return runAgent<IgceResult>(sdk, IGCE_AGENT, what, { solicitationId, igceText: igceText.slice(0, 9000) }, onState)
}

// ── Proposals ───────────────────────────────────────────────────────────────

/** Offeror code -> volumes found under SS-Proposals/<solicitationId>/<code>/<volume>.pdf */
export async function listProposals(sdk: UiPath, solicitationId: string): Promise<Record<string, string[]>> {
  const res = await new Buckets(sdk).getFileMetaData({ name: PROPOSALS_BUCKET }, { ...FOLDER, prefix: solicitationId })
  return group((res.items ?? []).map((b) => b.path))
}

export function group(paths: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const p of paths) {
    const [, code, file] = p.replace(/^\//, '').split('/')
    if (code && file?.toLowerCase().endsWith('.pdf')) (out[code] ??= []).push(file.slice(0, -4))
  }
  return out
}

export async function uploadProposal(sdk: UiPath, solicitationId: string, code: string, volume: string, file: File) {
  await new Buckets(sdk).uploadFile({ name: PROPOSALS_BUCKET }, `${solicitationId}/${code}/${volume}.pdf`, file, FOLDER)
}

/** Guess a volume from a file name (technical.pdf, "Vol III Past Performance.pdf", "Section 3 References.pdf", …). */
export function guessVolume(name: string): string {
  const n = name.toLowerCase()
  if (/past|perf|refer|experience|vol(ume)?\s*iii\b|section\s*3\b/.test(n)) return 'pastPerformance'
  if (/price|cost|vol(ume)?\s*iv|section\s*4\b/.test(n)) return 'price'
  if (/manag|implement|support|vol(ume)?\s*ii\b|section\s*2\b/.test(n)) return 'management'
  if (/cover|cert|letter|transmittal|forms/.test(n)) return 'cover'
  return 'technical'
}

// ── Create ──────────────────────────────────────────────────────────────────

export function solicitationRecord(plan: Plan): Omit<Solicitation, 'Id'> {
  return { SolicitationId: plan.solicitationId, Title: plan.title, Agency: plan.agency, PlanJson: JSON.stringify(plan), Status: 'Proposals Received', Stage: 'Not started' }
}

export async function saveSolicitation(sdk: UiPath, plan: Plan, existingId?: string) {
  const e = new Entities(sdk)
  const rec = solicitationRecord(plan)
  if (existingId) await e.updateRecord({ name: 'SSSolicitation' }, existingId, rec)
  else await e.insertRecord({ name: 'SSSolicitation' }, rec)
}
