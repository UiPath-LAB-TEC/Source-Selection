import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Entities } from '@uipath/uipath-typescript/entities'
import { Processes } from '@uipath/uipath-typescript/processes'
import { useAuth } from '@ss/hooks/useAuth'
import { AWARD_ENTITY, AWARD_PROCESS_FOLDER } from '@ss/lib/apps'
import { ENTITY } from '@ss/lib/data'
import type { Persona } from '@ss/lib/types'
import { useAwardPersona } from '../hooks/usePersona'
import { alertOwners, byUrgency, isLive } from './award'
import type { AlertRow, AwardDataset } from './award'
import { useAwardData } from './data'

/** The Maestro BPMN process that runs the daily contract watch (Award solution). */
export const WATCH_PROCESS = 'ContractWatchProcess'

/** A persona's live alerts, most urgent first. The Contracting Officer sees every alert; the others see their own. */
export function alertsFor(data: AwardDataset | undefined, persona: Persona, all = false) {
  const live = (data?.alerts ?? []).filter(isLive)
  return byUrgency(all || persona.id === 'co' ? live : live.filter((a) => alertOwners(a).includes(persona.taskLabel)))
}

/**
 * Action items come in three groups, and only the first is ever counted as needing anyone:
 * - needs: open, and overdue or due within 14 days
 * - inHand: acknowledged; someone is on it (the watch reopens it only if it gets more urgent)
 * - coming: open, but more than 14 days out
 */
export type ActionGroup = 'needs' | 'inHand' | 'coming'

export function groupOf(a: AlertRow): ActionGroup | undefined {
  if (a.Status === 'Acknowledged') return 'inHand'
  if (a.Status !== 'Open') return undefined
  return a.Severity === 'Overdue' || a.Severity === 'Due soon' ? 'needs' : 'coming'
}

export function grouped(alerts: AlertRow[]): Record<ActionGroup, AlertRow[]> {
  const out: Record<ActionGroup, AlertRow[]> = { needs: [], inHand: [], coming: [] }
  for (const a of byUrgency(alerts)) { const g = groupOf(a); if (g) out[g].push(a) }
  return out
}

/** A persona's action items, grouped. */
export const actionsFor = (data: AwardDataset | undefined, persona: Persona, all = false) => grouped(alertsFor(data, persona, all))

/** The latest time the watch looked at any contract. */
export const lastWatched = (data?: AwardDataset) => (data?.awards ?? []).map((a) => a.WatchedAt ?? '').sort().at(-1) || undefined

/**
 * Acknowledge, dismiss (with a reason) or reopen an alert, as the person signed in, with an audit row. The next watch
 * keeps what they chose unless the alert gets more severe (AW_Robots admin.reconcile).
 */
export function useAlertActions() {
  const { sdk } = useAuth()
  const { reload, preview } = useAwardData()
  const { persona } = useAwardPersona()
  const [busy, setBusy] = useState<string>()
  const act = async (a: AlertRow, status: 'Acknowledged' | 'Dismissed' | 'Open', reason?: string) => {
    if (preview) { toast.info('The preview doesn’t save changes.'); return }
    setBusy(a.AlertId)
    try {
      const e = new Entities(sdk)
      const now = new Date().toISOString()
      await e.updateRecord({ name: AWARD_ENTITY.alerts }, a.Id, { Status: status, ActedBy: persona.name, ActedAt: now, Reason: reason ?? '' })
      const action = status === 'Dismissed' ? 'AlertDismissed' : status === 'Acknowledged' ? 'AlertAcknowledged' : 'AlertReopened'
      await e.insertRecords({ name: ENTITY.audit }, [{
        EventId: `${a.SolicitationId}-${a.AlertId}-${action}-${Date.now()}`, SolicitationId: a.SolicitationId, EntityRef: a.AlertId, Action: action,
        Actor: persona.name, OccurredAt: now, Detail: `${a.Title}${reason ? `. ${reason}` : ''}`,
      }])
      await reload()
    } catch (err) {
      toast.error(`Could not save: ${(err as Error).message}`)
    } finally {
      setBusy(undefined)
    }
  }
  return {
    busy,
    acknowledge: (a: AlertRow) => act(a, 'Acknowledged'),
    dismiss: (a: AlertRow, reason: string) => act(a, 'Dismissed', reason),
    reopen: (a: AlertRow) => act(a, 'Open'),
  }
}

/**
 * Run check now: starts the contract watch in Maestro, then reloads every 10 seconds (up to 3 minutes) until it has
 * written, so the new alerts appear without a manual refresh.
 */
export function useRunWatch() {
  const { sdk } = useAuth()
  const { data, reload, preview } = useAwardData()
  const [running, setRunning] = useState(false)
  const latest = useRef(lastWatched(data))
  useEffect(() => { latest.current = lastWatched(data) }, [data])
  const run = async () => {
    if (preview) { toast.info('The preview can’t start a run.'); return }
    setRunning(true)
    const before = latest.current
    try {
      await new Processes(sdk).start({ name: WATCH_PROCESS }, { ...AWARD_PROCESS_FOLDER, inputArguments: JSON.stringify({ asOf: '' }) })
      toast.success('Contract watch started. The alerts refresh when it finishes, usually within a minute or two.')
      for (let i = 0; i < 18; i++) {
        await new Promise((r) => setTimeout(r, 10_000))
        await reload()
        if (latest.current && latest.current !== before) { toast.success('Contract watch finished.'); return }
      }
      toast.info('The watch is still running. Refresh in a minute to see its results.')
    } catch (err) {
      const msg = (err as Error).message
      toast.error(/could not be found/i.test(msg) ? 'The contract watch is not deployed yet.' : `Could not start the watch: ${msg}`)
    } finally {
      setRunning(false)
    }
  }
  return { running, run }
}
