import { Place, PlacePatch } from '@forkling/schema'
import { capHistory } from './place-history.ts'
import { PLACE_LIMITS, roomOutsideWalls, validatePlace, type PlaceContext } from './validate-place.ts'

/** The limits of spec 5.4 that are about one change rather than the whole file. */
export const PATCH_LIMITS = {
  tendExhibitChanges: 3,
  tendLabels: 2,
  expandParts: 15,
  renamesPerWeek: 2,
  closingsPerWeek: 1,
  reasonMax: 140,
  summaryMax: PLACE_LIMITS.summaryMax,
} as const

export interface PatchContext extends PlaceContext {
  /** The moment of the change; code, never the model, dates it. */
  nowIso: string
  /** The places that exist, for a path to name one. */
  placeIds?: ReadonlySet<string>
  /** How many places were renamed in the last 7 days. */
  renamesThisWeek?: number
  /** How many places there are, how many are closed now, and how many were closed in the last 7 days (spec 9.9). */
  placeCount?: number
  closedPlaces?: number
  closingsThisWeek?: number
}

export type PatchResult = { ok: true; place: Place } | { ok: false; reasons: string[] }

/**
 * Applies a patch to a copy of a place and checks the result (spec 5.4, 11.1): the change obeys its verb's rules (a tend:
 * up to 3 exhibit changes, 2 labels, the sign and the lamps, never a part; a revisit: only the care time and a history line;
 * an expand: a room, a larger room or a path, up to 15 parts; a rename: 2 places a week), and the whole place still obeys
 * 5.2, the kit and the files it points at. Nothing is written here and the input is never changed; a refusal lists every
 * reason, for Merge's next call to read.
 */
