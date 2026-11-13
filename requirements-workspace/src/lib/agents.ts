/**
 * The Requirements agents, started as Orchestrator jobs in the Requirements solution's folder, as Source Selection's
 * intake agents are. The UI names every one of them "UiPath Agent".
 */
import type { UiPath } from '@uipath/uipath-typescript/core'
import { Jobs } from '@uipath/uipath-typescript/jobs'
import { Processes } from '@uipath/uipath-typescript/processes'
import { camel } from '@ss/lib/intake'
import { unitOf } from './units'
import type { Analysis, DocKind, Flag, Kind, Question, RequirementRow, Section, Spec } from './types'
import { emptySpec } from './types'
import { mockAnalysis, mockDraft } from './mock'

/** The Requirements solution's deployment folder (AMER Presales/Public Sector/Procurement/Requirements), by key. */
export const REQUIREMENTS_FOLDER = { folderKey: '7d0d7fb8-708b-4019-b848-7956ad3c67a9' }
export const ANALYST_AGENT = 'RQ_RequirementsAnalyst'
export const DRAFTER_AGENT = 'RQ_Drafter'
/** Writes up the structured requirement each round, beside the analyst (from solution 1.0.4). */
export const SPEC_AGENT = 'RQ_SpecWriter'
export const AGENT_LABEL = 'UiPath Agent'

/**
 * A run whose answer came back in the wrong shape: the runtime's output check failed, or the app couldn't read the
 * answer. The next run usually comes back right, so runAgent tries once more.
 */
class ShapeError extends Error {}
const SHAPE_FAULT = /did not match the expected schema|does not satisfy the configured output schema/i

async function runAgent<T>(sdk: UiPath, agent: string, what: string, inputs: Record<string, string>, onState: (s: string) => void, read: (raw: unknown) => T = (raw) => raw as T): Promise<T> {
  try {
    return read(await runAgentOnce(sdk, agent, what, inputs, onState))
  } catch (e) {
    if (!(e instanceof ShapeError) && !SHAPE_FAULT.test((e as Error).message)) throw e
    onState('Retrying')
    return read(await runAgentOnce(sdk, agent, what, inputs, () => onState('Retrying')))
  }
}

async function runAgentOnce(sdk: UiPath, agent: string, what: string, inputs: Record<string, string>, onState: (s: string) => void): Promise<unknown> {
  if (!REQUIREMENTS_FOLDER.folderKey) throw new Error(`The ${AGENT_LABEL} for ${what} isn't deployed yet.`)
  let started: Awaited<ReturnType<Processes['start']>>
  try {
    started = await new Processes(sdk).start({ name: agent }, { ...REQUIREMENTS_FOLDER, inputArguments: JSON.stringify(inputs) })
  } catch (e) {
    if (/could not be found|not found/i.test((e as Error).message)) throw new Error(`The ${AGENT_LABEL} for ${what} isn't deployed yet.`)
    throw e
  }
  const job = started[0]
  const jobs = new Jobs(sdk)
  const folderId = (job as unknown as { folderId: number }).folderId
  const deadline = Date.now() + 6 * 60_000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    const j = await jobs.getById(job.key, folderId)
    onState(String(j.state))
    if (j.state === 'Successful') return camel<unknown>((await jobs.getOutput(job.key, folderId)) ?? {})
    if (j.state === 'Faulted' || j.state === 'Stopped') throw new Error(`The ${AGENT_LABEL} ${String(j.state).toLowerCase()} on ${what}: ${(j as unknown as { info?: string }).info ?? ''}`)
  }
  throw new Error(`The ${AGENT_LABEL} did not finish ${what} within 6 minutes.`)
}

const WARM_KEY = 'rq.agentWarmAt'

/** Wake cloud robots when the builder opens, so the first question round doesn't wait for them to start. */
export function warmAgents(sdk: UiPath) {
  if (!REQUIREMENTS_FOLDER.folderKey) return
  try {
    if (Date.now() - Number(localStorage.getItem(WARM_KEY) ?? 0) < 10 * 60_000) return
    localStorage.setItem(WARM_KEY, String(Date.now()))
  } catch { /* no storage: warm anyway */ }
  for (const name of [ANALYST_AGENT, SPEC_AGENT]) {
    void new Processes(sdk).start({ name }, {
      ...REQUIREMENTS_FOLDER,
      inputArguments: JSON.stringify({ need: 'Warm-up run with no need described. Return empty values.', context: '{}', answers: '[]', draft: '{}' }),
    }).catch(() => undefined)
  }
}

