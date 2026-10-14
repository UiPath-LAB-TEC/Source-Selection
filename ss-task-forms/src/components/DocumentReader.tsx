import { useEffect, useState } from 'react'
import { Download, FileWarning, Loader2, RotateCw } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@uipath/apollo-wind/components/ui/dialog'
import { useForm } from '../forms/common'
import type { Offeror } from '../lib/types'

/**
 * The offeror's original PDF for a volume, from the proposals bucket, in the browser's PDF viewer. The text an
 * evaluator reads and cites is beside the findings; this is the document exactly as it was submitted.
 */
export function DocumentReader({ open, onOpenChange, offeror, volume, label }: {
  open: boolean; onOpenChange: (open: boolean) => void; offeror?: Offeror; volume: string; label: string
}) {
  const { backend, sol } = useForm()
  const canPdf = !!backend.documentUrl && !!offeror?.OfferorCode
  const [pdf, setPdf] = useState<{ url: string; link: string }>()
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)

  // Each opening starts fresh: the read link expires, and the viewer may have moved to another offeror or volume.
  useEffect(() => {
    if (open) return
    setPdf(undefined); setError(undefined)
  }, [open, offeror?.OfferorId, volume])

  // Fetch the PDF and show it from a blob: URL, so it displays inline whatever headers storage sends.
  useEffect(() => {
    if (!open || pdf || !canPdf || !offeror) return
    let stop = false
    setError(undefined)
    ;(async () => {
      try {
        const link = await backend.documentUrl!(sol.SolicitationId, offeror.OfferorCode, volume)
        const res = await fetch(link)
        if (!res.ok) throw new Error(`the proposals bucket answered ${res.status}`)
        const url = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'application/pdf' }))
        if (stop) URL.revokeObjectURL(url)
        else setPdf({ url, link })
      } catch (e) {
        if (!stop) setError((e as Error).message)
      }
    })()
    return () => { stop = true }
  }, [open, pdf, canPdf, offeror, volume, backend, sol.SolicitationId, attempt])
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url) }, [pdf])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[94vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-3 pr-12">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold">{offeror?.Name} · {label}</DialogTitle>
            <DialogDescription className="truncate text-xs">Original PDF as submitted · {sol.SolicitationId}</DialogDescription>
          </div>
          {pdf && <Button size="sm" variant="ghost" asChild><a href={pdf.link} target="_blank" rel="noreferrer" download><Download className="mr-1.5 h-3.5 w-3.5" />Download</a></Button>}
        </div>
        <div className="relative min-h-0 flex-1 bg-muted/30">
          {pdf
            ? <iframe src={pdf.url} title={`${offeror?.Name} ${label}`} className="absolute inset-0 h-full w-full border-0" />
            : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
                {!canPdf
                  ? <><FileWarning className="h-5 w-5" />The original PDF isn't available here.</>
                  : error
                    ? <>
                        <FileWarning className="h-5 w-5" />
                        <span>The original PDF couldn't be loaded ({error}).</span>
                        <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}><RotateCw className="mr-1.5 h-3.5 w-3.5" />Try again</Button>
                      </>
                    : <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Opening the original PDF…</span>}
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
