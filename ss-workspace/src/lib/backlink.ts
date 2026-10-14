import { useLocation } from 'react-router-dom'

/** Pages an evaluation can be opened from, and how its back link names them. */
const PLACES: Record<string, string> = {
  '/': 'My workspace',
  '/evaluations': 'Evaluations',
  '/tasks': 'My tasks',
  '/new': 'New evaluation',
}

/** `from`: the page a link was followed from. `prior`: that page's own `from`, kept so a round trip restores it. */
interface BackState { from?: string; prior?: string }

/** Router state for a link into an evaluation: remembers the page it was opened from (carried through trace pages). */
export function useBackState(): BackState {
  const { pathname, state } = useLocation()
  if (PLACES[pathname]) return { from: pathname }
  return { from: (state as BackState | null)?.from }
}

/** Router state for a link into New source selection: remembers the page it was opened from, an evaluation included. */
export function useNewLinkState(): BackState {
  const { pathname, state } = useLocation()
  const s = state as BackState | null
  return pathname === '/new' ? { from: s?.from, prior: s?.prior } : { from: pathname, prior: s?.from }
}

/**
 * New source selection's back link: the page it was opened from. An evaluation (or one of its trace pages) is named by
 * `titleOf`; anything unknown falls back to Evaluations.
 */
export function useWizardBackLink(titleOf: (solicitationId: string) => string | undefined) {
  const { state } = useLocation()
  const { from, prior } = (state as BackState | null) ?? {}
  if (from && from !== '/new' && PLACES[from]) return { to: from, label: PLACES[from], state: undefined }
  const id = from?.match(/^\/s\/([^/]+)/)?.[1]
  const title = id ? titleOf(decodeURIComponent(id)) : undefined
  // Back on the evaluation, its own back link should still point where it pointed before the detour.
  if (from && title) return { to: from, label: title, state: { from: prior } }
  return { to: '/evaluations', label: PLACES['/evaluations'], state: undefined }
}

/** Where an evaluation page's back link goes: the page it was opened from, else Evaluations. */
export function useBackLink() {
  const { state } = useLocation()
  const from = (state as BackState | null)?.from
  const to = from && PLACES[from] ? from : '/evaluations'
  return { to, label: PLACES[to] }
}
