import { useEffect, useRef, useState } from 'react'
import { Bot, ClipboardCheck, Cpu, Database, ScanText, Workflow } from 'lucide-react'
import robot from '../assets/uipath-robot.png'

/** The UiPath products this solution runs on, orbiting the robot. */
const PRODUCTS = [
  { label: 'Maestro', icon: Workflow, title: 'Maestro case management runs the evaluation lifecycle' },
  { label: 'Agents', icon: Bot, title: 'Agents draft findings, consensus and the award document with citations' },
  { label: 'Actions', icon: ClipboardCheck, title: 'Action Center carries every evaluator and official decision' },
  { label: 'IXP', icon: ScanText, title: 'IXP extracts price schedules and certifications' },
  { label: 'Data Fabric', icon: Database, title: 'Data Fabric holds the evaluation record' },
  { label: 'Robots', icon: Cpu, title: 'Robots ingest, screen, price and publish' },
]

export function ProductOrbit({ small }: { small?: boolean }) {
  const step = 36 / PRODUCTS.length
  return (
    <div className={`ss-orbit shrink-0 ${small ? 'sm' : ''}`} aria-label="UiPath products in this solution">
      <div className="ss-ring outer" />
      <div className="ss-ring inner" />
      <div className="ss-core"><img src={robot} alt="UiPath robot" /></div>
      {PRODUCTS.map((p, i) => (
        <div key={p.label} className="ss-orbit-item" style={{ animationDelay: `-${(i * step).toFixed(2)}s` }}>
          <div className="ss-orbit-chip" title={p.title}>
            <p.icon className="h-5 w-5" />
            <span>{p.label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Counts from 0 to `value` once, when first shown. Non-numeric values render as-is. */
export function CountUp({ value, suffix = '', duration = 1100 }: { value: number; suffix?: string; duration?: number }) {
  const [n, setN] = useState(0)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) { setN(value); return }
    started.current = true
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(value); return }
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{n.toLocaleString('en-US')}{suffix}</>
}
