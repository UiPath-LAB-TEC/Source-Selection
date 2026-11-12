import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Check, ChevronsUpDown, ClipboardList, House, LogOut, Plus, RefreshCw, Settings } from 'lucide-react'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@uipath/apollo-wind/components/ui/popover'
import { titled, useFramework } from '@forms/lib/terms'
import { AppSwitcher } from '@ss/components/AppSwitcher'
import { PersonaAvatar } from '@ss/components/Flair'
import { ThemeToggle } from '@ss/components/Theme'
import { ADMIN } from '@ss/lib/types'
import type { Persona, PersonaId } from '@ss/lib/types'
import { REQ_PERSONAS, TEAM, useReqPersona } from '../hooks/usePersona'

const REQ_PM = REQ_PERSONAS[0]
import { useScopedData } from '../lib/data'
import { initials, requesterLine } from '../lib/profiles'

function PersonRow({ id, short, name, sub, on, onClick }: { id: PersonaId; short: string; name: string; sub: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted ${on ? 'bg-muted' : ''}`}>
      <PersonaAvatar id={id} short={short} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  )
}

const groupLabel = 'px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground'

/** The switcher: the requesters (each a program office person, by agency), then the acquisition team, then the admin. */
function PersonaCard() {
  const { persona, setPersona, requester, requesters, setRequester } = useReqPersona()
  const fw = useFramework()
  const [open, setOpen] = useState(false)
  const role = (raw: Persona) => {
    const p = titled(raw, fw)
    return <PersonRow key={p.id} id={p.id} short={p.short} name={p.name} sub={p.label} on={p.id === persona.id} onClick={() => { setPersona(p.id); setOpen(false) }} />
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
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
      <PopoverContent side="top" align="start" className="max-h-[70vh] w-80 overflow-y-auto p-1.5">
        <p className="px-2 pb-1 pt-1 text-xs text-muted-foreground">One demo user plays every role. Switch to see each person's view.</p>
        <p className={groupLabel}>Program offices</p>
        {requesters.map((r) => (
          <PersonRow key={r.ProfileId} id="pm" short={initials(r.Name)} name={r.Name} sub={requesterLine(r, titled(REQ_PM, fw).label)}
            on={persona.id === 'pm' && r.ProfileId === requester.ProfileId} onClick={() => { setRequester(r.ProfileId); setOpen(false) }} />
        ))}
        <p className={groupLabel}>Acquisition team</p>
        {TEAM.map(role)}
        <p className={groupLabel}>Workspace</p>
        {role(ADMIN)}
      </PopoverContent>
    </Popover>
  )
}

export function Sidebar({ onSignOut, onNavigate }: { onSignOut: () => void; onNavigate?: () => void }) {
  const { data, loading, reload } = useScopedData()
  const { persona } = useReqPersona()
  const open = data?.requirements.filter((r) => r.Status !== 'Accepted' && r.Status !== 'Cancelled').length ?? 0
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <AppSwitcher current="requirements" />

      <Button asChild className="w-full justify-start" onClick={onNavigate}>
        <Link to="/new"><Plus className="mr-2 h-4 w-4" />Start a requirement</Link>
      </Button>

      <nav className="space-y-1" onClick={onNavigate}>
        <NavLink to="/" end className={link}><House className="h-4 w-4" />My workspace</NavLink>
        <NavLink to="/requirements" className={link}><ClipboardList className="h-4 w-4" />Requirements<span className="ml-auto text-xs tabular-nums text-muted-foreground">{open || ''}</span></NavLink>
        {persona.id === 'admin' && <NavLink to="/settings" className={link}><Settings className="h-4 w-4" />Settings</NavLink>}
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
