import { useEffect, useMemo, useRef, useState } from 'react'
import { useScopedData } from '../hooks/useFramework'
import type { RefObject } from 'react'
import { Search, Sparkles } from 'lucide-react'
import robot from '../assets/uipath-robot.png'
import { kindTone } from '../lib/eval'

interface Cite { kind: string; page: number }

/** Shown before any agent has drafted findings, and in preview without data. */
const SAMPLE: Cite[] = [
  { kind: 'Strength', page: 4 }, { kind: 'Weakness', page: 9 }, { kind: 'Risk', page: 14 },
  { kind: 'Significant Strength', page: 6 }, { kind: 'Deficiency', page: 21 }, { kind: 'Strength', page: 11 },
]
/** The proposal volumes, kept generic — no offeror names on the page. */
const DOCS = [
  ['Volume I', 'Technical Proposal'], ['Volume II', 'Management Proposal'], ['Volume III', 'Past Performance'], ['Volume IV', 'Price Proposal'],
]
const LINES = [92, 78, 88, 64, 90, 72, 84, 58, 80]
const CHIPS = 3

/** The agent's real drafted findings, interleaved by tone so neighbouring chips differ. */
function useCites(): Cite[] {
  const { data } = useScopedData()
  return useMemo(() => {
    const drafts = (data?.findings ?? []).filter((f) => f.Origin === 'Agent' && f.CitationPage > 0)
    if (drafts.length < CHIPS) return SAMPLE
    const byTone = new Map<string, Cite[]>()
    for (const f of drafts) {
      const t = kindTone(f.Kind)
      byTone.set(t, [...(byTone.get(t) ?? []), { kind: f.Kind, page: f.CitationPage }])
    }
    const groups = [...byTone.values()]
    const out: Cite[] = []
    for (let i = 0; out.length < Math.min(drafts.length, 24); i++) {
      const g = groups[i % groups.length]
      const c = g[Math.floor(i / groups.length) % g.length]
      out.push(c)
    }
    return out
  }, [data])
}

/**
 * Which loop the element's CSS animation is on, read from the animation's own clock rather than animationiteration
 * events, which a browser skips while the page isn't being drawn (a background tab, a hidden pane).
 */
function useLoop(ref: RefObject<HTMLElement | null>) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      const it = ref.current?.getAnimations()[0]?.effect?.getComputedTiming().currentIteration
      if (typeof it === 'number') setN(it)
    }, 200)
    return () => clearInterval(id)
  }, [ref])
  return n
}

/**
 * A live feed of cited findings: a new one glides in at the top every couple of seconds, the others ease down a row,
 * and the oldest drifts out the bottom as it fades. One extra item is kept while it fades out.
 */
function useFeed(cites: Cite[]) {
  const [items, setItems] = useState<{ id: number; cite: Cite }[]>([])
  const nextId = useRef(0)
  useEffect(() => {
    let i = 0
    const add = () => {
      const id = nextId.current++
      setItems((xs) => [{ id, cite: cites[i++ % cites.length] }, ...xs].slice(0, CHIPS + 1))
    }
    add()
    const t = setInterval(add, 2000)
    return () => clearInterval(t)
  }, [cites])
  return items
}

/** Hero animation: the UiPath robot reads a proposal while the evaluation agent's cited findings pop out of it. */
export function RobotReader() {
  const cites = useCites()
  const feed = useFeed(cites)
  // A new document each time the magnifier finishes a full sweep of the page.
  const scan = useRef<HTMLDivElement>(null)
  const n = useLoop(scan)
  const [volume, title] = DOCS[n % DOCS.length]
  return (
    <div className="ss-reader shrink-0" role="img" aria-label="The UiPath evaluation agent reads a proposal and cites strengths, weaknesses and risks by page">
      <img src={robot} alt="" className="ss-reader-bot" />
      <div className="ss-reader-page-card" aria-hidden>
        <div key={n} className="ss-reader-head">
          <span className="ss-reader-vol">{volume}</span>
          <span className="ss-reader-doc">{title}</span>
        </div>
        {LINES.map((_, i) => <span key={i} className="ss-reader-line" style={{ width: `${LINES[(i + n * 2) % LINES.length]}%` }} />)}
        <div ref={scan} className="ss-reader-scan">
          <span className="ss-reader-band" />
          <span className="ss-reader-lens"><Search className="h-3.5 w-3.5" /></span>
        </div>
      </div>
      <div className="ss-reader-chips" aria-hidden>
        {feed.map(({ id, cite }, i) => (
          <div key={id} className="ss-reader-chip" data-leaving={i >= CHIPS} style={{ transform: `translateY(${i * 46}px)` }}>
            <span className="ss-reader-dot" style={{ background: `var(--ss-${kindTone(cite.kind)})` }} />
            <span className="ss-reader-kind">{cite.kind}</span>
            <span className="ss-reader-page">p. {cite.page}</span>
          </div>
        ))}
      </div>
      <div className="ss-reader-caption" aria-hidden><Sparkles className="h-3 w-3" />Evaluation agent · citing every finding</div>
    </div>
  )
}
