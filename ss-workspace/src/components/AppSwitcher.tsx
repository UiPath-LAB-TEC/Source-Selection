import { Check, ChevronsUpDown, Gavel, Landmark } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@uipath/apollo-wind/components/ui/popover'
import { useTerms } from '@forms/lib/terms'
import { APPS, appUrl } from '../lib/apps'
import type { AppId, AppInfo } from '../lib/apps'

const ICON: Record<AppId, typeof Landmark> = { 'source-selection': Landmark, award: Gavel }

/** The brand block at the top of every app's sidebar: the app in use, and a switch to the other phase apps. */
export function AppSwitcher({ current }: { current: AppId }) {
  const t = useTerms()
  const here = APPS.find((a) => a.id === current)!
  const name = (a: AppInfo) => (t.sled ? a.sledName : a.name)
  const Icon = ICON[current]
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-xl p-1 text-left hover:bg-muted/60" aria-label={`${name(here)}: switch app`}>
          <span className="ss-hero flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><Icon className="relative z-10 h-5 w-5" /></span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate font-semibold">{name(here)}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{t.sled ? 'Agentic Procurement' : 'Agentic Acquisition'}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <p className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground">Every phase works on the same {t.process} record.</p>
        {APPS.map((a) => {
          const AppIcon = ICON[a.id]
          const on = a.id === current
          return (
            <a key={a.id} href={on ? undefined : appUrl(a.id)} aria-current={on ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted ${on ? 'bg-muted' : ''}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: a.accent }}><AppIcon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{name(a)}</span>
                <span className="block truncate text-xs text-muted-foreground">{t.sled ? a.sledBlurb : a.blurb}</span>
              </span>
              {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </a>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
