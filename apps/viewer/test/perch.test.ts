import { describe, expect, it } from 'vitest'
import { SpeciesPack } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { bodyWorldFor, createForkling, findPath, STEP, stepForkling, type StepContext } from '@forkling/sim'
import blobJson from '../../../packages/sim/test/fixtures/blob.species.json'
import { PERCH_REACH, perchLift } from '../src/forkling/perch.ts'

const world = bodyWorldFor({ seed: 1, places: [], kit })
const spots = world.spots([0, 1, 0])
const desk = spots.desk![0]!
const bench = spots.bench![0]!
const seatOf = (s: { x: number; z: number; perch?: number }) => ({ x: s.x, z: s.z, perch: s.perch! })

describe('Merge up on the seat at its desk (issue 461)', () => {
  it('sits at the seat height on the chair when its step is at the desk', () => {
    expect(perchLift(spots, { targetId: 'desk' }, desk)).toBeCloseTo(0.5, 9)
  })

  it('eases up over the last stretch, by how far it still has to go', () => {
    const at = (d: number) => perchLift(spots, { targetId: 'desk' }, { x: desk.x, z: desk.z + d })
    expect(at(PERCH_REACH + 0.01)).toBe(0)
    expect(at(PERCH_REACH / 2)).toBeGreaterThan(0)
    expect(at(PERCH_REACH / 2)).toBeLessThan(0.5)
    expect(at(PERCH_REACH * 0.25)).toBeGreaterThan(at(PERCH_REACH * 0.75))
  })

  it('stays on the floor at the chair when its step is somewhere else and it did not sit there', () => {
    expect(perchLift(spots, { targetId: 'home' }, desk)).toBe(0)
    expect(perchLift(spots, {}, desk)).toBe(0)
  })

  it('eases down off the seat it is leaving', () => {
    const at = (d: number) => perchLift(spots, { targetId: 'home', from: seatOf(desk) }, { x: desk.x, z: desk.z + d })
    expect(at(0)).toBeCloseTo(0.5, 9)
    expect(at(PERCH_REACH * 0.9)).toBeLessThan(0.1)
    expect(at(PERCH_REACH * 0.9)).toBeGreaterThan(0)
  })

  it('draws no perch while walking straight across a seat that is neither where it goes nor where it left', () => {
    // Across Home's bench, from one side of the room to the other, going to the desk, having left nothing.
    const state = createForkling(SpeciesPack.parse(blobJson), [], 1, { x: bench.x - 2, z: bench.z })
    const ctx: StepContext = { grid: world.grid, visitor: null, timeOfDay: 12, spots }
    state.action = state.pack.actions.find((a) => a.id === 'roam')!
    state.intention = { ...state.intention, targetId: 'desk' }
    state.phase = 'moving'
    state.path = findPath(world.grid, state.pos, { x: bench.x + 2, z: bench.z })!
    let nearest = Infinity
    let most = 0
    for (let i = 0; i < 60 && state.phase === 'moving'; i++) {
      stepForkling(state, STEP, ctx)
      nearest = Math.min(nearest, Math.hypot(state.pos.x - bench.x, state.pos.z - bench.z))
      most = Math.max(most, perchLift(spots, { targetId: 'desk', ...(state.leftSeat ? { from: state.leftSeat } : {}) }, state.pos))
    }
    expect(nearest).toBeLessThan(0.1)
    expect(most).toBe(0)
  })

  it('is on the floor away from any seat', () => {
    expect(perchLift(spots, { targetId: 'desk' }, { x: desk.x + 3, z: desk.z })).toBe(0)
  })
})
