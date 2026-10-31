/** A tiny observable boolean, for React's `useSyncExternalStore`. Subscribers hear only about real changes. */
export interface Flag {
  get(): boolean
  set(value: boolean): void
  toggle(): void
  subscribe(listener: () => void): () => void
}

export function createFlag(initial: boolean): Flag {
  let value = initial
  const listeners = new Set<() => void>()
  const set = (next: boolean) => {
    if (next === value) return
    value = next
    for (const l of listeners) l()
  }
  return {
    get: () => value,
    set,
    toggle: () => set(!value),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
