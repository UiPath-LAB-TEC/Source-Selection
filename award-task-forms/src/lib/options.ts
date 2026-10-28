import { LETTER_DATE, LETTER_SIGNATURE } from './record.ts'

/*
 * An option or the 52.217-8 extension of services, as AW_Robots PrepareOptionPackage prepares it (admin.option_package)
 * and the two forms finish it: the Resource Manager certifies the funds (certifyFunds), the Contracting Officer decides
 * and signs (optionDecision). The package lives on the option's or extension's schedule row (SSSchedule.ReviewJson);
 * the draft determination is an SSDecision the robot wrote. The notice and the modification are written here, from the
 * CO's choice, and AW_Robots files them (IssueOptionExercise, IssuePreliminaryNotice, RecordNotExercised).
 */

export type CheckStatus = 'Met' | 'Not met' | 'To confirm' | 'Not required'

/** One check FAR 17.204-1(b) or DFARS 217.207(c) asks for, as the robot found it, with its source. */
export interface OptionCheck { id: string; label: string; rule: string; status: CheckStatus; finding: string; source: string }

export interface OptionLine { clin: string; description?: string; type?: string; monthly: number; amount: number }

export interface FundsCertification {
  /** Certified: available now. Planned: in the budget, enough for a preliminary notice. */
  status: 'Certified' | 'Planned' | 'Not available'
  months?: number
  amount: number
  document?: string
  appropriation?: string
  note?: string
  by: string
  at: string
}

export type Outcome = 'Exercised' | 'Notice sent' | 'Not exercised'

/** What the CO decided, as the issue steps read it. */
export interface OptionDecisionRecord {
  outcome: Outcome
  period: string
  months: number
  start?: string
  end?: string | null
  amount: number
  bilateral: boolean
  decisionId: string
  letterId: string
  modificationId?: string
  number?: string
  appropriation?: string
  document?: string
  reason?: string
  by: string
  at: string
}

export interface OptionPackage {
  scheduleId: string
  asOf: string
  kind: 'extension' | 'option'
  stage: 'extension' | 'preliminary' | 'exercise'
  title: string
  /** The period this would add or exercise: "Extension 1", "Option 1". */
  name: string
  clause: string
  clauseText?: string
  noticeBy: string
  noticeDays?: number
  exerciseBy?: string
  daysLeft: number
  late: boolean
  extension?: { remaining: number; used: number; cap: number; ratesFrom: string }
  proposal: { months: number; start: string; end: string | null; amount: number; reason: string; lines: OptionLine[] }
  modification: string
  appropriation: string
  successor?: { contract: string; contractor?: string; state: 'stayed' | 'protest window' | 'under way'; stayBy?: string; transitionInDone?: string } | null
  contract: { number: string; contractor: string; address?: string; uei?: string; cage?: string; title?: string; agency?: string; office?: string; end?: string; currentPeriod?: string; dod: boolean }
  checks: OptionCheck[]
  writer?: {
    recommendation?: string | null; recommendedMonths?: number | null; reason?: string; summary?: string; risks?: string[]
    drafted?: Record<string, { sources: string[]; note?: string }>; agent?: boolean
  }
  ids: { decision: string; letter: string; modification: string }
  history?: Record<string, unknown>[]
  funds?: FundsCertification
  decision?: OptionDecisionRecord
}

export const parsePackage = (s?: string | null): OptionPackage | undefined => {
  try {
    const p = s ? (JSON.parse(s) as OptionPackage) : undefined
    return p && Array.isArray(p.checks) ? p : undefined
  } catch { return undefined }
}

/** The draft determination's two blanks, filled from the Resource Manager's step and the CO's decision (admin.FUNDS_FILL). */
export const FUNDS_FILL = '[Funds certification]'
export const DETERMINATION_FILL = '[Determination]'

export const money = (n?: number | null, cents = false) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })

const at = (d: string) => new Date(`${d}T12:00:00Z`)
/** "Jan 31, 2027". */
export const showDay = (d?: string | null) => (d ? at(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—')
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** The same day `n` months later, or the month's last day when it's shorter (admin.add_months). */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number)
  const total = m - 1 + n
  const year = y + Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}
