import { toast } from 'sonner'
import type { UiPath } from '@uipath/uipath-typescript/core'
import { Buckets } from '@uipath/uipath-typescript/buckets'
import { Entities } from '@uipath/uipath-typescript/entities'
import { Tasks, TaskType } from '@uipath/uipath-typescript/tasks'
import { ENTITY, PROPOSALS, keepLocalDraft, proposalPath, withLocalDraft } from '@forms/lib/backend'
import type { Backend, EntityKey, LoadedTask, Status, TaskData } from '@forms/lib/backend'
import type { Dataset } from '@forms/lib/types'

type Row = Record<string, unknown>

/** Task data can arrive as an object or as a JSON string. */
function taskData(raw: unknown): TaskData {
  if (typeof raw === 'string') { try { return JSON.parse(raw) as TaskData } catch { return {} as TaskData } }
  return (raw ?? {}) as TaskData
}

/**
 * The ss-task-forms Backend, served from the workspace instead of Action Center: the task comes from the Tasks API
 * and completing it calls Tasks.complete with the same outcome the form would send Action Center. Data Fabric reads
 * and writes match ActionCenterBackend, so a form behaves identically in both hosts.
 */
export class WorkspaceBackend implements Backend {
  mode = 'action-center' as const
  private cache = new Map<EntityKey, Row[]>()
  private sdk: UiPath
  private taskId: number
  private folderId: number
  private actor: string
  private onCompleted: (outcome: string) => void
  /** What the loading screen calls the record ("evaluation record"; Contract Management's "award record"). */
  private record: string

  constructor(sdk: UiPath, taskId: number, folderId: number, actor: string, onCompleted: (outcome: string) => void, record = 'evaluation record') {
    this.sdk = sdk
    this.taskId = taskId
    this.folderId = folderId
    this.actor = actor
    this.onCompleted = onCompleted
    this.record = record
  }

  async getTask(status?: Status): Promise<LoadedTask> {
    status?.('Opening the task…')
    const t = await new Tasks(this.sdk).getById(this.taskId, { taskType: TaskType.App }, this.folderId)
    return {
      data: withLocalDraft(taskData(t.data)),
      isReadOnly: t.isCompleted || t.status === 'Completed',
      dark: document.documentElement.classList.contains('dark'),
      actor: this.actor,
    }
  }

  setTaskData() {}

  /**
   * Save work in progress onto the task itself. saveData replaces the whole payload, so it is merged into the task's
   * current data rather than the form's narrower view of it; a browser copy backs it up.
   */
  async saveDraft(d: TaskData) {
    keepLocalDraft(d)
    const tasks = new Tasks(this.sdk)
    const current = taskData((await tasks.getById(this.taskId, { taskType: TaskType.App }, this.folderId)).data) as unknown as Record<string, unknown>
    await tasks.saveData(this.taskId, { ...current, draft: d.draft }, { type: TaskType.App, folderId: this.folderId })
  }

  async documentUrl(solicitationId: string, offerorCode: string, volume: string) {
    const r = await new Buckets(this.sdk).getReadUri({ name: PROPOSALS.bucket }, proposalPath(solicitationId, offerorCode, volume),
      { folderKey: PROPOSALS.folderKey, expiryInMinutes: 30 })
    return r.uri
  }

  async complete(outcome: string, d: TaskData) {
    const res = await new Tasks(this.sdk).complete({ type: TaskType.App, taskId: this.taskId, data: d, action: outcome }, this.folderId)
    if (!res.success) throw new Error(`Action Center did not accept the ${outcome} outcome.`)
    this.onCompleted(outcome)
  }

  private async all(k: EntityKey): Promise<Row[]> {
    const e = new Entities(this.sdk)
    const out: Row[] = []
    let page = await e.getRecordsByName(ENTITY[k], { pageSize: 500 })
    out.push(...((page.items ?? []) as Row[]))
    while (page.hasNextPage && page.nextCursor) {
      page = await e.getRecordsByName(ENTITY[k], { pageSize: 500, cursor: page.nextCursor })
      out.push(...((page.items ?? []) as Row[]))
    }
    this.cache.set(k, out)
    return out
  }

  async load(id: string, status?: Status): Promise<Dataset> {
    status?.(`Loading the ${this.record}…`)
    const keys = Object.keys(ENTITY) as EntityKey[]
    const all = await Promise.all(keys.map((k) => this.all(k)))
    return Object.fromEntries(keys.map((k, i) => [k, all[i].filter((r) => r.SolicitationId === id)])) as unknown as Dataset
  }

  async upsert(k: EntityKey, key: string, rows: Row[]) {
    if (!rows.length) return
    const existing = this.cache.get(k) ?? await this.all(k)
    const idOf = new Map(existing.map((r) => [r[key], r.Id as string]))
    const inserts = rows.filter((r) => !idOf.has(r[key]))
    const updates = rows.filter((r) => idOf.has(r[key])).map((r) => ({ ...r, Id: idOf.get(r[key])! }))
    const e = new Entities(this.sdk)
    const ref = { name: ENTITY[k] }
    if (inserts.length) {
      const res = await e.insertRecords(ref, inserts)
      if (res.failureRecords?.length) throw new Error(`${ENTITY[k]}: ${res.failureRecords.length} rows failed to save`)
    }
    if (updates.length) {
      const res = await e.updateRecords(ref, updates as never)
      if (res.failureRecords?.length) throw new Error(`${ENTITY[k]}: ${res.failureRecords.length} rows failed to update`)
    }
    await this.all(k)
  }

  notify(msg: string, kind: 'success' | 'error' | 'info' = 'info') {
    if (kind === 'error') toast.error(msg)
    else if (kind === 'success') toast.success(msg)
    else toast(msg)
  }
}
