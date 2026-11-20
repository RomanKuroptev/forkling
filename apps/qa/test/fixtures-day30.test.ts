import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { allPaths, layoutProblems, neglectFor, stairFlights, toLandPlace, upperRoomWithoutStairs } from '@forkling/sim'
import { materialize, readQaJson, worldFileList } from '../src/fixtures/fixtures.ts'

/**
 * The day-30 fixture is grown by code (`growDay30`), so it must grow the way the engine does, or the world explorer reports what the
 * generator made up (issues 333, 336, 338, 372).
 */
const dir = materialize('day-30', join(mkdtempSync(join(tmpdir(), 'qa-d30-')), 'world'))
const places = worldFileList(dir)
  .filter((f) => f.startsWith('places/') && f.endsWith('.json'))
  .map((f) => Place.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))))
const grown = places.filter((p) => p.id.startsWith('grown-place-'))
const now = Date.parse(readQaJson('day-30').now)

describe('the day-30 fixture grows the way the engine does', { timeout: 60_000 }, () => {
  it('has grown places', () => {
    expect(grown.length).toBeGreaterThanOrEqual(6)
  })

  it('stands each new place on a chunk that touches the world on a side, as founding does (issue 338)', () => {
    expect(layoutProblems(places.map(toLandPlace))).toEqual([])
  })

  it('joins every place to the world by a path (issue 338)', () => {
    const joined = new Set(allPaths(places.map(toLandPlace)).flatMap((p) => [p.from, p.to]))
    for (const p of places) if (p.id !== 'workshop') expect(joined.has(p.id), p.id).toBe(true)
  })

  it('makes places that differ, as found picks a style, a palette, a size and rooms of its own (issue 372)', () => {
    expect(new Set(grown.map((p) => p.exterior.style)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(grown.map((p) => p.exterior.palette)).size).toBeGreaterThanOrEqual(4)
    expect(new Set(grown.map((p) => p.exterior.footprint.join('x'))).size).toBeGreaterThanOrEqual(3)
    const rooms = grown.flatMap((p) => p.rooms)
    expect(new Set(rooms.map((r) => r.name)).size).toBe(rooms.length)
    const furnishing = (r: Place['rooms'][number]) => r.parts.map((x) => x.part).sort().join(',')
    expect(new Set(rooms.map(furnishing)).size).toBeGreaterThanOrEqual(rooms.length - 1)
  })

  it('makes upper floors only as found does (1 or 2 floors, set when founded), with a door on the ground floor only (issue 333)', () => {
    for (const p of grown) {
      expect(p.exterior.floors, p.id).toBeLessThanOrEqual(2)
      for (const r of p.rooms) if (r.floor > 0) expect(r.parts.some((x) => x.part.startsWith('door-')), `${p.id}/${r.id}`).toBe(false)
      expect(p.rooms.some((r) => r.floor === 0 && r.parts.some((x) => x.part.startsWith('door-'))), p.id).toBe(true)
    }
  })

  it('puts stairs in the ground room of every 2-floor place, so each room upstairs has a way up, with nothing in the stairwell (issue 333)', () => {
    const tall = grown.filter((p) => p.exterior.floors === 2)
    expect(tall.length).toBeGreaterThanOrEqual(1)
    expect(tall.some((p) => p.rooms.some((r) => r.floor === 1))).toBe(true)
    for (const p of tall) {
      const flights = stairFlights(p, kit)
      expect(flights.length, p.id).toBeGreaterThanOrEqual(1)
      for (const r of p.rooms) expect(upperRoomWithoutStairs(p, r, kit), `${p.id}/${r.id}`).toBeNull()
      // The foot of each flight is inside the walls with room to stand in front of it, and no other part stands in a stairwell.
      const [fw, fd] = p.exterior.footprint
      for (const f of flights) {
        const stand = [f.foot[0] - f.dir[0] * 0.6, f.foot[1] - f.dir[1] * 0.6]
        expect(Math.abs(stand[0]!) <= fw / 2 - 0.8 - 0.3 && Math.abs(stand[1]!) <= fd / 2 - 0.8 - 0.3, `${p.id} foot`).toBe(true)
        for (const room of p.rooms) {
          room.parts.forEach((placed, k) => {
            if (placed.part === 'stairs') return
            const part = kit.parts.find((x) => x.id === placed.part)!
            const c = Math.abs(Math.cos(placed.rot))
            const s = Math.abs(Math.sin(placed.rot))
            const hx = (part.size[0] * c + part.size[2] * s) / 2
            const hz = (part.size[0] * s + part.size[2] * c) / 2
            const x = room.at[0] + placed.at[0]
            const z = room.at[1] + placed.at[2]
            const well = { x0: Math.min(f.well.x0, stand[0]! - 0.4), x1: Math.max(f.well.x1, stand[0]! + 0.4), z0: Math.min(f.well.z0, stand[1]! - 0.4), z1: Math.max(f.well.z1, stand[1]! + 0.4) }
            const overlaps = x - hx < well.x1 && x + hx > well.x0 && z - hz < well.z1 && z + hz > well.z0
            expect(overlaps, `${p.id}/${room.id}/${k} ${placed.part} in the stairwell`).toBe(false)
          })
        }
      }
    }
  })

  it('tends some places, so not every one is dusty, and keeps things on their shelves (issue 336)', () => {
    const levels = grown.map((p) => neglectFor({ id: p.id, lastCareAt: p.state.lastCareAt, founded: p.founded }, now))
    expect(levels.filter((l) => l < 2).length).toBeGreaterThanOrEqual(Math.ceil(grown.length / 2))
    const kept = grown.flatMap((p) => p.exhibits.filter((e) => e.kind === 'souvenir'))
    expect(kept.length).toBeGreaterThanOrEqual(grown.length)
  })

  it('every kit part it uses is in the kit', () => {
    const ids = new Set(kit.parts.map((p) => p.id))
    for (const p of grown) for (const r of p.rooms) for (const x of r.parts) expect(ids.has(x.part), x.part).toBe(true)
  })
})
