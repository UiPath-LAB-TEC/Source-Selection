/**
 * State & Local scoring: each criterion earns points by its consensus score (see POINT_SHARES), cost earns points by
 * formula once the Procurement Officer has evaluated cost, and the total is out of 100. Shared with ss-workspace.
 */
import { cell, rated } from './eval'
import { pointsFor } from './ratings'
import { costPoints } from './terms'
import type { Offeror, Plan, Rating } from './types'

export interface Score {
  offerorId: string
  /** Points per rated criterion; undefined until the committee sets its consensus score. */
  byFactor: Record<string, number | undefined>
  /** Cost points; undefined until cost is evaluated. */
  cost?: number
  total: number
  /** Points available so far (criteria with a consensus score, plus cost once evaluated). */
  of: number
  /** Every criterion scored and cost evaluated. */
  complete: boolean
  /** 1 = highest total. Ties share a rank. */
  rank: number
}

export function scores(plan: Plan, offerors: Offeror[], ratings: Rating[]): Score[] {
  const factors = rated(plan)
  const costFactor = plan.factors.find((f) => f.evaluatedNotRated)
  const prices = offerors.map((o) => o.TotalEvaluatedPrice).filter((p): p is number => p != null && p > 0)
  const lowest = prices.length ? Math.min(...prices) : undefined
  const rows = offerors.map((o) => {
    const byFactor = Object.fromEntries(factors.map((f) => [f.id, pointsFor(plan, f, cell(plan, f, ratings, o.OfferorId).consensus?.Rating)]))
    const cost = costFactor?.weight != null ? costPoints(costFactor.weight, o.TotalEvaluatedPrice, lowest) : undefined
    const earned = Object.values(byFactor).filter((v): v is number => v != null)
    const of = factors.filter((f) => byFactor[f.id] != null).reduce((n, f) => n + (f.weight ?? 0), 0) + (cost != null ? costFactor?.weight ?? 0 : 0)
    const total = Math.round((earned.reduce((a, b) => a + b, 0) + (cost ?? 0)) * 10) / 10
    return { offerorId: o.OfferorId, byFactor, cost, total, of, complete: earned.length === factors.length && cost != null, rank: 0 }
  })
  for (const r of rows) r.rank = 1 + rows.filter((x) => x.total > r.total).length
  return rows
}

export const scoreFor = (all: Score[], offerorId: string) => all.find((s) => s.offerorId === offerorId)

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`
