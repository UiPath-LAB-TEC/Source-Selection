import { useMemo, useRef } from 'react'
import { Sparkles, MessageSquareText } from 'lucide-react'
import robot from '@ss/assets/uipath-robot.png'
import { useFeed, useLoop } from '@ss/lib/feed'
import { useScopedData } from '../lib/data'
import { analysisOf } from '../lib/types'

interface Chip { kind: string; tone: string; to: string }

const CHIPS = 3
const LINES = [88, 72, 94, 60, 84, 70, 90, 58, 76]
const PAGES = ['The need', 'Answers so far', 'Requirement draft', 'Package']

/** What the agent produces from a need: the questions it asks, what it flags, and the documents it drafts. */
function useChips(): Chip[] {
  const { data } = useScopedData()
  return useMemo(() => {
    const out: Chip[] = []
    for (const r of data?.requirements ?? []) {
      const a = analysisOf(r)
      if (!a) continue
      for (const q of [...a.answered, ...a.questions].slice(0, 3)) out.push({ kind: 'Question', tone: 'rate-2', to: q.question.replace(/\?$/, '').slice(0, 34) })
      for (const f of a.flags.slice(0, 2)) out.push({ kind: 'Flag', tone: 'warn', to: f.label })
      out.push({ kind: 'Draft', tone: 'good', to: a.kind === 'Service' ? 'Performance work statement' : 'Purchase description' })
    }
    return out.length >= CHIPS ? out : [
      { kind: 'Question', tone: 'rate-2', to: 'What must it survive?' },
      { kind: 'Flag', tone: 'warn', to: 'A brand is named' },
      { kind: 'Draft', tone: 'good', to: 'Purchase description' },
      { kind: 'Question', tone: 'rate-2', to: 'When and where?' },
      { kind: 'Flag', tone: 'warn', to: 'Section 508 applies' },
      { kind: 'Draft', tone: 'good', to: 'Surveillance plan' },
    ]
  }, [data])
}

/**
 * Home hero animation, Requirements' counterpart to Source Selection's RobotReader: the UiPath robot reads a need
 * while the questions, flags and drafts it produces pop out.
 */
export function NeedReader() {
  const chips = useChips()
  const feed = useFeed(chips, CHIPS)
  const scan = useRef<HTMLDivElement>(null)
  const n = useLoop(scan)
  return (
    <div className="ss-reader shrink-0" role="img" aria-label="The UiPath agent reads a need and asks the questions a Contracting Officer would, then drafts the package">
      <img src={robot} alt="" className="ss-reader-bot" />
      <div className="ss-reader-page-card" aria-hidden>
        <div key={n} className="ss-reader-head">
          <span className="ss-reader-vol">Requirement</span>
          <span className="ss-reader-doc">{PAGES[n % PAGES.length]}</span>
        </div>
        {LINES.map((_, i) => <span key={i} className="ss-reader-line" style={{ width: `${LINES[(i + n * 3) % LINES.length]}%` }} />)}
        <div ref={scan} className="ss-reader-scan">
          <span className="ss-reader-band" />
          <span className="ss-reader-lens"><MessageSquareText className="h-3.5 w-3.5" /></span>
        </div>
      </div>
      <div className="ss-reader-chips" aria-hidden>
        {feed.map(({ id, item }, i) => (
          <div key={id} className="ss-reader-chip" data-leaving={i >= CHIPS} style={{ transform: `translateY(${i * 46}px)` }}>
            <span className="ss-reader-dot" style={{ background: `var(--ss-${item.tone})` }} />
            <span className="ss-reader-kind">{item.kind}</span>
            <span className="ss-reader-page">{item.to}</span>
          </div>
        ))}
      </div>
      <div className="ss-reader-caption" aria-hidden><Sparkles className="h-3 w-3" />Requirements agent · asks before contracting does</div>
    </div>
  )
}
