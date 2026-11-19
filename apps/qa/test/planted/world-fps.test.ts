import { describe, expect, it } from 'vitest'
import { fpsFindings, fpsFloor } from '../../src/world/fps.ts'

describe('the frame-rate floors (audit spec 7.5)', () => {
  it('are 50 and 30 at day-7, 30 and 24 at day-30', () => {
    expect([fpsFloor('day-7', 'laptop'), fpsFloor('day-7', 'phone'), fpsFloor('day-30', 'laptop'), fpsFloor('day-30', 'phone')]).toEqual([50, 30, 30, 24])
  })
  it('planted: a world at 20 fps on the phone preset is a major finding; 60 on the laptop is fine', () => {
    const found = fpsFindings([
      { fixture: 'day-7', device: 'laptop', fps: 60 },
      { fixture: 'day-7', device: 'phone', fps: 20 },
    ])
    expect(found.map((f) => f.fingerprint)).toEqual(['world.fps|day-7|phone'])
    expect(found[0]!.severity).toBe('major')
  })
})
