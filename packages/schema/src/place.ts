import { z } from 'zod'
import { Vec3 } from './geometry.ts'
import { Timestamp } from './intention.ts'
import { ExhibitKind, PartId } from './kit.ts'

/**
 * `places/<id>.json` (spec 5.1). A place only names kit parts and content; Merge never writes 3D code.
 *
 * This is the shape. The limits of spec 5.2 (a name of 3 to 40 characters, 6 rooms, 30 exhibits and so on) are checked by
 * `validatePlace` in `packages/sim`, so every limit is rejected with a reason Merge can read. The numbers here only keep
 * a file from being enormous.
 *
 * Coordinates are meters. A room's `at` is where its middle is, from the middle of the building's footprint, and its `size` is
 * `[width, depth, height]`. A part's `at` is from the middle of its room's floor (y up).
 */
export const PlaceId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, 'lowercase words with dashes')

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'like 2026-11-20')
const Positive = z.number().positive().finite()

export const PlacedPart = z.object({ part: PartId, at: Vec3, rot: z.number().finite().default(0) }).strict()
export type PlacedPart = z.infer<typeof PlacedPart>

export const Room = z
  .object({
    id: PartId,
    name: z.string().max(200),
    size: z.tuple([Positive, Positive, Positive]),
    /** The middle of the room from the middle of the footprint, on the floor plan. Missing means the middle. */
    at: z.tuple([z.number().finite(), z.number().finite()]).default([0, 0]),
    /** 0 is the ground floor. */
    floor: z.number().int().min(0).default(0),
    parts: z.array(PlacedPart).max(200),
  })
  .strict()
export type Room = z.infer<typeof Room>

/**
 * Something shown in a slot. `ref` is the file it shows (`souvenirs/<id>`, `works/<id>`, `trails/<id>`,
 * `notebook/writing/<file>.md` for a plaque), and null for the gallery of every work.
 */
export const Exhibit = z
  .object({
    id: PartId,
    kind: ExhibitKind,
    ref: z.string().max(200).nullable(),
    /** `room id / index of the part in that room / index of the slot on that part`. */
    slot: z.string().max(120),
    label: z.string().max(1000),
    added: DateOnly,
  })
  .strict()
export type Exhibit = z.infer<typeof Exhibit>

export const PlaceState = z
  .object({
    /** Set while an expand or a found is being built (spec 4.5). W6 fills it. */
    construction: z.object({ kind: z.enum(['expand', 'found']), finishesAt: Timestamp }).strict().nullable().default(null),
    lastCareAt: Timestamp.nullable().default(null),
    /** Days since care, as a level (spec 4.4): 0 fresh, 1 quiet, 2 dusty, 3 overgrown. */
    neglect: z.number().int().min(0).max(3).default(0),
    /** Tend may turn the lamps off and on (spec 5.4). */
    lamps: z.boolean().default(true),
    /** Merge closed this place (spec 9.9): a boarded door and a sign with the reason. Null while it is open. */
    closed: z.object({ at: Timestamp, reason: z.string().min(1).max(140) }).strict().nullable().default(null),
  })
  .strict()
export type PlaceState = z.infer<typeof PlaceState>

export const PlaceVerb = z.enum(['found', 'expand', 'tend', 'revisit', 'rename', 'install', 'close', 'open'])
export type PlaceVerb = z.infer<typeof PlaceVerb>

export const PlaceHistoryEntry = z.object({ at: Timestamp, verb: PlaceVerb, summary: z.string().max(1000) }).strict()
export type PlaceHistoryEntry = z.infer<typeof PlaceHistoryEntry>

export const Place = z
  .object({
    id: PlaceId,
    name: z.string().max(200),
    purpose: z.string().max(2000),
    tags: z.array(z.string().min(1).max(100)).max(10),
    founded: DateOnly,
    /** The chunk it stands on (spec 4.1). */
    chunk: z.tuple([z.number().int(), z.number().int()]),
    /** Where its middle is from its chunk's middle. Only the founding clearing, which holds Home and the Workshop side by side, uses it (spec 4.1). */
    offset: z.tuple([z.number().finite(), z.number().finite()]).default([0, 0]),
    related: z.array(PlaceId).max(10).default([]),
    /** Paths an expand added from this place to another (spec 4.3). The ones founding makes are worked out from the places, so they are not stored. W6 draws these. */
    paths: z.array(z.object({ to: PlaceId, at: DateOnly }).strict()).max(20).default([]),
    exterior: z
      .object({
        style: PartId,
        footprint: z.tuple([Positive, Positive]),
        floors: z.number().int(),
        palette: PartId,
        sign: z.string().max(200),
      })
      .strict(),
    rooms: z.array(Room).max(30),
    exhibits: z.array(Exhibit).max(200),
    state: PlaceState.default({ construction: null, lastCareAt: null, neglect: 0, lamps: true, closed: null }),
    /** Exhibits Merge put away (spec 9.9), the last 20: what it was, when, and why. The thing itself is kept; only its place on show goes. */
    away: z.array(z.object({ id: PartId, kind: ExhibitKind, label: z.string().max(1000), at: DateOnly, reason: z.string().min(1).max(140) }).strict()).max(20).default([]),
    history: z.array(PlaceHistoryEntry).max(1000),
  })
  .strict()
export type Place = z.infer<typeof Place>

const PART_ID_MAX = 41
const LOOSE_ID = /^[a-z0-9][a-z0-9-]*$/

/**
 * Repairs a place file before it is parsed: an exhibit id over PartId's 41 characters (install once cut `screen-<work id>`
 * at 60) is cut to 41, never ending in a dash and kept unique. Without this one long id drops the whole place for every
 * reader (Merge's Workshop, November 2026). Anything that is not such an id is left alone and still refused by `Place`.
 * A file that needs no repair is returned as it is.
 */
export function repairPlaceJson(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { exhibits?: unknown }).exhibits)) return raw
  const exhibits = (raw as { exhibits: unknown[] }).exhibits
  const idOf = (e: unknown) => (typeof e === 'object' && e !== null && typeof (e as { id?: unknown }).id === 'string' ? (e as { id: string }).id : null)
  const tooLong = (id: string | null): id is string => id !== null && id.length > PART_ID_MAX && LOOSE_ID.test(id)
  if (!exhibits.some((e) => tooLong(idOf(e)))) return raw
  const used = new Set(exhibits.map(idOf).filter((id): id is string => id !== null && !tooLong(id)))
  const cut = (s: string, n: number) => s.slice(0, n).replace(/-+$/, '')
  return {
    ...raw,
    exhibits: exhibits.map((e) => {
      const id = idOf(e)
      if (!tooLong(id)) return e
      let next = cut(id, PART_ID_MAX)
      for (let n = 2; used.has(next); n++) next = `${cut(id, PART_ID_MAX - 1 - String(n).length)}-${n}`
      used.add(next)
      return { ...(e as object), id: next }
    }),
  }
}
