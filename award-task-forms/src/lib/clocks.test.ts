// Runs with plain Node (type stripping): `npm test`. The same cases run against AW_Robots/clocks.py in pytest.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { addBusinessDays, addCalendarDays, awardClocks, dayOf, priorBusinessDay } from './clocks.ts'

const cases = JSON.parse(readFileSync(new URL('./clock-cases.json', import.meta.url), 'utf8'))

for (const c of cases.calendar) assert.equal(addCalendarDays(c.from, c.n), c.expect, `calendar ${c.from} + ${c.n}: ${c.why}`)
for (const c of cases.business) assert.equal(addBusinessDays(c.from, c.n), c.expect, `business ${c.from} + ${c.n}: ${c.why}`)
for (const c of cases.dayOf) assert.equal(dayOf(c.iso), c.expect, `dayOf ${c.iso}`)
for (const c of cases.award) assert.deepEqual(awardClocks(c.awardedAt, c.notices), c.expect)
for (const c of cases.priorBusiness) assert.equal(priorBusinessDay(c.day), c.expect, `prior business day ${c.day}: ${c.why}`)

console.log(`clock cases pass (${cases.calendar.length + cases.business.length + cases.dayOf.length + cases.award.length + cases.priorBusiness.length})`)
