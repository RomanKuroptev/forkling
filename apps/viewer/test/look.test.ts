import { describe, expect, it } from 'vitest'
import { MAX_PITCH, applyLookDrag, cursorKind, lookEuler, wasDrag } from '../src/player/look.ts'

describe('first person look', () => {
  it('starts facing the heading the visitor spawned with', () => {
    // Heading 0 looks along +z; a three.js camera looks along -z, so its yaw is a half turn off.
    const e = lookEuler({ yaw: 0, pitch: 0 })
    expect(e.order).toBe('YXZ')
    expect(e.y).toBeCloseTo(Math.PI)
  })

  it('drags right to turn right and up to look up', () => {
    expect(applyLookDrag({ yaw: 0, pitch: 0 }, 100, 0).yaw).toBeGreaterThan(0)
    expect(applyLookDrag({ yaw: 0, pitch: 0 }, 0, -100).pitch).toBeGreaterThan(0)
  })

  it('never looks past straight up or straight down', () => {
    expect(applyLookDrag({ yaw: 0, pitch: 0 }, 0, -100000).pitch).toBeLessThanOrEqual(MAX_PITCH)
    expect(applyLookDrag({ yaw: 0, pitch: 0 }, 0, 100000).pitch).toBeGreaterThanOrEqual(-MAX_PITCH)
    expect(MAX_PITCH).toBeLessThan(Math.PI / 2)
  })

  it('keeps yaw within one turn', () => {
    expect(Math.abs(applyLookDrag({ yaw: 3, pitch: 0 }, -100000, 0).yaw)).toBeLessThanOrEqual(Math.PI)
  })

  it('tells a tap from a drag', () => {
    expect(wasDrag(2)).toBe(false)
    expect(wasDrag(20)).toBe(true)
  })

  it('shows the hand over something that can be opened, and no cursor under a panel', () => {
    expect(cursorKind({ hovering: false, panelOpen: false })).toBe('arrow')
    expect(cursorKind({ hovering: true, panelOpen: false })).toBe('hand')
    expect(cursorKind({ hovering: true, panelOpen: true })).toBe('none')
  })
})
