/**
 * The Award phase's statutory clocks. Pure date arithmetic on agency-local calendar days ('YYYY-MM-DD'), mirrored line
 * for line in Award/AW_Robots/clocks.py; both run the cases in clock-cases.json, so the robot that files a deadline and
 * the screen that shows it always agree.
 *
 * Counting rule: days are calendar days, and a period that ends on a Saturday, Sunday or federal holiday runs to the
 * next business day (FAR 33.102(a) under the RFO deviation; 4 CFR 21.0(d)). FAR 15.207-2(a) applies the same rule to
 * the Part 15 notice and debriefing periods. DoD's follow-up questions count business days instead (DFARS 215.301-270).
 */

export type Day = string

/** Federal agencies keep Eastern time on the record's dates, so a notice sent at 10 p.m. ET counts that day. */
const TIME_ZONE = 'America/New_York'

const parse = (d: Day) => { const [y, m, n] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, n)) }
const format = (d: Date) => d.toISOString().slice(0, 10)
const shift = (d: Day, n: number) => { const x = parse(d); x.setUTCDate(x.getUTCDate() + n); return format(x) }
const weekday = (d: Day) => parse(d).getUTCDay()

/** The agency-local calendar day of a timestamp. */
export function dayOf(iso: string): Day {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

/** The nth (1-based) `dow` (0 = Sunday) of a month, or the last when n is -1. */
function nth(year: number, month: number, dow: number, n: number): Day {
  if (n === -1) {
    const last = new Date(Date.UTC(year, month, 0))
    last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() - dow + 7) % 7))
    return format(last)
  }
  const first = new Date(Date.UTC(year, month - 1, 1))
  first.setUTCDate(1 + ((dow - first.getUTCDay() + 7) % 7) + (n - 1) * 7)
  return format(first)
}

/** A fixed-date holiday on a weekend is observed the Friday before or the Monday after (5 U.S.C. 6103(b)). */
const observed = (d: Day) => (weekday(d) === 6 ? shift(d, -1) : weekday(d) === 0 ? shift(d, 1) : d)

/** The federal holidays of a year (5 U.S.C. 6103(a)), as observed. */
export function federalHolidays(year: number): Set<Day> {
  const fixed = (m: number, d: number) => observed(`${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  return new Set([
    fixed(1, 1), nth(year, 1, 1, 3), nth(year, 2, 1, 3), nth(year, 5, 1, -1), fixed(6, 19), fixed(7, 4),
    nth(year, 9, 1, 1), nth(year, 10, 1, 2), fixed(11, 11), nth(year, 11, 4, 4), fixed(12, 25),
  ])
}

export function isBusinessDay(d: Day): boolean {
  const dow = weekday(d)
  if (dow === 0 || dow === 6) return false
  const y = Number(d.slice(0, 4))
  // New Year's Day on a Saturday is observed on December 31 of the year before.
  return !federalHolidays(y).has(d) && !federalHolidays(y + 1).has(d)
}

/** `n` calendar days after `from`, run forward to the next business day if it lands on a weekend or holiday. */
export function addCalendarDays(from: Day, n: number): Day {
  let d = shift(from, n)
  while (!isBusinessDay(d)) d = shift(d, 1)
  return d
}

/**
 * A contract deadline on a weekend or federal holiday moves back to the business day before, so whoever must act does
 * it in time (the administration alerts). The protest-counting rule above runs the other way: there the rule gives the extra day.
 */
export function priorBusinessDay(day: Day): Day {
  let d = day
  while (!isBusinessDay(d)) d = shift(d, -1)
  return d
}

/** `n` business days after `from`. */
export function addBusinessDays(from: Day, n: number): Day {
  let d = from
  for (let left = n; left > 0;) { d = shift(d, 1); if (isBusinessDay(d)) left-- }
  return d
}

export interface NoticeForClocks { offerorId: string; kind: string; deliveredAt?: string }

/** The deadlines stored in SSAward.ClocksJson. Each is a 'YYYY-MM-DD' agency-local day. */
export interface AwardClocks {
  /** Notices to unsuccessful offerors are due within 3 days after award (FAR 15.207-2(b)). */
  noticesDue?: Day
  /** An unsuccessful offeror may request a debriefing within 3 days after receiving its notice (FAR 15.301-1(a)(1)). */
  requestDue: Record<string, Day>
  /** A GAO protest stays performance if GAO's notice arrives within 10 days after award (31 U.S.C. 3553(d)(4)(A)), or later after a debriefing. */
  stayByAward?: Day
}

export function awardClocks(awardedAt: string | undefined, notices: NoticeForClocks[]): AwardClocks {
  const award = awardedAt ? dayOf(awardedAt) : undefined
  const requestDue: Record<string, Day> = {}
  for (const n of notices) if (n.kind === 'UnsuccessfulNotice' && n.deliveredAt) requestDue[n.offerorId] = addCalendarDays(dayOf(n.deliveredAt), 3)
  return {
    ...(award ? { noticesDue: addCalendarDays(award, 3), stayByAward: addCalendarDays(award, 10) } : {}),
    requestDue,
  }
}
