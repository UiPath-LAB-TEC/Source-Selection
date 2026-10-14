/**
 * One five-step scale, shown several ways. Index 0 is always best. Shared with ss-workspace.
 * Federal plans show it as merit adjectives, DoD colors or a 5-point number; State & Local plans show the points a step
 * earns on the criterion (Excellent earns every point, Good 80%…) or the District's scoring-guide words.
 */
import { rank, scaleOf } from './eval'
import { POINT_SHARES, frameworkOf, pointsAt, pts } from './terms'
import type { Framework } from './terms'
import type { Factor, Plan, RatingMethod } from './types'

export const RATING_METHODS: { id: RatingMethod; label: string; hint: string }[] = [
  { id: 'adjectival', label: 'Adjectival', hint: 'Outstanding, Good, Acceptable…' },
  { id: 'color', label: 'Color', hint: 'Blue, Purple, Green, Yellow, Red (DoD)' },
  { id: 'numeric', label: 'Numeric', hint: '5 (best) to 1' },
]

/** State & Local display choices: points (the default) or the scoring guide's words. */
export const SLED_RATING_METHODS: { id: RatingMethod; label: string; hint: string }[] = [
  { id: 'points', label: 'Points', hint: 'Points earned out of each criterion’s maximum' },
  { id: 'adjectival', label: 'Scoring guide', hint: 'Excellent, Good, Satisfactory…' },
]

export const methodsFor = (fw: Framework) => (fw === 'sled' ? SLED_RATING_METHODS : RATING_METHODS)

/** Level colors for adjectival and numeric display: solid green, tinted green, neutral, tinted amber, solid red. */
const ADJECTIVAL = [0, 1, 2, 3, 4].map((i) => ({ bg: `var(--ss-lvl-${i})`, fg: `var(--ss-lvl-${i}-fg)` }))

/** The merit adjectives every federal factor is displayed with, best first. */
export const ADJECTIVES = ['Outstanding', 'Good', 'Acceptable', 'Marginal', 'Unacceptable']

/** The District's scoring guide, best first, when a State & Local plan doesn't name its own. */
export const SCORING_GUIDE = ['Excellent', 'Good', 'Satisfactory', 'Poor', 'Unacceptable']

/** DoD Source Selection Procedures color ratings. */
const COLORS = [
  { name: 'Blue', bg: '#1d5fd6', fg: '#ffffff' },
  { name: 'Purple', bg: '#7c3aed', fg: '#ffffff' },
  { name: 'Green', bg: '#15803d', fg: '#ffffff' },
  { name: 'Yellow', bg: '#facc15', fg: '#3d3000' },
  { name: 'Red', bg: '#dc2626', fg: '#ffffff' },
]

export function methodOf(plan: Plan): RatingMethod {
  if (frameworkOf(plan) === 'sled') return plan.ratingMethod === 'adjectival' ? 'adjectival' : 'points'
  return plan.ratingMethod && plan.ratingMethod !== 'points' ? plan.ratingMethod : 'adjectival'
}

/** The words the steps are displayed with: the federal merit adjectives, or the District's scoring guide. */
export const wordsOf = (plan: Plan) => (frameworkOf(plan) === 'sled' ? plan.scales.technical ?? SCORING_GUIDE : ADJECTIVES)

export function level(plan: Plan, factor: Factor, rating?: string) {
  const r = rank(plan, factor, rating)
  return r > 4 ? undefined : r
}

export interface LookOptions {
  /** Step words, best first (default: the federal adjectives). */
  words?: readonly string[]
  /** The criterion's maximum points, for the points display. */
  max?: number
}

/** Look options for a factor on a plan. */
export const lookOf = (plan: Plan, factor?: Factor): LookOptions => ({ words: wordsOf(plan), max: factor?.weight })

/**
 * Text and colors for a rating level under a display method. Every factor shows the step word (past performance
 * included); `official` is the stored scale label, e.g. "Substantial Confidence".
 */
export function look(method: RatingMethod, i: number, official: string, o: LookOptions = {}) {
  const k = Math.max(0, Math.min(4, i))
  const word = o.words?.[k] ?? ADJECTIVES[k]
  if (method === 'color') return { text: COLORS[k].name, word, official, ...COLORS[k] }
  if (method === 'numeric') return { text: String(5 - k), word, official, ...ADJECTIVAL[k] }
  if (method === 'points') {
    const text = o.max != null ? pts(pointsAt(o.max, k)) : `${Math.round(POINT_SHARES[k] * 100)}%`
    return { text, word, official, ...ADJECTIVAL[k] }
  }
  return { text: word, word, official, ...ADJECTIVAL[k] }
}

/** Legend steps, best first. */
export function legend(words: readonly string[] = ADJECTIVES) {
  return words.slice(0, 5).map((word, i) => ({ i, word }))
}

/** The points a consensus rating earns on a criterion, or undefined when unrated or the criterion has no weight. */
export function pointsFor(plan: Plan, factor: Factor, rating?: string) {
  const i = level(plan, factor, rating)
  return i == null || factor.weight == null ? undefined : pointsAt(factor.weight, i)
}

export { scaleOf }
