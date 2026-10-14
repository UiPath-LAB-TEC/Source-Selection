import { PersonaAvatar } from './Flair'
import { ownerOf } from '../lib/roles'
import { titled, useTerms } from '@forms/lib/terms'
import { PERSONAS } from '../lib/types'
import type { Persona, PersonaId, Plan, Solicitation } from '../lib/types'

/**
 * Who is on this source selection: officials, the SSEB with their assigned factors, and who it waits on. `nextUp`
 * is who Maestro is waiting on right now (so an evaluator who has submitted drops off at once); without a live run
 * it falls back to the evaluation's status.
 */
export function TeamStrip({ plan, sol, nextUp }: { plan: Plan; sol: Solicitation; nextUp?: PersonaId[] }) {
  const waiting = new Set<PersonaId>(nextUp ?? ownerOf(sol)?.who ?? [])
  const factorName = (id: string) => plan.factors.find((f) => f.id === id)?.name ?? id
  const evaluators = plan.panel.evaluators.filter((e) => e.factors.length)
  const t = useTerms()
  const pick = (id: string) => titled(PERSONAS.find((p) => p.id === id)!, t.id)
  const members: { p: Persona; duty: string }[] = [
    { p: pick('co'), duty: t.sled ? 'Releases proposals · cost evaluation' : 'Releases proposals · price reasonableness' },
    ...evaluators.map((e) => ({ p: PERSONAS.find((x) => x.slot === e.slot)!, duty: e.factors.map(factorName).join(' · ') })).filter((m) => m.p).map((m) => ({ ...m, p: titled(m.p, t.id) })),
    { p: pick('chair'), duty: t.sled ? 'Leads consensus · signs the committee report' : 'Leads consensus · signs the SSEB report' },
    { p: pick('ssa'), duty: t.sled ? 'Signs the recommendation of award to the Board' : 'Makes and signs the award decision' },
  ]
  return (
    <section className="ss-in rounded-2xl border border-border bg-card px-4 py-3" aria-label={t.sled ? 'Evaluation committee' : 'Source selection team'}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t.sled ? 'Evaluation committee' : 'Source selection team'}</h2>
        <span className="text-[11px] text-muted-foreground">{evaluators.length} evaluator{evaluators.length === 1 ? '' : 's'} on {t.theBoard}</span>
      </div>
      <ul className="grid gap-x-3 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {members.map(({ p, duty }) => {
          const next = waiting.has(p.id)
          return (
            <li key={p.id} className={`flex items-center gap-2.5 rounded-xl border p-2 ${next ? 'border-primary/60 bg-primary/5' : 'border-transparent'}`}>
              <PersonaAvatar id={p.id} short={p.short} size={38} />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{p.name}</span>
                  {next && <span className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">Next up</span>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{p.label}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">{duty}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
