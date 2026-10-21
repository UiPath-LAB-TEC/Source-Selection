import type { Framework } from '@forms/lib/terms'
import { PERSONAS } from '@ss/lib/types'
import type { Dataset, Persona, Solicitation } from '@ss/lib/types'

/** One row per solicitation: where its Award phase stands. Kept apart from SSSolicitation.Status, which Source Selection reads. */
export interface AwardRow {
  Id: string
  AwardId: string
  SolicitationId: string
  Stage?: string
  CaseInstanceId?: string
  ContractNumber?: string
  ContractValue?: number
  AwardedAt?: string
  NoticesSentAt?: string
  ClocksJson?: string
  PerformanceStatus?: string
  StartedAt?: string
  ClosedAt?: string
}

/** A document exchanged with an offeror: notice, debriefing request, debriefing, follow-up question or answer. */
export interface Correspondence {
  Id: string
  CorrespondenceId: string
  SolicitationId: string
  OfferorId: string
  Kind: string
  Status: string
  Text?: string
  AgentText?: string
  DisclosureCheckJson?: string
  ReceivedAt?: string
  DeliveredAt?: string
  DueAt?: string
  FilePath?: string
  Author?: string
}

export interface Protest {
  Id: string
  ProtestId: string
  SolicitationId: string
  OfferorId: string
  Forum?: string
  DocketNumber?: string
  FiledAt?: string
  NoticeReceivedAt?: string
  StayRequired?: boolean
  GroundsJson?: string
  Position?: string
  ReportDueAt?: string
  ReportFiledAt?: string
  DecisionDueAt?: string
  Outcome?: string
  FilePath?: string
}

/** The whole record of every solicitation: Source Selection's entities plus the Award phase's own. */
export interface AwardDataset extends Dataset {
  awards: AwardRow[]
  correspondence: Correspondence[]
  protests: Protest[]
}

/**
 * The Award phase's steps. A district's order differs: the notice of intent to award opens the protest period before
 * the Board approves the contract.
 */
export const AWARD_STAGES: Record<Framework, string[]> = {
  federal: ['Contract award', 'Notices', 'Debriefings', 'Protest window', 'Closed'],
  sled: ['Notice of intent', 'Protest period', 'Board approval', 'Contract', 'Closed'],
}

/** Where an award stands on its tracker: -1 before the Award phase starts, the stage count once it's closed. */
export function awardStageIndex(award: AwardRow | undefined, fw: Framework) {
  if (!award) return -1
  const stages = AWARD_STAGES[fw]
  if (award.ClosedAt || award.Stage === 'Closed') return stages.length
  return Math.max(0, stages.indexOf(award.Stage ?? ''))
}

/**
 * Who moves next at each Award step, before the phase starts (-1) and at each stage index, in the framework's words.
 * The status bar on an award card reads "Next: <label>" and adds "— that's you" for the persona named.
 */
export const AWARD_NEXT: Record<Framework, { who: Persona['id'][]; label: string }[]> = {
  federal: [
    { who: ['co'], label: 'Contracting Officer begins the award phase' },
    { who: ['co'], label: 'Contracting Officer executes the contract award' },
    { who: ['co'], label: 'Contracting Officer sends the notices' },
    { who: ['co'], label: 'Contracting Officer delivers the debriefings' },
    { who: ['co', 'counsel'], label: 'Protest window open: Contracting Officer and counsel' },
  ],
  sled: [
    { who: ['co'], label: 'Procurement Officer begins the award phase' },
    { who: ['co'], label: 'Procurement Officer sends the notice of intent' },
    { who: ['co', 'counsel'], label: 'Protest period open: Procurement Officer and counsel' },
    { who: [], label: 'Board of Education approves the contract' },
    { who: ['co'], label: 'Procurement Officer executes the contract' },
  ],
}

/** Awarded in Source Selection: the decision is signed and the award record filed, so the Award phase can begin. */
export const isAwarded = (s: Solicitation) => s.Status === 'Awarded'

/** At the award decision in Source Selection: the next ones to reach this app. */
export const atAwardDecision = (s: Solicitation) => s.Status === 'In evaluation' && s.Stage === 'Award Decision'

const person = (id: Persona['id']) => PERSONAS.find((p) => p.id === id)!

/** Agency counsel: advises the CO on debriefings and defends a protest. Fictional, like every official in the demo. */
export const COUNSEL: Persona = {
  id: 'counsel', name: 'Claire Navarro', label: 'Agency Counsel', role: 'Advises on debriefings and defends protests', short: 'CN', taskLabel: 'agency-counsel',
}

/** The Award app's people: the Contracting Officer does most of the work, counsel handles protests, the SSA reads. */
export const AWARD_PERSONAS: Persona[] = [person('co'), COUNSEL, person('ssa')]

/** Counsel's title in a district. The other officials take their framework titles from the shared terms (titled). */
export function counselTitled(p: Persona, fw: Framework): Persona {
  return p.id === 'counsel' && fw === 'sled' ? { ...p, label: 'District Counsel', role: 'Advises the district on protests' } : p
}
