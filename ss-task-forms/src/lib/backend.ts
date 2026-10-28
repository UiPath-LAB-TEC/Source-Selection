/**
 * Everything the forms need from the platform, behind one interface:
 *  - ActionCenterBackend: the real task (codedActionAppService) + Data Fabric (Entities)
 *  - PreviewBackend: local dev harness over a Data Fabric snapshot; writes stay in memory
 */
import { CodedActionAppService, Theme } from '@uipath/coded-action-app'
import type { Task } from '@uipath/coded-action-app'
import { UiPath } from '@uipath/uipath-typescript/core'
import { Buckets } from '@uipath/uipath-typescript/buckets'
import { Entities } from '@uipath/uipath-typescript/entities'
import type { Dataset } from './types'

export const ENTITY = {
  solicitations: 'SSSolicitation', offerors: 'SSOfferor', pages: 'SSProposalPage', findings: 'SSFinding',
  ratings: 'SSRating', decisions: 'SSDecision', audit: 'SSAuditEvent',
  // The Award app's own rows (the award phase, then the contract's administration): its forms read and write them,
  // Source Selection's forms ignore them.
  awards: 'SSAward', correspondence: 'SSCorrespondence', protests: 'SSProtest', schedule: 'SSSchedule', alerts: 'SSAlert',
  funding: 'SSFunding', modifications: 'SSModification',
} as const

/**
 * A contract awarded outside Source Selection has no SSSolicitation row, so the record it loads gets a header built from
 * its SSAward row (Origin Imported): its own title, agency and terms, in the shape the forms read a solicitation in.
 */
export function withContractHeader(d: Dataset): Dataset {
  if (d.solicitations.length) return d
  const a = (d.awards ?? []).find((x) => x.Origin === 'Imported') as Record<string, string | undefined> | undefined
  if (!a) return d
  const plan = { solicitationId: a.SolicitationId, title: a.Title, agency: a.Agency, office: a.Office, contractType: a.ContractType, framework: a.Framework ?? 'federal' }
  return { ...d, solicitations: [{ Id: `contract-${a.AwardId}`, SolicitationId: a.SolicitationId!, Title: a.Title ?? a.SolicitationId!, Agency: a.Agency ?? '',
    Status: 'Awarded', Stage: 'Awarded', AwardeeName: a.AwardeeName, AwardedAt: a.AwardedAt, PlanJson: JSON.stringify(plan) } as unknown as Dataset['solicitations'][number]] }
}
export type EntityKey = keyof typeof ENTITY

/** Union of the action schema's inputs and outputs. */
export interface TaskData {
  actionType: string
  solicitationId: string
  evaluatorSlot?: number
  complianceSummary?: string
  consensusDraft?: string
  priceAnalysis?: string
  ssddDraft?: string
  recommendedAwardee?: string
  chairQuestions?: string
  /** Generic outputs (action-schema.json): decision, notes, payload, awardee. */
  decision?: string
  notes?: string
  payload?: string
  awardee?: string
  /** Work in progress the person saved without submitting (JSON, shape owned by the form). */
  draft?: string
  /** Contract Management: the schedule row a task is about (a deliverable to review, an option or extension to decide) and
   *  what the robot prepared for it: the deliverable review, or the option package. */
  scheduleId?: string
  reviewDraft?: string
  packageDraft?: string
}

export interface LoadedTask { data: TaskData; isReadOnly: boolean; dark: boolean; actor: string }

/** Progress text for the loading screen. */
export type Status = (msg: string) => void

export interface Backend {
  mode: 'action-center' | 'preview'
  getTask(status?: Status): Promise<LoadedTask>
  setTaskData(d: TaskData): void
  /** Keep work in progress without completing the task; the form reads it back from task data when reopened. */
  saveDraft(d: TaskData): Promise<void>
  /** A short-lived link to an offeror's original proposal volume (PDF), when the host can reach the proposals bucket. */
  documentUrl?(solicitationId: string, offerorCode: string, volume: string): Promise<string>
  /** A short-lived link to a file filed with the record in SS-Records, such as a contractor's deliverable. */
  recordUrl?(path: string): Promise<string>
  complete(outcome: string, d: TaskData): Promise<void>
  load(solicitationId: string, status?: Status): Promise<Dataset>
  /** Insert rows whose key is new, update rows whose key exists. */
  upsert(entity: EntityKey, key: string, rows: Record<string, unknown>[]): Promise<void>
  notify(msg: string, kind?: 'success' | 'error' | 'info'): void
}

