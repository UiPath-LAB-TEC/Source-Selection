import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { CircleAlert } from 'lucide-react'
import { Card, CardContent } from '@uipath/apollo-wind/components/ui/card'
import { Info } from '@forms/components/Bits'
import { dayOf } from '@award/lib/clocks'
import { Section } from '@ss/components/Bits'
import { money } from '@ss/lib/eval'
import type { FundingRow, FundsLine, FundsSummary } from '../lib/award'

const fmt = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')
const ms = (d: string) => Date.parse(`${d}T12:00:00`)
const addDays = (d: string, n: number) => new Date(ms(d) + n * 86_400_000).toISOString().slice(0, 10)
/** Round tick values: a 1, 2, 2.5 or 5 step that gives about `count` ticks from zero past `max`. */
function niceTicks(max: number, count = 5) {
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step)
}
const compact = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`)

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(640)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return { ref, w }
}

interface Point { day: string; value: number; forecast?: boolean }

/**
 * One line item's spending through its period: invoiced to date (solid, with a light wash), the forecast at the recent
 * rate (dashed), and the obligated funds, the ceiling and its 85% mark as labelled reference lines. A crosshair snaps to
 * each invoiced month and each forecast month-end.
 */
function SpendChart({ line, invoices, periodStart, today }: { line: FundsLine; invoices: FundingRow[]; periodStart: string; today: string }) {
  const { ref, w } = useWidth()
  const [hover, setHover] = useState<number>()
  const h = 260
  const pad = { l: 52, r: 96, t: 14, b: 28 }
  const actual: Point[] = useMemo(() => {
    let sum = 0
    const pts: Point[] = [{ day: addDays(periodStart, -1), value: 0 }]
    for (const f of [...invoices].sort((a, b) => (a.ServiceEnd ?? '').localeCompare(b.ServiceEnd ?? ''))) {
      sum += f.Amount ?? 0
      pts.push({ day: f.ServiceEnd!, value: sum })
    }
    return pts
  }, [invoices, periodStart])
  const forecast: Point[] = useMemo(() => {
    const pts: Point[] = [{ day: line.through, value: line.invoiced, forecast: true }]
    let d = line.through
    while (d < line.periodEnd) {
      // The next month-end after d (the last day of d's month when d isn't already one), up to the period end.
      const x = new Date(ms(d))
      const monthEnd = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
      const next = monthEnd > d ? monthEnd : new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 2, 0)).toISOString().slice(0, 10)
      d = next > line.periodEnd ? line.periodEnd : next
      pts.push({ day: d, value: line.invoiced + line.perDay * Math.round((ms(d) - ms(line.through)) / 86_400_000), forecast: true })
    }
    return pts
  }, [line])
  const labor = line.type === 'Labor-hour'
  const refs = [
    { label: 'Obligated', value: line.obligated, tone: 'var(--foreground)', dash: undefined, weight: 1.5 },
    ...(labor ? [{ label: 'Ceiling', value: line.price, tone: 'var(--muted-foreground)', dash: undefined, weight: 1 },
      { label: '85% of ceiling', value: line.price * 0.85, tone: 'var(--muted-foreground)', dash: '2 3', weight: 1 }] : []),
  ]
  // Reference labels sit at their line, nudged apart when two lines are within a label's height of each other.
  const x0 = ms(addDays(periodStart, -1))
  const x1 = ms(line.periodEnd)
  const ticks = niceTicks(Math.max(line.atPeriodEnd, line.price, line.obligated) * 1.04)
  const yMax = ticks.at(-1)!
  const X = (d: string) => pad.l + ((ms(d) - x0) / (x1 - x0)) * (w - pad.l - pad.r)
  const Y = (v: number) => pad.t + (1 - v / yMax) * (h - pad.t - pad.b)
  const path = (pts: Point[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.day).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ')
  const area = `${path(actual)} L${X(actual.at(-1)!.day).toFixed(1)},${Y(0)} L${X(actual[0].day).toFixed(1)},${Y(0)} Z`
  const months = useMemo(() => {
    const out: string[] = []
    const d = new Date(ms(periodStart)); d.setUTCDate(1)
    while (d.toISOString().slice(0, 10) <= line.periodEnd) { const s = d.toISOString().slice(0, 10); if (s >= periodStart) out.push(s); d.setUTCMonth(d.getUTCMonth() + 1) }
    return out
  }, [periodStart, line.periodEnd])
  const labelled = [...refs].sort((a, b) => b.value - a.value).reduce<(typeof refs[number] & { at: number })[]>((out, r) => {
    const want = Y(r.value)
    const prev = out.at(-1)
    return [...out, { ...r, at: prev && want - prev.at < 12 ? prev.at + 12 : want }]
  }, [])
  const step = Math.ceil(months.length / Math.max(2, Math.floor((w - pad.l - pad.r) / 56)))
  const points = [...actual.slice(1), ...forecast.slice(1)]
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * w
    let best = 0
    points.forEach((p, i) => { if (Math.abs(X(p.day) - px) < Math.abs(X(points[best].day) - px)) best = i })
    setHover(best)
  }
  const hp = hover !== undefined ? points[hover] : undefined
  const runOut = line.runOut && line.runOut < line.periodEnd ? line.runOut : undefined
  const ceilingHit = labor && line.day100 && line.day100 < line.periodEnd ? line.day100 : undefined
  const legend = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke="var(--ss-brand-2)" strokeWidth="2" strokeLinecap="round" /></svg>Invoiced</span>
      <span className="inline-flex items-center gap-1.5"><svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke="var(--ss-brand-2)" strokeWidth="2" strokeDasharray="4 3" /></svg>Forecast at the recent rate</span>
    </div>
  )

  return (
    <div ref={ref} className="relative space-y-2">
      {legend}
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" className="block touch-none select-none"
        aria-label={`Line item ${line.clin}: ${money(line.invoiced)} invoiced through ${fmt(line.through)}, forecast ${money(line.atPeriodEnd)} by ${fmt(line.periodEnd)}, against ${money(line.obligated)} obligated`}
        onPointerMove={onMove} onPointerLeave={() => setHover(undefined)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeWidth="1" />
            <text x={pad.l - 8} y={Y(v)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">{compact(v)}</text>
          </g>
        ))}
        {months.filter((_, i) => i % step === 0).map((m) => (
          <text key={m} x={X(m)} y={h - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {new Date(`${m}T12:00:00`).toLocaleDateString('en-US', { month: 'short' })}
          </text>
        ))}
        {labelled.map((r) => (
          <g key={r.label}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(r.value)} y2={Y(r.value)} stroke={r.tone} strokeWidth={r.weight} strokeDasharray={r.dash} opacity={0.7} />
            <text x={w - pad.r + 6} y={r.at} dy="0.32em" className="fill-muted-foreground text-[10px]">{r.label}</text>
          </g>
        ))}
        {today >= periodStart && today <= line.periodEnd && (
          <g>
            <line x1={X(today)} x2={X(today)} y1={pad.t} y2={h - pad.b} stroke="var(--muted-foreground)" strokeWidth="1" opacity={0.5} />
            <text x={X(today)} y={pad.t - 3} textAnchor="middle" className="fill-muted-foreground text-[10px]">Today</text>
          </g>
        )}
        <path d={area} fill="var(--ss-brand-2)" opacity={0.1} />
        <path d={path(actual)} fill="none" stroke="var(--ss-brand-2)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={path(forecast)} fill="none" stroke="var(--ss-brand-2)" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
        {[runOut && { day: runOut, value: line.obligated, label: 'Funds run out' }, ceilingHit && { day: ceilingHit, value: line.price, label: 'Ceiling reached' }]
          .filter(Boolean).map((m) => m && (
            <g key={m.label}>
              <circle cx={X(m.day)} cy={Y(m.value)} r={6} fill="var(--card)" />
              <circle cx={X(m.day)} cy={Y(m.value)} r={4} fill="var(--ss-serious)" />
            </g>
          ))}
        {hp && (
          <g pointerEvents="none">
            <line x1={X(hp.day)} x2={X(hp.day)} y1={pad.t} y2={h - pad.b} stroke="var(--foreground)" strokeWidth="1" opacity={0.25} />
            <circle cx={X(hp.day)} cy={Y(hp.value)} r={6} fill="var(--card)" />
            <circle cx={X(hp.day)} cy={Y(hp.value)} r={4} fill="var(--ss-brand-2)" />
          </g>
        )}
      </svg>
      {hp && (
        <div className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: Math.min(Math.max(X(hp.day) - 80, 0), w - 170), top: 18 }}>
          <p className="font-medium">{hp.forecast ? 'Forecast' : 'Invoiced'} through {fmt(hp.day)}</p>
          <p className="tabular-nums text-muted-foreground">{money(Math.round(hp.value))} of {money(line.obligated)} obligated</p>
        </div>
      )}
      {(runOut || ceilingHit) && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {runOut && <span className="inline-flex items-center gap-1"><CircleAlert className="h-3.5 w-3.5 text-[var(--ss-serious)]" aria-hidden />Funds run out around {fmt(runOut)}</span>}
          {ceilingHit && <span className="inline-flex items-center gap-1"><CircleAlert className="h-3.5 w-3.5 text-[var(--ss-serious)]" aria-hidden />Ceiling reached around {fmt(ceilingHit)}</span>}
        </p>
      )}
    </div>
  )
}

/**
 * The contract's money in its current period, as the watch forecast it: per line item the price (or labor-hour
 * ceiling), obligated, invoiced and the forecast at the period end; a chart of one line item; and the period's
 * obligations and invoices.
 */
export function FundsPanel({ funds, funding }: { funds?: FundsSummary; funding: FundingRow[] }) {
  const today = dayOf(new Date().toISOString())
  const lines = funds?.lines ?? []
  const first = lines.find((l) => (l.runOut && l.runOut < l.periodEnd) || (l.type === 'Labor-hour' && l.day85 && l.day85 <= l.periodEnd)) ?? lines[0]
  const [pick, setPick] = useState<string>()
  const line = lines.find((l) => l.clin === pick) ?? first
  if (!funds || !line) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">The contract watch hasn't forecast this contract's funds yet. It runs every morning.</CardContent></Card>
  }
  const period = funds.period ?? line.period
  const here = funding.filter((f) => f.Period === period)
  const invoices = here.filter((f) => f.Kind === 'Invoice')
  const byRef = Object.values(invoices.reduce<Record<string, FundingRow[]>>((acc, f) => { (acc[f.Reference] ??= []).push(f); return acc }, {}))
    .sort((a, b) => (b[0].ServiceEnd ?? '').localeCompare(a[0].ServiceEnd ?? ''))
  const obligations = here.filter((f) => f.Kind === 'Obligation' || f.Kind === 'Deobligation').sort((a, b) => (a.ReceivedDay ?? '').localeCompare(b.ReceivedDay ?? ''))
  const flagged = (l: FundsLine) => (l.runOut && l.runOut < l.periodEnd) || (l.type === 'Labor-hour' && !!l.day85 && l.day85 <= l.periodEnd)

  return (
    <div className="space-y-6">
      <Section title={`Funds in ${period?.toLowerCase().startsWith('option') ? period : `the ${period?.toLowerCase()} period`}`}
        description={`${fmt(funds.periodStart)} to ${fmt(funds.periodEnd)}. The forecast runs at the average of the last three invoiced months.`}>
        <Card><CardContent className="space-y-5 p-5">
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Line item</th>
                  <th className="py-2 pr-3 text-right font-medium">Price or ceiling</th>
                  <th className="py-2 pr-3 text-right font-medium">Obligated</th>
                  <th className="py-2 pr-3 text-right font-medium">Invoiced</th>
                  <th className="py-2 pr-3 text-right font-medium">Forecast at period end</th>
                  <th className="py-2 font-medium">Watch</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {lines.map((l) => (
                  <tr key={l.clin} onClick={() => setPick(l.clin)} aria-selected={l.clin === line.clin}
                    className={`cursor-pointer border-b border-border last:border-0 ${l.clin === line.clin ? 'bg-primary/5' : 'hover:bg-muted/40'}`}>
                    <td className="py-2 pr-3">
                      <span className="block font-medium">{l.clin} · {l.description}</span>
                      <span className="block text-xs text-muted-foreground">{l.type}</span>
                    </td>
                    <td className="py-2 pr-3 text-right">{money(l.price)}</td>
                    <td className="py-2 pr-3 text-right">{money(l.obligated)}</td>
                    <td className="py-2 pr-3 text-right">{money(l.invoiced)}<span className="block text-xs text-muted-foreground">through {fmt(l.through)}</span></td>
                    <td className="py-2 pr-3 text-right">{money(Math.round(l.atPeriodEnd))}</td>
                    <td className="py-2 text-xs">
                      {flagged(l)
                        ? <span className="inline-flex items-center gap-1 font-medium"><CircleAlert className="h-3.5 w-3.5 text-[var(--ss-serious)]" aria-hidden />
                            {l.runOut && l.runOut < l.periodEnd ? `Funds out ${fmt(l.runOut)}` : `Past 85% ${fmt(l.day85)}`}</span>
                        : <span className="text-muted-foreground">On track</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-1">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">Line item {line.clin}: spending through {period}
              <Info label="How the forecast works">Invoiced amounts are summed month by month. From the last invoiced day, the forecast continues at the average daily rate of the last three invoiced months. Pick another line item in the table to chart it.</Info>
            </h3>
            <SpendChart line={line} periodStart={funds.periodStart ?? line.through} today={today}
              invoices={invoices.filter((f) => f.Clin === line.clin && f.Status !== 'Defective')} />
          </div>
        </CardContent></Card>
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Invoices" description="Payment is due 30 days after a proper invoice arrives (FAR 32.904). A defective one goes back within 7 days.">
          <Card><CardContent className="divide-y divide-border p-0">
            {byRef.map((lines_) => {
              const f = lines_[0]
              const total = lines_.reduce((s, x) => s + (x.Amount ?? 0), 0)
              return (
                <div key={f.Reference} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{f.Reference}</span>
                    <span className="block text-xs text-muted-foreground">{fmt(f.ServiceStart)} to {fmt(f.ServiceEnd)} · received {fmt(f.ReceivedDay)}</span>
                  </span>
                  <span className="tabular-nums">{money(total)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${f.Status === 'Paid' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                    {f.Status === 'Paid' ? `Paid ${fmt(f.PaidDay)}` : f.Status === 'Received' ? 'Waiting on approval' : f.Status}
                  </span>
                </div>
              )
            })}
            {!byRef.length && <p className="px-4 py-3 text-sm text-muted-foreground">No invoices this period yet.</p>}
          </CardContent></Card>
        </Section>
        <Section title="Obligations" description="Funds put on the contract by modification, by line item.">
          <Card><CardContent className="divide-y divide-border p-0">
            {obligations.map((f) => (
              <div key={f.FundingId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{f.Reference} · line item {f.Clin}</span>
                  <span className="block text-xs text-muted-foreground">{fmt(f.ReceivedDay)}{f.Appropriation ? ` · ${f.Appropriation}` : ''}</span>
                </span>
                <span className="tabular-nums">{f.Kind === 'Deobligation' ? '−' : ''}{money(f.Amount)}</span>
              </div>
            ))}
          </CardContent></Card>
        </Section>
      </div>
    </div>
  )
}
