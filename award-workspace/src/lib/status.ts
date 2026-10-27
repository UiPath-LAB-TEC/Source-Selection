import { dayOf } from '@award/lib/clocks'
import type { AwardClocks } from '@award/lib/clocks'
import type { Solicitation } from '@ss/lib/types'
import { atAwardDecision, fundsOf, isAwarded, isImported, isImportedHeader, periodsOf } from './award'
import type { AwardDataset, AwardRow, Correspondence, Protest, ScheduleRow } from './award'

/**
 * Where a record stands, in one word, the same on every page:
 * - awaiting: the award decision is still with the SSA in Source Selection
 * - ready: the decision is signed and the award phase hasn't begun
 * - awarding: the award phase is under way and the contract isn't signed yet
 * - active: the contract is signed (or was awarded elsewhere) and is performing
 * - closed: closed out
 * An award is an award until the contract is signed; from then on it's a contract, and the post-award steps (debriefings,
 * any protest) are items on the contract rather than a second tracker.
 */
export type Status = 'awaiting' | 'ready' | 'awarding' | 'active' | 'closed'

export const STATUS_LABEL: Record<Status, string> = {
  awaiting: 'Awaiting decision', ready: 'Ready to award', awarding: 'Award in progress', active: 'Active', closed: 'Closed',
}

export const isContract = (s?: Status) => s === 'active' || s === 'closed'
export const isAward = (s?: Status) => s === 'awaiting' || s === 'ready' || s === 'awarding'

/** The contract award is signed: the SSDecision of Kind Contract has Outcome Awarded. */
export const contractSigned = (d: AwardDataset, id: string) =>
  d.decisions.some((x) => x.SolicitationId === id && x.Kind === 'Contract' && x.Outcome === 'Awarded')

export function statusOf(d: AwardDataset, s: Solicitation): Status | undefined {
  const award = d.awards.find((a) => a.SolicitationId === s.SolicitationId)
  if (isImported(award) || isImportedHeader(s) || contractSigned(d, s.SolicitationId)) return award?.Phase === 'Closed' ? 'closed' : 'active'
  if (isAwarded(s)) return award ? 'awarding' : 'ready'
  if (atAwardDecision(s)) return 'awaiting'
  return undefined
}

/** The agency-local day the contract was signed: its Contract decision, or the award date of one awarded elsewhere. */
export function signedOn(d: AwardDataset, s: Solicitation, award?: AwardRow) {
  const c = d.decisions.find((x) => x.SolicitationId === s.SolicitationId && x.Kind === 'Contract' && x.Outcome === 'Awarded')
  const at = c?.DecidedAt ?? award?.AwardedAt ?? s.AwardedAt
  return at ? dayOf(at) : undefined
}

export const today = () => dayOf(new Date().toISOString())

/** "$0", "$116K", "$4.7M": short money for tiles and captions. */
export const shortMoney = (n?: number) => (n == null ? '—' : n === 0 ? '$0' : Math.abs(n) < 1e6 ? `$${Math.round(n / 1e3)}K` : `$${(n / 1e6).toFixed(1)}M`)
const ms = (d: string) => Date.parse(`${d}T12:00:00`)
const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 86_400_000)
export const fmtDay = (d?: string, withYear = true) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' }) : '—'

/** "base year", "option year 2", "final option year". */
export function periodWord(r: ScheduleRow | undefined, periods: ScheduleRow[]) {
  if (!r) return 'not started'
  if (r.Kind === 'Period') return 'base year'
  if (r.Kind === 'Extension') return 'extension'
  const n = Number(r.Name.match(/\d+/)?.[0])
  return r === periods.at(-1) ? 'final option year' : `option year ${n}`
}

/** The period running today, how far into it the contract is, and what it has spent against what's obligated. */
export function periodNow(schedule: ScheduleRow[], award: AwardRow | undefined, on = today()) {
  const periods = periodsOf(schedule)
  const exercised = [...periods, ...schedule.filter((r) => r.Kind === 'Extension')].filter((r) => r.Status === 'Exercised')
  const current = exercised.find((r) => (r.StartDay ?? '') <= on && on <= (r.EndDay ?? '')) ?? exercised.filter((r) => (r.EndDay ?? '') < on).at(-1)
  const total = current?.StartDay && current.EndDay ? daysBetween(current.StartDay, current.EndDay) + 1 : 0
  const day = current?.StartDay ? Math.min(total, Math.max(1, daysBetween(current.StartDay, on) + 1)) : 0
  const left = current?.EndDay ? Math.max(0, daysBetween(on, current.EndDay)) : 0
  const lines = fundsOf(award)?.lines ?? []
  const obligated = lines.reduce((s, l) => s + l.obligated, 0)
  const invoiced = lines.reduce((s, l) => s + l.invoiced, 0)
  return { current, word: periodWord(current, periods), day, total, left, obligated, invoiced, periods }
}

export interface PostAward { lines: { text: string; open: boolean }[]; open: boolean }

/**
 * A contract awarded here, after signing: the debriefing request window and the protest window for a stay of
 * performance, from the deadlines the robots filed (SSAward.ClocksJson), the requests received and any protest.
 */
export function postAward(award: AwardRow | undefined, letters: Correspondence[], protests: Protest[], on = today()): PostAward | undefined {
  if (!award || isImported(award) || !award.ClocksJson) return undefined
  let clocks: AwardClocks | undefined
  try { clocks = JSON.parse(award.ClocksJson) as AwardClocks } catch { return undefined }
  const lines: PostAward['lines'] = []
  const requests = letters.filter((c) => c.Kind === 'DebriefRequest')
  const delivered = letters.filter((c) => c.Kind === 'Debriefing' && c.Status === 'Delivered').length
  const due = Object.values(clocks?.requestDue ?? {}).sort().at(-1)
  if (requests.length) lines.push({ text: `${requests.length} debriefing request${requests.length > 1 ? 's' : ''}, ${delivered} delivered`, open: delivered < requests.length })
  else if (due) lines.push(on > due ? { text: `No debriefing requests by ${fmtDay(due, false)}`, open: false } : { text: `Debriefing requests due by ${fmtDay(due, false)}`, open: true })
  const pending = protests.filter((p) => !p.Outcome)
  if (protests.length) lines.push({ text: pending.length ? `Protest filed${pending[0].Forum ? ` at ${pending[0].Forum}` : ''}` : `Protest decided: ${protests.at(-1)?.Outcome}`, open: pending.length > 0 })
  else if (clocks?.stayByAward) lines.push(on > clocks.stayByAward ? { text: `No protest by ${fmtDay(clocks.stayByAward, false)}`, open: false } : { text: `Protest window for a stay closes ${fmtDay(clocks.stayByAward, false)}`, open: true })
  return lines.length ? { lines, open: lines.some((l) => l.open) } : undefined
}
