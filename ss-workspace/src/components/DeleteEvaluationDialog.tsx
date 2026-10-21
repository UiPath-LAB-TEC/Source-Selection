import { useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@uipath/apollo-wind/components/ui/dialog'
import { Input } from '@uipath/apollo-wind/components/ui/input'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../lib/data'
import { deleteEvaluation } from '../lib/deleteEvaluation'
import { forSolicitation } from '../lib/eval'
import type { Solicitation } from '../lib/types'

/**
 * Deleting a source selection frees its number so the same documents can run again (System Admin only). The admin types
 * the number to confirm; the dialog lists what goes and reports each step while it runs. `running` says a Maestro run
 * is still going (when not known, an evaluation still in evaluation is assumed to have one).
 */
export function DeleteEvaluationDialog({ open, onOpenChange, sol, running, onDeleted }: {
  open: boolean; onOpenChange: (v: boolean) => void; sol: Solicitation; running?: boolean; onDeleted?: () => void
}) {
  const { sdk } = useAuth()
  const { data, reload } = useData()
  const [typed, setTyped] = useState('')
  const [step, setStep] = useState<string>()
  const id = sol.SolicitationId
  const busy = step !== undefined
  const matches = typed.trim().toUpperCase() === id.toUpperCase()
  const d = data ? forSolicitation(data, id) : undefined
  const live = running ?? sol.Status === 'In evaluation'
  useEffect(() => { if (!open) { setTyped(''); setStep(undefined) } }, [open])
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`

  const run = async () => {
    setStep('Starting')
    try {
      const done = await deleteEvaluation(sdk, sol, setStep)
      toast.success(`${id} deleted: ${n(done.records, 'record')} and ${n(done.files, 'file')} removed${done.runsCancelled ? `, ${n(done.runsCancelled, 'Maestro run')} cancelled` : ''}. The number is free to use again.`)
      onOpenChange(false)
      onDeleted?.()
      await reload()
    } catch (e) {
      toast.error(`Delete stopped part way: ${(e as Error).message}. Try again to finish.`)
      setStep(undefined)
      await reload()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {id}?</DialogTitle>
          <DialogDescription>Removes this evaluation completely, so you can start it again with the same number and documents.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 text-sm">
          {live && <li className="flex gap-2"><span aria-hidden>•</span>Cancels its Maestro run, which is still going</li>}
          {d && <li className="flex gap-2"><span aria-hidden>•</span>{n(d.offerors.length, 'offeror')}, {n(d.pages.length, 'proposal page')}, {n(d.findings.length, 'finding')}, {n(d.ratings.length, 'rating')}, {n(d.decisions.length, 'decision')} and {n(d.audit.length, 'audit event')}</li>}
          <li className="flex gap-2"><span aria-hidden>•</span>Its uploaded proposal PDFs and any filed award record</li>
          {sol.Status === 'Awarded' && <li className="flex gap-2"><span aria-hidden>•</span>Its Award records: notices, debriefings and any protest</li>}
        </ul>
        <p className="text-sm font-medium text-[var(--ss-critical)]">This can't be undone.</p>
        <label className="block space-y-1.5">
          <span className="text-sm">Type <span className="font-mono font-semibold">{id}</span> to confirm</span>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy} autoComplete="off" spellCheck={false} aria-label={`Type ${id} to confirm`} />
        </label>
        {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite"><Loader2 className="h-4 w-4 animate-spin" />{step}…</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={run} disabled={!matches || busy}><Trash2 className="mr-1.5 h-4 w-4" />Delete evaluation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
