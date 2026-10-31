import { readFileSync } from 'node:fs'
import { SpeciesPack, TemperamentPools, type MicroBehavior } from '@forkling/schema'
import { behaviors as catBehaviors } from '@forkling/species-cat/behaviors'

/** Everything the mind needs to know about a species. The mind never hardcodes one; it reads the pack. */
export interface SpeciesEntry {
  pack: SpeciesPack
  behaviors: MicroBehavior[]
  /** The species `persona.md`. */
  persona: string
  /** Where its likes, dislikes and quirks are rolled from. */
  pools: TemperamentPools
}

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const entries: Record<string, () => SpeciesEntry> = {
  cat: () => ({
    pack: SpeciesPack.parse(JSON.parse(read('../../../species/cat/species.json'))),
    behaviors: catBehaviors,
    persona: read('../../../species/cat/persona.md'),
    pools: TemperamentPools.parse(JSON.parse(read('../../../species/cat/temperament.json'))),
  }),
}

/** A species pack shipped with the engine, by id. */
export function loadSpecies(id: string): SpeciesEntry {
  const load = entries[id]
  if (!load) throw new Error(`there is no "${id}" species pack (available: ${Object.keys(entries).join(', ')})`)
  return load()
}