const addDays = (day: string, n: number) => new Date(at(day).getTime() + n * 86_400_000).toISOString().slice(0, 10)

/** The last day of an extension of `months` from `start`. */
export const endAfter = (start: string, months: number) => addDays(addMonths(start, months), -1)

/** Each line item's amount for a length: an extension at its monthly rates, an option at its prices (admin.decided_lines). */
export function linesFor(pkg: OptionPackage, months: number): OptionLine[] {
  return pkg.kind === 'extension' ? pkg.proposal.lines.map((x) => ({ ...x, amount: Math.round(x.monthly * months * 100) / 100 })) : pkg.proposal.lines
}
export const totalOf = (lines: OptionLine[]) => Math.round(lines.reduce((s, x) => s + x.amount, 0) * 100) / 100

/** What the CO can choose at this stage, and what each needs from the funds. */
export function choicesFor(pkg: OptionPackage): { outcome: Outcome; label: string; needs?: 'Certified' | 'Planned' }[] {
  if (pkg.stage === 'extension') return [{ outcome: 'Exercised', label: 'Extend', needs: 'Certified' }, { outcome: 'Not exercised', label: "Don't extend" }]
  if (pkg.stage === 'preliminary') return [{ outcome: 'Notice sent', label: 'Send the preliminary notice', needs: 'Planned' }, { outcome: 'Not exercised', label: "Don't exercise" }]
  return [{ outcome: 'Exercised', label: `Exercise ${pkg.name.toLowerCase()}`, needs: 'Certified' }, { outcome: 'Not exercised', label: "Don't exercise" }]
}

/** Whether the funds the Resource Manager gave allow a choice: certified for an exercise, at least planned for a notice. */
export function fundsAllow(f: FundsCertification | undefined, needs: 'Certified' | 'Planned' | undefined, amount: number): boolean {
  if (!needs) return true
  if (!f) return false
  if (needs === 'Planned') return f.status === 'Certified' || f.status === 'Planned'
  return f.status === 'Certified' && f.amount + 0.005 >= amount
}

/** The funds finding, as the determination states it. */
export function fundsFinding(f: FundsCertification | undefined, pkg: OptionPackage): string {
  if (!f) return 'The Resource Manager has not certified the funds.'
  const day = showDay(f.at.slice(0, 10))
  if (f.status === 'Certified') {
    return `${f.by}, Resource Manager, certified ${money(f.amount, true)} on ${day}${f.months && pkg.kind === 'extension' ? ` for ${plural(f.months, 'month')}` : ` for ${pkg.name.toLowerCase()}`}`
      + `${f.appropriation ? `, ${f.appropriation}` : ''}${f.document ? `, funding document ${f.document}` : ''}. Funds are available.`
  }
  if (f.status === 'Planned') {
    return `${f.by}, Resource Manager, confirmed on ${day} that ${money(f.amount)} is planned${f.appropriation ? ` in ${f.appropriation}` : ''} but not yet available.`
      + ' Funds must be certified before the option is exercised.'
  }
  return `${f.by}, Resource Manager, reported on ${day} that funds are not available${f.note ? `: ${f.note}` : ''}.`
}

