import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { titled, useFramework } from '@forms/lib/terms'
import { ALL_PERSONAS } from '../lib/types'
import type { Persona, PersonaId } from '../lib/types'

const KEY = 'ss.persona'
const Ctx = createContext<{ persona: Persona; setPersona: (id: PersonaId) => void } | undefined>(undefined)

/** The persona chosen last (on the sign-in page or from the sidebar switcher). */
export function storedPersona(): PersonaId {
  try {
    const v = localStorage.getItem(KEY) as PersonaId | null
    if (v && ALL_PERSONAS.some((p) => p.id === v)) return v
  } catch { /* storage unavailable */ }
  return 'co'
}

export function rememberPersona(id: PersonaId) {
  try { localStorage.setItem(KEY, id) } catch { /* storage unavailable */ }
}

/** Demo persona — one signed-in user plays every role, titled for the framework in use (Contracting/Procurement Officer). */
export function PersonaProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<PersonaId>(storedPersona)
  const fw = useFramework()
  const setPersona = (next: PersonaId) => {
    setId(next)
    rememberPersona(next)
  }
  return <Ctx.Provider value={{ persona: titled(ALL_PERSONAS.find((p) => p.id === id)!, fw), setPersona }}>{children}</Ctx.Provider>
}

export function usePersona() {
  const c = useContext(Ctx)
  if (!c) throw new Error('usePersona must be used within PersonaProvider')
  return c
}
