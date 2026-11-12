import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TextareaHTMLAttributes } from 'react'
import { Plus, X } from 'lucide-react'
import { sectionsToText, textToSections } from '../lib/agents'
import type { Section } from '../lib/types'

/** The stored text, without sections left completely empty. */
const toText = (xs: Section[]) => sectionsToText(xs.filter((s) => s.heading.trim() || s.text.trim()))
const sectionsOf = (t: string): Section[] => {
  const xs = textToSections(t)
  return xs.length ? xs : [{ heading: '', text: '' }]
}

/** A textarea as tall as its text, so a section reads like a page rather than a scrolling box. */
function Grow(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const fit = () => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }
  useLayoutEffect(fit, [props.value])
  useEffect(() => {
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return <textarea ref={ref} rows={1} {...props} />
}

/** The next heading's number when the document numbers its sections ("4. Delivery" → "5. "). */
function nextHeading(xs: Section[]) {
  const m = /^(\d+)\./.exec(xs[xs.length - 1]?.heading.trim() ?? '')
  return m ? `${Number(m[1]) + 1}. ` : ''
}

/**
 * A package document edited as a document: each section's heading and text in the app's own type, growing with the
 * text. It edits the same "## Heading" text the record stores (sectionsToText), so the record page and the agents
 * read it unchanged.
 */
export function DocEditor({ id, label, value, onChange, placeholder }: {
  id: string; label: string; value: string; onChange: (text: string) => void; placeholder?: string
}) {
  const [sections, setSections] = useState(() => sectionsOf(value))
  // The text this editor sent last: a different value means a redraft or a reload replaced it.
  const sent = useRef(value)
  useEffect(() => {
    if (value === sent.current) return
    sent.current = value
    setSections(sectionsOf(value))
  }, [value])

  const update = (next: Section[]) => {
    setSections(next)
    sent.current = toText(next)
    onChange(sent.current)
  }
  const set = (i: number, p: Partial<Section>) => update(sections.map((s, j) => (j === i ? { ...s, ...p } : s)))
  const remove = (i: number) => update(sections.length > 1 ? sections.filter((_, j) => j !== i) : [{ heading: '', text: '' }])

  return (
    <div id={id} role="group" aria-label={label} className="rounded-xl border border-border bg-background px-2 py-3 sm:px-4 sm:py-4">
      <div className="space-y-1">
        {sections.map((s, i) => (
          <section key={i} className="group relative rounded-lg px-3 py-2 transition-colors hover:bg-muted/40 focus-within:bg-muted/50">
            <input value={s.heading} onChange={(e) => set(i, { heading: e.target.value })} aria-label={`Section ${i + 1} heading`}
              placeholder="Section heading, e.g. 1. Background"
              className="w-full bg-transparent pr-8 text-[15px] font-semibold tracking-tight text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground" />
            <Grow value={s.text} onChange={(e) => set(i, { text: e.target.value })} aria-label={`Section ${i + 1} text`}
              placeholder={i === 0 && placeholder ? placeholder : 'Write this section. Start a line with "- " for a list.'}
              className="mt-1 block w-full resize-none overflow-hidden bg-transparent text-sm leading-relaxed text-foreground/90 outline-none placeholder:text-muted-foreground" />
            <button type="button" onClick={() => remove(i)} aria-label={`Remove section ${i + 1}`} title="Remove this section"
              className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </section>
        ))}
      </div>
      <button type="button" onClick={() => update([...sections, { heading: nextHeading(sections), text: '' }])}
        className="ml-3 mt-2 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground">
        <Plus className="h-3.5 w-3.5" />Add a section
      </button>
    </div>
  )
}
