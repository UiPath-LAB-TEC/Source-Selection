import { useState } from 'react'
import { FileText, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Buckets } from '@uipath/uipath-typescript/buckets'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Card, CardContent } from '@uipath/apollo-wind/components/ui/card'
import { Section } from '@ss/components/Bits'
import { FOLDER } from '@ss/lib/data'
import { money } from '@award/lib/options'
import { kindLabel } from '@award/lib/record'
import type { Correspondence, ModificationRow } from '../lib/award'
import { useAwardData } from '../lib/data'
import { fmtDay } from '../lib/status'

/** Letters to the contractor this phase writes: option and extension notices, and deliverables returned. */
const CONTRACTOR_LETTERS = new Set(['ExtensionNotice', 'OptionNotice', 'PreliminaryNotice', 'OptionNotExercised', 'DeliverableRejection'])

function OpenFile({ path, label }: { path?: string; label: string }) {
  const { sdk, preview } = useAwardData()
  const [busy, setBusy] = useState(false)
  if (!path) return null
  const open = async () => {
    if (preview) { toast.info('The preview can’t open filed documents.'); return }
    setBusy(true)
    try {
      const res = await new Buckets(sdk).getReadUri({ name: 'SS-Records' }, path.replace(/^SS-Records\//, ''), { folderKey: FOLDER.folderKey, expiryInMinutes: 30 })
      window.open(res.uri, '_blank', 'noopener')
    } catch (e) { toast.error(`Could not open it: ${(e as Error).message}`) } finally { setBusy(false) }
  }
  return <Button size="sm" variant="ghost" onClick={open} disabled={busy}>{busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}{label}</Button>
}

/**
 * What the contract's administration has issued: the modifications the system wrote (an option exercised, the
 * services extended) and the letters to the contractor, newest first, each opening its filed PDF.
 */
export function Modifications({ mods, letters }: { mods: ModificationRow[]; letters: Correspondence[] }) {
  const sent = letters.filter((c) => CONTRACTOR_LETTERS.has(c.Kind)).sort((a, b) => (b.DeliveredAt ?? '').localeCompare(a.DeliveredAt ?? ''))
  const issued = [...mods].sort((a, b) => b.Number.localeCompare(a.Number))
  if (!issued.length && !sent.length) return null
  return (
    <Section title="Modifications and letters" description="Issued from this app, each filed with the contract record.">
      <Card><CardContent className="divide-y divide-border p-0">
        {issued.map((m) => (
          <div key={m.ModificationId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
            <FileText className="h-4 w-4 shrink-0 text-[var(--ss-brand-2)]" aria-hidden />
            <div className="min-w-0 flex-1 basis-56">
              <p className="text-sm font-medium">Modification {m.Number} · {m.Kind}</p>
              <p className="text-xs text-muted-foreground">{m.Authority}{m.Bilateral ? ' · bilateral' : ' · unilateral'} · effective {fmtDay(m.EffectiveDay)}{m.SignedBy ? ` · signed by ${m.SignedBy}` : ''}{m.Status !== 'Issued' ? ' · filing' : ''}</p>
            </div>
            <span className="text-sm tabular-nums">{money(m.Amount, true)}</span>
            <OpenFile path={m.FilePath} label="Open" />
          </div>
        ))}
        {sent.map((c) => (
          <div key={c.CorrespondenceId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1 basis-56">
              <p className="text-sm font-medium">{kindLabel(c.Kind)}</p>
              <p className="text-xs text-muted-foreground">{c.Status === 'Delivered' ? `Sent ${fmtDay(c.DeliveredAt?.slice(0, 10))}` : 'Signed, being sent'}</p>
            </div>
            <OpenFile path={c.FilePath} label="Open" />
          </div>
        ))}
      </CardContent></Card>
    </Section>
  )
}
