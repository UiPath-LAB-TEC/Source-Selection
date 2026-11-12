import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { titled, useFramework } from '@forms/lib/terms'
import { PM, RM, SBP, COR } from '@forms/lib/types'
import { rememberPersona } from '@ss/hooks/usePersona'
import { ADMIN, PERSONAS } from '@ss/lib/types'
import type { Persona, PersonaId } from '@ss/lib/types'
import { useRequirementsData } from '../lib/data'
import { cacheProfiles, DEFAULT_PROFILE, rememberRequester, requesterIdOf, requesterPersona, requestersFor, storedRequester } from '../lib/profiles'
import type { RequesterProfile, RequirementRow } from '../lib/types'

const KEY = 'ss.persona'

/**
 * The people who build and review a requirement: the Program Manager writes it, the Contracting Officer can start one
 * and accepts the package, the Resource Manager certifies funds, the Small Business Professional reviews the set-aside,
 * and the COR nominee reviews the surveillance plan he'll run. Any requester profile plays the Program Manager.
 */
export const REQ_PERSONAS: Persona[] = [PM as Persona, PERSONAS.find((p) => p.id === 'co')!, RM as Persona, SBP as Persona, COR as Persona]
/** The acquisition team, after the requesters in the switcher. */
export const TEAM: Persona[] = REQ_PERSONAS.filter((p) => p.id !== 'pm')
/** Everyone the switcher offers by role: the team, then the System Admin, who keeps the requester profiles. */
const SELECTABLE: Persona[] = [...REQ_PERSONAS, ADMIN]

/** The persona chosen last in any app (they share the key). Anyone with no Requirements work opens as the Program Manager. */
export function storedReqPersona(): PersonaId {
  try {
    const v = localStorage.getItem(KEY) as PersonaId | null
    if (v && SELECTABLE.some((p) => p.id === v)) return v
  } catch { /* storage unavailable */ }
  return 'pm'
}

interface Ctx {
  persona: Persona
  setPersona: (id: PersonaId) => void
  /** The requester profile playing the Program Manager (the one chosen last, else the first in this workspace). */
  requester: RequesterProfile
  /** The requesters this workspace offers: active ones, or Grace when there are none. */
  requesters: RequesterProfile[]
  /** Become a requester: the Program Manager persona, as that profile. */
  setRequester: (profileId: string) => void
  /** Any profile by id, active or not ('pm' or empty is Grace), to name a requirement's owner. */
  profileFor: (profileId?: string) => RequesterProfile | undefined
  /** Whether a requirement is this person's: for a requester, the ones they own; for a role, every one. */
  isMine: (r: Pick<RequirementRow, 'RequestedBy'>) => boolean
}

const Ctx = createContext<Ctx | undefined>(undefined)

export function ReqPersonaProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<PersonaId>(storedReqPersona)
  const [rid, setRid] = useState(storedRequester)
  const fw = useFramework()
  const { data } = useRequirementsData()
  const profiles = useMemo(() => data?.profiles ?? [], [data?.profiles])
  useEffect(() => { if (profiles.length) cacheProfiles(profiles) }, [profiles])
  const requesters = useMemo(() => requestersFor(profiles, fw), [profiles, fw])
  const requester = requesters.find((p) => p.ProfileId === rid) ?? requesters[0]
  const setPersona = (next: PersonaId) => {
    setId(next)
    rememberPersona(next)
  }
  const setRequester = (profileId: string) => {
    setRid(profileId)
    rememberRequester(profileId)
    setPersona('pm')
  }
  const profileFor = (profileId?: string) => profiles.find((p) => p.ProfileId === (profileId || 'pm')) ?? (!profileId || profileId === 'pm' ? DEFAULT_PROFILE : undefined)
  const isMine = (r: Pick<RequirementRow, 'RequestedBy'>) => id !== 'pm' || requesterIdOf(r) === requester.ProfileId
  const base = titled(SELECTABLE.find((p) => p.id === id) ?? (PM as Persona), fw)
  const persona = id === 'pm' ? requesterPersona(requester, base) : base
  return <Ctx.Provider value={{ persona, setPersona, requester, requesters, setRequester, profileFor, isMine }}>{children}</Ctx.Provider>
}

export function useReqPersona() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useReqPersona must be used within ReqPersonaProvider')
  return c
}
