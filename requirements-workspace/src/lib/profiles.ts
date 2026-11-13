/**
 * Requester profiles: the program office people who build requirements (SSRequesterProfile). Each one plays the
 * Program Manager role, and their profile fills in a new requirement: agency, office, contracting office and location.
 */
import { PM } from '@forms/lib/types'
import { REQUIREMENT_ENTITY } from '@ss/lib/apps'
import type { Persona } from '@ss/lib/types'
import { upsert } from './save'
import type { Writer } from './save'
import type { RequesterProfile, RequirementRow, Spec } from './types'

/** Grace Lindqvist, as seeded: stands in when no profiles can be read, and owns requirements saved before profiles. */
export const DEFAULT_PROFILE: RequesterProfile = {
  ProfileId: 'pm', Name: PM.name, Title: PM.label, Agency: 'Department of the Air Force', Department: 'Department of Defense',
  Office: '42nd Aircraft Maintenance Squadron', Location: '', ContractingOffice: '', Framework: 'federal', Active: true,
}

export const initials = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean)
  return ((w[0]?.[0] ?? '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase()
}

/** The requester who owns a requirement: its RequestedBy, else Grace (rows saved before profiles existed). */
export const requesterIdOf = (r: Pick<RequirementRow, 'RequestedBy'>) => r.RequestedBy || 'pm'

/**
 * The requesters someone can be in this workspace: active, by name. With none, Grace stands in: as seeded in the
 * federal workspace, and with only her name elsewhere, so the workspace's own title shows and nothing federal fills in.
 */
export function requestersFor(profiles: RequesterProfile[], framework: string): RequesterProfile[] {
  const xs = profiles.filter((p) => p.Active && (p.Framework || 'federal') === framework).sort((a, b) => a.Name.localeCompare(b.Name))
  if (xs.length) return xs
  return [framework === 'federal' ? DEFAULT_PROFILE : { ...DEFAULT_PROFILE, Title: '', Agency: '', Department: '', Office: '', Framework: framework }]
}

/** The second line under a requester's name in a list: title and agency. */
export const requesterLine = (p: RequesterProfile, fallbackTitle: string) => [p.Title || fallbackTitle, p.Agency].filter(Boolean).join(' · ')

/** A requester as the Program Manager persona: their name, initials and title, with their office and agency as the role. */
export function requesterPersona(p: RequesterProfile, base: Persona): Persona {
  return {
    ...base,
    name: p.Name || base.name,
    short: initials(p.Name) || base.short,
    label: p.Title || base.label,
    role: [p.Office, p.Agency].filter(Boolean).join(' · ') || base.role,
    photo: p.ProfileId,
  }
}

/** The agency line: the agency, and its department when it sits under one. */
export const agencyLine = (p: Pick<RequesterProfile, 'Agency' | 'Department'>) =>
  [p.Agency, p.Department && p.Department !== p.Agency ? p.Department : ''].filter(Boolean).join(' · ')

/**
 * What a profile fills in on a new requirement: whose it is, the agency and offices, and the place things go. Only
 * values the profile has; the person can change any of them for this need.
 */
export function prefill(p: RequesterProfile): { row: Partial<RequirementRow>; spec: Partial<Spec> } {
  const row: Partial<RequirementRow> = { RequestedBy: p.ProfileId }
  if (p.Agency) row.Agency = p.Agency
  if (p.Office) row.Office = p.Office
  if (p.ContractingOffice) row.ContractingOffice = p.ContractingOffice
  return { row, spec: p.Location ? { deliveryPlace: p.Location, placeOfPerformance: p.Location } : {} }
}

/** A new profile's id from the name, kept unique: rq-leah-okonkwo, rq-leah-okonkwo-2… */
export function newProfileId(name: string, taken: string[]) {
  const base = `rq-${name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'requester'}`
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}

/** Insert or update a profile; the in-memory dataset is patched so every page shows the change. */
export async function saveProfile(w: Writer, p: RequesterProfile): Promise<RequesterProfile> {
  const stored = await upsert(w, REQUIREMENT_ENTITY.profiles, { ...p, UpdatedAt: new Date().toISOString() })
  w.patch((d) => ({ ...d, profiles: [...d.profiles.filter((x) => x.ProfileId !== p.ProfileId), stored] }))
  return stored
}

const CACHE = 'rq.profiles'
const KEY = 'rq.requester'

/** The sign-in screen lists requesters before anything loads, from the last list this browser saw. */
export function cacheProfiles(xs: RequesterProfile[]) {
  try { localStorage.setItem(CACHE, JSON.stringify(xs.map(({ Id: _id, ...p }) => { void _id; return p }))) } catch { /* storage unavailable */ }
}
export function cachedProfiles(): RequesterProfile[] {
  try { return JSON.parse(localStorage.getItem(CACHE) ?? '[]') as RequesterProfile[] } catch { return [] }
}
export function storedRequester(): string {
  try { return localStorage.getItem(KEY) || 'pm' } catch { return 'pm' }
}
export function rememberRequester(id: string) {
  try { localStorage.setItem(KEY, id) } catch { /* storage unavailable */ }
}
