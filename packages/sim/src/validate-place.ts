import { Place, SLOT_ACCEPTS, type Kit, type SlotKind, type SouvenirKindName } from '@forkling/schema'

/** The limits of spec 5.2, in one place. */
export const PLACE_LIMITS = {
  nameMin: 3,
  nameMax: 40,
  purposeMax: 160,
  tagsMin: 1,
  tagsMax: 3,
  footprintMax: 24,
  floorsMin: 1,
  floorsMax: 3,
  heightMax: 12,
  roomsMin: 1,
  roomsMax: 6,
  partsPerRoom: 40,
  exhibitsMax: 30,
  labelMax: 120,
  summaryMax: 140,
  signMax: 24,
  historyMax: 50,
} as const

/** What `validatePlace` may check the place against. Everything but the kit is optional: a caller that does not know it skips that check. */
export interface PlaceContext {
  kit: Kit
  /** The interests that exist. Tags are checked against them when a place is founded, not afterwards. */
  interests?: ReadonlySet<string>
  /** Whether a file in the world repo exists (`souvenirs/<id>`, `works/<id>`, ...). */
  exists?(path: string): boolean
  /** The kind of a souvenir file, to match it to a slot. */
  souvenirKind?(path: string): SouvenirKindName | undefined
}

/** The folder each kind of exhibit points into. A gallery points at nothing. */
const REF_PREFIX = { souvenir: 'souvenirs/', work: 'works/', trail: 'trails/', plaque: 'notebook/writing/' } as const

const SLOT_PATTERN = /^([a-z0-9][a-z0-9-]*)\/(\d+)\/(\d+)$/

interface Box {
  id: string
  floor: number
  x0: number
  x1: number
  z0: number
  z1: number
}

/**
 * Every reason a place file breaks the rules of spec 5.1 and 5.2 and the kit, or an empty list. The place may be anything
 * (it is parsed first), so this is safe on a model's output and on a file from a pull request.
 */
