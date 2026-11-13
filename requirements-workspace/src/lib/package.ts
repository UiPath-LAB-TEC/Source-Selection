/**
 * What a requirements package needs, from the requirement and the agent's flags. The rules live here only; the robot
 * that assembles the package (slice 2) reads the same table. Thresholds are named once, below.
 */
import type { Analysis, DocKind, DocRow, RequirementRow } from './types'
import { isProduct, isService } from './types'

/** FAR 2.101 thresholds as adjusted for inflation by FAC 2025-06 (90 FR 41872), effective Oct 1, 2025. */
export const THRESHOLDS = { micro: 15_000, sat: 350_000 } as const

/** Who produces a document: the agent drafts it here, the person writes it here, or a reviewer adds it after submission. */
export type Producer = 'agent' | 'person' | 'reviewer'

export interface PackageItem {
  kind: DocKind
  label: string
  /** Why it's in this package, in one line. */
  why: string
  producer: Producer
  /** For a reviewer's document: who adds it. */
  who?: string
  /** Where the rule comes from, for the ⓘ beside the document (RFO model deviation text, checked 2026-11-10). */
  cite: string
}

export const DOC_LABEL: Record<DocKind, string> = {
  purchaseDescription: 'Purchase description',
  pws: 'Performance work statement',
  qasp: 'Quality assurance surveillance plan',
  marketResearch: 'Market research report',
  igce: 'Independent government cost estimate',
  acquisitionStrategy: 'Acquisition strategy',
  smallBusiness: 'Small business coordination',
  brandName: 'Brand-name justification',
  ja: 'Justification for other than full and open competition',
  section508: 'Section 508 accessibility determination',
  funds: 'Funds certification',
}

/** The documents the drafting agent can write (slice 0). Market research, the IGCE and the strategy get their own agents in slice 1. */
export const AGENT_DRAFTS: DocKind[] = ['purchaseDescription', 'pws', 'qasp', 'brandName', 'section508']

const DOD = /\b(Army|Air Force|Space Force|Navy|Marine Corps|Defense|DoD)\b/i
export const isDod = (agency: string) => DOD.test(agency)

/** The value the rules use: the IGCE total once there is one, else the middle of the agent's range, else the budget. */
export function valueOf(r: Pick<RequirementRow, 'EstimatedValue' | 'Budget'>, a?: Analysis): number {
  if (r.EstimatedValue) return r.EstimatedValue
  if (a && a.value.high > 0) return Math.round((a.value.low + a.value.high) / 2)
  return r.Budget ?? 0
}

const has = (a: Analysis | undefined, id: string) => !!a?.flags.some((f) => f.id === id)

/** The value bands that change the package, for the "What applies" list. */
export function valueFlags(value: number, agency: string) {
  const out: { id: string; label: string; reason: string }[] = []
  if (value > THRESHOLDS.sat) {
    out.push({ id: 'aboveSat', label: 'Above the simplified acquisition threshold', reason: `At about ${usd(value)}, the package needs an acquisition strategy and full market research.` })
  } else if (value > THRESHOLDS.micro) {
    out.push({ id: 'sap', label: 'Simplified acquisition', reason: `At about ${usd(value)}, simplified procedures apply. It's set aside for small business when two or more can be expected to offer.` })
  } else if (value > 0) {
    out.push({ id: 'micro', label: 'Micro-purchase', reason: `At about ${usd(value)}, this may be a card purchase. Check your agency's purchase card rules before building a package.` })
  }
  if (value > THRESHOLDS.micro && isDod(agency)) out.push({ id: 'dd2579', label: 'Small business coordination', reason: 'A DoD requirement over the micro-purchase threshold goes to the Small Business Professional (DD Form 2579) before the solicitation.' })
  return out
}