/**
 * Claude sometimes leaks its tool-call markup into a text field, e.g. summary 'Due in 90 days.</summary>\n<parameter
 * name="pscCode">7E21' with pscCode null (1 of 24 debug answers, 2026-11-12). Cut the text at the markup and recover the
 * fields it carried, when they came back empty.
 */
function unleak<T>(o: T): T {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return o
  const out: Record<string, unknown> = { ...(o as Record<string, unknown>) }
  for (const [k, v] of Object.entries(out)) {
    if (typeof v !== 'string') continue
    const at = v.search(/<\/[A-Za-z]+>\s*<parameter\b|<parameter name="/)
    if (at < 0) continue
    out[k] = v.slice(0, at).trim()
    for (const m of v.slice(at).matchAll(/<parameter name="([^"]+)">([\s\S]*?)(?=<\/parameter>|<parameter name="|$)/g)) {
      const key = m[1][0].toLowerCase() + m[1].slice(1)
      if (out[key] == null || out[key] === '') out[key] = camel(m[2].trim())
    }
  }
  return out as T
}

/** What RQ_RequirementsAnalyst returns, after camel(). */
interface AnalystOut {
  kind: string; title: string; summary: string
  pscCode: string; pscName: string; naicsCode: string; naicsName: string; sizeStandard: string
  commercialLikely: boolean; commercialReason: string
  valueLow: number; valueHigh: number; valueBasis: string
  flags: Flag[]
  questions: { id: string; question: string; why: string; options: string[] }[]
  /** Solutions 1.0.1 and 1.0.2 only: the requirement as top-level spec* fields (specItems, specObjective, …). */
  [specField: `spec${string}`]: unknown
  /** The requirement as one object or a JSON string: the preview's canned answers, and solutions 1.0.0 and 1.0.3. */
  requirement?: Partial<Spec> | string
}

/**
 * RQ_RequirementsAnalyst's answer. From solution 1.0.4 it is typed fields (the read and the questions), with flags and
 * questions allowed to arrive as JSON text, and RQ_SpecWriter returns the requirement. Solution 1.0.3 put the whole answer in one text field, answerJson, which the model wrote as
 * broken JSON in 3 of 7 live runs; this still reads it, parsed by camel() or as text, until 1.0.4 is deployed.
 */
export function analystAnswer(raw: unknown): AnalystOut {
  const r = unleak((raw ?? {}) as AnalystOut & { answerJson?: unknown })
  if (r.answerJson == null) {
    // Lists may arrive as JSON text (the output schema allows it); camel() parsed what it could, so text left here is broken.
    if ((r.flags != null && !Array.isArray(r.flags)) || (r.questions != null && !Array.isArray(r.questions))) {
      throw new ShapeError(`The ${AGENT_LABEL} returned an answer the app couldn't read.`)
    }
    return r
  }
  if (typeof r.answerJson === 'object') return r.answerJson as AnalystOut
  const t = String(r.answerJson)
  try {
    return camel<AnalystOut>(JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)))
  } catch {
    throw new ShapeError(`The ${AGENT_LABEL} returned an answer the app couldn't read.`)
  }
}

const TEXT_LISTS = new Set(['standards', 'tasks'])

/**
 * RQ_SpecWriter's answer: the structured requirement as top-level fields. Keeps the Spec fields of the right shape; an
 * answer with none of them is a shape fault, so runAgent tries once more.
 */
export function specAnswer(raw: unknown): Partial<Spec> {
  const r = unleak((raw ?? {}) as Record<string, unknown>)
  const blank = emptySpec() as unknown as Record<string, unknown>
  const spec: Record<string, unknown> = {}
  for (const k of Object.keys(blank)) {
    const v = r[k]
    if (v == null || Array.isArray(v) !== Array.isArray(blank[k])) continue
    spec[k] = !Array.isArray(v) ? String(v)
      : TEXT_LISTS.has(k) ? v.filter((x) => typeof x === 'string' && x.trim())
        : v.filter((x) => x && typeof x === 'object').map((x) => (k === 'items' ? { ...x, unit: unitOf(x.unit) } : x))
  }
  if (!Object.keys(spec).length) throw new ShapeError(`The ${AGENT_LABEL} returned a requirement the app couldn't read.`)
  return spec as Partial<Spec>
}

