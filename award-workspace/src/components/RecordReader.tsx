import { useMemo, useRef } from 'react'
import { BookOpenCheck, Sparkles } from 'lucide-react'
import robot from '@ss/assets/uipath-robot.png'
import { useFeed, useLoop } from '@ss/lib/feed'
import { useTerms } from '@forms/lib/terms'
import { isAwarded, isImportedHeader } from '../lib/award'
import { useScopedAwardData } from '../lib/data'

interface Draft { kind: string; tone: string; to: string }

const CHIPS = 3
const LINES = [90, 74, 86, 62, 92, 70, 82, 56, 78]

/** The award record the robot reads: the documents Source Selection filed, in the framework's words. */
const RECORD = {
  federal: ['Source Selection Decision', 'SSEB Consensus Report', 'Price Reasonableness', 'Audit Trail'],
  sled: ['Recommendation of Award', 'Evaluation Committee Report', 'Cost Evaluation', 'Audit Trail'],
}

/** "Ironwood Federal Solutions Inc" → "Ironwood Federal": enough to tell offerors apart on a chip. */
const short = (name: string) => name.replace(/,?\s+(Inc|LLC|Corp|Corporation|Co|Ltd)\.?$/i, '').split(/\s+/).slice(0, 2).join(' ')

/** What the award agent drafts for each offeror on the awarded evaluations, interleaved so neighbouring chips differ. */
function useDrafts(): Draft[] {
  const { data } = useScopedAwardData()
  const t = useTerms()
  return useMemo(() => {
    // Awarded here: a contract brought in from elsewhere has no notices or debriefings to draft.
    const awarded = (data?.solicitations ?? []).filter((s) => isAwarded(s) && !isImportedHeader(s))
    const out: Draft[] = []
    for (const s of awarded) {
      const offerors = (data?.offerors ?? []).filter((o) => o.SolicitationId === s.SolicitationId)
      const others = offerors.filter((o) => o.Name !== s.AwardeeName).map((o) => short(o.Name))
      // Federal: a notice to each unsuccessful offeror, the award notice, then debriefings. A district sends every
      // proposer the notice of intent to award and the recommendation to its Board.
      for (const to of others) out.push({ kind: t.sled ? 'Notice of intent' : 'Notice', tone: 'rate-2', to })
      if (s.AwardeeName) out.push({ kind: t.sled ? 'Notice of intent' : 'Award notice', tone: 'good', to: short(s.AwardeeName) })
      if (t.sled) out.push({ kind: 'Board memo', tone: 'warn', to: 'Board of Education' })
      else for (const to of others) out.push({ kind: 'Debriefing', tone: 'warn', to })
    }
    return out.length >= CHIPS ? out : t.sled ? [
      { kind: 'Notice of intent', tone: 'rate-2', to: 'Each proposer' },
      { kind: 'Board memo', tone: 'warn', to: 'Board of Education' },
      { kind: 'Contract', tone: 'good', to: 'The awardee' },
    ] : [
      { kind: 'Notice', tone: 'rate-2', to: 'Each offeror' },
      { kind: 'Award notice', tone: 'good', to: 'The awardee' },
      { kind: 'Debriefing', tone: 'warn', to: 'On request' },
    ]
  }, [data, t])
}

/**
 * Home hero animation, the Award phase's counterpart to Source Selection's RobotReader: the UiPath robot reads the
 * award record while the notices and debriefings drafted from it pop out, one per offeror.
 */
export function RecordReader() {
  const t = useTerms()
  const drafts = useDrafts()
  const feed = useFeed(drafts, CHIPS)
  const scan = useRef<HTMLDivElement>(null)
  const n = useLoop(scan)
  const docs = RECORD[t.id]
  return (
    <div className="ss-reader shrink-0" role="img" aria-label="The UiPath award agent reads the evaluation record and drafts a notice and a debriefing for each offeror">
      <img src={robot} alt="" className="ss-reader-bot" />
      <div className="ss-reader-page-card" aria-hidden>
        <div key={n} className="ss-reader-head">
          <span className="ss-reader-vol">Award record</span>
          <span className="ss-reader-doc">{docs[n % docs.length]}</span>
        </div>
        {LINES.map((_, i) => <span key={i} className="ss-reader-line" style={{ width: `${LINES[(i + n * 3) % LINES.length]}%` }} />)}
        <div ref={scan} className="ss-reader-scan">
          <span className="ss-reader-band" />
          <span className="ss-reader-lens"><BookOpenCheck className="h-3.5 w-3.5" /></span>
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
      <div className="ss-reader-caption" aria-hidden><Sparkles className="h-3 w-3" />Award agent · every letter from the record</div>
    </div>
  )
}
