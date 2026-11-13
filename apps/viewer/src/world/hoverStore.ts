import { useSyncExternalStore } from 'react'

/** What the visitor is pointing at in the world: an exhibit's label, or a place's sign. Written by the 3D scene, read by the label. */
export interface Hover {
  title: string
  text: string
}

let current: Hover | null = null
const listeners = new Set<() => void>()

export const hoverStore = {
  get: (): Hover | null => current,
  set(next: Hover | null): void {
    if (next === current || (next && current && next.title === current.title && next.text === current.text)) return
    current = next
    for (const listener of listeners) listener()
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export const useHover = (): Hover | null => useSyncExternalStore(hoverStore.subscribe, hoverStore.get)
