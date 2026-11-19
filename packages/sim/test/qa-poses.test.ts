import { describe, expect, it } from 'vitest'
import { cameraPoses, type PoseInput } from '../src/qa-poses.ts'

const input: PoseInput = {
  places: [
    { id: 'home', box: { min: [-14, 0, -5], max: [-2, 5, 5] } },
    { id: 'workshop', box: { min: [2, 0, -5], max: [14, 5, 5] } },
  ],
  rooms: [
    { id: 'home/main', place: 'home', box: { min: [-13, 0, -4], max: [-3, 3, 4] } },
    { id: 'workshop/bench', place: 'workshop', box: { min: [3, 0, -4], max: [13, 3, 4] } },
  ],
  merge: { min: [0, 0, 8], max: [0.5, 0.9, 9] },
}

describe('the seeded camera poses of the world checks (audit spec 7.4)', () => {
  it('gives 40 poses, the same ones for the same seed', () => {
    const shift = (b: PoseInput['places'][number]['box'], dz: number) => ({ min: [b.min[0], b.min[1], b.min[2] + dz] as [number, number, number], max: [b.max[0], b.max[1], b.max[2] + dz] as [number, number, number] })
    const big: PoseInput = { ...input, places: [...input.places, ...input.places.map((p) => ({ id: `${p.id}-2`, box: shift(p.box, 30) }))], rooms: [...input.rooms, ...input.rooms.map((r) => ({ ...r, id: `${r.id}-2`, box: shift(r.box, 30) }))] }
    const a = cameraPoses(big, 7)
    expect(a).toHaveLength(40)
    expect(cameraPoses(big, 7)).toEqual(a)
    expect(cameraPoses(big, 8)).not.toEqual(a)
  })
  it('gives every pose when a small world has fewer than 40', () => {
    expect(cameraPoses(input, 7)).toEqual(cameraPoses(input, 7, 200))
  })
  it('has every kind: around each place, inside each room, the land edge, the sky, low, and Merge from four sides', () => {
    const kinds = new Set(cameraPoses(input, 1, 200).map((p) => p.name.split(':')[0]))
    for (const k of ['place-front', 'place-back', 'place-left', 'place-right', 'room', 'edge-in', 'edge-out', 'sky', 'low', 'merge']) expect(kinds).toContain(k)
  })
  it('puts room poses inside their room at eye height and place poses outside the place', () => {
    const all = cameraPoses(input, 1, 200)
    for (const p of all.filter((x) => x.name.startsWith('room:'))) {
      const room = input.rooms.find((r) => p.name.includes(r.id))!
      expect(p.position[0]).toBeGreaterThan(room.box.min[0])
      expect(p.position[0]).toBeLessThan(room.box.max[0])
      expect(p.position[1]).toBeCloseTo(room.box.min[1] + 1.6)
    }
    for (const p of all.filter((x) => x.name.startsWith('place-'))) {
      const place = input.places.find((pl) => p.name.endsWith(`:${pl.id}`))!
      const inside = p.position[0] > place.box.min[0] && p.position[0] < place.box.max[0] && p.position[2] > place.box.min[2] && p.position[2] < place.box.max[2]
      expect(inside).toBe(false)
    }
  })
  it('stands the visitor where each pose is, so the insides near it are drawn', () => {
    for (const p of cameraPoses(input, 3)) expect(Number.isFinite(p.stand.x) && Number.isFinite(p.stand.z)).toBe(true)
  })
})
