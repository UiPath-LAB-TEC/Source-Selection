/** Pure helpers over a Dataset slice — no SDK calls. */
import type { Dataset, Factor, Finding, Plan, Rating, Solicitation } from './types'
import { STAGES } from './types'

export const money = (n?: number) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export const moneyShort = (n?: number) => (n == null ? '—' : `$${(n / 1e6).toFixed(1)}M`)

export const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

export const day = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export function forSolicitation(d: Dataset, id: string) {
  const by = <T extends { SolicitationId: string }>(xs: T[]) => xs.filter((x) => x.SolicitationId === id)
  return {
    offerors: by(d.offerors).sort((a, b) => a.Name.localeCompare(b.Name)),
    pages: by(d.pages),
    findings: by(d.findings),
    ratings: by(d.ratings),
    decisions: by(d.decisions),
    audit: by(d.audit).sort((a, b) => a.OccurredAt.localeCompare(b.OccurredAt)),
  }
}

export function rated(plan: Plan): Factor[] {
  return plan.factors.filter((f) => !f.evaluatedNotRated).sort((a, b) => a.order - b.order)
}

export function scaleOf(plan: Plan, f: Factor) {
  return plan.scales[f.scale ?? 'technical']
}

/** 0 = best. Unknown ratings sort last. */
export function rank(plan: Plan, f: Factor, rating?: string) {
  const i = rating ? scaleOf(plan, f).indexOf(rating) : -1
  return i < 0 ? 99 : i
}

export interface Cell {
  consensus?: Rating
  individual: Rating[]
  spread: number
}

export function cell(plan: Plan, f: Factor, ratings: Rating[], offerorId: string): Cell {
  const mine = ratings.filter((r) => r.OfferorId === offerorId && r.FactorId === f.id)
  const individual = mine.filter((r) => r.Level === 'Individual').sort((a, b) => a.EvaluatorSlot - b.EvaluatorSlot)
  const ranks = individual.map((r) => rank(plan, f, r.Rating))
  return {
    consensus: mine.find((r) => r.Level === 'Consensus'),
    individual,
    spread: ranks.length > 1 ? Math.max(...ranks) - Math.min(...ranks) : 0,
  }
}

export function stageIndex(s: Solicitation) {
  if (s.Status === 'Awarded' || s.Stage === 'Awarded') return STAGES.length
  const i = STAGES.indexOf(s.Stage as (typeof STAGES)[number])
  return i
}

export function findingsFor(findings: Finding[], offerorId: string, factorId: string) {
  return findings.filter((x) => x.OfferorId === offerorId && x.FactorId === factorId)
}

export const KIND_ORDER = ['Significant Strength', 'Strength', 'Risk', 'Weakness', 'Significant Weakness', 'Deficiency']

export function kindTone(kind: string): 'good' | 'warn' | 'serious' | 'critical' {
  if (kind.includes('Strength')) return 'good'
  if (kind === 'Risk') return 'warn'
  if (kind === 'Deficiency') return 'critical'
  return kind === 'Significant Weakness' ? 'critical' : 'serious'
}
