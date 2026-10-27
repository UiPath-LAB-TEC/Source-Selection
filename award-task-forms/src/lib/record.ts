import type { Framework } from '@forms/lib/terms'

/*
 * The Award phase's record, shared by the Contract Management forms and web app (which imports this file
 * from source as @award, the way Source Selection's web app imports its forms as @forms).
 */

/**
 * One row per contract: where its award phase stands (kept apart from SSSolicitation.Status, which Source Selection
 * reads) and, once signed, its administration (lib/admin.ts). A contract awarded outside Source Selection has
 * Origin 'Imported' and carries its own title, agency and awardee.
 */
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
  /** Award · Administration · Closeout · Closed */
  Phase?: string
  /** Source Selection · Imported */
  Origin?: string
  Framework?: string
  Title?: string
  Agency?: string
  Office?: string
  AwardeeName?: string
  ContractType?: string
  PeriodStart?: string
  PeriodEnd?: string
  CurrentPeriod?: string
  CeilingValue?: number
  ObligatedValue?: number
  InvoicedValue?: number
  FundsJson?: string
  AbstractJson?: string
  CorName?: string
  CorEmail?: string
  PredecessorId?: string
  SuccessorId?: string
  WatchedAt?: string
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
export const AWARD_NEXT: Record<Framework, { who: string[]; label: string }[]> = {
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

/** Correspondence kinds, as stored in SSCorrespondence.Kind. */
export const KIND = {
  awardNotice: 'AwardNotice', notice: 'UnsuccessfulNotice', debriefRequest: 'DebriefRequest', debriefing: 'Debriefing',
  question: 'FollowUpQuestion', answer: 'FollowUpAnswer',
} as const

/** "UnsuccessfulNotice" → "Unsuccessful notice", for labels. */
export const kindLabel = (kind: string) => kind.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/ ([A-Z])/g, (m) => m.toLowerCase())

/** The robot leaves these in every drafted document; the Contracting Officer's signature fills them (AW_Robots letters.py). */
export const LETTER_DATE = '[Date sent]'
export const LETTER_SIGNATURE = "[Contracting Officer's signature]"

/** Sign a drafted document: today's date where the robot left the date, and "/s/ Name" where it left the signature. */
export const signLetter = (text: string, name: string, date: string) => text.split(LETTER_DATE).join(date).split(LETTER_SIGNATURE).join(`/s/ ${name}`)

export interface Check { label: string; ok: boolean }

/**
 * What a notice must say (FAR 15.207-2(b) under the RFO deviation; FAR 15.503(b)(1)), checked on the text the
 * Contracting Officer is about to send, so an edit can't drop one. A notice to an unsuccessful offeror must also never
 * name the other unsuccessful offerors.
 */
export function noticeChecks(kind: string, text: string, awardee: { name: string; address: string }, contractNumber: string, others: string[]): Check[] {
  if (kind === KIND.awardNotice) {
    return [
      { label: 'Contract number', ok: text.includes(contractNumber) },
      { label: 'Total price', ok: /\$[\d,]+/.test(text) },
    ]
  }
  return [
    { label: 'Offerors solicited', ok: /offerors solicited/i.test(text) },
    { label: 'Proposals received', ok: /proposals received:\s*\d+/i.test(text) },
    { label: 'Awardee name and address', ok: text.includes(awardee.name) && (!awardee.address || text.includes(awardee.address)) },
    { label: 'Items and prices awarded', ok: /total contract price/i.test(text) },
    { label: 'Why it wasn’t selected', ok: /not selected:\s*\S/i.test(text) },
    { label: 'Debriefing rights', ok: /request a debriefing/i.test(text) },
    { label: 'No other offeror named', ok: !others.some((n) => text.includes(n)) },
  ]
}
