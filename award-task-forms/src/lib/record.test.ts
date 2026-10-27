// Runs with plain Node (type stripping): `npm test`.
import assert from 'node:assert/strict'
import { LETTER_DATE, LETTER_SIGNATURE, KIND, noticeChecks, signLetter } from './record.ts'

const awardee = { name: 'Keystone Ridge Analytics LLC', address: '1200 Arsenal Way, Suite 410, Moline, IL 61265' }
const notice = [
  'Subject: Notice of award', '1. Offerors solicited: the solicitation was posted publicly on SAM.gov.', '2. Proposals received: 3.',
  `3. Awardee: ${awardee.name}, ${awardee.address}.`, '4. Items and prices awarded:\nTotal contract price  $19,300,000',
  '5. Why your proposal was not selected: rated higher on Technical Approach.', 'To request a debriefing, write to the Contracting Officer.',
  `${LETTER_DATE}\n${LETTER_SIGNATURE}`,
].join('\n\n')

const failing = (text: string, others: string[] = []) => noticeChecks(KIND.notice, text, awardee, 'W52P1J-27-C-0023', others).filter((c) => !c.ok).map((c) => c.label)

assert.deepEqual(failing(notice), [], 'a complete notice passes every check')
assert.deepEqual(failing(notice.replace('2. Proposals received: 3.', '')), ['Proposals received'])
assert.deepEqual(failing(notice.replace(awardee.address, '')), ['Awardee name and address'])
assert.deepEqual(failing(`${notice} Ironwood Federal Solutions Inc`, ['Ironwood Federal Solutions Inc']), ['No other offeror named'])
assert.deepEqual(noticeChecks(KIND.awardNotice, 'Contract W52P1J-27-C-0023, $19,300,000', awardee, 'W52P1J-27-C-0023', []).every((c) => c.ok), true)

const signed = signLetter(notice, 'Dana Whitfield', 'October 22, 2026')
assert.ok(signed.includes('October 22, 2026\n/s/ Dana Whitfield') && !signed.includes(LETTER_DATE) && !signed.includes(LETTER_SIGNATURE), 'signing fills date and signature')

console.log('record checks pass')
