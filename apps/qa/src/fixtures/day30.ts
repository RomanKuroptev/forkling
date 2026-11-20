import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Place, SLOT_ACCEPTS, Souvenir, Trail, WorkMeta, type Kit, type SlotKind } from '@forkling/schema'
import { kit as engineKit } from '@forkling/schema/kit'
import { choosePlacement, createPrng, toLandPlace, validatePlace, type Prng } from '@forkling/sim'

/**
 * `day-30` by code (audit spec 4: it is for volume): day-7 plus 23 days of works, trails, places and rooms, made through the
 * schemas and the place rules with a seeded PRNG, no model and no clock. The words are plain placeholders; the shapes are what
 * Merge's own files look like, and they grow the way the engine grows them, or the world explorer reports what this file made up
 * (issues 333, 336, 338, 372):
 * - a new place stands where founding puts it (`choosePlacement`: a chunk that touches the world on a side), so every place gets
 *   its founding path;
 * - it is built the way the fallback found build makes one (`found-build.ts`): a style and a palette from the kit, a footprint of
 *   its own, 1 or 2 floors, 1 or 2 rooms of kit parts, and a door only on the ground floor; a 2-floor place has stairs in its
 *   ground room, since found and expand require them under any room upstairs (issue 333);
 * - an expand never changes the building (`expand.ts`): it adds a room on a floor the building already has, or a path;
 * - a tend sets the place's care time and puts a souvenir on a free shelf, case or plaque.
 * Same seed, same files.
 */

