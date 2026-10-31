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

/** The part of `localStorage` a persisted flag uses. */
export interface FlagStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * A flag that is remembered between visits. The browser may refuse storage (private windows, blocked site data), and then
 * it simply forgets: the page works the same, it just does not remember.
 */
export function createPersistedFlag(key: string, initial: boolean, storage: FlagStorage | undefined): Flag {
  let start = initial
  try {
    const saved = storage?.getItem(key)
    if (saved === '1') start = true
    else if (saved === '0') start = false
  } catch {
    // Not remembered.
  }
  const flag = createFlag(start)
  const save = () => {
    try {
      storage?.setItem(key, flag.get() ? '1' : '0')
    } catch {
      // Not remembered.
    }
  }
  return {
    ...flag,
    set(value) {
      flag.set(value)
      save()
    },
    toggle() {
      flag.toggle()
      save()
    },
  }
}