export function validatePlace(input: unknown, ctx: PlaceContext): string[] {
  const parsed = Place.safeParse(input)
  if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join('.') || 'place'}: ${i.message}`).slice(0, 12)
  const place = parsed.data
  const L = PLACE_LIMITS
  const reasons: string[] = []
  const no = (why: string) => reasons.push(why)

  if (place.name.length < L.nameMin || place.name.length > L.nameMax) no(`name must be ${L.nameMin} to ${L.nameMax} characters (it is ${place.name.length})`)
  if (place.purpose.length > L.purposeMax) no(`purpose must be up to ${L.purposeMax} characters (it is ${place.purpose.length})`)
  if (place.tags.length < L.tagsMin || place.tags.length > L.tagsMax) no(`tags must be ${L.tagsMin} to ${L.tagsMax} interests (there are ${place.tags.length})`)
  if (ctx.interests) for (const tag of place.tags) if (!ctx.interests.has(tag)) no(`tags: "${tag}" is not one of the interests that exist`)

  const { footprint, floors, style, palette, sign } = place.exterior
  if (footprint[0] > L.footprintMax || footprint[1] > L.footprintMax) no(`footprint must be at most ${L.footprintMax} by ${L.footprintMax} meters (it is ${footprint[0]} by ${footprint[1]})`)
  if (floors < L.floorsMin || floors > L.floorsMax) no(`floors must be ${L.floorsMin} to ${L.floorsMax} (it is ${floors})`)
  if (sign.length > L.signMax) no(`sign must be up to ${L.signMax} characters (it is ${sign.length})`)
  if (!ctx.kit.styles.some((s) => s.id === style)) no(`exterior style "${style}" is not one of the kit's styles`)
  if (!ctx.kit.palettes.some((p) => p.id === palette)) no(`exterior palette "${palette}" is not one of the kit's palettes`)

  if (place.rooms.length < L.roomsMin || place.rooms.length > L.roomsMax) no(`rooms must be ${L.roomsMin} to ${L.roomsMax} (there are ${place.rooms.length})`)
  const tallest = Math.max(0, ...place.rooms.map((r) => r.size[2]))
  if (floors >= 1 && floors * tallest > L.heightMax) no(`height: ${floors} floors of ${tallest} m make ${floors * tallest} m, over the ${L.heightMax} m limit`)

  const partById = new Map(ctx.kit.parts.map((p) => [p.id, p]))
  const boxes: Box[] = []
  const roomIds = new Set<string>()
  for (const room of place.rooms) {
    if (roomIds.has(room.id)) no(`room id "${room.id}" is used twice`)
    roomIds.add(room.id)
    if (room.floor >= floors) no(`room ${room.id}: floor ${room.floor} does not exist (the building has ${floors} floors)`)
    const [w, d, h] = room.size
    const box: Box = { id: room.id, floor: room.floor, x0: room.at[0] - w / 2, x1: room.at[0] + w / 2, z0: room.at[1] - d / 2, z1: room.at[1] + d / 2 }
    boxes.push(box)
    if (box.x0 < -footprint[0] / 2 - 1e-9 || box.x1 > footprint[0] / 2 + 1e-9 || box.z0 < -footprint[1] / 2 - 1e-9 || box.z1 > footprint[1] / 2 + 1e-9) no(`room ${room.id} must fit inside the footprint`)

    if (room.parts.length > L.partsPerRoom) no(`room ${room.id} has more than ${L.partsPerRoom} parts (${room.parts.length})`)
    room.parts.forEach((placed, i) => {
      if (!partById.has(placed.part)) no(`room ${room.id} part #${i}: "${placed.part}" is not in the kit`)
      const [x, y, z] = placed.at
      if (Math.abs(x) > w / 2 + 1e-9 || Math.abs(z) > d / 2 + 1e-9 || y < -1e-9 || y > h + 1e-9) no(`room ${room.id} part #${i} (${placed.part}) is outside the room`)
    })
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!
      const b = boxes[j]!
      if (a.floor === b.floor && a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.z0 < b.z1 - 1e-9 && b.z0 < a.z1 - 1e-9) no(`rooms ${a.id} and ${b.id} overlap on floor ${a.floor}`)
    }
  }

  if (place.exhibits.length > L.exhibitsMax) no(`exhibits must be at most ${L.exhibitsMax} (there are ${place.exhibits.length})`)
  const exhibitIds = new Set<string>()
  const taken = new Map<string, string>()
  for (const ex of place.exhibits) {
    if (exhibitIds.has(ex.id)) no(`exhibit id "${ex.id}" is used twice`)
    exhibitIds.add(ex.id)
    if (ex.label.length > L.labelMax) no(`exhibit ${ex.id}: label must be up to ${L.labelMax} characters (it is ${ex.label.length})`)

    // Where it points.
    if (ex.kind === 'gallery') {
      if (ex.ref !== null) no(`exhibit ${ex.id}: a gallery has no ref`)
    } else {
      const prefix = REF_PREFIX[ex.kind]
      if (ex.ref === null || !ex.ref.startsWith(prefix)) no(`exhibit ${ex.id}: ref must start with ${prefix} for a ${ex.kind}`)
      else if (ctx.exists && !ctx.exists(ex.ref)) no(`exhibit ${ex.id}: ${ex.ref} does not exist`)
    }

    // Where it sits.
    const m = SLOT_PATTERN.exec(ex.slot)
    if (!m) {
      no(`exhibit ${ex.id}: slot "${ex.slot}" is not room/part/slot`)
      continue
    }
    const room = place.rooms.find((r) => r.id === m[1])
    const placed = room?.parts[Number(m[2])]
    const slot = placed ? partById.get(placed.part)?.slots[Number(m[3])] : undefined
    if (!room) no(`exhibit ${ex.id}: slot ${ex.slot} names a room the place does not have`)
    else if (!placed) no(`exhibit ${ex.id}: slot ${ex.slot} names a part the room does not have`)
    else if (!slot) no(`exhibit ${ex.id}: slot ${ex.slot} is a slot ${placed.part} does not have`)
    else {
      const accepts = SLOT_ACCEPTS[slot.kind as SlotKind]
      if (!accepts.exhibits.includes(ex.kind)) no(`exhibit ${ex.id}: a ${ex.kind} does not fit a ${slot.kind} slot`)
      else if (ex.kind === 'souvenir' && accepts.souvenirs && ex.ref && ctx.souvenirKind) {
        const kind = ctx.souvenirKind(ex.ref)
        if (kind && !accepts.souvenirs.includes(kind)) no(`exhibit ${ex.id}: a ${kind} souvenir does not fit a ${slot.kind} slot`)
      }
      const other = taken.get(ex.slot)
      if (other) no(`slot ${ex.slot} holds two exhibits, ${other} and ${ex.id} (one exhibit per slot)`)
      taken.set(ex.slot, ex.id)
    }
  }

  if (place.history.length > L.historyMax) no(`history must keep at most ${L.historyMax} entries (there are ${place.history.length}); older ones stay in git`)
  for (const [i, entry] of place.history.entries()) if (entry.summary.length > L.summaryMax) no(`history #${i}: summary must be up to ${L.summaryMax} characters (it is ${entry.summary.length})`)

  return reasons
}
