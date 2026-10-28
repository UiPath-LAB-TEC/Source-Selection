import type { AwardRow } from './record'

/*
 * A contract's administration after award, as the daily contract watch (AW_Robots admin.py, WatchContracts) writes it:
 * its schedule, its money and the alerts raised on both. Shared by the Contract Management app (imported as @award) and,
 * from slice B, the forms that answer an alert. The rules themselves live in the robot only; the screens read what it
 * wrote, so every number on a page is the one the alert was raised on.
 */

/** A dated obligation: a period or option, the extension clause, a milestone, a deliverable, a performance evaluation. */
export interface ScheduleRow {
  Id: string
  ScheduleId: string
  SolicitationId: string
  /** Period · Option · Extension · Milestone · Deliverable · Evaluation */
  Kind: string
  Name: string
  Code?: string
  Period?: string
  Clin?: string
  StartDay?: string
  EndDay?: string
  DueDay?: string
  /** For an option: the preliminary notice deadline (52.217-9(a)). DueDay is then the exercise deadline. */
  NoticeDay?: string
  /** 'monthly:<day>' on a recurring deliverable's template row; its due rows are added as the dates come up. */
  Recurrence?: string
  ReceivedDay?: string
  AcceptedDay?: string
  Amount?: number
  /** Exercised · Planned · Notice sent · Not exercised · Due · Received · Accepted · Done · Recurring */
  Status?: string
  ClauseRef?: string
  ClauseText?: string
  Owner?: string
  /** A deliverable on file: its PDF in SS-Records, the reviewer's check (JSON), the COR's decision and the review run. */
  FilePath?: string
  ReviewJson?: string
  ReviewedBy?: string
  ReviewedAt?: string
  Reason?: string
  ProcessInstanceId?: string
}

/** Money on a contract: an obligation or deobligation by modification, or one line of an invoice. */
export interface FundingRow {
  Id: string
  FundingId: string
  SolicitationId: string
  /** Obligation · Deobligation · Invoice */
  Kind: string
  Reference: string
  Clin?: string
  Period?: string
  Amount?: number
  Hours?: number
  ServiceStart?: string
  ServiceEnd?: string
  ReceivedDay?: string
  AcceptedDay?: string
  DueDay?: string
  PaidDay?: string
  /** Obligated · Received · Approved · Defective · Paid */
  Status?: string
  Appropriation?: string
  FundsExpireDay?: string
}

/** A modification the system wrote: an option exercise or an extension of services, signed by the CO and issued. */
export interface ModificationRow {
  Id: string
  ModificationId: string
  SolicitationId: string
  Number: string
  /** Option exercise · Extension of services */
  Kind: string
  Authority?: string
  Bilateral?: boolean
  ScheduleId?: string
  EffectiveDay?: string
  Amount?: number
  /** Signed · Issued */
  Status?: string
  Text?: string
  FilePath?: string
  SignedBy?: string
  SignedAt?: string
}

/** What the watch found coming due or running short on one contract, with the rule behind it. */
export interface AlertRow {
  Id: string
  AlertId: string
  SolicitationId: string
  Kind: AlertKind
  Rule: string
  Subject?: string
  Severity: Severity
  Title: string
  Detail?: string
  DueDay?: string
  /** Persona task labels, comma-separated: contracting-officer, cor, resource-manager */
  Owner?: string
  /** Open · Acknowledged · Dismissed · Resolved */
  Status: string
  EvidenceJson?: string
  RaisedAt?: string
  ResolvedAt?: string
  ActedBy?: string
  ActedAt?: string
  Reason?: string
  ProcessInstanceId?: string
}

export type AlertKind = 'option' | 'extension' | 'ceiling' | 'funds' | 'invoice' | 'deliverable' | 'milestone' | 'evaluation' | 'registration'
export type Severity = 'Overdue' | 'Due soon' | 'Upcoming' | 'Info'