export function validatePlacePatch(before: unknown, patch: unknown, ctx: PatchContext): PatchResult {
  const parsedBefore = Place.safeParse(before)
  if (!parsedBefore.success) return { ok: false, reasons: [`the place file is not valid: ${parsedBefore.error.issues[0]?.path.join('.') ?? ''} ${parsedBefore.error.issues[0]?.message ?? ''}`.trim()] }
  const parsed = PlacePatch.safeParse(patch)
  if (!parsed.success) return { ok: false, reasons: parsed.error.issues.map((i) => `${i.path.join('.') || 'patch'}: ${i.message}`).slice(0, 8) }

  const change = parsed.data
  /** The rooms this patch adds or enlarges: each must stand inside the walls (issue 373). */
  const changedRooms: string[] = []
  const place: Place = JSON.parse(JSON.stringify(parsedBefore.data)) as Place
  const reasons: string[] = []
  const no = (why: string) => reasons.push(why)
  const today = ctx.nowIso.slice(0, 10)

  if (change.summary.length > PATCH_LIMITS.summaryMax) no(`summary must be 1 to ${PATCH_LIMITS.summaryMax} characters (it is ${change.summary.length})`)

  /** Any care resets the neglect count (spec 4.4). */
  const care = () => {
    place.state.lastCareAt = ctx.nowIso
    place.state.neglect = 0
  }

  switch (change.verb) {
    case 'tend': {
      const door = change.door
      if (place.state.closed && door?.op === 'close') {
        no(`${place.id} is already closed`)
        break
      }
      if (place.state.closed && door?.op !== 'open') {
        no(`${place.id} is closed, so it takes no tend until it is opened (a tend with the door opened first)`)
        break
      }
      if (door?.op === 'close') {
        const other = change.exhibits.length > 0 || change.labels.length > 0 || change.sign !== undefined || change.lamps !== undefined
        if (other) no('a closing carries no other change: no exhibits, labels, sign or lamps')
        if (place.id === 'home' || place.id === 'workshop') no('Home and the Workshop never close')
        if ((ctx.closingsThisWeek ?? 0) >= PATCH_LIMITS.closingsPerWeek) no(`at most ${PATCH_LIMITS.closingsPerWeek} closing a week, and a place was already closed in the last 7 days`)
        const total = ctx.placeCount ?? 0
        const closedAfter = (ctx.closedPlaces ?? 0) + 1
        if (total === 0 || closedAfter * 3 > total) no(`never more than a third of the places closed (${closedAfter} of ${total} would be)`)
        place.state.closed = { at: ctx.nowIso, reason: door.reason }
        care()
        place.history.push({ at: ctx.nowIso, verb: 'close', summary: change.summary })
        break
      }
      if (door?.op === 'open') {
        if (!place.state.closed) no(`${place.id} is not closed, so there is nothing to open`)
        place.state.closed = null
      }
      const changes = change.exhibits.length + (change.putAway ? 1 : 0)
      if (changes > PATCH_LIMITS.tendExhibitChanges) no(`a tend makes at most ${PATCH_LIMITS.tendExhibitChanges} exhibit changes (it makes ${changes})`)
      if (change.putAway) {
        const gone = change.putAway.id
        const ex = place.exhibits.find((e) => e.id === gone)
        if (!ex) no(`exhibit "${gone}" does not exist in ${place.id}, so it cannot be put away`)
        else if (change.exhibits.some((o) => o.op !== 'add' && o.id === gone) || change.labels.some((l) => l.id === gone)) no(`exhibit "${gone}" is put away, so the same tend cannot also move, remove or relabel it`)
        else {
          place.away = [...place.away, { id: ex.id, kind: ex.kind, label: ex.label, at: today, reason: change.putAway.reason }].slice(-20)
          place.exhibits = place.exhibits.filter((e) => e.id !== gone)
        }
      }
      if (change.labels.length > PATCH_LIMITS.tendLabels) no(`a tend rewrites at most ${PATCH_LIMITS.tendLabels} labels (it rewrites ${change.labels.length})`)
      for (const op of change.exhibits) {
        if (op.op === 'add') place.exhibits.push({ ...op.exhibit, added: today })
        else {
          const ex = place.exhibits.find((e) => e.id === op.id)
          if (!ex) no(`exhibit "${op.id}" does not exist in ${place.id}`)
          else if (op.op === 'move') ex.slot = op.slot
          else place.exhibits = place.exhibits.filter((e) => e.id !== op.id)
        }
      }
      for (const l of change.labels) {
        const ex = place.exhibits.find((e) => e.id === l.id)
        if (!ex) no(`exhibit "${l.id}" does not exist in ${place.id}, so its label cannot be rewritten`)
        else ex.label = l.label
      }
      if (change.sign !== undefined) place.exterior.sign = change.sign
      if (change.lamps !== undefined) place.state.lamps = change.lamps
      care()
      place.history.push({ at: ctx.nowIso, verb: door?.op === 'open' ? 'open' : 'tend', summary: change.summary })
      break
    }
    case 'revisit': {
      if (place.state.closed) no(`${place.id} is closed, so it cannot be revisited until it is opened`)
      care()
      place.history.push({ at: ctx.nowIso, verb: 'revisit', summary: change.summary })
      break
    }
    case 'expand': {
      if (place.state.closed) no(`${place.id} is closed, so it cannot be expanded`)
      if (place.state.construction !== null) no(`${place.id} is under construction, so it cannot be expanded`)
      const c = change.change
      if (c.kind === 'room') {
        if (c.room.parts.length > PATCH_LIMITS.expandParts) no(`an expand adds at most ${PATCH_LIMITS.expandParts} parts (the room has ${c.room.parts.length})`)
        place.rooms.push(c.room)
        changedRooms.push(c.room.id)
      } else if (c.kind === 'enlarge') {
        const room = place.rooms.find((r) => r.id === c.roomId)
        if (!room) no(`room "${c.roomId}" does not exist in ${place.id}`)
        else {
          if (c.size.some((n, i) => n < room.size[i]! - 1e-9)) no(`room ${room.id} can only be enlarged: a room is never shrunk`)
          room.size = c.size
          if (c.at) room.at = c.at
          changedRooms.push(room.id)
          for (const m of c.moves) {
            const part = room.parts[m.index]
            if (!part) no(`room ${room.id} has no part #${m.index} to move`)
            else part.at = m.at
          }
          if (c.addParts.length > PATCH_LIMITS.expandParts) no(`an expand adds at most ${PATCH_LIMITS.expandParts} parts (${c.addParts.length} given)`)
          room.parts.push(...c.addParts)
        }
      } else {
        if (c.to === place.id) no(`a path cannot lead from ${place.id} to itself`)
        else if (ctx.placeIds && !ctx.placeIds.has(c.to)) no(`"${c.to}" is not a place, so there is nowhere to lay a path to`)
        else if (place.paths.some((p) => p.to === c.to)) no(`${place.id} already has a path to ${c.to}`)
        else place.paths.push({ to: c.to, at: today })
      }
      care()
      place.history.push({ at: ctx.nowIso, verb: 'expand', summary: change.summary })
      break
    }
    case 'rename': {
      if ((ctx.renamesThisWeek ?? 0) >= PATCH_LIMITS.renamesPerWeek) no(`at most ${PATCH_LIMITS.renamesPerWeek} renames a week, and ${ctx.renamesThisWeek} places were already renamed in the last 7 days`)
      place.name = change.name
      place.history.push({ at: ctx.nowIso, verb: 'rename', summary: change.summary })
      break
    }
  }

  // The history keeps the last 50 entries; older ones stay in git (spec 5.1).
  place.history = capHistory(place.history, PLACE_LIMITS.historyMax)

  if (reasons.length > 0) return { ok: false, reasons }
  const walls = changedRooms.flatMap((id) => {
    const room = place.rooms.find((r) => r.id === id)
    const why = room ? roomOutsideWalls(place, room) : null
    return why ? [why] : []
  })
  const rest = [...validatePlace(place, ctx), ...walls]
  return rest.length > 0 ? { ok: false, reasons: rest } : { ok: true, place }
}
