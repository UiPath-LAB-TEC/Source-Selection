import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@uipath/apollo-wind/components/ui/tooltip'
import type { PersonaId } from '../lib/types'

const PERSONA_COLOR: Record<PersonaId, string> = {
  co: '#1d3a8a', evaluator1: '#2a78d6', evaluator2: '#0e7490', evaluator3: '#7c3aed', chair: '#b45309', ssa: '#be123c', admin: '#475467', counsel: '#0f766e',
  cor: '#4d7c0f', rm: '#9333ea',
}

/**
 * Headshots for the fictional officials, from src/assets/people/<personaId>.<ext>.
 * A photo (jpg/png/webp) takes precedence over the illustrated SVG from tools/generate_headshots.js.
 */
const HEADSHOTS = import.meta.glob<string>('../assets/people/*.{jpg,jpeg,png,webp,svg}', { eager: true, query: '?url', import: 'default' })
const headshot = (id: PersonaId) =>
  ['jpg', 'jpeg', 'png', 'webp', 'svg'].map((x) => HEADSHOTS[`../assets/people/${id}.${x}`]).find(Boolean)

/** Headshot; with a `title` ("Name · Role") it shows a hover caption. */
export function PersonaAvatar({ id, short, size = 28, title }: { id: PersonaId; short: string; size?: number; title?: string }) {
  const src = headshot(id)
  const face = src
    ? <img src={src} alt={title ?? ''} width={size} height={size} className="shrink-0 rounded-full object-cover ring-2 ring-white/70" style={{ width: size, height: size, background: PERSONA_COLOR[id] }} />
    : (
      <span className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white/70"
        style={{ width: size, height: size, fontSize: size * 0.38, background: PERSONA_COLOR[id] }}>{short}</span>
    )
  if (!title) return face
  const [name, ...rest] = title.split(' · ')
  return (
    <TooltipProvider delayDuration={80}>
      <Tooltip>
        <TooltipTrigger asChild><span className="inline-flex shrink-0 rounded-full" tabIndex={0}>{face}</span></TooltipTrigger>
        <TooltipContent side="top" className="text-center">
          <span className="block text-xs font-semibold">{name}</span>
          {rest.length > 0 && <span className="block text-[11px] opacity-80">{rest.join(' · ')}</span>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const OFFEROR_HUES = ['#2a78d6', '#0e7490', '#7c3aed', '#b45309', '#be123c', '#15803d']

export function initials(name: string) {
  return name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('')
}

export function OfferorAvatar({ name, index, size = 28 }: { name: string; index: number; size?: number }) {
  return (
    <span title={name} className="inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36, background: OFFEROR_HUES[index % OFFEROR_HUES.length] }}>
      {initials(name)}
    </span>
  )
}

export function AvatarStack({ names }: { names: string[] }) {
  return (
    <span className="flex -space-x-2">
      {names.map((n, i) => (
        <span key={n} className="rounded-full ring-2 ring-card">
          <span title={n} className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white"
            style={{ background: OFFEROR_HUES[i % OFFEROR_HUES.length] }}>{initials(n)}</span>
        </span>
      ))}
    </span>
  )
}

export function agencyMark(agency: string) {
  if (/Air Force/i.test(agency)) return 'DAF'
  if (/National Institutes of Health/i.test(agency)) return 'NIH'
  // School districts go by their initials in full, e.g. Willowmere Unified School District → WUSD.
  if (/School District/i.test(agency)) return agency.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 4).map((w) => w[0]).join('')
  return agency.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 3).map((w) => w[0]).join('')
}

export function AgencyMark({ agency, size = 44 }: { agency: string; size?: number }) {
  return (
    <span className="ss-hero inline-flex shrink-0 items-center justify-center rounded-xl font-bold tracking-wide"
      style={{ width: size, height: size, fontSize: size * 0.3 }}>{agencyMark(agency)}</span>
  )
}

export function HeroTile({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: string; icon?: ReactNode }) {
  return (
    <div className="ss-hero-tile min-w-0 rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-white/80">{icon}<span className="truncate">{label}</span></div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="truncate text-xs text-white/75">{sub}</div>}
    </div>
  )
}
