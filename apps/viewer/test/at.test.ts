import { describe, expect, it } from 'vitest'
import { parseStand } from '../src/world/at.ts'

describe('?stand=x,z[,yaw] (where the visitor starts, to look at a part of the world)', () => {
  it('reads a place, and a direction in degrees as the way the visitor faces (0 faces +z, 90 faces +x)', () => {
    expect(parseStand('?stand=10,-20')).toEqual({ x: 10, z: -20, yaw: 0 })
    const east = parseStand('?debug&stand=5.5,6,90')!
    expect(east.x).toBe(5.5)
    expect(east.z).toBe(6)
    expect(east.yaw).toBeCloseTo(Math.PI / 2, 9)
  })
  it('is nothing when it is absent or does not make sense', () => {
    expect(parseStand('')).toBeNull()
    expect(parseStand('?stand=')).toBeNull()
    expect(parseStand('?stand=1')).toBeNull()
    expect(parseStand('?stand=a,b')).toBeNull()
    expect(parseStand('?stand=1,2,3,4')).toBeNull()
    expect(parseStand('?stand=Infinity,2')).toBeNull()
    // `?at=` is the clock's own (an ISO time), not a place.
    expect(parseStand('?at=2026-12-20T12:00:00Z')).toBeNull()
  })
})
