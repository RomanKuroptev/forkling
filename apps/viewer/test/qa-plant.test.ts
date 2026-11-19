import { describe, expect, it } from 'vitest'
import { plantBoards, plantFrom } from '../src/qa/plant.ts'
import type { SignBoard } from '../src/world/signGeometry.ts'

const qa = { now: Date.parse('2026-11-26T13:00:00Z'), seed: 1 }
const board = (id: string, y: number): SignBoard => ({ id, position: [0, y, 0], size: [2.6, 1.2], layout: { name: [id], text: [], ops: [] }, colors: { bg: '#fff', fg: '#000' } })

describe('planted world flaws (audit QW.7): only what the world files cannot say', () => {
  it('is ignored in normal mode, whatever qa.json says', () => {
    expect(plantFrom(null, { raise: [{ id: 'home/sign', dy: 3 }] })).toBeNull()
  })
  it('is nothing when qa.json plants nothing or something it does not know', () => {
    expect(plantFrom(qa, undefined)).toBeNull()
    expect(plantFrom(qa, { delete: 'everything' })).toBeNull()
  })
  it('reads a raised object and a missing texture under ?qa=1', () => {
    expect(plantFrom(qa, { raise: [{ id: 'home/sign', dy: 3 }], missingTexture: ['signs'], walkThrough: ['home'], invisibleWall: [{ x: 1, z: 2, w: 0.3, d: 6 }] })).toEqual({ raise: [{ id: 'home/sign', dy: 3 }], missingTexture: ['signs'], walkThrough: ['home'], invisibleWall: [{ x: 1, z: 2, w: 0.3, d: 6 }] })
  })
  it('raises only the planted sign', () => {
    const boards = [board('home', 1.5), board('workshop', 1.5)]
    const out = plantBoards(boards, { raise: [{ id: 'home/sign', dy: 3 }], missingTexture: [], walkThrough: [], invisibleWall: [] })
    expect(out.map((b) => b.position[1])).toEqual([4.5, 1.5])
    expect(plantBoards(boards, null)).toBe(boards)
  })
})