const DAY = 86_400_000
const write = (dir: string, rel: string, value: unknown) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`)
}
const readJson = (dir: string, rel: string): unknown => JSON.parse(readFileSync(join(dir, rel), 'utf8'))
const pick = <T>(prng: Prng, list: readonly T[]): T => list[prng.int(list.length)]!
const shuffle = <T>(prng: Prng, list: readonly T[]): T[] => {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = prng.int(i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

// Not memes: a meme must name the format it looked at, which a placeholder cannot honestly do.
const WORK_KINDS = ['art', 'game', 'tool', 'sound', 'zine'] as const
const ROOM_HEIGHT = 3
/**
 * Where the stairs of a 2-floor place stand in its ground room (room meters): their middle this far in from the left side (the walls
 * take the room's outer 0.3 m), their foot this far in from the back, and the corner kept clear of everything else, across and back.
 */
const STAIR_FROM_SIDE = 0.95
const STAIR_FOOT = 1.3
const STAIR_CLEAR = [1.65, 4.45] as const
const FOOTPRINT_WIDTHS = [8, 10, 12, 14] as const
const FOOTPRINT_DEPTHS = [8, 10, 12] as const
/** The kinds of kit part a room is furnished from, by what they do: something to keep souvenirs on, a screen for works, a light, and the rest. */
const KEEPERS = ['shelf-low', 'shelf-tall', 'case-glass', 'case-table', 'plaque-stand'] as const
const SCREENS = ['screen-small', 'screen-large'] as const
const LIGHTS = ['lamp-floor', 'lantern-ground'] as const
const EXTRAS = ['table', 'bench', 'desk', 'chair', 'stool', 'plinth', 'cabinet', 'crate', 'cat-bed', 'bookcase', 'fern', 'bush', 'flower-patch', 'rock-small', 'lamp-floor', 'rug-round', 'rug-square'] as const

type Room = Place['rooms'][number]
type Placed = Room['parts'][number]

/** The slots of a place's rooms of the given kinds that are free. */
function freeSlots(place: Place, kit: Kit, kinds: readonly SlotKind[]): { id: string; kind: SlotKind }[] {
  const used = new Set(place.exhibits.map((e) => e.slot))
  const out: { id: string; kind: SlotKind }[] = []
  for (const room of place.rooms) {
    room.parts.forEach((placed, i) => {
      const part = kit.parts.find((p) => p.id === placed.part)
      part?.slots.forEach((slot, k) => {
        const id = `${room.id}/${i}/${k}`
        if (kinds.includes(slot.kind) && !used.has(id)) out.push({ id, kind: slot.kind })
      })
    })
  }
  return out
}

/**
 * A room of `w` by `d` meters furnished from the kit: the style's door in the middle of the front wall (ground floor only), the
 * style's window on the back wall and maybe one on a side, then something to keep souvenirs on, a screen, a light and a few more
 * things, each against a wall facing in or standing free, never in the line from the door to the middle.
 */
function furnish(prng: Prng, kit: Kit, style: string, w: number, d: number, door: boolean, stairwell: 'stairs' | 'well' | null = null): Placed[] {
  const s = kit.styles.find((x) => x.id === style) ?? kit.styles[0]!
  const parts: Placed[] = []
  if (door) parts.push({ part: s.door, at: [0, 0, d / 2 - 0.1], rot: 0 })
  // A 2-floor place has stairs in its ground room, as found and expand require (issue 333): along the left wall, the foot near the
  // back with room to stand in front of it, climbing toward the front. Nothing else stands there, nor over the stairwell upstairs.
  const clear = stairwell ? { x0: -w / 2, x1: -w / 2 + STAIR_CLEAR[0], z0: -d / 2, z1: -d / 2 + STAIR_CLEAR[1] } : null
  if (stairwell === 'stairs') parts.push({ part: 'stairs', at: [-(w / 2 - STAIR_FROM_SIDE), 0, -d / 2 + STAIR_FOOT + 1.5], rot: 0 })
  parts.push({ part: s.window, at: [0, 1.2, -(d / 2 - 0.1)], rot: 0 })
  if (prng.next() < 0.6) {
    const side = prng.next() < 0.5 && !clear ? -1 : 1
    parts.push({ part: s.window, at: [side * (w / 2 - 0.1), 1.2, 0], rot: Math.PI / 2 })
  }
  /** Whether a part set at a spot stays out of the stairs' corner. */
  const fits = (part: string, [x, z, rot]: [number, number, number]) => {
    if (!clear) return true
    const size = kit.parts.find((p) => p.id === part)?.size ?? [1, 1, 1]
    const hx = (size[0]! * Math.abs(Math.cos(rot)) + size[2]! * Math.abs(Math.sin(rot))) / 2
    const hz = (size[0]! * Math.abs(Math.sin(rot)) + size[2]! * Math.abs(Math.cos(rot))) / 2
    return !(x - hx < clear.x1 && x + hx > clear.x0 && z - hz < clear.z1 && z + hz > clear.z0)
  }
  const take = (spots: [number, number, number][], part: string) => {
    const i = spots.findIndex((spot) => fits(part, spot))
    return i < 0 ? undefined : spots.splice(i, 1)[0]
  }
  // Spots against the walls, facing into the room, and spots standing free, off the door's line. An upper floor's walls stand a
  // little further in than the room's edge, so a thing against a wall keeps a metre from the edge.
  const back = d / 2 - 1
  const side = w / 2 - 1
  const wallSpots: [number, number, number][] = shuffle(prng, [
    [-(w / 2 - 1.5), -back, 0],
    [w / 2 - 1.5, -back, 0],
    [-side, -d / 4, Math.PI / 2],
    [-side, d / 4, Math.PI / 2],
    [side, -d / 4, -Math.PI / 2],
    [side, d / 4, -Math.PI / 2],
  ])
  const freeSpots: [number, number, number][] = shuffle(prng, [
    [-w / 4, 0, 0],
    [w / 4, 0, 0],
    [-w / 4, d / 4 - 0.3, 0],
    [w / 4, d / 4 - 0.3, 0],
  ])
  const against = (part: string) => {
    const spot = take(wallSpots, part)
    if (spot) parts.push({ part, at: [spot[0], 0, spot[1]], rot: spot[2] })
  }
  const free = (part: string) => {
    const spot = take(freeSpots, part)
    if (spot) parts.push({ part, at: [spot[0], 0, spot[1]], rot: spot[2] })
  }
  against(pick(prng, KEEPERS))
  against(pick(prng, SCREENS))
  free(pick(prng, LIGHTS))
  if (prng.next() < 0.5) against(pick(prng, KEEPERS))
  const more = 2 + prng.int(3)
  for (let k = 0; k < more; k++) {
    const part = pick(prng, EXTRAS)
    if (part.startsWith('rug')) parts.push({ part, at: [0, 0, 0], rot: 0 })
    else if (['bookcase', 'cabinet', 'desk'].includes(part)) against(part)
    else free(part)
  }
  // A rug once at most.
  return parts.filter((p, i) => !p.part.startsWith('rug') || parts.findIndex((q) => q.part.startsWith('rug')) === i)
}

/** Chooses `n` distinct items. */
const some = <T>(prng: Prng, list: readonly T[], n: number): T[] => shuffle(prng, list).slice(0, n)

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
  const worldSeed = (readJson(dir, 'forkling.json') as { seed: number }).seed
  const placeFiles = readdirSync(join(dir, 'places')).filter((f) => f.endsWith('.json')).sort()
  const places = placeFiles.map((f) => Place.parse(readJson(dir, `places/${f}`)))
  const tagPool = [...new Set(places.flatMap((p) => p.tags))].filter((t) => !['home', 'workshop'].includes(t)).sort()
  const workDirs = readdirSync(join(dir, 'works')).filter((d) => existsSync(join(dir, 'works', d, 'meta.json'))).sort()
  const workTemplate = WorkMeta.parse(readJson(dir, `works/${workDirs[0]}/meta.json`))
  const page = readFileSync(join(dir, 'works', workDirs[0]!, 'index.html'), 'utf8')
  const trailFile = readdirSync(join(dir, 'trails')).filter((f) => f.endsWith('.json')).sort()[0]!
  const trailTemplate = Trail.parse(readJson(dir, `trails/${trailFile}`))
  const souvenirFiles = existsSync(join(dir, 'souvenirs')) ? readdirSync(join(dir, 'souvenirs')).filter((f) => f.endsWith('.json')).sort() : []
  const souvenirs = souvenirFiles.map((f) => Souvenir.parse(readJson(dir, `souvenirs/${f}`)))
  const onShow = new Set(places.flatMap((p) => p.exhibits.filter((e) => e.kind === 'souvenir' && e.ref).map((e) => e.ref!.slice('souvenirs/'.length))))
  const changedSouvenirs = new Set<string>()
  const exists = (path: string) => existsSync(join(dir, path)) || existsSync(join(dir, `${path}.json`))
  const added = { places: 0, rooms: 0, works: 0, trails: 0 }
  const startMs = Date.parse(`${opts.start}T00:00:00Z`)
  const grown = () => places.filter((p) => p.id.startsWith('grown-place-'))
  const replace = (p: Place, next: Place) => {
    places[places.indexOf(p)] = next
  }

  for (let d = 0; d < opts.days; d++) {
    const date = new Date(startMs + d * DAY).toISOString().slice(0, 10)
    const at = (h: number) => new Date(startMs + d * DAY + h * 3_600_000).toISOString()

    // Every third day, a new place, where founding puts it and built the way the fallback found build makes one.
    if (d % 3 === 1) {
      const n = places.length + 1
      const name = `Grown Place ${n}`
      const tags = tagPool.length ? some(prng, tagPool, 1 + prng.int(2)) : ['places']
      const related = [pick(prng, places).id]
      const chunk = choosePlacement(places.map(toLandPlace), { tags, related }, worldSeed)
      if (chunk) {
        const style = pick(prng, kit.styles).id
        const footprint: [number, number] = [pick(prng, FOOTPRINT_WIDTHS), pick(prng, FOOTPRINT_DEPTHS)]
        const floors = prng.next() < 0.35 ? 2 : 1
        const [w, dd] = [footprint[0] - 1, footprint[1] - 1]
        const rooms: Room[] = [{ id: 'main-room', name: `Grown Room ${n}a`, size: [w, dd, ROOM_HEIGHT], at: [0, 0], floor: 0, parts: furnish(prng, kit, style, w, dd, true, floors === 2 ? 'stairs' : null) }]
        // A two-floor place may get its upper room when it is founded, or later from an expand.
        if (floors === 2 && prng.next() < 0.5) rooms.push({ id: 'upper-room', name: `Grown Room ${n}b`, size: [w, dd, ROOM_HEIGHT], at: [0, 0], floor: 1, parts: furnish(prng, kit, style, w, dd, false, 'well') })
        const place = Place.parse({
          id: `grown-place-${n}`,
          name,
          purpose: `A place grown for the day-30 fixture on ${date}, the shape of one Merge founded.`,
          tags,
          founded: date,
          chunk: [...chunk],
          offset: [0, 0],
          related,
          paths: [],
          exterior: { style, footprint, floors, palette: pick(prng, kit.palettes).id, sign: name.toUpperCase().slice(0, 24) },
          rooms,
          exhibits: [],
          state: { construction: null, lastCareAt: at(9), neglect: 0, lamps: true, closed: null },
          away: [],
          history: [{ at: at(9), verb: 'found', summary: 'Founded for the day-30 fixture.' }],
        })
        const problems = validatePlace(place, { kit, exists })
        if (problems.length) throw new Error(`grown place ${place.id} breaks the place rules: ${problems.join('; ')}`)
        places.push(place)
        added.places++
      }
    }

    // Every fourth day, an expand: the building never changes, so it is a room on an upper floor that has none yet, or a path.
    if (d % 4 === 2 && grown().length) {
      const p = pick(prng, grown())
      const upperFree = p.exterior.floors === 2 && !p.rooms.some((r) => r.floor === 1)
      let candidate: Place | null = null
      if (upperFree) {
        const [w, dd] = [p.exterior.footprint[0] - 1, p.exterior.footprint[1] - 1]
        const room: Room = { id: 'upper-room', name: `${p.rooms[0]!.name.replace(/a$/, '')}b`, size: [w, dd, ROOM_HEIGHT], at: [0, 0], floor: 1, parts: furnish(prng, kit, p.exterior.style, w, dd, false, 'well') }
        candidate = { ...p, rooms: [...p.rooms, room], history: [...p.history, { at: at(11), verb: 'expand', summary: 'A room upstairs for the day-30 fixture.' }] }
      } else {
        const others = places.filter((o) => o.id !== p.id && !p.paths.some((x) => x.to === o.id))
        if (others.length) {
          const to = pick(prng, others).id
          candidate = { ...p, paths: [...p.paths, { to, at: date }], history: [...p.history, { at: at(11), verb: 'expand', summary: `A path to ${to} for the day-30 fixture.` }] }
        }
      }
      if (candidate && validatePlace(candidate, { kit, exists }).length === 0) {
        replace(p, Place.parse(candidate))
        if (upperFree) added.rooms++
      }
    }

    // Every other day, a tend: one grown place is cared for, and a souvenir not on show yet goes on a free shelf, case or plaque.
    if (d % 2 === 0 && grown().length) {
      const p = pick(prng, grown())
      let next: Place = { ...p, state: { ...p.state, lastCareAt: at(10) }, history: [...p.history, { at: at(10), verb: 'tend', summary: 'Tended for the day-30 fixture.' }] }
      const slots = freeSlots(p, kit, ['shelf', 'case', 'plaque'])
      const kept = slots.flatMap((slot) => {
        const fits = souvenirs.find((s) => !onShow.has(s.id) && (SLOT_ACCEPTS[slot.kind].souvenirs ?? []).includes(s.kind))
        return fits ? [{ slot, souvenir: fits }] : []
      })[0]
      if (kept) {
        const exhibit = { id: `kept-${kept.souvenir.id}`.slice(0, 41).replace(/-+$/, ''), kind: 'souvenir' as const, ref: `souvenirs/${kept.souvenir.id}`, slot: kept.slot.id, label: `A souvenir kept here for the day-30 fixture on ${date}.`, added: date }
        next = { ...next, exhibits: [...next.exhibits, exhibit] }
      }
      if (validatePlace(next, { kit, exists }).length === 0) {
        replace(p, Place.parse(next))
        if (kept) {
          onShow.add(kept.souvenir.id)
          const s = souvenirs.find((x) => x.id === kept.souvenir.id)!
          souvenirs[souvenirs.indexOf(s)] = { ...s, placedIn: p.id }
          changedSouvenirs.add(s.id)
        }
      }
    }

    // Two works a day, each on a free screen somewhere, or only on the shelf when there is none.
    for (let k = 0; k < 2; k++) {
      const id = `grown-work-${date}-${k + 1}`
      const meta = WorkMeta.parse({ ...workTemplate, id, title: `Grown Work ${date} ${k + 1}`, kind: pick(prng, WORK_KINDS), about: `A work grown for the day-30 fixture on ${date}.`, made: at(13 + k), titleHistory: [], status: 'shelf', installedIn: null })
      write(dir, `works/${id}/meta.json`, meta)
      write(dir, `works/${id}/index.html`, page)
      added.works++
      const withRoom = places.map((p) => ({ p, slots: freeSlots(p, kit, ['screen']) })).filter((x) => x.slots.length > 0)
      if (withRoom.length && prng.next() < 0.8) {
        const { p, slots } = pick(prng, withRoom)
        const slot = slots[0]!.id
        const candidate = { ...p, exhibits: [...p.exhibits, { id: `screen-${id}`.slice(0, 41).replace(/-+$/, ''), kind: 'work', ref: `works/${id}`, slot, label: meta.title, added: date }] }
        if (validatePlace(candidate, { kit, exists }).length === 0) replace(p, Place.parse(candidate))
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
  for (const s of souvenirs) if (changedSouvenirs.has(s.id)) write(dir, `souvenirs/${s.id}.json`, s)
  return added
}
