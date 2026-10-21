import { NavLink } from 'react-router-dom'
import { useScopedData } from '../hooks/useFramework'
import { Check, ChevronsUpDown, CirclePlus, FolderKanban, House, Inbox, LogOut, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@uipath/apollo-wind/components/ui/popover'
import { ThemeToggle } from './Theme'
import { AppSwitcher } from './AppSwitcher'
import { PersonaAvatar } from './Flair'
import { usePersona } from '../hooks/usePersona'
import { useNewLinkState } from '../lib/backlink'
import { useData } from '../lib/data'
import { tasksFor } from '../lib/roles'
import { stillOpen } from './TaskDialog'
import { titled, useTerms } from '@forms/lib/terms'
import { ADMIN, CERTIFIED_THROUGH, PERSONAS, annualCertifications } from '../lib/types'
import type { Persona, Solicitation } from '../lib/types'

/** Open tasks for a persona, counted the way My tasks lists them (tasks on a closed evaluation don't count). */
function openFor(tasks: ReturnType<typeof useData>['tasks'], p: Persona, sols: Solicitation[] | undefined) {
  return tasksFor(tasks, p).filter((t) => stillOpen(t, sols)).length
}

function PersonaCard() {
  const { persona, setPersona } = usePersona()
  const { tasks, data } = useScopedData()
  const t = useTerms()
  const option = (raw: Persona) => {
    const p = titled(raw, t.id)
    const n = openFor(tasks, p, data?.solicitations)
    return (
      <button key={p.id} onClick={() => setPersona(p.id)}
        className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted ${p.id === persona.id ? 'bg-muted' : ''}`}>
        <PersonaAvatar id={p.id} short={p.short} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{p.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{p.label}</span>
        </span>
        {n > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{n}</span>}
        {p.id === persona.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
      </button>
    )
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2.5 text-left hover:bg-muted/60" aria-label="Switch persona">
          <PersonaAvatar id={persona.id} short={persona.short} size={34} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{persona.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{persona.label}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-1.5">
        {/* The profile's annual certifications: kept here once, not re-entered for every evaluation. */}
        {persona.id !== 'admin' && <div className="mb-1.5 rounded-lg bg-muted/50 px-2.5 py-2">
          <p className="flex items-center gap-1.5 text-xs font-medium"><ShieldCheck className="h-3.5 w-3.5 text-[var(--ss-good)]" />Certifications on file · through {CERTIFIED_THROUGH}</p>
          <ul className="mt-1 space-y-0.5 pl-5 text-[11px] text-muted-foreground">{annualCertifications(t.id).map((c) => <li key={c} className="list-disc">{c}</li>)}</ul>
        </div>}
        <p className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground">One demo user plays every role. Switch to see each official's view.</p>
        {PERSONAS.map((p) => option(p))}
        <p className="mt-1.5 border-t border-border px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Administration</p>
        {option(ADMIN)}
      </PopoverContent>
    </Popover>
  )
}

export function Sidebar({ onSignOut, onNavigate }: { onSignOut: () => void; onNavigate?: () => void }) {
  const { tasks, loading, reload, data } = useScopedData()
  const newState = useNewLinkState()
  const { persona } = usePersona()
  const myOpen = openFor(tasks, persona, data?.solicitations)
  const t = useTerms()
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <AppSwitcher current="source-selection" />

      <nav className="space-y-1" onClick={onNavigate}>
        <NavLink to="/" end className={link}><House className="h-4 w-4" />My workspace</NavLink>
        <NavLink to="/evaluations" className={link}><FolderKanban className="h-4 w-4" />Evaluations</NavLink>
        {persona.id === 'co' && <NavLink to="/new" state={newState} className={link}><CirclePlus className="h-4 w-4" />New {t.process}</NavLink>}
        <NavLink to="/tasks" className={link}>
          <Inbox className="h-4 w-4" />My tasks
          {myOpen > 0 && <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{myOpen}</span>}
        </NavLink>
      </nav>

      <div className="mt-auto space-y-3">
        <PersonaCard />
        <div className="flex items-center justify-between px-1">
          <Button variant="ghost" size="icon" onClick={reload} aria-label="Refresh" title="Refresh"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={onSignOut} aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  )
}
