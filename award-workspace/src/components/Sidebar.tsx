import { NavLink } from 'react-router-dom'
import { Check, ChevronsUpDown, Gavel, House, Inbox, LogOut, RefreshCw } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@uipath/apollo-wind/components/ui/popover'
import { useFramework } from '@forms/lib/terms'
import { AppSwitcher } from '@ss/components/AppSwitcher'
import { PersonaAvatar } from '@ss/components/Flair'
import { ThemeToggle } from '@ss/components/Theme'
import { awardTitled, useAwardPersona } from '../hooks/usePersona'
import { AWARD_PERSONAS } from '../lib/award'
import { useScopedAwardData } from '../lib/data'
import { myTasks } from '../pages/MyTasks'

function PersonaCard() {
  const { persona, setPersona } = useAwardPersona()
  const { tasks } = useScopedAwardData()
  const fw = useFramework()
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
        <p className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground">One demo user plays every role. Switch to see each official's view.</p>
        {AWARD_PERSONAS.map((raw) => {
          const p = awardTitled(raw, fw)
          const n = myTasks(tasks, p).length
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
        })}
      </PopoverContent>
    </Popover>
  )
}

export function Sidebar({ onSignOut, onNavigate }: { onSignOut: () => void; onNavigate?: () => void }) {
  const { tasks, loading, reload } = useScopedAwardData()
  const { persona } = useAwardPersona()
  const mine = myTasks(tasks, persona).length
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <AppSwitcher current="award" />

      <nav className="space-y-1" onClick={onNavigate}>
        <NavLink to="/" end className={link}><House className="h-4 w-4" />My workspace</NavLink>
        <NavLink to="/awards" className={link}><Gavel className="h-4 w-4" />Awards</NavLink>
        <NavLink to="/tasks" className={link}>
          <Inbox className="h-4 w-4" />My tasks
          {mine > 0 && <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{mine}</span>}
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
