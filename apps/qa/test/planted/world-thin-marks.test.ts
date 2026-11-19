import { describe, expect, it } from 'vitest'
import { thinMarkFindings, type ThinMark } from '../../src/world/marks.ts'

const mark = (place: string, up: number): ThinMark => ({ place, thickness: 0.02, up, at: [13, 2.6, -19] })

describe('no thin unlit marks hanging in a room (issue 336)', () => {
  it('passes a world whose cobwebs are neon strands', () => {
    expect(thinMarkFindings([], 'day-30')).toEqual([])
  })

  it('planted: the old 2 cm grey cobweb slabs under the ceiling are one major finding per place', () => {
    const found = thinMarkFindings([mark('grown-place-4', 2.6), mark('grown-place-4', 2.6), mark('hillside-room-five-lamps', 2.6)], 'day-30')
    expect(found.map((f) => f.fingerprint)).toEqual(['world.thin-mark-hangs|day-30|grown-place-4', 'world.thin-mark-hangs|day-30|hillside-room-five-lamps'])
    expect(found.every((f) => f.severity === 'major' && f.fixKind === 'look' && f.id === 'world.thin-mark-hangs')).toBe(true)
    expect(found[0]!.what).toContain('2 marks of neglect hang in a room')
    expect(found[0]!.what).toContain('0.02 m thick, 2.6 m above the floor')
  })
})
