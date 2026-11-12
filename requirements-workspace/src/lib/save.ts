/** Writing the record: the requirement row, its package documents, and an audit row for every change. */
import { Entities } from '@uipath/uipath-typescript/entities'
import type { UiPath } from '@uipath/uipath-typescript/core'
import { ENTITY } from '@ss/lib/data'
import { REQUIREMENT_ENTITY } from '@ss/lib/apps'
import type { AuditRow, Dataset, DocRow, RequirementRow } from './types'

/** The federal fiscal year (Oct 1 to Sep 30) as two digits: Nov 2026 is FY27. */
export const fiscalYear = (d = new Date()) => String((d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear()) % 100).padStart(2, '0')

/** The next requirement number in the fiscal year: RQ-27-0001, RQ-27-0002… */
export function nextRequirementId(rows: RequirementRow[]) {
  const fy = fiscalYear()
  const seq = rows.map((r) => /^RQ-(\d\d)-(\d{4})$/.exec(r.RequirementId)).filter((m) => m && m[1] === fy).map((m) => Number(m![2]))
  return `RQ-${fy}-${String((seq.length ? Math.max(...seq) : 0) + 1).padStart(4, '0')}`
}

export interface Writer { sdk: UiPath; preview: boolean; patch: (fn: (d: Dataset) => Dataset) => void }

/** One audit row: who did what. The actor is a person's name, or an agent's process name (shown as "… (agent)"). */
export interface Event { action: string; actor: string; detail?: string; ref?: string }

const strip = <T extends { Id?: string }>(row: T) => { const { Id: _id, ...rest } = row; void _id; return rest }

function auditRows(requirementId: string, ref: string, events: Event[]): AuditRow[] {
  const now = Date.now()
  return events.map((x, i) => ({
    EventId: `${requirementId}-${x.action}-${now + i}`, SolicitationId: requirementId, EntityRef: x.ref ?? ref, Action: x.action, Actor: x.actor,
    OccurredAt: new Date(now + i).toISOString(), Detail: (x.detail ?? '').slice(0, 2000),
  }))
}

/** Insert a row, or update it when it has an Id. The preview only pretends. */
export async function upsert<T extends { Id?: string }>(w: Writer, entity: string, row: T): Promise<T> {
  if (w.preview) return { ...row, Id: row.Id ?? `preview-${Math.random().toString(36).slice(2)}` }
  const e = new Entities(w.sdk)
  if (row.Id) { await e.updateRecord({ name: entity }, row.Id, strip(row)); return row }
  const res = await e.insertRecord({ name: entity }, strip(row)) as unknown as { Id?: string; id?: string }
  return { ...row, Id: res?.Id ?? res?.id }
}

async function log(w: Writer, rows: AuditRow[]) {
  if (!w.preview && rows.length) await new Entities(w.sdk).insertRecords({ name: ENTITY.audit }, rows)
}

/**
 * Insert or update the requirement, with its audit rows. The in-memory dataset is patched as well, so the pages show
 * the change without a full reload. Returns the row as stored (with its Id).
 */
export async function saveRequirement(w: Writer, row: RequirementRow, events: Event[]): Promise<RequirementRow> {
  const now = new Date().toISOString()
  const stored = await upsert(w, REQUIREMENT_ENTITY.requirements, { ...row, UpdatedAt: now, CreatedAt: row.CreatedAt || now })
  const audit = auditRows(row.RequirementId, row.RequirementId, events)
  await log(w, audit)
  w.patch((d) => ({ ...d, requirements: [...d.requirements.filter((r) => r.RequirementId !== row.RequirementId), stored], audit: [...d.audit, ...audit] }))
  return stored
}

/** Insert or update one package document, with audit rows naming who drafted or edited it. */
export async function saveDoc(w: Writer, doc: DocRow, events: Event[]): Promise<DocRow> {
  const stored = await upsert(w, REQUIREMENT_ENTITY.docs, { ...doc, UpdatedAt: new Date().toISOString() })
  const audit = auditRows(doc.RequirementId, doc.DocId, events)
  await log(w, audit)
  w.patch((d) => ({ ...d, docs: [...d.docs.filter((x) => x.DocId !== doc.DocId), stored], audit: [...d.audit, ...audit] }))
  return stored
}

export function blankRequirement(ownerPersona: string, framework: string): RequirementRow {
  return {
    RequirementId: '', Title: '', Kind: '', Framework: framework, Status: 'Draft', Stage: 'Need', Agency: 'Department of the Air Force',
    Office: '', ContractingOffice: '', Need: '', NeedBy: '', Budget: null, EstimatedValue: null, Psc: '', Naics: '',
    RequirementJson: '', AnalysisJson: '', StrategyJson: '', SolicitationId: '', OwnerPersona: ownerPersona, CreatedAt: '', UpdatedAt: '',
  }
}
