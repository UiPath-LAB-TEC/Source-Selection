import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import robot from '../assets/uipath-robot.png'

export interface JourneyStage { name: string; icon: LucideIcon; who?: string }

/**
 * Horizontal stage track for a dark brand panel: the robot hops station to station, and the station it lands on shows
 * who holds that step. Each app in the system passes its own stages.
 */
export function StageJourney({ stages }: { stages: JourneyStage[] }) {
  const [i, setI] = useState(0)
  const [hop, setHop] = useState(0)
  const reduced = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    if (reduced.current) return
    const t = setTimeout(() => { setI((n) => (n + 1) % stages.length); setHop((h) => h + 1) }, 2200)
    return () => clearTimeout(t)
  }, [i, stages.length])
  const pct = (n: number) => 10 + (n * 80) / (stages.length - 1)
  return (
    <div className="ss-hj relative h-[140px] w-full max-w-2xl">
      <div className="ss-track"><div className="ss-track-fill" style={{ width: `${(i / (stages.length - 1)) * 100}%` }} /></div>
      <div className="ss-runner" style={{ left: `${pct(i)}%` }} aria-hidden="true">
        <div key={hop} className={hop ? 'hop' : 'idle'}><img src={robot} alt="" /><div className="ss-runner-shadow" /></div>
      </div>
      <ol className="absolute inset-x-0 top-[14px] flex">
        {stages.map((s, n) => {
          const Icon = s.icon
          const on = n === i
          return (
            <li key={s.name} className="flex min-w-0 flex-1 flex-col items-center text-center">
              <span className={`ss-station ${on ? 'on bg-white text-[var(--ss-brand-1)]' : n < i ? 'bg-white/35 text-white' : 'bg-white/12 text-white/70'}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className={`mt-2 w-full text-balance px-1 text-xs leading-tight ${on ? 'font-semibold text-white' : 'text-white/75'}`}>{s.name}</span>
              <span className={`mt-0.5 w-full text-balance px-1 text-[10px] leading-tight transition-colors ${on ? 'text-white/85' : 'text-white/0'}`}>{s.who}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
