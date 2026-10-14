import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BadgeDollarSign, Bot, ClipboardCheck, Cpu, Gavel, Inbox, ScanText, Users, Workflow } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import robot from '../assets/uipath-robot.png'
import { stageName, useTerms } from '@forms/lib/terms'
import { STAGES } from '../lib/types'

interface Step {
  icon: LucideIcon
  who: string
  what: string
  products: { label: string; icon: LucideIcon }[]
}

const ROBOTS = { label: 'Robots', icon: Cpu }
const IXP = { label: 'IXP', icon: ScanText }
const AGENTS = { label: 'Agents', icon: Bot }
const ACTION = { label: 'Action Center', icon: ClipboardCheck }

const STEPS: Step[] = [
  { icon: Inbox, who: 'Contracting Officer', what: 'Robots ingest every volume, IXP extracts price schedules and certifications, and SAM, exclusions and FAPIIS are screened before release.', products: [ROBOTS, IXP, ACTION] },
  { icon: ClipboardCheck, who: 'Evaluators', what: 'The evaluation assistant drafts findings cited to proposal pages. Evaluators accept, edit or reject, and rate independently.', products: [AGENTS, ACTION] },
  { icon: Users, who: 'SSEB Chair', what: 'An agent surfaces where evaluators disagree and proposes consensus language. The Chair sets consensus and signs the SSEB report.', products: [ROBOTS, AGENTS, ACTION] },
  { icon: BadgeDollarSign, who: 'Contracting Officer', what: 'Robots compute total evaluated price against the IGCE and flag unbalanced line items for the reasonableness determination.', products: [ROBOTS, ACTION] },
  { icon: Gavel, who: 'Source Selection Authority', what: 'An agent drafts the best-value tradeoff and SSDD. The SSA decides, signs, and the award record publishes with its audit trail.', products: [AGENTS, ACTION, ROBOTS] },
]

/** The same five stages for a District RFP. */
const SLED_STEPS: Step[] = [
  { icon: Inbox, who: 'Procurement Officer', what: 'Robots ingest every section, IXP extracts cost schedules and required forms, and state vendor registration and the debarment list are checked before release.', products: [ROBOTS, IXP, ACTION] },
  { icon: ClipboardCheck, who: 'Evaluators', what: 'The evaluation assistant drafts findings cited to proposal pages. Committee members accept, edit or reject, and score each criterion independently.', products: [AGENTS, ACTION] },
  { icon: Users, who: 'Committee Chair', what: 'An agent surfaces where scores differ and proposes consensus language. The Chair sets consensus scores and signs the committee report.', products: [ROBOTS, AGENTS, ACTION] },
  { icon: BadgeDollarSign, who: 'Procurement Officer', what: 'Robots total each cost proposal, compare it with the District estimate, and award cost points by formula: lowest cost earns them all.', products: [ROBOTS, ACTION] },
  { icon: Gavel, who: 'Award Authority', what: 'An agent drafts the recommendation of award from the final scores. The Award Authority signs it for the Board, and the Notice of Intent to Award follows.', products: [AGENTS, ACTION, ROBOTS] },
]

const HOLD_MS = 2800

/** The five FAR stages stacked vertically; the UiPath robot hops down the track. */
export function ProcessJourney() {
  const terms = useTerms()
  const steps = terms.sled ? SLED_STEPS : STEPS
  const [i, setI] = useState(0)
  const [hop, setHop] = useState(0)
  const [paused, setPaused] = useState(false)
  const [top, setTop] = useState(0)
  const rows = useRef<(HTMLLIElement | null)[]>([])
  const reduced = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    if (paused || reduced.current) return
    const t = setTimeout(() => { setI((n) => (n + 1) % STEPS.length); setHop((h) => h + 1) }, HOLD_MS)
    return () => clearTimeout(t)
  }, [i, paused])

  // Track the active row's position (rows change height as the active one expands).
  useLayoutEffect(() => {
    const measure = () => { const r = rows.current[i]; if (r) setTop(r.offsetTop) }
    measure()
    const t = setTimeout(measure, 320)
    return () => clearTimeout(t)
  }, [i])

  const go = (n: number) => { if (n !== i) { setI(n); setHop((h) => h + 1) } }
  const fill = rows.current[i] ? rows.current[i]!.offsetTop + 22 : 0

  return (
    <section className="ss-in rounded-2xl border border-border bg-card p-5" style={{ animationDelay: '160ms' }}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-label={`How ${terms.sled ? 'an' : 'a'} ${terms.process} runs`}>
      <div className="mb-4">
        <h2 className="text-base font-semibold">How {terms.sled ? 'an' : 'a'} {terms.process} runs</h2>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Workflow className="h-3.5 w-3.5" />One Maestro case · {terms.sled ? 'five stages, scored out of 100 points' : 'five FAR Part 15 stages'}</p>
      </div>

      <div className="relative pl-14">
        <div className="ss-vtrack"><div className="ss-vtrack-fill" style={{ height: `${fill}px` }} /></div>
        <div className="ss-vrunner" style={{ top: `${top - 6}px` }} aria-hidden="true">
          <div key={hop} className={hop ? 'vhop' : 'idle'}><img src={robot} alt="" /></div>
        </div>
        <ol className="space-y-1">
          {steps.map((s, n) => {
            const on = n === i
            const done = n < i
            return (
              <li key={n} ref={(el) => { rows.current[n] = el }}>
                <button onClick={() => go(n)} aria-current={on ? 'step' : undefined}
                  className={`flex w-full items-start gap-3 rounded-xl p-2 text-left transition-colors ${on ? 'bg-primary/10' : 'hover:bg-muted/60'}`}>
                  <span className={`ss-station shrink-0 ${on ? 'on bg-primary text-primary-foreground' : done ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}
                    style={{ height: 44, width: 44 }}>
                    <s.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5">
                    <span className={`block text-sm ${on ? 'font-semibold' : 'font-medium'}`}>{stageName(STAGES[n], terms.id)}</span>
                    <span className="block text-xs text-muted-foreground">{s.who}</span>
                    {on && (
                      <span className="ss-fade mt-2 block space-y-2">
                        <span className="block text-sm leading-relaxed text-foreground">{s.what}</span>
                        <span className="flex flex-wrap gap-1.5">
                          {s.products.map((p) => (
                            <span key={p.label} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium">
                              <p.icon className="h-3 w-3 text-primary" />{p.label}
                            </span>
                          ))}
                        </span>
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
