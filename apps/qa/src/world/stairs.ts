import type { Kit, Place } from '@forkling/schema'
import { landing, placeCentre, stairFlights, toLandPlace, upperRoomWithoutStairs, type Point2, type StairFlight } from '@forkling/sim'
import type { CheckResult } from '../report/finding.ts'

/**
 * Two checks on the way up to the rooms above the ground floor (issue 333, audit QW.2). The world explorer found upper rooms with
 * doors onto air and nothing to climb; now the kit's stairs are walkable, and found and expand require them, so code checks it:
 *
 * - `world.upper-room-no-stairs` (from the files): a room on floor 1 or above with no flight of stairs from the floor under it topping
 *   out inside it (`upperRoomWithoutStairs`): a room a visitor can see from outside but never enter.
 * - `world.upper-room-unreachable` (walking, `walk.ts`): from the arrival point, with the real W key, along the walking grid to the
 *   foot of its stairs, up them and on to the middle of the room, the visitor must end up in the room, on its floor.
 */

export function stairsFindings(fixture: string, places: readonly Place[], kit: Kit): CheckResult[] {
  const out: CheckResult[] = []
  for (const place of places) {
    for (const room of place.rooms) {
      const why = upperRoomWithoutStairs(place, room, kit)
      if (!why) continue
      out.push({
        id: 'world.upper-room-no-stairs',
        fingerprint: `world.upper-room-no-stairs|${fixture}|${place.id}/${room.id}`,
        severity: 'major',
        title: `Nothing leads up to ${place.id}/${room.id}`,
        what: `${place.id}/${room.id} is on floor ${room.floor}, and no stairs from floor ${room.floor - 1} reach it: ${why}.`,
        causes: 'A visitor sees the room from outside but can never get in.',
        evidence: [],
        fixKind: 'data',
        fixture,
        where: `places/${place.id}.json`,
      })
    }
  }
  return out
}

/**
 * The flights a visitor climbs to reach an upper room, from the ground floor up, or null when none leads there. A flight from floor
 * n-1 must top out in the room; if it starts above the ground, the room it starts in must be reached the same way.
 */
export function stairRoute(place: Place, roomId: string, kit: Kit): StairFlight[] | null {
  const flights = stairFlights(place, kit)
  const route = (id: string, depth: number): StairFlight[] | null => {
    const room = place.rooms.find((r) => r.id === id)
    if (!room || depth > 4) return null
    if (room.floor === 0) return []
    const inRoom = ([x, z]: [number, number], r = room) => Math.abs(x - r.at[0]) <= r.size[0] / 2 + 1e-9 && Math.abs(z - r.at[1]) <= r.size[1] / 2 + 1e-9
    for (const f of flights.filter((f) => f.floor === room.floor - 1 && inRoom(landing(f)))) {
      if (f.floor === 0) return [f]
      const below = place.rooms.find((r) => r.floor === f.floor && inRoom(f.foot, r))
      const before = below ? route(below.id, depth + 1) : null
      if (before) return [...before, f]
    }
    return null
  }
  return route(roomId, 0)
}

/** The points a visitor walks through on a route, in the world: in front of each flight's foot, then past its top step. */
export function routePoints(place: Place, flights: readonly StairFlight[]): { stand: Point2; top: Point2 }[] {
  const [px, pz] = placeCentre(toLandPlace(place))
  return flights.map((f) => {
    const [lx, lz] = landing(f)
    return { stand: { x: px + f.foot[0] - f.dir[0] * 0.8, z: pz + f.foot[1] - f.dir[1] * 0.8 }, top: { x: px + lx + f.dir[0] * 0.8, z: pz + lz + f.dir[1] * 0.8 } }
  })
}

/** How far over its floor the visitor's middle stands, at least: a visitor on the floor below is well under it. */
const ON_FLOOR = 0.3

/** Whether the visitor (its capsule's middle) stands in a room, on its floor: inside it across and front to back, and over its floor. */
export function reachedRoom(visitor: { x: number; y: number; z: number }, room: { min: [number, number, number]; max: [number, number, number] }): boolean {
  return visitor.x >= room.min[0] && visitor.x <= room.max[0] && visitor.z >= room.min[2] && visitor.z <= room.max[2] && visitor.y >= room.min[1] + ON_FLOOR && visitor.y <= room.max[1]
}
