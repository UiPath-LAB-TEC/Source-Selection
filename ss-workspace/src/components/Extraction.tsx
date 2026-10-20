import { CircleCheck, CircleX, ScanText } from 'lucide-react'
import { useTerms } from '@forms/lib/terms'
import { money } from '../lib/eval'
import type { Offeror } from '../lib/types'

/** What the intake robot recorded in SSOfferor.ExtractionJson: which reader supplied each volume, and IXP's results. */
interface Source { source?: 'IXP' | 'rules' | 'none'; confidence?: number | null }
interface Reference { program?: string; customer?: string; contract?: string; value?: number | null; start?: string; end?: string; rating?: string; relevance?: string }
interface Extraction {
  cover?: Source & { signatory?: string; dated?: string; certifications?: Record<string, boolean | null> }
  price?: Source & { statedTotal?: number | null; lines?: number }
  references?: Reference[]
  referencesMeta?: Source
}

export function extractionOf(o: Offeror): Extraction | undefined {
  try { return o.ExtractionJson ? (JSON.parse(o.ExtractionJson) as Extraction) : undefined } catch { return undefined }
}

const CERTS: Record<string, string> = {
  samRepsCurrent: 'SAM representations and certifications current', nonCollusion: 'Non-collusion affidavit',
  debarment: 'Suspension and debarment certification', dataPrivacy: 'Student data privacy agreement',
}

function SourceChip({ label, s }: { label: string; s?: Source }) {
  if (!s || s.source === 'none') return null
  const ixp = s.source === 'IXP'
  const tip = ixp ? `Extracted by UiPath IXP${s.confidence != null ? `; lowest field confidence ${Math.round(s.confidence * 100)}%` : ''}` : 'IXP was unavailable; read by the fallback rules'
  return (
    <span title={tip} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border px-1.5 py-0.5 text-xs">
      {label}<span className="text-muted-foreground">· {ixp ? 'IXP' : 'rules'}</span>
    </span>
  )
}

/** The offeror card's "Read by IXP" section: sources and confidence, the certifications found, and claimed references. */
export function ExtractionPanel({ o }: { o: Offeror }) {
  const x = extractionOf(o)
  const t = useTerms()
  if (!x) return null
  const certs = Object.entries(x.cover?.certifications ?? {}).filter(([, v]) => v != null)
  const refs = x.references ?? []
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 inline-flex items-center gap-1 text-xs font-medium"><ScanText aria-hidden className="h-3.5 w-3.5" />Read by IXP</span>
        <SourceChip label={t.sled ? 'Transmittal letter' : 'Cover letter'} s={x.cover} />
        <SourceChip label={t.sled ? 'Cost proposal' : 'Price schedule'} s={x.price} />
        <SourceChip label={t.sled ? 'References' : 'Past performance'} s={x.referencesMeta} />
      </div>
      {certs.length > 0 && (
        <ul className="space-y-0.5 text-xs">
          {certs.map(([k, v]) => (
            <li key={k} className="flex items-center gap-1.5">
              {v ? <CircleCheck aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--ss-good)]" /> : <CircleX aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--ss-critical)]" />}
              <span>{CERTS[k] ?? k}{v ? '' : ': not provided'}</span>
            </li>
          ))}
        </ul>
      )}
      {refs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t.sled ? 'References' : 'Past performance references'} ({refs.length})</p>
          <ul className="space-y-1.5 text-xs">
            {refs.map((r, i) => (
              <li key={`${r.contract}-${i}`} className="border-t border-border pt-1.5">
                <div className="font-medium">{r.program || r.customer}</div>
                <div className="text-muted-foreground">
                  {[r.contract, r.start ? `${r.start}–${r.end ?? ''}` : '', r.value != null ? money(r.value) : '', r.rating ? `${t.sled ? 'rated' : 'claims'} ${r.rating}` : ''].filter(Boolean).join(' · ')}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
