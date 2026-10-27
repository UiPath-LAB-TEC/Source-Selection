import { useState } from 'react'
import { ChevronDown, FileText, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Buckets } from '@uipath/uipath-typescript/buckets'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Card, CardContent } from '@uipath/apollo-wind/components/ui/card'
import { EmptyState } from '@uipath/apollo-wind/components/ui/empty-state'
import { useTerms } from '@forms/lib/terms'
import { dayOf } from '@award/lib/clocks'
import { KIND, kindLabel } from '@award/lib/record'
import type { Correspondence } from '@award/lib/record'
import { OfferorAvatar } from '@ss/components/Flair'
import { Pill } from '@ss/components/Bits'
import { FOLDER } from '@ss/lib/data'
import { when } from '@ss/lib/eval'
import type { Offeror } from '@ss/lib/types'
import { useAwardData } from '../lib/data'

const STATUS: Record<string, string> = { Draft: 'var(--ss-warn)', Approved: 'var(--ss-brand-2)', Delivered: 'var(--ss-good)', Received: 'var(--ss-brand-2)' }
const ORDER = [KIND.awardNotice, KIND.notice, KIND.debriefRequest, KIND.debriefing, KIND.question, KIND.answer] as string[]
const fmt = (iso: string) => new Date(`${dayOf(iso)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/** Every document exchanged with the offerors, per offeror and in order: read the text, or open the filed PDF. */
export function Letters({ letters, offerors }: { letters: Correspondence[]; offerors: Offeror[] }) {
  const { sdk, preview } = useAwardData()
  const t = useTerms()
  const [open, setOpen] = useState<string>()
  const [opening, setOpening] = useState<string>()
  const index = (id: string) => offerors.findIndex((o) => o.OfferorId === id)
  const name = (id: string) => offerors[index(id)]?.Name ?? id
  const rows = [...letters].sort((a, b) => ORDER.indexOf(a.Kind) - ORDER.indexOf(b.Kind) || name(a.OfferorId).localeCompare(name(b.OfferorId)))

  // Filed PDFs live in SS-Records (Source Selection's folder); a short-lived link opens one in a new tab.
  const pdf = async (c: Correspondence) => {
    if (!c.FilePath) return
    setOpening(c.CorrespondenceId)
    try {
      const path = c.FilePath.replace(/^SS-Records\//, '')
      const r = await new Buckets(sdk).getReadUri({ name: 'SS-Records' }, path, { folderKey: FOLDER.folderKey, expiryInMinutes: 30 })
      window.open(r.uri, '_blank', 'noopener')
    } catch (e) { toast.error(`Could not open the PDF: ${(e as Error).message}`) } finally { setOpening(undefined) }
  }

  if (!rows.length) {
    return (
      <Card><CardContent className="p-8"><EmptyState icon={<Mail className="h-6 w-6" />} title="No correspondence yet"
        description={t.sled ? 'The notice of intent to award is drafted for every proposer from the record.' : 'Notices are drafted for every offeror from the record once the award phase begins, and debriefings when an offeror asks for one.'} /></CardContent></Card>
    )
  }
  return (
    <Card><CardContent className="divide-y divide-border p-0">
      {rows.map((c) => {
        const isOpen = open === c.CorrespondenceId
        return (
          <div key={c.CorrespondenceId}>
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <OfferorAvatar name={name(c.OfferorId)} index={Math.max(0, index(c.OfferorId))} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{kindLabel(c.Kind)} · {name(c.OfferorId)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {c.DeliveredAt ? `Delivered ${when(c.DeliveredAt)}` : c.ReceivedAt ? `Received ${when(c.ReceivedAt)}` : 'Not sent yet'}
                  {c.DueAt && c.Kind === KIND.notice ? ` · debriefing request due ${fmt(c.DueAt)}` : ''}
                </span>
              </span>
              <Pill color={STATUS[c.Status]}>{c.Status}</Pill>
              {c.FilePath && (
                <Button size="sm" variant="outline" disabled={preview || opening === c.CorrespondenceId} onClick={() => pdf(c)} title={preview ? 'Not available in the preview' : undefined}>
                  {opening === c.CorrespondenceId ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}PDF
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setOpen(isOpen ? undefined : c.CorrespondenceId)} aria-expanded={isOpen}>
                Read<ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </Button>
            </div>
            {isOpen && <pre className="ss-doc mx-4 mb-4 whitespace-pre-wrap rounded-xl border border-border bg-background p-4 text-sm leading-6">{c.Text}</pre>}
          </div>
        )
      })}
    </CardContent></Card>
  )
}
