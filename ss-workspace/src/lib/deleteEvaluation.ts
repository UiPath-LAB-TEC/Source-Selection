import type { UiPath } from '@uipath/uipath-typescript/core'
import { isSolicitationNumber } from '@forms/lib/terms'
import { Buckets } from '@uipath/uipath-typescript/buckets'
import { Entities } from '@uipath/uipath-typescript/entities'
import { ProcessInstances } from '@uipath/uipath-typescript/maestro-processes'
import type { ProcessInstanceGetResponse } from '@uipath/uipath-typescript/maestro-processes'
import { ENTITY, FOLDER, all } from './data'
import { AWARD_ENTITY, AWARD_PROCESS_FOLDER } from './apps'
import { PROPOSALS_BUCKET } from './intake'
import { PROCESS_PACKAGE, RUNNING } from './maestro'
import type { Solicitation } from './types'

/** Where the robots file the award record (SSDD, SSEB report, audit trail) under <solicitationId>/. */
const RECORDS_BUCKET = 'SS-Records'
/**
 * Children first and the solicitation row last, so a delete that stops part way never leaves rows without a parent. The
 * Award app's rows go too: the record is one record across both apps.
 */
const ENTITIES = [ENTITY.offerors, ENTITY.pages, ENTITY.findings, ENTITY.ratings, ENTITY.decisions, ENTITY.audit,
  AWARD_ENTITY.alerts, AWARD_ENTITY.modifications, AWARD_ENTITY.funding, AWARD_ENTITY.schedule, AWARD_ENTITY.correspondence, AWARD_ENTITY.protests, AWARD_ENTITY.awards,
  ENTITY.solicitations]

export interface DeleteSummary { runsCancelled: number; records: number; files: number }

/** Maestro runs of the process still going for this solicitation: its recorded run, and any other run started for its number. */
async function runningRuns(pi: ProcessInstances, sol: Solicitation): Promise<ProcessInstanceGetResponse[]> {
  const found: ProcessInstanceGetResponse[] = []
  let page = await pi.getAll({ packageId: PROCESS_PACKAGE, pageSize: 50 })
  found.push(...page.items)
  while (page.hasNextPage && page.nextCursor && found.length < 300) {
    page = await pi.getAll({ packageId: PROCESS_PACKAGE, pageSize: 50, cursor: page.nextCursor })
    found.push(...page.items)
  }
  const out: ProcessInstanceGetResponse[] = []
  for (const x of found.filter((i) => RUNNING.has(i.latestRunStatus))) {
    if (x.instanceId === sol.CaseInstanceId) { out.push(x); continue }
    const vars = await pi.getVariables(x.instanceId, x.folderKey).catch(() => undefined)
    if (vars?.globalVariables.some((v) => v.name === 'solicitationId' && String(v.value) === sol.SolicitationId)) out.push(x)
  }
  return out
}

/** The solicitation's Award-phase runs still going (each SSAward row records its run). */
async function runningAwardRuns(pi: ProcessInstances, entities: Entities, sol: Solicitation): Promise<ProcessInstanceGetResponse[]> {
  const rows = (await all<{ SolicitationId?: string; CaseInstanceId?: string }>(entities, AWARD_ENTITY.awards).catch(() => []))
    .filter((r) => r.SolicitationId === sol.SolicitationId && r.CaseInstanceId)
  const runs = await Promise.all(rows.map((r) => pi.getById(r.CaseInstanceId!, AWARD_PROCESS_FOLDER.folderKey).catch(() => undefined)))
  return runs.filter((r): r is ProcessInstanceGetResponse => !!r && RUNNING.has(r.latestRunStatus))
}

