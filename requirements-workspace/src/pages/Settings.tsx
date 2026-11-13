import { useState } from 'react'
import type { ReactNode } from 'react'
import { Building2, FileSignature, MapPin, Pencil, Plus, Settings as SettingsIcon, UserRoundPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@uipath/apollo-wind/components/ui/badge'
import { Button } from '@uipath/apollo-wind/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@uipath/apollo-wind/components/ui/dialog'
import { Input } from '@uipath/apollo-wind/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@uipath/apollo-wind/components/ui/select'
import { Switch } from '@uipath/apollo-wind/components/ui/switch'
import { PersonaAvatar } from '@ss/components/Flair'
import { ADMIN } from '@ss/lib/types'
import { useReqPersona } from '../hooks/usePersona'
import { useRequirementsData } from '../lib/data'
import { agencyLine, DEFAULT_PROFILE, initials, newProfileId, requesterIdOf, saveProfile } from '../lib/profiles'
import type { RequesterProfile } from '../lib/types'

/** Parent departments to suggest; any text is fine. */
const DEPARTMENTS = [
  'Department of Defense', 'Department of Veterans Affairs', 'Department of Homeland Security', 'Department of the Interior',
  'Department of Health and Human Services', 'Department of Energy', 'Department of Justice', 'Department of State',
  'Department of Transportation', 'Department of Agriculture', 'General Services Administration',
]

const blank = (): RequesterProfile => ({
  ProfileId: '', Name: '', Title: '', Agency: '', Department: '', Office: '', Location: '', ContractingOffice: '', Framework: 'federal', Active: true,
})

/** Settings: the requester profiles. Only the System Admin changes them; everyone else is told who can. */
export function Settings() {
  const { data } = useRequirementsData()
  const { persona, setPersona } = useReqPersona()
  const [editing, setEditing] = useState<RequesterProfile>()
  if (!data) return null

  if (persona.id !== 'admin') {
    return (
      <div className="mx-auto max-w-xl space-y-3 rounded-2xl border border-border bg-card p-6 text-sm">
        <h1 className="flex items-center gap-2 text-lg font-semibold"><SettingsIcon className="h-5 w-5" />Settings</h1>
        <p className="text-muted-foreground">The System Admin keeps the requester profiles. Switch to {ADMIN.name} to change them.</p>
        <Button variant="outline" onClick={() => setPersona('admin')}>Switch to {ADMIN.name}</Button>
      </div>
    )
  }

  const profiles = [...data.profiles].sort((a, b) => Number(b.Active) - Number(a.Active) || a.Name.localeCompare(b.Name))
  const uses = (id: string) => data.requirements.filter((r) => requesterIdOf(r) === id).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Who builds requirements here, and what their profile fills in.</p>
      </div>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold">Requesters</h2>
            <p className="text-sm text-muted-foreground">
              Program office people, in any agency. Each one signs in as themselves, and their agency, offices and location fill in every new requirement they start. They can still change any of it for a particular need.
            </p>
          </div>
          <Button onClick={() => setEditing(blank())}><UserRoundPlus className="mr-1.5 h-4 w-4" />Add requester</Button>
        </div>

        {profiles.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            No requester profiles yet, so {DEFAULT_PROFILE.Name} stands in. Add the first one.
          </p>
        )}
        <ul className="divide-y divide-border rounded-xl border border-border">
          {profiles.map((p) => (
            <li key={p.ProfileId} className={`flex flex-wrap items-start gap-4 p-4 ${p.Active ? '' : 'opacity-60'}`}>
              <PersonaAvatar id="pm" short={initials(p.Name)} size={38} photo={p.ProfileId} />
              <div className="min-w-0 flex-1 basis-72 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{p.Name}</span>
                  <span className="text-sm text-muted-foreground">{p.Title}</span>
                  {!p.Active && <Badge variant="secondary">Inactive</Badge>}
                  {p.Framework === 'sled' && <Badge variant="outline">State &amp; Local</Badge>}
                </div>
                <div className="text-sm">{agencyLine(p)}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {p.Office && <Detail icon={<Building2 className="h-3.5 w-3.5" />}>{p.Office}</Detail>}
                  {p.Location && <Detail icon={<MapPin className="h-3.5 w-3.5" />}>{p.Location}</Detail>}
                  {p.ContractingOffice && <Detail icon={<FileSignature className="h-3.5 w-3.5" />}>{p.ContractingOffice}</Detail>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs tabular-nums text-muted-foreground">{uses(p.ProfileId) || 'No'} requirement{uses(p.ProfileId) === 1 ? '' : 's'}</span>
                <Button size="sm" variant="outline" onClick={() => setEditing(p)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {editing && <ProfileDialog profile={editing} taken={data.profiles.map((p) => p.ProfileId)} onClose={() => setEditing(undefined)} />}
    </div>
  )
}

function Detail({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span className="flex min-w-0 items-center gap-1">{icon}<span className="truncate">{children}</span></span>
}

function Field({ id, title, hint, error, children, wide }: { id: string; title: string; hint?: string; error?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`space-y-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <label htmlFor={id} className="text-sm font-medium">{title}</label>
      {children}
      {error ? <p className="text-xs text-[var(--ss-critical)]">{error}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

const REQUIRED: (keyof RequesterProfile)[] = ['Name', 'Agency', 'Office']

/** Add or edit one requester. Saving writes the profile; a new one gets an id from the name. */
function ProfileDialog({ profile, taken, onClose }: { profile: RequesterProfile; taken: string[]; onClose: () => void }) {
  const { sdk, preview, patch } = useRequirementsData()
  const [p, setP] = useState(profile)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const isNew = !profile.ProfileId
  const set = (x: Partial<RequesterProfile>) => setP((v) => ({ ...v, ...x }))
  const missing = (k: keyof RequesterProfile) => tried && !String(p[k] ?? '').trim()
  const text = (k: 'Name' | 'Title' | 'Agency' | 'Department' | 'Office' | 'Location' | 'ContractingOffice') =>
    ({ value: p[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: e.target.value }), 'aria-invalid': missing(k) || undefined })

  const save = async () => {
    setTried(true)
    if (REQUIRED.some((k) => !String(p[k] ?? '').trim())) return
    setBusy(true)
    try {
      const row = { ...p, Name: p.Name.trim(), ProfileId: p.ProfileId || newProfileId(p.Name, taken) }
      await saveProfile({ sdk, preview, patch }, row)
      toast.success(`${isNew ? 'Added' : 'Saved'} ${row.Name}`)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add a requester' : `Edit ${profile.Name}`}</DialogTitle>
          <DialogDescription>What this person's profile fills in when they start a requirement.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pf-name" title="Name" error={missing('Name') ? 'Enter a name.' : undefined}><Input id="pf-name" {...text('Name')} placeholder="e.g. Leah Okonkwo" /></Field>
          <Field id="pf-title" title="Title"><Input id="pf-title" {...text('Title')} placeholder="e.g. Program Manager" /></Field>
          <Field id="pf-agency" title="Agency" error={missing('Agency') ? 'Enter the agency.' : undefined}><Input id="pf-agency" {...text('Agency')} placeholder="e.g. Department of the Army" /></Field>
          <Field id="pf-dept" title="Department" hint="The department the agency sits under, if any.">
            <Input id="pf-dept" list="pf-departments" {...text('Department')} placeholder="e.g. Department of Defense" />
            <datalist id="pf-departments">{DEPARTMENTS.map((d) => <option key={d} value={d} />)}</datalist>
          </Field>
          <Field id="pf-office" title="Requiring office" error={missing('Office') ? 'Enter the office.' : undefined}><Input id="pf-office" {...text('Office')} placeholder="e.g. Training Support Center" /></Field>
          <Field id="pf-co" title="Contracting office" hint="Where their packages go."><Input id="pf-co" {...text('ContractingOffice')} placeholder="e.g. Network Contracting Office 10" /></Field>
          <Field id="pf-location" title="Location" hint="The default delivery place for products and place of performance for services." wide>
            <Input id="pf-location" {...text('Location')} placeholder="e.g. Building 33018, Fort Cavazos, TX" />
          </Field>
          <Field id="pf-fw" title="Workspace">
            <Select value={p.Framework || 'federal'} onValueChange={(v) => set({ Framework: v })}>
              <SelectTrigger id="pf-fw"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="federal">Federal</SelectItem>
                <SelectItem value="sled">State &amp; Local</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 sm:self-end">
            <label htmlFor="pf-active" className="text-sm">
              <span className="block font-medium">Active</span>
              <span className="block text-xs text-muted-foreground">Can sign in and start requirements</span>
            </label>
            <Switch id="pf-active" checked={p.Active} onCheckedChange={(v) => set({ Active: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{isNew ? <><Plus className="mr-1.5 h-4 w-4" />Add requester</> : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
