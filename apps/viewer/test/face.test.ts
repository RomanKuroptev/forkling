import { describe, expect, it } from 'vitest'
import { FACE_COLS, FACE_ROWS, faceGrid, faceState } from '../src/forkling/face.ts'

describe('which face Merge shows', () => {
  it('chooses from what the viewer has: old data first, then sleep, then a step, else awake', () => {
    expect(faceState({ stale: true, asleep: true, inStep: true })).toBe('nosignal')
    expect(faceState({ stale: false, asleep: true, inStep: true })).toBe('asleep')
    expect(faceState({ stale: false, asleep: false, inStep: true })).toBe('step')
    expect(faceState({ stale: false, asleep: false, inStep: false })).toBe('awake')
  })
})

describe('the face grid', () => {
  const lit = (rows: string[]) => rows.join('').split('#').length - 1
  it('is 16 by 12 for every state and time', () => {
    for (const state of ['awake', 'step', 'asleep', 'nosignal'] as const) {
      for (const t of [0, 1, 2.3, 3.9, 7.77]) {
        const rows = faceGrid(state, t)
        expect(rows).toHaveLength(FACE_ROWS)
        for (const r of rows) expect(r).toMatch(new RegExp(`^[#.]{${FACE_COLS}}$`))
      }
    }
  })
  it('has two square eyes and a smile awake, and blinks every few seconds', () => {
    const open = faceGrid('awake', 1)
    expect(open[3]!.slice(3, 6)).toBe('###')
    expect(faceGrid('awake', 3.9)[3]!.slice(3, 6)).toBe('...')
    expect(faceGrid('awake', 3.9)).not.toEqual(open)
  })
  it('fills three dots one by one in a step', () => {
    const counts = [0, 0.7, 1.4, 2.1].map((t) => lit(faceGrid('step', t)))
    expect(counts[1]!).toBeGreaterThan(counts[0]!)
    expect(counts[3]!).toBeGreaterThan(counts[1]!)
  })
  it('has flat eyes and a z that drifts up when asleep', () => {
    const a = faceGrid('asleep', 0.2)
    const b = faceGrid('asleep', 1.2)
    expect(a).not.toEqual(b)
    expect(a[6]!.slice(3, 7)).toBe('####')
  })
  it('has x eyes with no signal', () => {
    expect(faceGrid('nosignal', 0)[3]!.slice(4, 5)).toBe('#')
  })
})
