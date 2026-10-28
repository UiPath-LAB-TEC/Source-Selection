// Runs with plain Node (type stripping): `npm test`. The package is the one AW_Robots builds for the incumbent's extension.
import assert from 'node:assert/strict'
import { LETTER_DATE, LETTER_SIGNATURE, signLetter } from './record.ts'
import { DETERMINATION_FILL, FUNDS_FILL, addMonths, choicesFor, determinationText, endAfter, fillDetermination, fundsAllow, fundsFinding,
  linesFor, modificationText, noticeLetter, totalOf } from './options.ts'
import type { FundsCertification, OptionPackage } from './options.ts'

const pkg: OptionPackage = {
  scheduleId: 'W52P1J-22-R-0011-extension-EXT', asOf: '2026-10-27', kind: 'extension', stage: 'extension', title: 'Extension of services', name: 'Extension 1',
  clause: '52.217-8', noticeBy: '2026-10-30', noticeDays: 60, daysLeft: 3, late: false,
  extension: { remaining: 6, used: 0, cap: 6, ratesFrom: 'Option 4' },
  proposal: { months: 1, start: '2027-01-01', end: '2027-01-31', amount: 289_999.99, reason: '', lines: [
    { clin: '0001', description: 'Analytics platform operations', type: 'Firm-fixed-price', monthly: 115_000, amount: 115_000 },
    { clin: '0002', description: 'Data engineering support', type: 'Labor-hour', monthly: 95_833.33, amount: 95_833.33 },
    { clin: '0003', description: 'Cybersecurity and RMF support', type: 'Firm-fixed-price', monthly: 50_833.33, amount: 50_833.33 },
    { clin: '0004', description: 'Program management', type: 'Firm-fixed-price', monthly: 28_333.33, amount: 28_333.33 }] },
  modification: 'P00012', appropriation: 'Operation and maintenance, Army, FY2027',
  successor: { contract: 'W52P1J-27-C-0023', state: 'protest window', stayBy: '2026-11-02' },
  contract: { number: 'W52P1J-22-C-0011', contractor: 'Ostrander Analytics Group Inc', address: '410 Riverbend Parkway, Suite 200, Bettendorf, IA 52722',
    uei: 'OAGX7Q2M4K91', cage: '4QZT7', office: 'Army Contracting Command — Rock Island', agency: 'Department of the Army', end: '2026-12-31', dod: true },
  checks: [], ids: { decision: 'W52P1J-22-R-0011-EXT-1', letter: 'W52P1J-22-R-0011-EXT-1-Notice', modification: 'W52P1J-22-R-0011-P00012' },
}
const funds: FundsCertification = { status: 'Certified', months: 2, amount: 579_999.98, document: 'PR 0012345678', appropriation: pkg.appropriation, by: 'Nadia Sorensen', at: '2026-10-28T15:00:00Z' }

assert.equal(addMonths('2027-01-31', 1), '2027-02-28', 'a shorter month ends on its last day')
assert.equal(endAfter('2027-01-01', 1), '2027-01-31')
assert.equal(endAfter('2027-01-01', 6), '2027-06-30')
assert.equal(totalOf(linesFor(pkg, 2)), 579_999.98, 'two months at the monthly rates (admin.decided_lines)')

// What each choice needs from the funds.
const [extend, decline] = choicesFor(pkg)
assert.equal(extend.needs, 'Certified')
assert.ok(fundsAllow(funds, extend.needs, totalOf(linesFor(pkg, 2))) && !fundsAllow(funds, extend.needs, totalOf(linesFor(pkg, 3))), 'certified for two months, not three')
assert.ok(fundsAllow({ ...funds, status: 'Planned' }, 'Planned', 1) && !fundsAllow({ ...funds, status: 'Planned' }, 'Certified', 1))
assert.ok(fundsAllow(undefined, decline.needs, 0), "declining needs no funds")
assert.deepEqual(choicesFor({ ...pkg, kind: 'option', stage: 'preliminary', name: 'Option 1' }).map((c) => c.outcome), ['Notice sent', 'Not exercised'])

// The determination and findings: the blanks filled, signed.
const draft = `DETERMINATION AND FINDINGS\n\n2. Funds (FAR 17.204-1(b)(2)). ${FUNDS_FILL}\n\nDetermination\n\n${DETERMINATION_FILL}\n\n${LETTER_DATE}\n${LETTER_SIGNATURE}`
const memo = signLetter(fillDetermination(draft, fundsFinding(funds, pkg), determinationText(pkg, 'Exercised', 1, false)), 'Dana Whitfield', 'October 28, 2026')
assert.ok(memo.includes('Nadia Sorensen, Resource Manager, certified $579,999.98 on Oct 28, 2026 for 2 months') && memo.includes('funding document PR 0012345678'))
assert.ok(memo.includes('for 1 month, Jan 1, 2027 through Jan 31, 2027') && memo.includes('a total of $289,999.99') && memo.endsWith('/s/ Dana Whitfield'))
assert.ok(!memo.includes(FUNDS_FILL) && !memo.includes(DETERMINATION_FILL))
assert.ok(determinationText(pkg, 'Not exercised', 0, false, 'Keystone takes over Jan 1.').endsWith('Keystone takes over Jan 1.'))
assert.ok(determinationText(pkg, 'Exercised', 1, true).includes('bilateral modification with Ostrander Analytics Group Inc'))

// The notice and the modification.
const notice = noticeLetter(pkg, 'Exercised', 1, false)
assert.equal(notice.kind, 'ExtensionNotice')
assert.ok(notice.text.includes('for 1 month, from Jan 1, 2027 through Jan 31, 2027') && notice.text.includes('1 of the 6 months the clause allows is used') && notice.text.includes('Modification P00012'))
assert.ok(notice.text.includes(LETTER_DATE) && notice.text.includes(LETTER_SIGNATURE) && notice.text.includes('by Oct 30, 2026'))
assert.ok(noticeLetter(pkg, 'Exercised', 1, true).text.includes('please sign and return it'))
const declined = noticeLetter(pkg, 'Not exercised', 0, false)
assert.ok(declined.kind === 'OptionNotExercised' && declined.text.includes('ends Dec 31, 2026') && declined.text.includes('follow-on contractor'))
const prelim = noticeLetter({ ...pkg, kind: 'option', stage: 'preliminary', name: 'Option 1', exerciseBy: '2027-10-22',
  proposal: { ...pkg.proposal, start: '2027-10-23', end: '2028-10-22' } }, 'Notice sent', 12, false)
assert.ok(prelim.kind === 'PreliminaryNotice' && prelim.text.includes('does not commit the Government') && prelim.text.includes('on Oct 22, 2027'))
const mod = modificationText(pkg, 2, funds, false)
assert.ok(mod.includes('Modification number: P00012') && mod.includes('Unilateral, under FAR 52.217-8') && mod.includes('Total  $579,999.98'))
assert.ok(mod.includes('Jan 1, 2027 through Feb 28, 2027 (Extension 1), at the rates of option 4') && mod.includes('funding document PR 0012345678'))
assert.ok(modificationText(pkg, 1, funds, true).includes('Accepted for Ostrander Analytics Group Inc'))

console.log('option checks pass')
