import { describe, expect, it } from 'vitest'
import { WorldObject } from '@forkling/schema'
import { MOVED_METERS, runContraption } from '../src/physics.ts'

const part = (shape: string, size: [number, number, number], at: [number, number, number], extra: Record<string, unknown> = {}) => ({ shape, size, at, color: '#aa8855', ...extra })

/** A marble resting on the ground: part 0. */
const marbleRun = (impulse: [number, number, number], runSec = 12, extra: Record<string, unknown> = {}) =>
  WorldObject.parse({
    id: 'marble-run',
    kind: 'contraption',
    name: 'A marble run',
    position: [4, 0, 5],
    model: { parts: [part('sphere', [0.2, 0.2, 0.2], [0, 0.1, 0])] },
    contraption: { bodies: [{ part: 0, body: 'dynamic', massKg: 0.2 }], trigger: { part: 0, impulse }, runSec },
    reason: 'I wanted to see it roll.',
    ...extra,
  })

describe('runContraption', () => {
  it('rolls a marble it has pushed, and lets it come to rest', async () => {
    const r = (await runContraption(marbleRun([0.1, 0, 0])))!
    expect(r.moved).toBe(true)
    expect(r.maxTravel).toBeGreaterThan(0.5)
    expect(r.maxTravel).toBeLessThan(3)
    expect(r.settled).toBe(true)
    expect(r.escaped).toBe(false)
  })

  it('reports nothing moved when the push was too gentle to matter', async () => {
    const r = (await runContraption(marbleRun([0.0005, 0, 0])))!
    expect(r.moved).toBe(false)
    expect(r.maxTravel).toBeLessThan(MOVED_METERS)
  })

  it('reports a part flung off the island as escaped', async () => {
    const r = (await runContraption(marbleRun([20, 0, 0])))!
    expect(r.escaped).toBe(true)
  })

  it('lets a marble roll off a fixed table and fall to the ground', async () => {
    const o = WorldObject.parse({
      id: 'table-drop',
      kind: 'contraption',
      name: 'A table drop',
      position: [0, 0, 0],
      model: { parts: [part('box', [1, 0.1, 0.6], [0, 0.45, 0]), part('sphere', [0.2, 0.2, 0.2], [0.3, 0.6, 0])] },
      contraption: {
        bodies: [
          { part: 0, body: 'fixed' },
          { part: 1, body: 'dynamic', massKg: 0.2 },
        ],
        trigger: { part: 1, impulse: [0.1, 0, 0] },
        runSec: 8,
      },
      reason: 'To see it fall.',
    })
    const r = (await runContraption(o))!
    expect(r.moved).toBe(true)
    expect(r.maxTravel).toBeGreaterThan(0.4)
  })

  it('is exactly the same every time', async () => {
    const a = (await runContraption(marbleRun([0.1, 0, 0.05])))!
    const b = (await runContraption(marbleRun([0.1, 0, 0.05])))!
    expect(b).toEqual(a)
  })

  it('treats parts it is not told about as fixed scenery', async () => {
    const o = marbleRun([0.1, 0, 0], 12, { model: { parts: [part('sphere', [0.2, 0.2, 0.2], [0, 0.1, 0]), part('box', [0.1, 0.4, 2], [0.6, 0.2, 0])] } })
    const r = (await runContraption(o))!
    // The wall is in the marble's way, so it stops short of where it went before.
    expect(r.maxTravel).toBeLessThan(0.7)
  })

  it('says nothing for an object that is not a contraption', async () => {
    const { contraption: _c, ...plain } = marbleRun([0.1, 0, 0])
    expect(await runContraption(plain as WorldObject)).toBeNull()
  })
})
