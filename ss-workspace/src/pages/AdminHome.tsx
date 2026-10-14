import { useEffect, useState } from 'react'
import { FRAMEWORKS, frameworkOf, termsFor } from '@forms/lib/terms'
import { Link } from 'react-router-dom'
import { ArrowRight, Database, FolderX, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Card, CardContent } from '@uipath/apollo-wind/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@uipath/apollo-wind/components/ui/dialog'
import { EmptyState } from '@uipath/apollo-wind/components/ui/empty-state'
import { DeleteEvaluationDialog } from '../components/DeleteEvaluationDialog'
import { AgencyMark, PersonaAvatar } from '../components/Flair'
import { useAuth } from '../hooks/useAuth'
import { usePersona } from '../hooks/usePersona'
import { deleteLeftoverFiles, leftoverFolders } from '../lib/deleteEvaluation'
import type { LeftoverFolder } from '../lib/deleteEvaluation'
import { planOf, useData } from '../lib/data'
import { day, forSolicitation } from '../lib/eval'
import type { Solicitation } from '../lib/types'

const newest = (a: Solicitation, b: Solicitation) => (b.StartedAt ?? '').localeCompare(a.StartedAt ?? '') || a.SolicitationId.localeCompare(b.SolicitationId)

/**
 * The System Admin's home: every source selection in the demo workspace, with what it holds, and Delete to remove one
 * completely so its solicitation number (and the same documents) can be used again.
 */
export function AdminHome() {
  const { data, preview } = useData()
  const { persona } = usePersona()
  const [target, setTarget] = useState<Solicitation>()
  const { sdk } = useAuth()
  // Files in storage with no evaluation behind them, so they can be cleared here rather than from a terminal.
  const [leftovers, setLeftovers] = useState<LeftoverFolder[]>()
  const [clearing, setClearing] = useState<LeftoverFolder>()
  const [busy, setBusy] = useState(false)
  const known = (data?.solicitations ?? []).map((s) => s.SolicitationId).sort().join('|')
  useEffect(() => {
    if (preview || !data) return
    let live = true
    leftoverFolders(sdk, known ? known.split('|') : []).then((x) => { if (live) setLeftovers(x) }, () => { if (live) setLeftovers([]) })
    return () => { live = false }
  }, [sdk, preview, known, data])
  const clear = async (f: LeftoverFolder) => {
    setBusy(true)
    try {
      const n = await deleteLeftoverFiles(sdk, f.solicitationId)
      toast.success(`Deleted ${n} leftover file${n === 1 ? '' : 's'} for ${f.solicitationId}.`)
      setLeftovers((x) => x?.filter((y) => y.solicitationId !== f.solicitationId))
      setClearing(undefined)
    } catch (e) {
      toast.error(`Could not delete every file for ${f.solicitationId}: ${(e as Error).message}`)
      leftoverFolders(sdk, known ? known.split('|') : []).then(setLeftovers, () => undefined)
    } finally {
      setBusy(false)
    }
  }
  if (!data) return null
  const sols = [...data.solicitations].sort(newest)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <PersonaAvatar id={persona.id} short={persona.short} size={48} />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Workspace administration</h1>
          <p className="text-sm text-muted-foreground">Every evaluation in this workspace, federal and State &amp; Local. Delete one to run it again under the same number.</p>
        </div>
      </div>

      {!sols.length && (
        <Card><CardContent className="p-8">
          <EmptyState icon={<Database className="h-6 w-6" />} title="No evaluations" description="Evaluations appear here once a Contracting or Procurement Officer creates one." />
        </CardContent></Card>
      )}

      {sols.length > 0 && (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card" aria-label="Evaluations">
          {sols.map((s) => {
            const d = forSolicitation(data, s.SolicitationId)
            const plan = planOf(s)
            return (
              <li key={s.SolicitationId} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
                <span className="flex min-w-[240px] flex-1 items-center gap-3">
                  <AgencyMark agency={plan.agency} size={36} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{s.Title}</span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium">{s.Status}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{FRAMEWORKS.find((f) => f.id === frameworkOf(plan))?.label}</span>
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">{s.SolicitationId}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.StartedAt ? `Started ${day(s.StartedAt)}` : 'Not started'} · {d.offerors.length} {termsFor(plan).offerors} · {d.findings.length} findings · {d.audit.length} audit events
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" asChild><Link to={`/s/${encodeURIComponent(s.SolicitationId)}`}>Open<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
                  <Button variant="outline" size="sm" disabled={preview} onClick={() => setTarget(s)} aria-label={`Delete ${s.SolicitationId}`}
                    className="text-[var(--ss-critical)] hover:bg-[var(--ss-critical)]/10 hover:text-[var(--ss-critical)]">
                    <Trash2 className="mr-1 h-3.5 w-3.5" />Delete
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {leftovers && leftovers.length > 0 && (
        <section className="space-y-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Leftover files</h2>
            <p className="text-sm text-muted-foreground">Stored proposals and award records for solicitation numbers that no longer have an evaluation.</p>
          </div>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card" aria-label="Leftover files">
            {leftovers.map((f) => (
              <li key={f.solicitationId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <FolderX className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm font-medium">{f.solicitationId}</span>
                  <span className="block text-xs text-muted-foreground">{f.files} file{f.files === 1 ? '' : 's'} in storage</span>
                </span>
                <Button variant="outline" size="sm" onClick={() => setClearing(f)} aria-label={`Delete leftover files for ${f.solicitationId}`}
                  className="text-[var(--ss-critical)] hover:bg-[var(--ss-critical)]/10 hover:text-[var(--ss-critical)]">
                  <Trash2 className="mr-1 h-3.5 w-3.5" />Delete files
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog open={!!clearing} onOpenChange={(v) => { if (!v && !busy) setClearing(undefined) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete leftover files for {clearing?.solicitationId}?</DialogTitle>
            <DialogDescription>Removes {clearing?.files} stored file{clearing?.files === 1 ? '' : 's'} (proposal PDFs and award records). There is no evaluation left to affect. This can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearing(undefined)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={() => clearing && clear(clearing)} disabled={busy}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}Delete files
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {target && <DeleteEvaluationDialog open={!!target} onOpenChange={(v) => { if (!v) setTarget(undefined) }} sol={target} />}
    </div>
  )
}
