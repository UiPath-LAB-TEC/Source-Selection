import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CornerUpLeft, FileText, SearchX } from 'lucide-react'
import { DocumentReader } from './DocumentReader'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Highlighted, findQuote, kindAccent } from './Bits'
import { useVolumeLabel, volumeName } from '../lib/terms'
import type { Offeror, ProposalPage } from '../lib/types'

/** A volume's federal name; components inside an evaluation use useVolumeLabel() for its own framework. */
export const volumeLabel = (v: string) => volumeName(v, 'federal')

/** The finding the viewer is showing: where it is cited, what it quotes and its kind (for the highlight colour). */
export interface CitedFinding { kind: string; volume: string; page: number; quote?: string }

/** Top of `el` within the scrolling `box`, in the box's scroll coordinates. */
const topWithin = (el: Element, box: HTMLElement) => el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop

/**
 * The whole proposal volume as one scrolling document, from its indexed text, so an evaluator can read it end to end.
 * With `finding`, its cited quote is highlighted in the finding kind's accent and scrolled into view; a quote that is
 * not on the page (a finding about something the proposal leaves out) gets a note instead of a silent miss. `quote`
 * alone highlights on `page` in plain yellow. `page` is the page in view: scrolling reports it through `onPage`, and
 * setting it (the arrows, or "Back to it") scrolls there.
 */
export function PageViewer({ pages, offeror, volume, page, quote, onPage, finding, onReturn }: {
  pages: ProposalPage[]; offeror?: Offeror; volume: string; page: number; quote?: string; onPage?: (n: number) => void
  finding?: CitedFinding; onReturn?: () => void
}) {
  const volumeLabel = useVolumeLabel()
  const vol = pages.filter((p) => p.OfferorId === offeror?.OfferorId && p.Volume === volume).sort((a, b) => a.PageNumber - b.PageNumber)
  const [reading, setReading] = useState(false)
  const max = vol.length
  const citedPage = finding ? (finding.volume === volume ? finding.page : undefined) : quote ? page : undefined
  const citedQuote = finding ? finding.quote : quote
  const citedText = vol.find((p) => p.PageNumber === citedPage)?.PageText
  const found = !!citedText && !!findQuote(citedText, citedQuote)
  const absent = !!finding && !!citedText && !found
  const body = useRef<HTMLDivElement>(null)
  const mark = useRef<HTMLElement>(null)
  const reported = useRef<number>(undefined) // the page this viewer last reported while the reader scrolled
  const shown = useRef('') // which document and citation the scroll position belongs to
  // Only the reader's own scrolling (wheel, touch, scrollbar, keys) reports a page; the viewer's scrolling and layout
  // changes don't, or a short volume clamped at its end would claim its last page.
  const byReader = useRef(false)

  // Scroll to the cited passage when the document or citation changes, or to a page asked for by the arrows or
  // "Back to it", inside the viewer only (never scroll the page around it). A page the reader scrolled to stays put.
  const doc = `${offeror?.OfferorId}|${volume}|${citedPage}|${citedQuote}`
  useEffect(() => {
    const box = body.current
    if (!box) return
    if (shown.current === doc && reported.current === page) return
    shown.current = doc
    reported.current = undefined
    const toMark = page === citedPage && mark.current
    const el = toMark ? mark.current : box.querySelector(`[data-page="${page}"]`)
    const top = el ? Math.max(0, topWithin(el, box) - (toMark ? box.clientHeight / 3 : 0)) : 0
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    byReader.current = false
    box.scrollTo({ top, behavior: still ? 'auto' : 'smooth' })
  }, [doc, page, citedPage])

  // Report the page in view as the reader scrolls: the last page whose top is above the upper third.
  const frame = useRef(0)
  const onScroll = () => {
    if (!byReader.current || !onPage) return
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const box = body.current
      if (!box) return
      const line = box.scrollTop + box.clientHeight / 3
      let n = vol[0]?.PageNumber ?? 1
      for (const el of box.querySelectorAll<HTMLElement>('[data-page]')) if (topWithin(el, box) <= line) n = Number(el.dataset.page)
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2) n = vol[vol.length - 1]?.PageNumber ?? n
      if (n !== page) { reported.current = n; onPage(n) }
    })
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  const reader = () => { byReader.current = true }

  const kindLabel = finding?.kind.toLowerCase()
  return (
    <div className="ss-paper overflow-hidden rounded-xl border border-border bg-card">
      <DocumentReader open={reading} onOpenChange={setReading} offeror={offeror} volume={volume} label={volumeLabel(volume)} />
      <div className="border-b border-border px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate"><span className="font-semibold text-foreground">{offeror?.Name}</span> · {volumeLabel(volume)}</span>
          {onPage && (
            <span className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <span className="tabular-nums">Page {page} of {max || '—'}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page >= max} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></Button>
            </span>
          )}
          {!onPage && <span className="shrink-0 tabular-nums">Page {page}</span>}
          <Button variant="outline" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => setReading(true)} disabled={!vol.length}>
            <FileText className="mr-1 h-3.5 w-3.5" />Original PDF
          </Button>
        </div>
        {finding && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2" aria-live="polite">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: kindAccent(finding.kind) }} aria-hidden />
            {citedPage == null
              ? <span className="text-muted-foreground">The selected {kindLabel} cites {volumeLabel(finding.volume)}, p. {finding.page}.</span>
              : <span className="font-medium text-foreground">{found ? 'Highlighting' : 'Showing'}: {finding.kind} · p. {finding.page}</span>}
            {onReturn && (citedPage == null || page !== citedPage) && (
              <button type="button" onClick={onReturn} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><CornerUpLeft className="h-3 w-3" />Back to it</button>
            )}
          </div>
        )}
      </div>
      <div ref={body} onScroll={onScroll} onWheel={reader} onTouchStart={reader} onPointerDown={reader} onKeyDown={reader} tabIndex={0}
        aria-label={`${offeror?.Name ?? 'Proposal'} ${volumeLabel(volume)}, full text`} className="ss-doc relative max-h-[min(70vh,680px)] overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary bg-[#fdfcf8] px-8 py-6 text-[15px] leading-7 text-[#1f2328] dark:bg-[#f5f3ec]">
        {vol.map((p) => (
          <section key={p.PageId} data-page={p.PageNumber} aria-label={`Page ${p.PageNumber} of ${max}`}
            className="border-b border-dashed border-[#d0d5dd] pb-6 [&+section]:pt-5 last:border-0 last:pb-0">
            <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667085]">Page {p.PageNumber} of {max}</p>
            {absent && p.PageNumber === citedPage && (
              <div role="note" className="mb-4 flex items-start gap-2 rounded-lg border border-dashed bg-white/70 px-3 py-2 font-sans text-[13px] leading-snug text-[#344054]"
                style={{ borderColor: kindAccent(finding!.kind) }}>
                <SearchX className="mt-0.5 h-4 w-4 shrink-0" style={{ color: kindAccent(finding!.kind) }} />
                <span>{finding!.quote?.trim()
                  ? "This finding is about something the proposal doesn't include, so there is no passage to highlight. The cited page is marked for context."
                  : 'This finding quotes no passage. The cited page is marked for context.'}</span>
              </div>
            )}
            {p.PageNumber === citedPage ? <Highlighted text={p.PageText} quote={citedQuote} kind={finding?.kind} markRef={mark} /> : p.PageText}
          </section>
        ))}
        {!vol.length && <p className="text-muted-foreground">This volume hasn't been indexed yet.</p>}
      </div>
    </div>
  )
}
