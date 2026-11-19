import { useSyncExternalStore } from 'react'
import type { LoadedWorld } from './loadWorld.ts'
import type { PanelContent } from './panelContent.ts'
import { loadPanel, localFilesBase, worldFiles, type PanelTarget } from './worldData.ts'

/** The open panel: nothing, loading, or what was found. Written when the visitor clicks an exhibit or a sign. */
export type PanelState = { status: 'closed' } | { status: 'loading'; heading: string } | { status: 'open'; content: PanelContent }

let current: PanelState = { status: 'closed' }
let ticket = 0
const listeners = new Set<() => void>()
const set = (next: PanelState) => {
  current = next
  for (const listener of listeners) listener()
}

export const panelStore = {
  get: (): PanelState => current,
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  close(): void {
    ticket++
    set({ status: 'closed' })
  },
  /** Opens the panel for a click: shows that it is loading, then what was read. A slower earlier click never overwrites a later one. */
  async open(target: PanelTarget, world: LoadedWorld): Promise<void> {
    const mine = ++ticket
    set({ status: 'loading', heading: target.kind === 'sign' ? target.place.name : target.kind === 'plot' ? target.request.name : target.exhibit.label })
    // `?world=local` reads the panels' files from the same server as the world (so they can be looked at before they go live).
    const localBase = localFilesBase(world, location.origin, import.meta.env.BASE_URL)
    const content = await loadPanel(target, { world, files: worldFiles(world, undefined, localBase), localSite: localBase })
    if (mine === ticket) set({ status: 'open', content })
  },
}

export const usePanel = (): PanelState => useSyncExternalStore(panelStore.subscribe, panelStore.get)