/** The package for a requirement: every document it needs, in the order a Contracting Officer reads them. */
export function packageFor(r: RequirementRow, a: Analysis | undefined): PackageItem[] {
  const value = valueOf(r, a)
  const kind = a?.kind ?? (r.Kind || undefined)
  const out: PackageItem[] = []
  if (isProduct(kind)) out.push({ kind: 'purchaseDescription', label: DOC_LABEL.purchaseDescription, why: 'What the item must do and meet: salient characteristics, not a brand.', producer: 'agent',
    cite: 'FAR 11.102: state needs as functions, performance or essential characteristics.' })
  if (isService(kind)) {
    out.push({ kind: 'pws', label: DOC_LABEL.pws, why: 'What the contractor must achieve and how well, not how to do it.', producer: 'agent',
      cite: 'FAR 37.101-1 and 37.102-1: performance-based acquisition to the maximum extent practicable.' })
    out.push({ kind: 'qasp', label: DOC_LABEL.qasp, why: 'How the government will check each performance standard.', producer: 'agent', cite: 'FAR 46.401(a).' })
  }
  if (has(a, 'brandName')) out.push({ kind: 'brandName', label: DOC_LABEL.brandName, why: 'The need names a brand: say why only it will do, or describe it so others can compete.', producer: 'agent',
    cite: 'Brand-name-only needs a justification posted with the solicitation (FAR 11.204, 6.104). "Brand name or equal" needs none, except at DoD (DFARS 206.103-170(d)).' })
  if (has(a, 'ict')) out.push({ kind: 'section508', label: DOC_LABEL.section508, why: 'Information and communication technology must meet the Section 508 accessibility standards.', producer: 'agent',
    cite: 'FAR 11.102(f) and 39.1; the standards are at 36 CFR 1194.1.' })
  out.push({ kind: 'marketResearch', label: DOC_LABEL.marketResearch, why: value > THRESHOLDS.sat ? 'Who sells it, on which vehicles, and whether small businesses can do it.' : 'A short record of the sources you checked.', producer: 'person',
    cite: 'FAR 10.001: before developing new requirements documents and before acquisitions above the simplified acquisition threshold, documented to suit the size of the buy.' })
  if (value > THRESHOLDS.micro || !value) out.push({ kind: 'igce', label: DOC_LABEL.igce, why: 'The government\u2019s own estimate, with its basis, to judge prices against.', producer: 'person',
    cite: 'Agency policy for supplies and services. The FAR requires an estimate only for construction and architect-engineer work (36.101-6).' })
  if (value > THRESHOLDS.sat) out.push({ kind: 'acquisitionStrategy', label: DOC_LABEL.acquisitionStrategy, why: 'Contract type, vehicle, competition and the set-aside recommendation.', producer: 'person',
    cite: 'FAR 7.102: every acquisition is planned. DoD needs a written plan for services of $50M or more in total, or $25M in a year (DFARS 207.103-70).' })
  if (has(a, 'soleSource') && value > THRESHOLDS.sat) out.push({ kind: 'ja', label: DOC_LABEL.ja, why: 'Only one source is named, so the package must justify not competing.', producer: 'person',
    cite: 'FAR 6.104-1 and 6.104-2; DoD approval levels in DFARS 206.104-71.' })
  if (value > THRESHOLDS.micro && isDod(r.Agency)) out.push({ kind: 'smallBusiness', label: DOC_LABEL.smallBusiness, producer: 'reviewer', who: 'Small Business Professional',
    why: value > THRESHOLDS.sat ? 'Reviewed after you submit (DD Form 2579).' : 'Reviewed after you submit, unless it\u2019s a total small business set-aside.',
    cite: 'FAR 19.104-1 (the rule of two); DoD records the review on DD Form 2579 (PGI 219.102(g)(1)).' })
  out.push({ kind: 'funds', label: DOC_LABEL.funds, why: 'The purchase request, certified after you submit.', producer: 'reviewer', who: 'Resource Manager',
    cite: 'FAR 32.702: written assurance that funds are available before award.' })
  return out
}

/** How far a package is: documents this person or the agent owes that are final or at least drafted. */
export function progressOf(items: PackageItem[], docs: DocRow[]) {
  const mine = items.filter((i) => i.producer !== 'reviewer')
  const done = mine.filter((i) => docs.some((d) => d.Kind === i.kind && d.Text.trim()))
  return { done: done.length, total: mine.length }
}

export const usd = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${n}`

/** A date-only value (yyyy-mm-dd) as a calendar day, read at local noon so no time zone moves it to the day before. */
export const onDay = (ymd?: string) => (ymd ? new Date(`${ymd.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')
