import { useEffect, useState } from 'react'
import { Mail } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@uipath/apollo-wind/components/ui/dialog'
import { Input } from '@uipath/apollo-wind/components/ui/input'
import { answerRunner, askRunner, isEmail, onAskRunner, runnerEmail, useRunnerEmail } from '../lib/runner'

/** Asks who is running the demo, the first time a run starts (and from the persona menu's Change). Mount once per app. */
export function RunnerPrompt() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  useEffect(() => onAskRunner((o) => {
    setOpen(o)
    if (o) setValue(runnerEmail())
  }), [])
  const ok = isEmail(value)
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) answerRunner(null) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Who’s running this demo?</DialogTitle>
          <DialogDescription>
            Every task this run raises goes to one UiPath account, so you can play every role from the persona menu. Use the email you sign in to UiPath with.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (ok) answerRunner(value) }}>
          <Input type="email" value={value} onChange={(e) => setValue(e.target.value)} placeholder="you@uipath.com" autoFocus
            autoComplete="email" spellCheck={false} aria-label="Your UiPath email" />
          <p className="text-xs text-muted-foreground">Saved in this browser. Change it any time from the persona menu.</p>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => answerRunner(null)}>Cancel</Button>
            <Button type="submit" disabled={!ok}>Continue</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** The persona menu's line: where new runs send their tasks, with Change. */
export function RunnerRow() {
  const email = useRunnerEmail()
  return (
    <div className="mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs">
      <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {isEmail(email) ? <>Tasks go to <span className="font-medium text-foreground" title={email}>{email}</span></> : 'Who gets new runs’ tasks?'}
      </span>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { askRunner(true).catch(() => undefined) }}>
        {isEmail(email) ? 'Change' : 'Set'}
      </Button>
    </div>
  )
}
