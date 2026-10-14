import { Building2, School } from 'lucide-react'
import { FRAMEWORKS } from '@forms/lib/terms'
import { useFrameworkMode } from '../hooks/useFramework'

const ICON = { federal: Building2, sled: School }

/** Federal or State & Local: which evaluations the workspace shows, and in whose words. The chosen one is filled in primary. */
export function FrameworkSwitch({ disabled }: { disabled?: boolean }) {
  const { framework, setFramework } = useFrameworkMode()
  return (
    <div role="radiogroup" aria-label="Procurement framework" className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1">
      {FRAMEWORKS.map((f) => {
        const Icon = ICON[f.id]
        const on = f.id === framework
        return (
          <button key={f.id} type="button" role="radio" aria-checked={on} disabled={disabled} title={f.hint} onClick={() => setFramework(f.id)}
            className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 ${on
              ? 'bg-primary font-semibold text-primary-foreground shadow-md'
              : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{f.label}</span>
          </button>
        )
      })}
    </div>
  )
}
