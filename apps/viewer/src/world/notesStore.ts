import { useSyncExternalStore } from 'react'
import type { Note } from '@forkling/schema'

/** The notes the viewer holds, and which one is open in the panel. */
export function createNotesStore() {
  let notes: readonly Note[] = []
  let openId: string | null = null
  const listeners = new Set<() => void>()
  const emit = () => {
    for (const listener of listeners) listener()
  }
  const opened = (): Note | null => (openId ? (notes.find((n) => n.id === openId) ?? null) : null)
  return {
    get: (): readonly Note[] => notes,
    opened,
    set(next: readonly Note[]): void {
      notes = next
      if (openId && !notes.some((n) => n.id === openId)) openId = null
      emit()
    },
    /** Opens a note by its id; an id that is not there opens nothing. */
    open(id: string): void {
      openId = notes.some((n) => n.id === id) ? id : null
      emit()
    },
    close(): void {
      openId = null
      emit()
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export const notesStore = createNotesStore()
export const useNotes = (): readonly Note[] => useSyncExternalStore(notesStore.subscribe, notesStore.get)
export const useOpenedNote = (): Note | null => useSyncExternalStore(notesStore.subscribe, notesStore.opened)