/** The determination paragraph for the CO's choice. */
export function determinationText(pkg: OptionPackage, outcome: Outcome, months: number, bilateral: boolean, reason = ''): string {
  const c = pkg.contract
  if (outcome === 'Not exercised') {
    const what = pkg.kind === 'extension' ? 'the option to extend services under FAR 52.217-8' : `${pkg.name.toLowerCase()} under FAR 52.217-9`
    return `I have decided not to exercise ${what}. ${reason.trim()}`.trim()
  }
  if (outcome === 'Notice sent') {
    return `I intend to exercise ${pkg.name.toLowerCase()}, ${showDay(pkg.proposal.start)} through ${showDay(pkg.proposal.end)}, and give ${c.contractor} the preliminary written `
      + `notice of intent under FAR 52.217-9(a). The notice does not commit the Government. Funds will be certified and these findings confirmed before the option is exercised.`
  }
  const lines = linesFor(pkg, months)
  const end = pkg.kind === 'extension' ? endAfter(pkg.proposal.start, months) : pkg.proposal.end
  const what = pkg.kind === 'extension'
    ? `the option to extend services under FAR 52.217-8 for ${plural(months, 'month')}, ${showDay(pkg.proposal.start)} through ${showDay(end)}, at the contract's rates`
    : `${pkg.name.toLowerCase()}, ${showDay(pkg.proposal.start)} through ${showDay(end)}, at the prices in the contract`
  return `Based on these findings, I determine that exercising ${what}, a total of ${money(totalOf(lines), true)}, is in accordance with the terms of the contract and `
    + `FAR 17.204-1, and is in the Government's best interest.`
    + (bilateral ? ` The notice period closed ${showDay(pkg.noticeBy)}, so it is made by bilateral modification with ${c.contractor}'s agreement.` : '')
}

/** The draft determination with its two blanks filled. */
export const fillDetermination = (draft: string, funds: string, determination: string) =>
  draft.split(FUNDS_FILL).join(funds).split(DETERMINATION_FILL).join(determination)

function letterhead(pkg: OptionPackage) {
  const c = pkg.contract
  return [`${c.office ?? ''}\n${c.agency ?? ''}`, LETTER_DATE, `${c.contractor}\n${c.address ?? ''}`].join('\n\n')
}

/** The letter to the contractor for the CO's choice: its kind (SSCorrespondence.Kind) and text, signed on release. */
export function noticeLetter(pkg: OptionPackage, outcome: Outcome, months: number, bilateral: boolean): { kind: string; title: string; text: string } {
  const c = pkg.contract
  const sign = `${LETTER_SIGNATURE}\nContracting Officer, ${c.office ?? ''}`
  if (outcome === 'Not exercised') {
    const what = pkg.kind === 'extension' ? 'its option to extend services under clause 52.217-8' : `${pkg.name.toLowerCase()} under clause 52.217-9`
    return { kind: 'OptionNotExercised', title: 'Option not exercised', text: [letterhead(pkg),
      `Subject: Contract ${c.number}: ${pkg.kind === 'extension' ? 'the option to extend services' : pkg.name.toLowerCase()} will not be exercised`,
      `The Government will not exercise ${what}. Contract ${c.number} ends ${showDay(pkg.kind === 'extension' ? c.end : addDays(pkg.proposal.start, -1))}.`
      + (pkg.successor ? ' Please complete the transition of the work to the follow-on contractor by that date.' : ''),
      sign].join('\n\n') }
  }
  if (outcome === 'Notice sent') {
    return { kind: 'PreliminaryNotice', title: 'Preliminary notice of intent', text: [letterhead(pkg),
      `Subject: Contract ${c.number}: preliminary notice of intent to exercise ${pkg.name.toLowerCase()}`,
      `Under clause 52.217-9(a), Option to Extend the Term of the Contract, the Government gives you preliminary written notice of its intent to extend the term of `
      + `contract ${c.number} by exercising ${pkg.name.toLowerCase()}, ${showDay(pkg.proposal.start)} through ${showDay(pkg.proposal.end)}.`,
      `This preliminary notice does not commit the Government to an extension. If the option is exercised, it will be by written notice before the current period `
      + `ends${pkg.exerciseBy ? ` on ${showDay(pkg.exerciseBy)}` : ''}.`,
      sign].join('\n\n') }
  }
  const end = pkg.kind === 'extension' ? endAfter(pkg.proposal.start, months) : pkg.proposal.end
  const amount = totalOf(linesFor(pkg, months))
  const body = pkg.kind === 'extension'
    ? `Under clause 52.217-8, Option to Extend Services, the Government exercises its option to require continued performance of the services under contract ${c.number} `
      + `for ${plural(months, 'month')}, from ${showDay(pkg.proposal.start)} through ${showDay(end)}, within the limits and at the rates specified in the contract (${money(amount, true)}). `
      + `With this extension, ${(pkg.extension?.used ?? 0) + months} of the ${pkg.extension?.cap ?? 6} months the clause allows ${(pkg.extension?.used ?? 0) + months === 1 ? 'is' : 'are'} used.`
    : `Under clause 52.217-9, Option to Extend the Term of the Contract, the Government exercises ${pkg.name.toLowerCase()}, extending the term of contract ${c.number} `
      + `from ${showDay(pkg.proposal.start)} through ${showDay(end)} at the prices in the contract (${money(amount, true)}).`
  return { kind: pkg.kind === 'extension' ? 'ExtensionNotice' : 'OptionNotice', title: 'Notice of option exercise', text: [letterhead(pkg),
    `Subject: Contract ${c.number}: exercise of ${pkg.kind === 'extension' ? 'the option to extend services (FAR 52.217-8)' : `${pkg.name.toLowerCase()} (FAR 52.217-9)`}`,
    `${body} Modification ${pkg.modification} is enclosed.`,
    bilateral
      ? `The period the contract sets for this notice closed ${showDay(pkg.noticeBy)}, so the modification is bilateral: please sign and return it to confirm your agreement.`
      : `This notice is given within the period the contract sets, by ${showDay(pkg.noticeBy)}.`,
    sign].join('\n\n') }
}

