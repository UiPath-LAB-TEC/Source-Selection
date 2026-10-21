/**
 * The Agentic Acquisition apps: one per procurement phase, all on the same host and the same Data Fabric record. Each
 * is its own coded web app with its own route (its own dev server locally), so a link to another app is a full page
 * load; the persona and framework travel with it in localStorage on the shared origin.
 */
export type AppId = 'source-selection' | 'award'

export interface AppInfo {
  id: AppId
  name: string
  sledName: string
  blurb: string
  sledBlurb: string
  /** Hosted route: https://<org>.uipath.host/<route>/ */
  route: string
  /** Local dev server (vite.config.ts) */
  devPort: number
  /** The app's own accent (its --ss-brand-2), so the switcher shows each app in the color its pages use. */
  accent: string
}

export const APPS: AppInfo[] = [
  { id: 'source-selection', name: 'Source Selection', sledName: 'RFP Evaluation', blurb: 'Evaluate proposals and make the award decision',
    sledBlurb: 'Score proposals and recommend the award', route: 'source-selection', devPort: 5173, accent: '#2a78d6' },
  { id: 'award', name: 'Contract Award', sledName: 'Contract Award', blurb: 'Contract award, notices, debriefings and protests',
    sledBlurb: 'Notice of intent, protests and Board approval', route: 'award', devPort: 5175, accent: '#0a7f8c' },
]

/** A page in one of the apps: its hosted route, or its dev server when running locally. `path` is a hash route such as /s/<id>. */
export function appUrl(id: AppId, path = '/'): string {
  const app = APPS.find((a) => a.id === id)!
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const base = local ? `${window.location.protocol}//${window.location.hostname}:${app.devPort}/` : `${window.location.origin}/${app.route}/`
  return `${base}#${path}`
}

/** The Award phase's own entities. The Award app writes them; Delete evaluation removes them with the rest of the record. */
export const AWARD_ENTITY = { awards: 'SSAward', correspondence: 'SSCorrespondence', protests: 'SSProtest' } as const

/** The Award solution's deployment folder (AMER Presales/Public Sector/Source Selection/Award), where its runs live. By key, as every folder here. */
export const AWARD_PROCESS_FOLDER = { folderKey: '81e14639-e758-4614-a76b-305416269c98' }
