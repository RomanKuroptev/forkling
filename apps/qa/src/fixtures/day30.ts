import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Place, Trail, WorkMeta, type Kit } from '@forkling/schema'
import { kit as engineKit } from '@forkling/schema/kit'
import { createPrng, validatePlace, type Prng } from '@forkling/sim'

/**
 * `day-30` by code (audit spec 4: it is for volume): day-7 plus 23 days of works, trails, places and rooms, made through the
 * schemas and the place rules with a seeded PRNG, no model and no clock. The words are plain placeholders; the shapes are
 * what Merge's own files look like, copied from day-7. Same seed, same files.
 */

const DAY = 86_400_000
const write = (dir: string, rel: string, value: unknown) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`)
}
const readJson = (dir: string, rel: string): unknown => JSON.parse(readFileSync(join(dir, rel), 'utf8'))
const pick = <T>(prng: Prng, list: readonly T[]): T => list[prng.int(list.length)]!

// Not memes: a meme must name the format it looked at, which a placeholder cannot honestly do.
const WORK_KINDS = ['art', 'game', 'tool', 'sound', 'zine'] as const

/** The slots of a place's rooms that can show a work (a screen, a frame or a terminal) and are free. */
function freeWorkSlots(place: Place, kit: Kit): string[] {
  const used = new Set(place.exhibits.map((e) => e.slot))
  const out: string[] = []
  for (const room of place.rooms) {
    room.parts.forEach((placed, i) => {
      const part = kit.parts.find((p) => p.id === placed.part)
      part?.slots.forEach((slot, k) => {
        const id = `${room.id}/${i}/${k}`
        if (['screen', 'frame', 'terminal'].includes(slot.kind) && !used.has(id)) out.push(id)
      })
    })
  }
  return out
}

/** Chunks around the origin, nearest first: where new places go. */
function* chunksOutward(): Generator<[number, number]> {
  for (let r = 1; r < 12; r++) for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) if (Math.max(Math.abs(x), Math.abs(z)) === r) yield [x, z]
}

export interface GrowOptions {
  seed: number
  days: number
  /** The first day added (YYYY-MM-DD). */
  start: string
  kit?: Kit
}

/** Grows the world in `dir` (a copy of day-7) in place. Returns what it added. */
export function growDay30(dir: string, opts: GrowOptions): { places: number; rooms: number; works: number; trails: number } {
  const kit = opts.kit ?? engineKit
  const prng = createPrng(opts.seed)
  const placeFiles = readdirSync(join(dir, 'places')).filter((f) => f.endsWith('.json')).sort()
  const places = placeFiles.map((f) => Place.parse(readJson(dir, `places/${f}`)))
  const templates = places.filter((p) => !['home', 'workshop'].includes(p.id))
  const template = templates[0] ?? places[0]!
  const workDirs = readdirSync(join(dir, 'works')).filter((d) => existsSync(join(dir, 'works', d, 'meta.json'))).sort()
  const workTemplate = WorkMeta.parse(readJson(dir, `works/${workDirs[0]}/meta.json`))
  const page = readFileSync(join(dir, 'works', workDirs[0]!, 'index.html'), 'utf8')
  const trailFile = readdirSync(join(dir, 'trails')).filter((f) => f.endsWith('.json')).sort()[0]!
  const trailTemplate = Trail.parse(readJson(dir, `trails/${trailFile}`))
  const exists = (path: string) => existsSync(join(dir, path)) || existsSync(join(dir, `${path}.json`))
  const chunks = chunksOutward()
  const taken = new Set(places.map((p) => p.chunk.join(',')))
  const added = { places: 0, rooms: 0, works: 0, trails: 0 }
  const startMs = Date.parse(`${opts.start}T00:00:00Z`)

  for (let d = 0; d < opts.days; d++) {
    const date = new Date(startMs + d * DAY).toISOString().slice(0, 10)
    const at = (h: number) => new Date(startMs + d * DAY + h * 3_600_000).toISOString()

    // Every third day, a new place, the shape of a place Merge founded, on the next free chunk.
    if (d % 3 === 1) {
      let chunk = chunks.next().value as [number, number]
      while (taken.has(chunk.join(','))) chunk = chunks.next().value as [number, number]
      taken.add(chunk.join(','))
      const n = places.length + 1
      const room = { ...template.rooms[0]!, id: 'main-room' }
      const place: Place = Place.parse({
        ...template,
        id: `grown-place-${n}`,
        name: `Grown Place ${n}`,
        purpose: `A place grown for the day-30 fixture on ${date}, the shape of one Merge founded.`,
        founded: date,
        chunk,
        offset: [0, 0],
        related: [pick(prng, places).id],
        paths: [],
        exterior: { ...template.exterior, sign: `GROWN PLACE ${n}`, palette: pick(prng, kit.palettes).id },
        rooms: [room],
        exhibits: [],
        state: { ...template.state, construction: null, lastCareAt: at(9), closed: null },
        away: [],
        history: [{ at: at(9), verb: 'found', summary: `Founded for the day-30 fixture.` }],
      })
      places.push(place)
      added.places++
    }

    // Every fourth day, a place that has room for it gets one more room, a copy of its first, beside it.
    if (d % 4 === 2) {
      const grown = places.filter((p) => p.rooms.length < 3 && p.id.startsWith('grown-place-'))
      if (grown.length) {
        const p = pick(prng, grown)
        const first = p.rooms[0]!
        const next = { ...first, id: `room-${p.rooms.length + 1}`, floor: p.rooms.length, at: first.at }
        const candidate = { ...p, exterior: { ...p.exterior, floors: p.rooms.length + 1 }, rooms: [...p.rooms, next], history: [...p.history, { at: at(11), verb: 'expand' as const, summary: 'One more floor for the day-30 fixture.' }] }
        if (validatePlace(candidate, { kit, exists }).length === 0) {
          places[places.indexOf(p)] = Place.parse(candidate)
          added.rooms++
        }
      }
    }

    // Two works a day, each on a free screen or frame somewhere, or only on the shelf when there is none.
    for (let k = 0; k < 2; k++) {
      const id = `grown-work-${date}-${k + 1}`
      const meta = WorkMeta.parse({ ...workTemplate, id, title: `Grown Work ${date} ${k + 1}`, kind: pick(prng, WORK_KINDS), about: `A work grown for the day-30 fixture on ${date}.`, made: at(13 + k), titleHistory: [], status: 'shelf', installedIn: null })
      write(dir, `works/${id}/meta.json`, meta)
      write(dir, `works/${id}/index.html`, page)
      added.works++
      const withRoom = places.map((p) => ({ p, slots: freeWorkSlots(p, kit) })).filter((x) => x.slots.length > 0)
      if (withRoom.length && prng.next() < 0.8) {
        const { p, slots } = pick(prng, withRoom)
        const slot = slots[0]!
        const candidate = { ...p, exhibits: [...p.exhibits, { id: `screen-${id}`.slice(0, 41).replace(/-+$/, ''), kind: 'work', ref: `works/${id}`, slot, label: meta.title, added: date }] }
        if (validatePlace(candidate, { kit, exists }).length === 0) places[places.indexOf(p)] = Place.parse(candidate)
      }
    }

    // Three trails a day.
    for (let k = 0; k < 3; k++) {
      const id = `${date}-${k + 1}`
      write(dir, `trails/${id}.json`, Trail.parse({ ...trailTemplate, id, date, purpose: `A trail grown for the day-30 fixture (${k + 1}).` }))
      added.trails++
    }
  }
  for (const p of places) {
    const problems = validatePlace(p, { kit, exists })
    if (problems.length) throw new Error(`grown place ${p.id} breaks the place rules: ${problems.join('; ')}`)
    write(dir, `places/${p.id}.json`, p)
  }
  return added
}
