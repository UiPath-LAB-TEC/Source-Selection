import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { titled, useFramework } from '@forms/lib/terms'
import { rememberPersona } from '@ss/hooks/usePersona'
import type { Persona, PersonaId } from '@ss/lib/types'
import { AWARD_PERSONAS, counselTitled } from '../lib/award'

const KEY = 'ss.persona'

/**
 * The persona chosen last in either app (they share the key). An evaluator or the Chair has no Award work, so the
 * Award app opens as the Contracting Officer for them.
 */
export function storedAwardPersona(): PersonaId {
  try {
    const v = localStorage.getItem(KEY) as PersonaId | null
    if (v && AWARD_PERSONAS.some((p) => p.id === v)) return v
  } catch { /* storage unavailable */ }
  return 'co'
}

/** A person as the framework in use titles them (Contracting/Procurement Officer, Agency/District Counsel). */
export const awardTitled = (p: Persona, fw: ReturnType<typeof useFramework>) => counselTitled(titled(p, fw), fw)

const Ctx = createContext<{ persona: Persona; setPersona: (id: PersonaId) => void } | undefined>(undefined)

export function AwardPersonaProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<PersonaId>(storedAwardPersona)
  const fw = useFramework()
  const setPersona = (next: PersonaId) => {
    setId(next)
    rememberPersona(next)
  }
  return <Ctx.Provider value={{ persona: awardTitled(AWARD_PERSONAS.find((p) => p.id === id)!, fw), setPersona }}>{children}</Ctx.Provider>
}

export function useAwardPersona() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAwardPersona must be used within AwardPersonaProvider')
  return c
}
