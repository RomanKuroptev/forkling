import { Place, type SouvenirKindName } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import homeFile from '../../../templates/forkling-world/places/home.json'
import workshopFile from '../../../templates/forkling-world/places/workshop.json'
import { choosePlacement, toLandPlace } from './land.ts'
import { derivePaths, type WorldPath } from './paths.ts'
import { createPrng } from './prng.ts'

/**
 * A made-up world for looking at: a seeded set of places on the land, with their paths, built from the real Home and Workshop
 * and the real kit. The viewer shows it as `?world=local&fixture=10`, the site renders it in a test and the render budget is
 * measured on it. The tags and names are invented for the fixture and mean nothing to Merge.
 */
export const FIXTURE_NOW = '2026-12-20T12:00:00+01:00'

const TAGS = ['sea', 'signals', 'moss', 'clocks', 'maps', 'birds']
/** Days since care for the places, in turn, so every level of neglect (spec 4.4) shows. */
const DAYS_SINCE_CARE = [0, 10, 20, 40]
const DAY_MS = 86_400_000

export interface FixtureWorld {
  seed: number
  /** The moment the fixture treats as now, for neglect. */
  now: string
  places: Place[]
  paths: WorldPath[]
  /** The souvenir files the exhibits point at, and their kinds. */
  souvenirs: Record<string, SouvenirKindName>
}

const pad = (n: number) => String(n).padStart(2, '0')

export function makeFixtureWorld(seed = 1, count = 10, now: string = FIXTURE_NOW): FixtureWorld {
  const prng = createPrng(seed)
  const places: Place[] = [Place.parse(homeFile), Place.parse(workshopFile)]
  const souvenirs: Record<string, SouvenirKindName> = {}

  for (let i = 2; i < count; i++) {
    const pool = [...TAGS]
    for (let k = pool.length - 1; k > 0; k--) {
      const j = prng.int(k + 1)
      ;[pool[k], pool[j]] = [pool[j]!, pool[k]!]
    }
    const tags = pool.slice(0, 1 + prng.int(2))
    const related = i % 3 === 0 ? [places[prng.int(places.length)]!.id] : []
    const chunk = choosePlacement(places.map(toLandPlace), { tags, related }, seed * 1000 + i)
    if (!chunk) break

    const footprint: [number, number] = [10 + prng.int(13), 10 + prng.int(13)]
    const hx = (footprint[0] - 2) / 2
    const hz = (footprint[1] - 2) / 2
    const id = `place-${pad(i)}`
    const name = `House of ${tags[0]![0]!.toUpperCase()}${tags[0]!.slice(1)} ${i}`
    const founded = `2026-11-${pad(12 + Math.floor(i / 4))}`

    const parts = [
      { part: 'shelf-low', at: [-(hx - 1.5), 0, -(hz - 0.3)], rot: 0 },
      { part: 'shelf-low', at: [hx - 1.5, 0, -(hz - 0.3)], rot: 0 },
      { part: 'frame-large', at: [0, 1.6, hz - 0.1], rot: 3.1416 },
      { part: 'case-glass', at: [0, 0, 0], rot: 0 },
      { part: 'plaque-stand', at: [hx - 1, 0, hz - 1], rot: 0 },
      { part: 'lamp-floor', at: [-(hx - 0.5), 0, hz - 0.5], rot: 0 },
    ]
    const exhibits: unknown[] = []
    const add = (k: number, kind: SouvenirKindName, slot: string) => {
      const ref = `souvenirs/fixture-${pad(i)}-${k}`
      souvenirs[ref] = kind
      exhibits.push({ id: `${id}-${k}`, kind: 'souvenir', ref, slot, label: `A ${kind} kept for ${name}.`, added: founded })
    }
    const shelved = 2 + prng.int(5)
    for (let k = 0; k < shelved; k++) add(k, (['quote', 'fact', 'image'] as const)[k % 3]!, `main/${Math.floor(k / 3)}/${k % 3}`)
    add(10, 'image', 'main/2/0')
    add(11, 'fact', 'main/3/0')
    add(12, 'quote', 'main/4/0')

    const lastCare = new Date(Date.parse(now) - DAYS_SINCE_CARE[i % DAYS_SINCE_CARE.length]! * DAY_MS).toISOString()
    places.push(
      Place.parse({
        id,
        name,
        purpose: `A fixture place about ${tags.join(' and ')}.`,
        tags,
        founded,
        chunk,
        related,
        exterior: { style: kit.styles[i % kit.styles.length]!.id, footprint, floors: 1, palette: kit.palettes[i % kit.palettes.length]!.id, sign: name.toUpperCase().slice(0, 24) },
        rooms: [{ id: 'main', name: 'Main room', size: [footprint[0] - 2, footprint[1] - 2, 3.4], at: [0, 0], floor: 0, parts }],
        exhibits,
        state: { construction: null, lastCareAt: lastCare, neglect: 0, lamps: true },
        history: [{ at: `${founded}T10:00:00+01:00`, verb: 'found', summary: `Founded ${name}.` }],
      }),
    )
  }

  return { seed, now, places, paths: derivePaths(places.map(toLandPlace)), souvenirs }
}