/** Most urgent first. The word is always shown with the color, never the color alone. */
export const SEVERITIES: Severity[] = ['Overdue', 'Due soon', 'Upcoming', 'Info']
export const severityRank = (s: string) => { const i = SEVERITIES.indexOf(s as Severity); return i < 0 ? SEVERITIES.length : i }

export const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  option: 'Option', extension: 'Extension of services', ceiling: 'Labor-hour ceiling', funds: 'Funds', invoice: 'Invoice',
  deliverable: 'Deliverable', milestone: 'Milestone', evaluation: 'Performance evaluation', registration: 'Registration',
}

/** An alert someone still has to act on: open, or acknowledged but not yet cleared. */
export const isLive = (a: AlertRow) => a.Status === 'Open' || a.Status === 'Acknowledged'

export const alertOwners = (a: AlertRow) => (a.Owner ?? '').split(',').map((s) => s.trim()).filter(Boolean)

/** Live alerts, most urgent first, then soonest due. */
export function byUrgency(alerts: AlertRow[]) {
  return [...alerts].sort((a, b) => severityRank(a.Severity) - severityRank(b.Severity) || (a.DueDay ?? '9').localeCompare(b.DueDay ?? '9'))
}

/** One line item in the current period, as the watch forecast it (SSAward.FundsJson). */
export interface FundsLine {
  clin: string
  description?: string
  type?: string
  period: string
  /** The line's price for the period; the ceiling, on a labor-hour line. */
  price: number
  obligated: number
  invoiced: number
  /** The last day invoiced. */
  through: string
  perDay: number
  accrued: number
  atPeriodEnd: number
  runOut?: string | null
  day85?: string | null
  day100?: string | null
  periodEnd: string
}

export interface FundsSummary {
  asOf: string
  period?: string | null
  periodStart?: string | null
  periodEnd?: string | null
  lines: FundsLine[]
}

export interface ContractAbstract {
  source?: string
  contractNumber?: string
  contractType?: string
  contractor?: { name?: string; uei?: string; cage?: string; address?: string; samExpires?: string }
  periods?: { name: string; start: string; end: string }[]
  clins?: { clin: string; description?: string; type?: string; byPeriod?: Record<string, number> }[]
  clauses?: { ref: string; fill?: Record<string, number> }[]
  deliverables?: { code: string; name: string; due: string }[]
}

const parse = <T,>(json?: string): T | undefined => { try { return json ? (JSON.parse(json) as T) : undefined } catch { return undefined } }
export const fundsOf = (a?: AwardRow) => parse<FundsSummary>(a?.FundsJson)
export const abstractOf = (a?: AwardRow) => parse<ContractAbstract>(a?.AbstractJson)

/** Administration has started: the contract is signed and the watch keeps its schedule. */
export const inAdministration = (a?: AwardRow) => a?.Phase === 'Administration' || a?.Phase === 'Closeout'
/** Awarded outside Source Selection: no evaluation record and no award-phase steps here. */
export const isImported = (a?: AwardRow) => a?.Origin === 'Imported'

/** The base period and options, in order. */
export const periodsOf = (schedule: ScheduleRow[]) =>
  schedule.filter((r) => r.Kind === 'Period' || r.Kind === 'Option').sort((a, b) => (a.StartDay ?? '').localeCompare(b.StartDay ?? ''))

/** The 52.217-8 clause's own row (what remains of it); the periods exercised under it are Extension 1, 2, ... */
export const isExtensionClause = (r: ScheduleRow) => r.Kind === 'Extension' && r.ScheduleId.endsWith('-extension-EXT')

/** The extension periods exercised, in order. */
export const extensionsOf = (schedule: ScheduleRow[]) =>
  schedule.filter((r) => r.Kind === 'Extension' && !isExtensionClause(r) && r.Status === 'Exercised').sort((a, b) => (a.StartDay ?? '').localeCompare(b.StartDay ?? ''))
