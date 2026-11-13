import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Place } from '@forkling/schema'

/** The places in a world repo (`places/<id>.json`), in id order. A file that does not fit the schema is left out, never guessed at. */
export function readPlaces(dir: string): Place[] {
  const folder = join(dir, 'places')
  if (!existsSync(folder)) return []
  return parsePlaces(
    readdirSync(folder)
      .filter((f) => f.endsWith('.json'))
      .map((f) => readFileSync(join(folder, f), 'utf8')),
  )
}

/** Places from the text of their files, in id order, skipping any that are not valid. */
export function parsePlaces(texts: readonly string[]): Place[] {
  const places: Place[] = []
  for (const text of texts) {
    try {
      const parsed = Place.safeParse(JSON.parse(text))
      if (parsed.success) places.push(parsed.data)
    } catch {
      // Not JSON: not a place.
    }
  }
  return places.sort((a, b) => a.id.localeCompare(b.id))
}