type Row = Record<string, unknown>

// ------------------------------------------------- Action Center handshake

/*
 * Action Center answers the app's AC.init with AC.loadApp (the task). CodedActionAppService.getTask() sends
 * AC.init once and stops listening after 3 s, so a host that is not ready by then is never asked again and the
 * form can only fail. Listen for AC.loadApp from module load (before React renders), and re-send AC.init until
 * the task arrives. (The blank first opens in the 2026-10-12 run came from the SDK construction below.)
 */
const AC_LOADAPP = 'AC.loadApp'
const CONNECT_TIMEOUT_MS = 30_000
const basedomain = new URLSearchParams(location.search).get('basedomain')
const hostOrigins = new Set([basedomain, (() => { try { return basedomain ? new URL(basedomain).origin : null } catch { return null } })()].filter(Boolean))
let delivered: Task | undefined
const arrivals = new Set<(t: Task) => void>()

if (basedomain && window.parent !== window) {
  window.addEventListener('message', (e: MessageEvent) => {
    if (!hostOrigins.has(e.origin) || e.data?.eventType !== AC_LOADAPP || !e.data?.content) return
    delivered = e.data.content as Task
    for (const done of [...arrivals]) done(delivered)
  })
}

/** The next AC.loadApp (or one already received), or undefined after `ms`. */
function loadApp(ms: number) {
  return new Promise<Task | undefined>((resolve) => {
    if (delivered) return resolve(delivered)
    const done = (t?: Task) => { clearTimeout(timer); arrivals.delete(done); resolve(t) }
    const timer = setTimeout(() => done(undefined), ms)
    arrivals.add(done)
  })
}

/** Task data can arrive as an object or, from some hosts, as a JSON string. */
/**
 * Where proposals live: SS-Proposals/<solicitationId>/<offeror code>/<volume>.pdf in the SourceSelection folder, referenced
 * by key so it keeps working when the folder is moved or renamed.
 */
export const PROPOSALS = { bucket: 'SS-Proposals', folderKey: '08605f4c-2b90-4971-81b7-2f4310a2b81a' }
export const RECORDS = { bucket: 'SS-Records', folderKey: PROPOSALS.folderKey }
export const proposalPath = (solicitationId: string, offerorCode: string, volume: string) => `${solicitationId}/${offerorCode}/${volume}.pdf`

/** A browser copy of each draft, so work survives even where the host can't store it on the task. */
export const draftKey = (d: TaskData) => `ss.draft.${d.actionType}.${d.solicitationId}.${d.evaluatorSlot ?? 0}`
export function keepLocalDraft(d: TaskData) {
  try { if (d.draft) localStorage.setItem(draftKey(d), d.draft) } catch { /* storage unavailable */ }
}
/** The saved draft: the task's own copy, else this browser's. */
export function withLocalDraft(d: TaskData): TaskData {
  if (d.draft) return d
  try { const local = localStorage.getItem(draftKey(d)); return local ? { ...d, draft: local } : d } catch { return d }
}

function taskData(raw: unknown): TaskData {
  if (typeof raw === 'string') { try { return JSON.parse(raw) as TaskData } catch { return {} as TaskData } }
  return (raw ?? {}) as TaskData
}

const log = (msg: string, ...rest: unknown[]) => console.info(`[ss-task-forms] ${msg}`, ...rest)

