import { createLand } from '@forkling/sim'
import { describe, expect, it } from 'vitest'
import { EDGE_MARGIN, keepOnLand, onLand } from '../src/player/keepOnLand.ts'

// One place in chunk (0, 0): chunks -1 to 1 on both axes are drawn (owned and edge), so the land runs from -32 to 64.
const land = createLand(1, [{ id: 'home', chunk: [0, 0], footprint: [8, 8], tags: [] }])
const isLand = (x: number, z: number) => onLand(land, x, z)

describe('keeping the visitor on the land (issues 340, 351)', () => {
  it('a point well inside the drawn chunks is on the land; one in the fog is not', () => {
    expect(isLand(16, 16)).toBe(true)
    expect(isLand(-31, 60)).toBe(true)
    expect(isLand(-40, 0)).toBe(false)
    expect(isLand(16, 99.9)).toBe(false)
  })

  it('leaves a step that stays on the land alone', () => {
    expect(keepOnLand(land, { x: 0, z: 0 }, { x: -0.1, z: 0.1 })).toBeNull()
  })

  it('stops a step west over the edge at the margin (the walk of issue 340)', () => {
    const edge = -32 + EDGE_MARGIN
    const kept = keepOnLand(land, { x: edge + 0.05, z: 0 }, { x: edge - 0.05, z: 0 })
    expect(kept).not.toBeNull()
    expect(kept!.x).toBeGreaterThanOrEqual(edge - 1e-9)
    expect(kept!.z).toBe(0)
  })

  it('stops a step north over the edge (the run of issue 351) and keeps the sideways part, so the visitor slides along it', () => {
    const edge = 64 - EDGE_MARGIN
    const kept = keepOnLand(land, { x: 16, z: edge - 0.05 }, { x: 16.1, z: edge + 0.05 })
    expect(kept!.x).toBeCloseTo(16.1, 6)
    expect(kept!.z).toBeCloseTo(edge, 4)
    expect(kept!.z).toBeLessThanOrEqual(edge)
  })

  it('keeps every step of a long walk in any direction on the land', () => {
    for (const heading of [0, 0.7, Math.PI / 2, 2, Math.PI, 4, (3 * Math.PI) / 2, 5.9]) {
      let p = { x: 16, z: 16 }
      for (let i = 0; i < 2000; i++) {
        const next = { x: p.x + Math.sin(heading) * 0.1, z: p.z + Math.cos(heading) * 0.1 }
        p = keepOnLand(land, p, next) ?? next
        expect(isLand(p.x, p.z)).toBe(true)
      }
    }
  })

  it('lets a visitor put nearer the end than the margin walk back in, and not further out', () => {
    expect(keepOnLand(land, { x: -31.5, z: 0 }, { x: -31.4, z: 0 })).toBeNull()
    const kept = keepOnLand(land, { x: -31.5, z: 0 }, { x: -31.7, z: 0 })
    expect(kept!.x).toBeGreaterThan(-31.7)
  })

  it('does nothing when the visitor is already off the land (it never traps anyone there) or there is no land', () => {
    expect(keepOnLand(land, { x: -50, z: 0 }, { x: -50.1, z: 0 })).toBeNull()
    expect(keepOnLand(createLand(1, []), { x: 0, z: 0 }, { x: 100, z: 0 })).toBeNull()
  })
})