/** The modification that exercises the option: a summary in the shape of a Standard Form 30's blocks (synthetic demo). */
export function modificationText(pkg: OptionPackage, months: number, funds: FundsCertification | undefined, bilateral: boolean): string {
  const c = pkg.contract
  const lines = linesFor(pkg, months)
  const end = pkg.kind === 'extension' ? endAfter(pkg.proposal.start, months) : pkg.proposal.end
  const authority = pkg.kind === 'extension' ? 'FAR 52.217-8, Option to Extend Services' : 'FAR 52.217-9, Option to Extend the Term of the Contract'
  return [
    'MODIFICATION OF CONTRACT (summary in the form of a Standard Form 30; synthetic demo)',
    `Modification number: ${pkg.modification}\nContract: ${c.number}\nEffective date: ${LETTER_DATE}\nIssued by: ${c.office ?? ''}, ${c.agency ?? ''}`,
    `Contractor: ${c.contractor}\n${c.address ?? ''}${c.uei ? `\nUEI ${c.uei}${c.cage ? ` · CAGE ${c.cage}` : ''}` : ''}`,
    `Type: ${bilateral ? `Bilateral, with the contractor's agreement (the notice period under ${pkg.clause} closed ${showDay(pkg.noticeBy)})` : `Unilateral, under ${authority}`}`,
    `1. ${pkg.kind === 'extension'
      ? `The period of performance is extended for ${plural(months, 'month')}, ${showDay(pkg.proposal.start)} through ${showDay(end)} (${pkg.name}), at the rates of ${pkg.extension?.ratesFrom?.toLowerCase() ?? 'the current period'}.`
      : `${pkg.name} is exercised. Performance continues ${showDay(pkg.proposal.start)} through ${showDay(end)}.`}`,
    `2. Line items for ${pkg.name}:\n${lines.map((x) => `CLIN ${x.clin}  ${x.description ?? ''} (${(x.type ?? '').toLowerCase()})  ${money(x.amount, true)}`).join('\n')}\nTotal  ${money(totalOf(lines), true)}`,
    `3. Funds obligated by this modification: ${money(totalOf(lines), true)}${funds?.appropriation ? `, ${funds.appropriation}` : ''}${funds?.document ? `, funding document ${funds.document}` : ''}.`,
    '4. Except as provided here, all terms and conditions of the contract remain unchanged and in full force and effect.',
    `${LETTER_SIGNATURE}\nContracting Officer, ${c.office ?? ''}`
    + (bilateral ? `\n\nAccepted for ${c.contractor}:\n______________________  Date: __________` : ''),
  ].join('\n\n')
}
