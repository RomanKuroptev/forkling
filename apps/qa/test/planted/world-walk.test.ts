import { describe, expect, it } from 'vitest'
import { enclosed, holesFrom, ROOM_RAYS } from '../../src/world/walk.ts'

describe('the walking checks, decided on rays (audit spec 7.4)', () => {
  it('never casts a room ray out of the door side (+z)', () => {
    for (const h of ROOM_RAYS) expect(Math.cos(h)).toBeLessThan(0.5)
  })
  it('planted: a room ray that meets nothing is a hole; walls all round are none', () => {
    expect(holesFrom([{ heading: Math.PI, hit: { distance: 3, object: 'InstancedMesh' } }, { heading: Math.PI / 2, hit: null }])).toEqual([Math.PI / 2])
    expect(holesFrom([{ heading: Math.PI, hit: { distance: 3, object: 'InstancedMesh' } }])).toEqual([])
  })
  it('planted: a camera with something within 25 cm on every side is inside a mesh; in a room it is not', () => {
    const near = { distance: 0.05, object: 'InstancedMesh' }
    expect(enclosed([near, near, near, near, near, near])).toBe(true)
    expect(enclosed([near, near, { distance: 3, object: 'InstancedMesh' }, null, near, near])).toBe(false)
    expect(enclosed([])).toBe(false)
  })
})
