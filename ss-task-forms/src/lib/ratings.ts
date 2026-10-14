/**
 * One five-step scale, shown several ways. Index 0 is always best. Shared with ss-workspace.
 * Federal plans show it as merit adjectives or DoD color names, both in the DoD Source Selection Procedures colors
 * (Blue Outstanding, Purple Good, Green Acceptable, Yellow Marginal, Red Unacceptable). Past performance shows its own
 * confidence terms, uncolored: the DoD procedures give confidence assessments no colors, and Neutral Confidence is not a
 * midpoint. There is deliberately no numeric display: GAO warns against mechanical scoring of adjectival ratings.
 * State & Local plans show the points a step earns on the criterion (Excellent earns every point, Good 80%…) or the
 * District's scoring-guide words.
 */
import { rank, scaleOf } from './eval'
import { POINT_SHARES, frameworkOf, pointsAt, pts } from './terms'
import type { Framework } from './terms'
import type { Factor, Plan, RatingMethod } from './types'

export const RATING_METHODS: { id: RatingMethod; label: string; hint: string }[] = [
  { id: 'adjectival', label: 'Adjectival', hint: 'Outstanding, Good, Acceptable…' },
  { id: 'color', label: 'Color', hint: 'Blue, Purple, Green, Yellow, Red (DoD)' },
]

/** State & Local display choices: points (the default) or the scoring guide's words. */
export const SLED_RATING_METHODS: { id: RatingMethod; label: string; hint: string }[] = [
  { id: 'points', label: 'Points', hint: 'Points earned out of each criterion’s maximum' },
  { id: 'adjectival', label: 'Scoring guide', hint: 'Excellent, Good, Satisfactory…' },
]

export const methodsFor = (fw: Framework) => (fw === 'sled' ? SLED_RATING_METHODS : RATING_METHODS)

/** Step colors, best first: the DoD color ratings (blue, purple, green, yellow, red), themed in index.css. */
const LEVELS = [0, 1, 2, 3, 4].map((i) => ({ bg: `var(--ss-rating-${i})`, fg: `var(--ss-rating-${i}-fg)` }))

/** The merit adjectives every federal factor is displayed with, best first. */
export const ADJECTIVES = ['Outstanding', 'Good', 'Acceptable', 'Marginal', 'Unacceptable']

/** Past performance confidence assessments, best first (FAR 15.305(a)(2), DoD Source Selection Procedures). */
export const CONFIDENCE_TERMS = ['Substantial Confidence', 'Satisfactory Confidence', 'Neutral Confidence', 'Limited Confidence', 'No Confidence']

/** The District's scoring guide, best first, when a State & Local plan doesn't name its own. */
export const SCORING_GUIDE = ['Excellent', 'Good', 'Satisfactory', 'Poor', 'Unacceptable']

/** DoD Source Selection Procedures color names, best first. */
const COLOR_NAMES = ['Blue', 'Purple', 'Green', 'Yellow', 'Red']

/** Plans saved with the retired numeric display show adjectives. */
export function methodOf(plan: Plan): RatingMethod {
  if (frameworkOf(plan) === 'sled') return plan.ratingMethod === 'adjectival' ? 'adjectival' : 'points'
  return plan.ratingMethod === 'color' ? 'color' : 'adjectival'
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
  /** A federal past performance factor: shown by its confidence term, without a rating color. */
  confidence?: boolean
}

/** Look options for a factor on a plan. */
export const lookOf = (plan: Plan, factor?: Factor): LookOptions => ({
  words: wordsOf(plan), max: factor?.weight, confidence: factor?.scale === 'confidence' && frameworkOf(plan) !== 'sled',
})

/** The confidence step that means "no relevant record": neither favorable nor unfavorable, so off the merit ramp. */
export const NEUTRAL_CONFIDENCE = 2

export interface Look {
  /** What the chip says: the adjective, color name, points or confidence term. */
  text: string
  /** The step's word (adjective or scoring-guide word; the term itself for confidence). */
  word: string
  /** The stored scale label. */
  official: string
  bg: string
  fg: string
  /** Set for a confidence factor: the confidence step, best (0) to worst (4). */
  confidence?: number
}

/**
 * Text and colors for a rating level under a display method; `official` is the stored scale label, e.g.
 * "Substantial Confidence". Confidence factors show that term under every federal method, on a neutral surface.
 */
export function look(method: RatingMethod, i: number, official: string, o: LookOptions = {}): Look {
  const k = Math.max(0, Math.min(4, i))
  if (o.confidence && method !== 'points') return { text: official, word: official, official, bg: 'var(--ss-confidence)', fg: 'var(--ss-confidence-fg)', confidence: k }
  const word = o.words?.[k] ?? ADJECTIVES[k]
  if (method === 'color') return { text: COLOR_NAMES[k], word, official, ...LEVELS[k] }
  if (method === 'points') {
    const text = o.max != null ? pts(pointsAt(o.max, k)) : `${Math.round(POINT_SHARES[k] * 100)}%`
    return { text, word, official, ...LEVELS[k] }
  }
  return { text: word, word, official, ...LEVELS[k] }
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
