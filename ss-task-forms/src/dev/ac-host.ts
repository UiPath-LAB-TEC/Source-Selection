/**
 * Dev only (open /src/dev/ac-host.html on the 5174 dev server): a stand-in Action Center that ignores AC.init
 * until `ready` ms have passed, then answers with AC.loadApp — the first-load race the consensus and SSA tasks hit.
 *   ?form=consensus|awardDecision|…  &sol=<solicitation>  &ready=<ms, default 5000>
 *   &app=<url of the app, default this dev server; e.g. a `vite preview` of a built bundle>
 */
import snapshot from './snapshot.json'
import { sampleInputs } from '../lib/backend'
import type { EntityKey } from '../lib/backend'

const q = new URLSearchParams(location.search)
const form = q.get('form') ?? 'consensus'
const sol = q.get('sol') ?? 'FA8771-27-R-0012'
const readyAfter = Number(q.get('ready') ?? 5000)
const app = new URL(q.get('app') ?? '/', location.href)
const frame = document.getElementById('app') as HTMLIFrameElement
const out = document.getElementById('log')!
const t0 = performance.now()
const log = (m: string) => { out.textContent += `${String(Math.round(performance.now() - t0)).padStart(6)} ms  ${m}\n`; out.scrollTop = out.scrollHeight }

const rows = snapshot as unknown as Record<EntityKey, Record<string, unknown>[]>
const task = {
  taskId: 20550000, title: `Simulated ${form} task`, status: 'Pending', isReadOnly: false, action: null, folderId: 0, folderName: 'SourceSelection', jobKey: null, theme: 'light',
  data: { actionType: form, solicitationId: sol, ...sampleInputs({ actionType: form, solicitationId: sol, slot: 1, fresh: true }, rows) },
}

app.search = new URLSearchParams({ basedomain: location.origin, source: 'ActionCenter', acsim: '1', form, sol }).toString()
document.getElementById('cfg')!.textContent = `${form} · ${sol} · host ready after ${readyAfter} ms · app ${app.origin}`
frame.src = app.toString()
log(`iframe → ${app}`)

window.addEventListener('message', (e: MessageEvent) => {
  if (e.origin !== app.origin || e.source !== frame.contentWindow) return
  const { eventType, content } = (e.data ?? {}) as { eventType?: string; content?: { action?: string } }
  const reply = (eventType: string, content: unknown) => frame.contentWindow!.postMessage({ eventType, content }, app.origin)
  if (eventType === 'AC.init') {
    if (performance.now() - t0 < readyAfter) return log('AC.init — host not ready yet, dropped')
    log('AC.init → AC.loadApp')
    reply('AC.loadApp', task)
  } else if (eventType === 'AC.complete') {
    log(`AC.complete "${content?.action}" → AC.completeResponse`)
    reply('AC.completeResponse', { success: true, errorCode: null, errorMessage: null })
  } else log(String(eventType))
})
