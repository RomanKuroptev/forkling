import { bodyWorldFor, type BodyWorld } from '@forkling/sim'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createWorldClock, type WorldClock } from '../clock.ts'
import { species, type SpeciesEntry } from '../species/registry.ts'
import type { LoadedWorld } from './loadWorld.ts'

export interface WorldView {
  world: LoadedWorld
  species: SpeciesEntry
  /** What the body walks on, as the sim sees it: the same world the mind builds from the same files. */
  simWorld: BodyWorld
  clock: WorldClock
}

const WorldContext = createContext<WorldView | null>(null)

export function WorldProvider({ world, children }: { world: LoadedWorld; children: ReactNode }) {
  const view = useMemo(
    () => ({
      world,
      // loadWorld only accepts species from the registry, so this always exists.
      species: species[world.forkling.species]!,
      simWorld: bodyWorldFor({ seed: world.forkling.seed, pack: species[world.forkling.species]!.pack, places: world.places, objects: world.objects }),
      clock: createWorldClock(world.forkling.timezone, location.search),
    }),
    [world],
  )
  return <WorldContext.Provider value={view}>{children}</WorldContext.Provider>
}

export function useWorld(): WorldView {
  const view = useContext(WorldContext)
  if (!view) throw new Error('useWorld must be used inside a WorldProvider')
  return view
}