async function filesUnder(buckets: Buckets, bucket: string, solicitationId: string): Promise<string[]> {
  // The prefix must not end in "/" (Orchestrator rejects it as an invalid blob path), so list by the number and keep
  // only this solicitation's own folder: the prefix alone would also match a longer number.
  const paths: string[] = []
  let page = await buckets.getFileMetaData({ name: bucket }, { ...FOLDER, prefix: solicitationId, pageSize: 200 })
  paths.push(...(page.items ?? []).map((f) => f.path))
  while (page.hasNextPage && page.nextCursor) {
    page = await buckets.getFileMetaData({ name: bucket }, { ...FOLDER, prefix: solicitationId, pageSize: 200, cursor: page.nextCursor })
    paths.push(...(page.items ?? []).map((f) => f.path))
  }
  return paths.filter((p) => p.replace(/^\//, '').startsWith(`${solicitationId}/`))
}

/** Delete one stored file. Listings return paths without a leading "/", the SDK's examples use one: try both forms. */
async function removeFile(buckets: Buckets, bucket: string, path: string) {
  try {
    await buckets.deleteFile({ name: bucket }, path, FOLDER)
  } catch (first) {
    const other = path.startsWith('/') ? path.slice(1) : `/${path}`
    try { await buckets.deleteFile({ name: bucket }, other, FOLDER) } catch { throw first }
  }
}

/** Delete every file under `<solicitationId>/` in both buckets; returns how many went. */
async function deleteFolder(buckets: Buckets, solicitationId: string, onStep?: (step: string) => void) {
  let files = 0
  for (const bucket of [PROPOSALS_BUCKET, RECORDS_BUCKET]) {
    onStep?.(`Deleting files in ${bucket === PROPOSALS_BUCKET ? 'proposals' : 'award records'}`)
    for (const path of await filesUnder(buckets, bucket, solicitationId)) {
      await removeFile(buckets, bucket, path)
      files++
    }
  }
  return files
}

export interface LeftoverFolder { solicitationId: string; files: number }

/** A folder named like a solicitation number, federal or State & Local (the wizard's own check); anything else in the buckets is left alone. */
const SOLICITATION_FOLDER = { test: isSolicitationNumber }

/**
 * Solicitation folders in storage with no source selection behind them: files left after an evaluation's records were
 * removed some other way (or by a delete that stopped part way). Folders not named like a solicitation number, such as
 * the hosted sample package, are never listed.
 */
export async function leftoverFolders(sdk: UiPath, known: string[]): Promise<LeftoverFolder[]> {
  const buckets = new Buckets(sdk)
  const count = new Map<string, number>()
  for (const bucket of [PROPOSALS_BUCKET, RECORDS_BUCKET]) {
    let page = await buckets.getFileMetaData({ name: bucket }, { ...FOLDER, pageSize: 500 })
    const take = () => { for (const f of page.items ?? []) { const top = f.path.replace(/^\//, '').split('/')[0]; if (top && f.path.includes('/')) count.set(top, (count.get(top) ?? 0) + 1) } }
    take()
    while (page.hasNextPage && page.nextCursor) {
      page = await buckets.getFileMetaData({ name: bucket }, { ...FOLDER, pageSize: 500, cursor: page.nextCursor })
      take()
    }
  }
  const have = new Set(known)
  return [...count].filter(([id]) => SOLICITATION_FOLDER.test(id) && !have.has(id)).map(([solicitationId, files]) => ({ solicitationId, files })).sort((a, b) => a.solicitationId.localeCompare(b.solicitationId))
}

/** Delete the leftover files of a solicitation that no longer exists. */
export async function deleteLeftoverFiles(sdk: UiPath, solicitationId: string) {
  return deleteFolder(new Buckets(sdk), solicitationId)
}

/**
 * Remove a source selection completely so its number can be used again with the same documents: cancel any Maestro
 * run still going for it, delete its files in SS-Proposals and SS-Records, then its rows in every Source Selection
 * entity, the solicitation row last. Until that last row goes the evaluation still lists, so a delete that stops part
 * way can simply be run again. Action Center tasks can't be deleted from here; tasks left by a cancelled run stay in
 * Action Center but no longer show in the workspace (see stillOpen). This cannot be undone.
 */
export async function deleteEvaluation(sdk: UiPath, sol: Solicitation, onStep: (step: string) => void): Promise<DeleteSummary> {
  const id = sol.SolicitationId
  const pi = new ProcessInstances(sdk)

  const entities = new Entities(sdk)
  onStep('Stopping the Maestro run')
  const running = async () => [...await runningRuns(pi, sol), ...await runningAwardRuns(pi, entities, sol)]
  const runs = await running()
  for (const r of runs) await pi.cancel(r.instanceId, r.folderKey, { comment: `Evaluation ${id} deleted from the workspace` })
  // Let the cancels land before the rows go, so no robot step writes into a solicitation that is being removed.
  for (let i = 0; i < 15 && runs.length; i++) {
    const still = (await running()).length
    if (!still) break
    await new Promise((r) => setTimeout(r, 2000))
  }

  const files = await deleteFolder(new Buckets(sdk), id, onStep)

  let records = 0
  for (const name of ENTITIES) {
    onStep(`Deleting ${name.replace(/^SS/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} records`)
    const ids = (await all<{ Id: string; SolicitationId?: string }>(entities, name)).filter((r) => r.SolicitationId === id).map((r) => r.Id)
    for (let i = 0; i < ids.length; i += 100) await entities.deleteRecords({ name }, ids.slice(i, i + 100))
    records += ids.length
  }

  return { runsCancelled: runs.length, records, files }
}
