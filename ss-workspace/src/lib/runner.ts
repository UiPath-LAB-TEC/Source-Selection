import { useSyncExternalStore } from 'react'

/**
 * Who is running the demo. Every human task a new run raises (the evaluators, SSEB chair, contracting officer and SSA;
 * in Contract Management the CO, counsel, SSA, COR and resource manager) is assigned to this one UiPath sign-in email,
 * so one person plays every role. Action Center lets only a task's assignee complete it, so it has to be the person
 * signed in, never a fixed address. Kept in this browser and asked for the first time a run starts (RunnerPrompt).
 */
const KEY = 'ss.runnerEmail'
const EVENT = 'ss:runner'

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

export function runnerEmail(): string {
  try {
    return (localStorage.getItem(KEY) ?? '').trim()
  } catch {
    return ''
  }
}

export function setRunnerEmail(email: string) {
  try {
    localStorage.setItem(KEY, email.trim())
  } catch { /* storage unavailable: the prompt asks again next time */ }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(fn: () => void) {
  const storage = (e: StorageEvent) => { if (e.key === KEY) fn() }
  window.addEventListener(EVENT, fn)
  window.addEventListener('storage', storage)
  return () => {
    window.removeEventListener(EVENT, fn)
    window.removeEventListener('storage', storage)
  }
}

/** The saved email, kept current across this tab and others. */
export const useRunnerEmail = () => useSyncExternalStore(subscribe, runnerEmail, () => '')

/** The person closed the prompt without an email: the caller stops quietly, with no error toast. */
export class RunnerCancelled extends Error {
  constructor() {
    super('No email for the run’s tasks.')
    this.name = 'RunnerCancelled'
  }
}

type Ask = { resolve: (email: string) => void; reject: (e: Error) => void }
let pending: Ask | null = null
const prompts = new Set<(open: boolean) => void>()

/**
 * The email to assign a new run's tasks to: the saved one, or ask for it first. `change` opens the prompt even when
 * one is saved (the persona menu's Change).
 */
export function askRunner(change = false): Promise<string> {
  const saved = runnerEmail()
  if (!change && isEmail(saved)) return Promise.resolve(saved)
  if (!prompts.size) return Promise.reject(new Error('Add your UiPath email from the persona menu, then start again.'))
  pending?.reject(new RunnerCancelled())
  return new Promise((resolve, reject) => {
    pending = { resolve, reject }
    prompts.forEach((p) => p(true))
  })
}

/** RunnerPrompt's side: open when asked, then answer with the email typed (or null when closed). */
export function onAskRunner(open: (open: boolean) => void) {
  prompts.add(open)
  return () => { prompts.delete(open) }
}

export function answerRunner(email: string | null) {
  const p = pending
  pending = null
  prompts.forEach((o) => o(false))
  if (!p) return
  if (email && isEmail(email)) {
    setRunnerEmail(email)
    p.resolve(email.trim())
  } else p.reject(new RunnerCancelled())
}