/** The structured requirement in an older analyst answer or the preview's: spec* fields, else a requirement object or string. */
export function specOut(out: AnalystOut): Partial<Spec> {
  const spec: Record<string, unknown> = {}
  for (const k of Object.keys(emptySpec())) {
    const v = out[`spec${k[0].toUpperCase()}${k.slice(1)}` as `spec${string}`]
    if (v != null) spec[k] = v
  }
  if (Object.keys(spec).length) return spec as Partial<Spec>
  if (typeof out.requirement === 'string') {
    try { return JSON.parse(out.requirement) as Partial<Spec> } catch { return {} }
  }
  return out.requirement ?? {}
}

const KINDS: Kind[] = ['Product', 'Service', 'Product and service']

/** The context the analyst reads besides the need: who needs it, when, and the budget. */
export function contextOf(r: RequirementRow) {
  return { agency: r.Agency, office: r.Office, neededBy: r.NeedBy, budget: r.Budget ?? null, kindHint: r.Kind || null }
}

/** Two agents' job states as one: the one still furthest behind, so the screen doesn't say done while one still runs. */
function combinedState(onState: (s: string) => void) {
  const states = ['', '']
  return (i: number) => (s: string) => {
    states[i] = s
    onState(states.includes('Retrying') ? 'Retrying' : states.find((x) => x && x !== 'Successful') ?? s)
  }
}

/**
 * One round: the need, the context, every answer so far and the current draft go to RQ_RequirementsAnalyst and
 * RQ_SpecWriter side by side. The analyst's read of the need and its next questions, and the writer's updated draft,
 * come out. If only the writer fails, the round still counts: specNote says so, and the next round redrafts.
 */
export async function analyze(sdk: UiPath, r: RequirementRow, prior: Analysis | undefined, spec: Spec, onState: (s: string) => void, preview = false): Promise<{ analysis: Analysis; spec: Spec; specNote?: string }> {
  const answered = [...(prior?.answered ?? []), ...(prior?.questions ?? []).filter((q) => q.answer?.trim() || q.skipped)]
  const answers = answered.map((q) => ({ question: q.question, answer: q.skipped ? '(skipped: the program office does not know yet)' : q.answer }))
  const inputs = {
    need: r.Need.slice(0, 6000),
    context: JSON.stringify(contextOf(r)),
    answers: JSON.stringify(answers).slice(0, 6000),
    draft: JSON.stringify(spec).slice(0, 8000),
  }
  let out: AnalystOut
  let written: Partial<Spec> | undefined
  if (preview) {
    out = await mockAnalysis(r, answered, onState)
  } else {
    const report = combinedState(onState)
    const [read, wrote] = await Promise.all([
      runAgent(sdk, ANALYST_AGENT, 'the requirement', inputs, report(0), analystAnswer),
      // Before solution 1.0.4 there is no writer: the analyst's own answer carries the requirement.
      runAgent(sdk, SPEC_AGENT, 'the requirement draft', inputs, report(1), specAnswer).catch(() => undefined),
    ])
    out = read
    written = wrote
  }
  const drafted = written ?? specOut(out)
  const specNote = !preview && !written && !Object.keys(drafted).length
    ? 'The draft requirement didn’t update this round. Your answers are saved, and the next round redrafts it.'
    : undefined
  const asked = new Set(answered.map((q) => q.question.trim().toLowerCase()))
  const questions: Question[] = (out.questions ?? []).filter((q) => q.question && !asked.has(q.question.trim().toLowerCase())).slice(0, 6)
    .map((q, i) => ({ id: q.id || `q${(prior?.round ?? 0) + 1}-${i}`, question: q.question, why: q.why ?? '', options: (q.options ?? []).slice(0, 4) }))
  const analysis: Analysis = {
    kind: KINDS.includes(out.kind as Kind) ? (out.kind as Kind) : (prior?.kind ?? 'Product'),
    title: out.title || prior?.title || '',
    summary: out.summary ?? '',
    psc: { code: out.pscCode ?? '', name: out.pscName ?? '' },
    naics: { code: out.naicsCode ?? '', name: out.naicsName ?? '', sizeStandard: out.sizeStandard ?? '' },
    commercial: { likely: !!out.commercialLikely, reason: out.commercialReason ?? '' },
    value: { low: Number(out.valueLow) || 0, high: Number(out.valueHigh) || 0, basis: out.valueBasis ?? '' },
    flags: withIctFlag((out.flags ?? []).filter((f) => f.id && f.label), out.pscCode),
    questions,
    answered,
    round: (prior?.round ?? 0) + 1,
    at: new Date().toISOString(),
  }
  const merged = mergeSpec(spec, drafted, prior?.drafted)
  return { analysis: { ...analysis, drafted: merged.drafted }, spec: merged.spec, specNote }
}