/** Ask Action Center for the task until it answers. Exported for the dev host simulator. */
export async function connectToActionCenter(svc: CodedActionAppService, status?: Status): Promise<Task> {
  if (!basedomain || window.parent === window) throw new Error('This form opens inside Action Center: the page has no Action Center host (basedomain).')
  const started = performance.now()
  for (let attempt = 1; ; attempt++) {
    // Each getTask() re-sends AC.init; its own 3 s rejection just means the host was not ready yet. Every
    // attempt waits its full window for AC.loadApp, so a fast rejection never turns this into a busy loop.
    const ask = svc.getTask().catch((e: Error) => { log(`AC.init attempt ${attempt} unanswered: ${e.message}`); return undefined })
    const t = (await Promise.race([ask.then((x) => x ?? loadApp(3_500)), loadApp(3_500)])) ?? delivered
    const elapsed = Math.round(performance.now() - started)
    // A task without its inputs is treated as not ready; after three tries it is shown as it is.
    if (t && (taskData(t.data).actionType || attempt >= 3)) {
      log(`task ${t.taskId} received after ${elapsed} ms (attempt ${attempt})`)
      return t
    }
    if (t) { log(`task ${t.taskId} arrived without data; asking again`); delivered = undefined }
    if (elapsed > CONNECT_TIMEOUT_MS) throw new Error(`Action Center did not send the task within ${Math.round(elapsed / 1000)} s (${attempt} attempts).`)
    status?.(`Waiting for Action Center to send the task… (attempt ${attempt + 1})`)
  }
}

/** Retry transient failures (e.g. the first token handshake) with a short backoff. */
async function withRetry<T>(what: string, fn: () => Promise<T>, status?: Status, tries = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await fn() } catch (e) {
      if (attempt >= tries) throw e
      log(`${what} failed (attempt ${attempt}): ${(e as Error).message}`)
      status?.(`${what} — retrying (attempt ${attempt + 1} of ${tries})…`)
      await new Promise((r) => setTimeout(r, 1_500 * attempt))
    }
  }
}

export function toLoaded(t: Task): LoadedTask {
  const dark = t.theme === Theme.Dark || t.theme === Theme.DarkHighContrast
  return { data: taskData(t.data), isReadOnly: !!t.isReadOnly, dark, actor: 'Action Center user' }
}

// ------------------------------------------------------------ Action Center

class ActionCenterBackend implements Backend {
  mode = 'action-center' as const
  private svc = new CodedActionAppService()
  private sdk?: Entities
  private cache = new Map<EntityKey, Row[]>()

  /**
   * The SDK is built on first Data Fabric use, never at startup. Its configuration comes from the
   * <meta name="uipath:…"> tags the platform injects into the served page; `new Entities(new UiPath())`
   * throws while they are missing, and when that happened during React's first render (1.0.1 built it as
   * a field initializer) the root unmounted and the task frame stayed blank, before AC.init was even sent.
   * Never sdk.initialize() in an action app — Action Center supplies the session over postMessage.
   */
  private async entities(status?: Status): Promise<Entities> {
    for (let attempt = 1; !this.sdk; attempt++) {
      try { this.sdk = new Entities(new UiPath()) } catch (e) {
        if (attempt >= 8) throw new Error(`The Data Fabric connection is not configured on this page. ${(e as Error).message}`)
        if (attempt === 1) { log(`SDK configuration not on the page yet: ${(e as Error).message}`); status?.('Waiting for the platform configuration…') }
        await new Promise((r) => setTimeout(r, 500))
      }
    }
    return this.sdk
  }

  async getTask(status?: Status): Promise<LoadedTask> {
    const t = toLoaded(await connectToActionCenter(this.svc, status))
    return { ...t, data: withLocalDraft(t.data) }
  }

  setTaskData(d: TaskData) { this.svc.setTaskData(d) }

  // The form app's scopes don't include updating tasks, so Action Center keeps the draft in its copy of the task data,
  // backed by a browser copy.
  async saveDraft(d: TaskData) {
    this.svc.setTaskData(d)
    keepLocalDraft(d)
  }

