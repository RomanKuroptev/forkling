import { describe, expect, it } from 'vitest'
import { IslandConfig, SpeciesPack } from '@forkling/schema'
import { eyeShot, heightAt } from '../src/index.ts'

const island = IslandConfig.parse({ seed: 1234 })
const pack = SpeciesPack.parse({
  id: 'x',
  displayName: 'X',
  needs: { energy: { initial: 50, decayPerHour: 1 } },
  actions: [{ id: 'sit', satisfies: {}, durationSec: [1, 2], target: { type: 'none' }, slot: 'sit', reason: 'Sitting.' }],
  perception: { noticeRadius: 5, eyeHeight: 0.4, fovDeg: 60 },
  locomotion: { walkSpeed: 1, runSpeed: 2 },
})

describe('eyeShot', () => {
  it('puts the eye at the pack eye height above the ground under the forkling', () => {
    const { eye } = eyeShot({ pos: { x: 3, z: -2 }, heading: 0, pack, island })
    expect(eye[0]).toBe(3)
    expect(eye[2]).toBe(-2)
    expect(eye[1]).toBeCloseTo(heightAt(3, -2, island) + 0.4, 6)
  })

  it('looks straight ahead along the heading when there is nothing to look at', () => {
    const { eye, look } = eyeShot({ pos: { x: 0, z: 0 }, heading: Math.PI / 2, pack, island })
    expect(look[0] - eye[0]).toBeGreaterThan(1)
    expect(look[2] - eye[2]).toBeCloseTo(0, 6)
    expect(look[1]).toBe(eye[1])
  })

  it('looks at the middle of the target, not at its feet', () => {
    const target = { position: [4, 0, 0] as [number, number, number], size: 1 }
    const { eye, look } = eyeShot({ pos: { x: 0, z: 0 }, heading: 0, pack, island, target })
    expect(look[0]).toBe(4)
    expect(look[2]).toBe(0)
    expect(look[1]).toBeCloseTo(heightAt(4, 0, island) + 0.5, 6)
    expect(look[1]).not.toBe(eye[1])
  })

  it('caps how high it aims at a tall target', () => {
    const { look } = eyeShot({ pos: { x: 0, z: 0 }, heading: 0, pack, island, target: { position: [4, 0, 0], size: 30 } })
    expect(look[1]).toBeLessThanOrEqual(heightAt(4, 0, island) + 1.5 + 1e-9)
  })

  it('is the same every time', () => {
    const a = eyeShot({ pos: { x: 1, z: 1 }, heading: 1, pack, island })
    expect(eyeShot({ pos: { x: 1, z: 1 }, heading: 1, pack, island })).toEqual(a)
  })

  it('nudges the aim off the eye when the target is directly under it', () => {
    const { eye, look } = eyeShot({ pos: { x: 4, z: 0 }, heading: 0, pack, island, target: { position: [4, 0, 0], size: 1 } })
    expect(Math.hypot(look[0] - eye[0], look[2] - eye[2])).toBeGreaterThan(0.1)
  })
})