/**
 * IT product (7A20–7K20) and IT service (DA01–DK10) codes, from the PSC Manual's IT categories. Section 508 applies to
 * anything bought under one, so the flag doesn't rest on the agent noticing it.
 */
export const isItPsc = (code?: string) => /^(7[A-HJK]2\d|D[A-HJK](0\d|1\d))$/i.test((code ?? '').trim())

function withIctFlag(flags: Flag[], psc?: string): Flag[] {
  if (flags.some((f) => f.id === 'ict') || !isItPsc(psc)) return flags
  return [...flags, { id: 'ict', label: 'Information technology', reason: `PSC ${psc} is an information technology code, so the Section 508 accessibility standards apply.` }]
}

/** A short fingerprint of a field's value, so the record remembers what the agent wrote without storing it twice. */
const mark = (v: unknown) => {
  let h = 5381
  for (const c of JSON.stringify(v ?? '')) h = ((h << 5) + h + c.charCodeAt(0)) | 0
  return (h >>> 0).toString(36)
}
const isEmpty = (v: unknown) => (Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim())

/**
 * The agent's new draft replaces what it wrote before, so an answer can change a field the agent filled in. A field the
 * person changed since (its value no longer matches the agent's last fingerprint) stays as the person wrote it.
 */
export function mergeSpec(mine: Spec, agent: Partial<Spec>, drafted: Record<string, string> = {}): { spec: Spec; drafted: Record<string, string> } {
  const out = { ...emptySpec(), ...mine }
  const marks = { ...drafted }
  for (const [k, v] of Object.entries(agent) as [keyof Spec, Spec[keyof Spec]][]) {
    if (!(k in out) || v == null || isEmpty(v)) continue
    const cur = out[k]
    const agentsOwn = isEmpty(cur) || marks[k] === mark(cur)
    if (!agentsOwn) continue
    const next = Array.isArray(v) ? (v as unknown[]).filter(Boolean) : v
    ;(out as Record<string, unknown>)[k] = next
    marks[k] = mark(next)
  }
  return { spec: out, drafted: marks }
}

interface DrafterOut { title: string; sections: Section[]; openQuestions: string[] }

/** RQ_Drafter: one package document from the requirement and the analysis. */
export async function draftDoc(sdk: UiPath, kind: DocKind, r: RequirementRow, a: Analysis | undefined, spec: Spec, onState: (s: string) => void, preview = false): Promise<DrafterOut> {
  const requirement = {
    title: r.Title, kind: a?.kind ?? r.Kind, agency: r.Agency, office: r.Office, neededBy: r.NeedBy, need: r.Need.slice(0, 3000),
    summary: a?.summary, psc: a?.psc, naics: a?.naics, commercial: a?.commercial, flags: a?.flags, spec,
  }
  const out = preview
    ? await mockDraft(kind, r, spec, onState)
    : await runAgent<DrafterOut>(sdk, DRAFTER_AGENT, 'the draft', { docKind: kind, requirement: JSON.stringify(requirement).slice(0, 9000) }, onState)
  return { title: out.title ?? '', sections: (out.sections ?? []).filter((s) => s.heading || s.text), openQuestions: (out.openQuestions ?? []).filter((q) => q && !/^none\.?$/i.test(q.trim())) }
}

/** Sections as the document text the editor holds and Data Fabric stores: "## Heading" lines between paragraphs. */
export const sectionsToText = (s: Section[]) => s.map((x) => `## ${x.heading}\n${x.text.trim()}`).join('\n\n')
export function textToSections(t: string): Section[] {
  const parts = t.split(/^## /m).map((p) => p.trim()).filter(Boolean)
  return parts.map((p) => { const [h, ...rest] = p.split('\n'); return { heading: h.trim(), text: rest.join('\n').trim() } })
}
