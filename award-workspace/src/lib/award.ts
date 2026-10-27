import type { Framework } from '@forms/lib/terms'
import { PERSONAS } from '@ss/lib/types'
import type { Dataset, Persona, Solicitation } from '@ss/lib/types'
import type { AwardRow, Correspondence, Protest } from '@award/lib/record'
import type { AlertRow, FundingRow, ScheduleRow } from '@award/lib/admin'

// The record's types, stages and who-moves-next live with the Contract Management forms; the app uses them from source.
export * from '@award/lib/record'
export * from '@award/lib/admin'

/** The whole record of every contract: Source Selection's entities plus the award phase's and the administration's own. */
export interface AwardDataset extends Dataset {
  awards: AwardRow[]
  correspondence: Correspondence[]
  protests: Protest[]
  schedule: ScheduleRow[]
  funding: FundingRow[]
  alerts: AlertRow[]
}

/**
 * A contract's header, as the pages read a solicitation. One awarded outside Source Selection has no SSSolicitation
 * row, so the data layer gives it one from its SSAward row (lib/data.tsx), marked Imported.
 */
export interface ContractHeader extends Solicitation {
  Imported?: boolean
}

/** The header the pages read for a contract awarded outside Source Selection: its own title, agency and terms. */
export function importedHeader(a: AwardRow): ContractHeader {
  return {
    Id: `contract-${a.AwardId}`, SolicitationId: a.SolicitationId, Title: a.Title ?? a.ContractNumber ?? a.SolicitationId, Agency: a.Agency ?? '',
    Status: 'Awarded', Stage: 'Awarded', AwardeeName: a.AwardeeName, AwardedAt: a.AwardedAt, Imported: true,
    PlanJson: JSON.stringify({ solicitationId: a.SolicitationId, title: a.Title, agency: a.Agency, office: a.Office, contractType: a.ContractType, framework: a.Framework ?? 'federal' }),
  }
}

export const isImportedHeader = (s: Solicitation) => !!(s as ContractHeader).Imported

/** Awarded in Source Selection: the decision is signed and the award record filed, so the Award phase can begin. */
export const isAwarded = (s: Solicitation) => s.Status === 'Awarded'

/** At the award decision in Source Selection: the next ones to reach this app. */
export const atAwardDecision = (s: Solicitation) => s.Status === 'In evaluation' && s.Stage === 'Award Decision'

const person = (id: Persona['id']) => PERSONAS.find((p) => p.id === id)!

/** Agency counsel: advises the CO on debriefings and defends a protest. Fictional, like every official in the demo. */
export const COUNSEL: Persona = {
  id: 'counsel', name: 'Claire Navarro', label: 'Agency Counsel', role: 'Advises on debriefings and defends protests', short: 'CN', taskLabel: 'agency-counsel',
}

/** The Contracting Officer's Representative: watches performance day to day, approves invoices, drafts evaluations. Fictional. */
export const COR_PERSONA: Persona = {
  id: 'cor', name: 'Owen Mercer', label: "Contracting Officer's Representative", role: 'Monitors performance, deliverables and invoices', short: 'OM', taskLabel: 'cor',
}

/** The Resource Manager: certifies funds and keeps each line item's obligations ahead of its spending. Fictional. */
export const RM_PERSONA: Persona = {
  id: 'rm', name: 'Nadia Sorensen', label: 'Resource Manager', role: 'Certifies funds and tracks obligations', short: 'NS', taskLabel: 'resource-manager',
}

/**
 * The app's people: the Contracting Officer does most of the work; counsel handles protests; the SSA reads; the COR and
 * the Resource Manager work the contract once it's signed.
 */
export const AWARD_PERSONAS: Persona[] = [person('co'), COR_PERSONA, RM_PERSONA, COUNSEL, person('ssa')]

/** Counsel's title in a district. The other officials take their framework titles from the shared terms (titled). */
export function counselTitled(p: Persona, fw: Framework): Persona {
  return p.id === 'counsel' && fw === 'sled' ? { ...p, label: 'District Counsel', role: 'Advises the district on protests' } : p
}
