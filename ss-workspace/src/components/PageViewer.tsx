import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Highlighted } from './Bits'
import { useVolumeLabel, volumeName } from '@forms/lib/terms'
import type { Offeror, ProposalPage } from '../lib/types'

/** A volume's federal name; components inside an evaluation use useVolumeLabel() for its own framework. */
export const volumeLabel = (v: string) => volumeName(v, 'federal')

/** Proposal page rendered from its indexed text, with the cited quote highlighted. */
export function PageViewer({ pages, offeror, volume, page, quote, onPage }: {
  pages: ProposalPage[]; offeror?: Offeror; volume: string; page: number; quote?: string; onPage?: (n: number) => void
}) {
  const volumeLabel = useVolumeLabel()
  const vol = pages.filter((p) => p.OfferorId === offeror?.OfferorId && p.Volume === volume).sort((a, b) => a.PageNumber - b.PageNumber)
  const current = vol.find((p) => p.PageNumber === page)
  const max = vol.length
  const body = useRef<HTMLDivElement>(null)
  // A new page starts at the top, or at the cited passage; only the viewer scrolls, never the page around it.
  useEffect(() => {
    const box = body.current
    if (!box) return
    const mark = box.querySelector('mark')
    const target = mark ? Math.max(0, mark.offsetTop - box.clientHeight / 3) : 0
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    box.scrollTo({ top: target, behavior: still ? 'auto' : 'smooth' })
  }, [offeror?.OfferorId, volume, page, quote])
  return (
    <div className="ss-paper overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{offeror?.Name} · {volumeLabel(volume)}</span>
        {onPage && (
          <span className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <span className="tabular-nums">Page {page} of {max || '—'}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page >= max} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></Button>
          </span>
        )}
        {!onPage && <span className="shrink-0 tabular-nums">Page {page}</span>}
      </div>
      <div ref={body} className="ss-doc relative max-h-[560px] overflow-y-auto bg-[#fdfcf8] px-8 py-6 text-[15px] leading-7 text-[#1f2328] dark:bg-[#f5f3ec]">
        {current ? <Highlighted text={current.PageText} quote={quote} /> : <p className="text-muted-foreground">Page not indexed yet.</p>}
      </div>
    </div>
  )
}
