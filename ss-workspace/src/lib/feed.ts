import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/**
 * Which loop the element's CSS animation is on, read from the animation's own clock rather than animationiteration
 * events, which a browser skips while the page isn't being drawn (a background tab, a hidden pane).
 */
export function useLoop(ref: RefObject<HTMLElement | null>) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      const it = ref.current?.getAnimations()[0]?.effect?.getComputedTiming().currentIteration
      if (typeof it === 'number') setN(it)
    }, 200)
    return () => clearInterval(id)
  }, [ref])
  return n
}

/**
 * A live feed for the hero animations: a new item glides in at the top every couple of seconds, the others ease down a
 * row, and the oldest drifts out the bottom as it fades. One extra item is kept while it fades out.
 */
export function useFeed<T>(source: T[], shown: number, everyMs = 2000) {
  const [items, setItems] = useState<{ id: number; item: T }[]>([])
  const nextId = useRef(0)
  useEffect(() => {
    let i = 0
    const add = () => {
      const id = nextId.current++
      setItems((xs) => [{ id, item: source[i++ % source.length] }, ...xs].slice(0, shown + 1))
    }
    add()
    const t = setInterval(add, everyMs)
    return () => clearInterval(t)
  }, [source, shown, everyMs])
  return items
}
