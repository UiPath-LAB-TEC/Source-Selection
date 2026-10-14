import { useEffect, useState } from 'react'
import { useTerms } from '@forms/lib/terms'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@uipath/apollo-wind/components/ui/dialog'
import type { LiveCase } from '../lib/maestro'
import type { Solicitation } from '../lib/types'

const time = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')

/**
 * Maestro's own instance page, framed in the app: the live diagram, execution trail, variables and incidents.
 * It rides on the viewer's UiPath sign-in, so a browser that blocks third-party cookies shows it empty —
 * "Open in Maestro" is the way out.
 */
export default function MaestroDialog({ open, onOpenChange, sol, live }: {
  open: boolean; onOpenChange: (open: boolean) => void; sol: Solicitation; live?: LiveCase | null
}) {
  const [loaded, setLoaded] = useState(false)
  const terms = useTerms()
  const url = live?.url
  useEffect(() => { if (open) setLoaded(false) }, [open, url])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[95vh] w-[98vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2.5 pr-12">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold">{terms.Process} {sol.SolicitationId} in Maestro</DialogTitle>
            <DialogDescription className="truncate text-xs">
              {live ? `Instance ${live.instanceId} · ${live.status}${live.startedTime ? ` · started ${time(live.startedTime)}` : ''}` : 'No process instance yet'}
            </DialogDescription>
          </div>
          {url && (
            <Button size="sm" variant="outline" asChild>
              <a href={url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open in Maestro</a>
            </Button>
          )}
        </div>

        <div className="relative min-h-0 flex-1 bg-background">
          {url ? (
            <>
              <iframe
                key={url}
                src={url}
                title={`Maestro process instance ${live?.instanceId}`}
                className="absolute inset-0 h-full w-full border-0"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
                allow="clipboard-read; clipboard-write"
                onLoad={() => setLoaded(true)}
              />
              {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-background text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />Opening Maestro…
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
              Starting the {terms.process} launches its process in Maestro.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