  /** A short-lived link to a file the robots filed with the record (SS-Records), such as a contractor's deliverable. */
  async recordUrl(path: string) {
    const r = await new Buckets(new UiPath()).getReadUri({ name: RECORDS.bucket }, path.replace(/^SS-Records\//, ''), { folderKey: RECORDS.folderKey, expiryInMinutes: 30 })
    return r.uri
  }

  async documentUrl(solicitationId: string, offerorCode: string, volume: string) {
    const r = await new Buckets(new UiPath()).getReadUri({ name: PROPOSALS.bucket }, proposalPath(solicitationId, offerorCode, volume),
      { folderKey: PROPOSALS.folderKey, expiryInMinutes: 30 })
    return r.uri
  }

  async complete(outcome: string, d: TaskData) { await this.svc.completeTask(outcome, d) }

  private async all(k: EntityKey): Promise<Row[]> {
    const entities = await this.entities()
    const out: Row[] = []
    let page = await entities.getRecordsByName(ENTITY[k], { pageSize: 500 })
    out.push(...((page.items ?? []) as Row[]))
    while (page.hasNextPage && page.nextCursor) {
      page = await entities.getRecordsByName(ENTITY[k], { pageSize: 500, cursor: page.nextCursor })
      out.push(...((page.items ?? []) as Row[]))
    }
    this.cache.set(k, out)
    return out
  }

  async load(id: string, status?: Status): Promise<Dataset> {
    const keys = Object.keys(ENTITY) as EntityKey[]
    const started = performance.now()
    await withRetry('Connecting to Data Fabric', () => this.entities(status), status)
    const all = await withRetry('Loading from Data Fabric', () => Promise.all(keys.map((k) => this.all(k))), status)
    log(`Data Fabric loaded in ${Math.round(performance.now() - started)} ms`)
    return withContractHeader(Object.fromEntries(keys.map((k, i) => [k, all[i].filter((r) => r.SolicitationId === id)])) as unknown as Dataset)
  }

  async upsert(k: EntityKey, key: string, rows: Row[]) {
    if (!rows.length) return
    const existing = this.cache.get(k) ?? await this.all(k)
    const idOf = new Map(existing.map((r) => [r[key], r.Id as string]))
    const inserts = rows.filter((r) => !idOf.has(r[key]))
    const updates = rows.filter((r) => idOf.has(r[key])).map((r) => ({ ...r, Id: idOf.get(r[key])! }))
    const ref = { name: ENTITY[k] }
    const entities = await this.entities()
    if (inserts.length) {
      const res = await entities.insertRecords(ref, inserts)
      if (res.failureRecords?.length) throw new Error(`${ENTITY[k]}: ${res.failureRecords.length} rows failed to save`)
    }
    if (updates.length) {
      const res = await entities.updateRecords(ref, updates as never)
      if (res.failureRecords?.length) throw new Error(`${ENTITY[k]}: ${res.failureRecords.length} rows failed to update`)
    }
    await this.all(k)
  }

  notify(msg: string, kind: 'success' | 'error' | 'info' = 'info') {
    // MessageSeverity values mirror these names.
    this.svc.showMessage(msg, (kind === 'success' ? 'Success' : kind === 'error' ? 'Error' : 'Info') as never)
  }
}

// ------------------------------------------------------------------ Preview

export interface PreviewOptions { actionType: string; solicitationId: string; slot: number; fresh: boolean; method?: string; absence?: boolean }

class PreviewBackend implements Backend {
  mode = 'preview' as const
  private data: Record<EntityKey, Row[]>
  private task: TaskData
  log: { at: string; what: string }[] = []
  onChange?: () => void

  /** Dev host simulator: take the task from a parent frame over the real Action Center handshake. */
  handshake?: CodedActionAppService

  constructor(snapshot: Record<EntityKey, Row[]>, o: PreviewOptions) {
    this.data = structuredClone(snapshot)
    if (o.absence) {
      // Preview an absence finding: one agent weakness whose quote is not on its cited page (as in the live run).
      const f = this.data.findings.find((x) => x.SolicitationId === o.solicitationId && x.Origin === 'Agent' && x.Kind === 'Weakness')
      if (f) f.CitationQuote = 'disaster recovery and continuity of operations plan'
    }
    if (o.method) {
      // Preview the plan in another rating display method.
      this.data.solicitations = this.data.solicitations.map((s) => ({ ...s, PlanJson: JSON.stringify({ ...JSON.parse(s.PlanJson as string), ratingMethod: o.method }) }))
    }
    if (o.fresh) {
      // A clean start for this form: drop what that persona already recorded.
      if (o.actionType === 'individualEvaluation') {
        this.data.findings = this.data.findings.filter((f) => !(f.Origin === 'Evaluator' && f.EvaluatorSlot === o.slot))
        this.data.ratings = this.data.ratings.filter((r) => !(r.Level === 'Individual' && r.EvaluatorSlot === o.slot))
        this.data.ratings = this.data.ratings.filter((r) => r.Level !== 'Consensus')
      }
      if (o.actionType === 'consensus') this.data.ratings = this.data.ratings.filter((r) => r.Level !== 'Consensus')
    }
    this.task = { actionType: o.actionType, solicitationId: o.solicitationId, evaluatorSlot: o.slot, ...sampleInputs(o, this.data) }
  }

  async getTask(status?: Status): Promise<LoadedTask> {
    if (this.handshake) return { ...toLoaded(await connectToActionCenter(this.handshake, status)), actor: 'anagh.bhave@uipath.com' }
    return { data: this.task, isReadOnly: false, dark: document.documentElement.classList.contains('dark'), actor: 'anagh.bhave@uipath.com' }
  }

  setTaskData(d: TaskData) { this.task = d }

  async saveDraft(d: TaskData) {
    this.task = d
    keepLocalDraft(d)
    this.record('Draft saved')
  }

  async complete(outcome: string, d: TaskData) {
    this.task = d
    this.record(`Task completed with outcome "${outcome}"`)
    console.info('[preview] completeTask', outcome, d)
  }

  async load(id: string): Promise<Dataset> {
    // A snapshot from before the Award entities has no rows for them.
    return withContractHeader(Object.fromEntries((Object.keys(ENTITY) as EntityKey[]).map((k) => [k, (this.data[k] ?? []).filter((r) => r.SolicitationId === id)])) as unknown as Dataset)
  }

  async upsert(k: EntityKey, key: string, rows: Row[]) {
    this.data[k] ??= []
    for (const r of rows) {
      const i = this.data[k].findIndex((x) => x[key] === r[key])
      if (i >= 0) this.data[k][i] = { ...this.data[k][i], ...r }
      else this.data[k].push({ Id: crypto.randomUUID(), ...r })
    }
    this.record(`Saved ${rows.length} ${ENTITY[k]} row${rows.length > 1 ? 's' : ''}`)
  }

  notify(msg: string) { this.record(msg) }

  private record(what: string) {
    this.log.unshift({ at: new Date().toLocaleTimeString(), what })
    this.onChange?.()
  }
}

/**
 * Stand-in for SS_ConsensusAnalyst output, PascalCased as the case delivers it: the median individual rating
 * (rounded toward the better one), with the last cell left without a proposal so the fallback shows too.
 */
function sampleProposals(o: PreviewOptions, d: Record<EntityKey, Row[]>, plan: { factors: { id: string; scale?: string; evaluatedNotRated?: boolean }[]; scales: Record<string, string[]> } | null) {
  if (!plan) return []
  const ratings = d.ratings.filter((r) => r.SolicitationId === o.solicitationId && r.Level === 'Individual')
  const offerors = d.offerors.filter((x) => x.SolicitationId === o.solicitationId).sort((a, b) => String(a.Name).localeCompare(String(b.Name)))
  const out: Record<string, unknown>[] = []
  for (const x of offerors) for (const f of plan.factors.filter((f) => !f.evaluatedNotRated)) {
    const scale = plan.scales[f.scale ?? 'technical']
    const mine = ratings.filter((r) => r.OfferorId === x.OfferorId && r.FactorId === f.id).sort((a, b) => scale.indexOf(a.Rating as string) - scale.indexOf(b.Rating as string))
    if (!mine.length) continue
    const proposed = mine[Math.floor((mine.length - 1) / 2)].Rating as string
    const spread = scale.indexOf(mine[mine.length - 1].Rating as string) - scale.indexOf(mine[0].Rating as string)
    const kinds = [...new Set(d.findings.filter((y) => y.OfferorId === x.OfferorId && y.FactorId === f.id && y.Origin === 'Evaluator' && y.Status !== 'Rejected').map((y) => String(y.Kind).toLowerCase()))]
    out.push({
      OfferorId: x.OfferorId, FactorId: f.id, Spread: spread, ProposedRating: proposed,
      Rationale: `${mine.length} evaluator${mine.length > 1 ? 's' : ''} rated ${mine.map((r) => r.Rating).join(', ')}. ${kinds.length ? `The accepted ${kinds.join(', ')} findings` : 'The record'} best support ${proposed}.`,
      SupportingFindingIds: [], ChairQuestions: spread >= 1 ? `${x.Name} — ${f.id}: evaluators were ${spread} step${spread > 1 ? 's' : ''} apart; confirm the lower rating reflects a documented weakness.` : 'None',
    })
  }
  return out.slice(0, -1)
}

/** What the case would pass in for each form, derived from the snapshot. */
export function sampleInputs(o: PreviewOptions, d: Record<EntityKey, Row[]>): Partial<TaskData> {
  const offerors = d.offerors.filter((x) => x.SolicitationId === o.solicitationId)
  const sol = d.solicitations.find((s) => s.SolicitationId === o.solicitationId)
  const plan = sol ? JSON.parse(sol.PlanJson as string) : null
  switch (o.actionType) {
    case 'certifyFunds':
    case 'optionDecision': {
      // Contract Management: the contract's option or extension with a package prepared (the incumbent's extension in the demo).
      const row = (d.schedule ?? []).find((r) => r.SolicitationId === o.solicitationId && (r.Kind === 'Extension' || r.Kind === 'Option')
        && String(r.ReviewJson ?? '').includes('"checks"'))
      return { scheduleId: (row?.ScheduleId as string) ?? '', packageDraft: (row?.ReviewJson as string) ?? '' }
    }
    case 'reviewDeliverable': {
      // Contract Management: the contract's first deliverable on file (received, with the reviewer's check if it ran).
      const row = (d.schedule ?? []).find((r) => r.SolicitationId === o.solicitationId && r.Kind === 'Deliverable' && !!r.FilePath)
      return { scheduleId: (row?.ScheduleId as string) ?? '', reviewDraft: (row?.ReviewJson as string) ?? '' }
    }
    case 'releaseToEvaluation':
      return { complianceSummary: JSON.stringify(offerors.map((x) => ({ offerorId: x.OfferorId, name: x.Name, status: x.ComplianceStatus, notes: x.ComplianceNotes }))) }
    case 'consensus':
      return { consensusDraft: JSON.stringify(sampleProposals(o, d, plan)), chairQuestions: '' }
    case 'priceDetermination': {
      const igce = plan?.igce?.total ?? 0
      return {
        priceAnalysis: JSON.stringify(offerors.map((x) => {
          const lines = JSON.parse((x.PriceLinesJson as string) || '[]') as { clin: string; amount: number }[]
          const total = lines.reduce((a, l) => a + l.amount, 0)
          const unbalanced = lines.filter((l) => plan && Math.abs(l.amount - plan.igce.lines[l.clin]) / plan.igce.lines[l.clin] > 0.25).map((l) => l.clin)
          return { offerorId: x.OfferorId, name: x.Name, total, igceVariancePct: igce ? ((total - igce) / igce) * 100 : 0, unbalanced }
        })),
      }
    }
    case 'awardDecision': {
      const first = offerors[0]?.Name as string | undefined
      return {
        recommendedAwardee: first ?? '',
        ssddDraft: `SOURCE SELECTION DECISION DOCUMENT\n\n${plan?.title ?? ''} — ${o.solicitationId}\n\n1. Basis for award. ${plan?.basisForAward ?? ''}. ${plan?.relativeImportance ?? ''}\n\n2. Comparative assessment. ${first ?? 'The leading offeror'} received the highest consensus ratings on Technical Approach, supported by a significant strength for its automated migration factory (Volume I, p. 1) and a strength for continuous ATO evidence feeding eMASS (Volume I, p. 2). Its price is about 4.6% above the IGCE.\n\n3. Tradeoff. The technical discriminators reduce migration schedule risk across 140 applications and, given that non-price factors are significantly more important than price, are worth the price premium.\n\n4. Decision. [The Source Selection Authority's independent decision and signature.]`,
      }
    }
    case 'clarification':
      return { chairQuestions: 'You rated Apex Mission Systems Technical Approach Good while Marcus Reyes and Tom Okafor rated it Outstanding. Please confirm whether the continuous ATO strength (Volume I, p. 2) was considered.' }
    default:
      return {}
  }
}

export function inActionCenter() {
  return window.parent !== window
}

export function createBackend(snapshot: Record<EntityKey, Row[]> | null, preview: PreviewOptions | null): Backend {
  if (preview && snapshot) return new PreviewBackend(snapshot, preview)
  return new ActionCenterBackend()
}

export type { PreviewBackend }
