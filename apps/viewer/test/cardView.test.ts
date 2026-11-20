import { describe, expect, it } from 'vitest'
import { kit } from '@forkling/schema/kit'
import { cardPose, cardView, VISITOR_EYE } from '../src/world/exhibitCards.ts'

type V = readonly number[]
/** Whether the straight line from `a` to `b` runs through the inside of a box (the slab test, a millimetre in from its faces). */
const through = (a: V, b: V, box: { min: V; max: V }) => {
  let t0 = 0
  let t1 = 1
  for (let k = 0; k < 3; k++) {
    const d = b[k]! - a[k]!
    const lo = box.min[k]! + 1e-3
    const hi = box.max[k]! - 1e-3
    if (Math.abs(d) < 1e-12) {
      if (a[k]! <= lo || a[k]! >= hi) return false
      continue
    }
    const u = (lo - a[k]!) / d
    const v = (hi - a[k]!) / d
    t0 = Math.max(t0, Math.min(u, v))
    t1 = Math.min(t1, Math.max(u, v))
  }
  return t0 < t1
}

describe("a card's whole face shows under the shelf above it (issue 453)", () => {
  const withCards = kit.parts.filter((p) => p.slots.some((s) => s.kind === 'shelf' || s.kind === 'case'))

  it('looks from where a visitor stands in front of the part, from up against it to a few steps back, at eye height', () => {
    const shelf = kit.parts.find((p) => p.id === 'shelf-low')!
    const slot = shelf.slots[0]!
    const view = cardView(cardPose({ slotKind: 'shelf', position: [0, 0, 0], partTop: 0 })!, slot.at, shelf, 0)
    expect(view.eyes.every((e) => e[1] === VISITOR_EYE && e[0] === slot.at[0] && e[2] > shelf.size[2] / 2)).toBe(true)
    expect(Math.min(...view.eyes.map((e) => e[2]))).toBeCloseTo(shelf.size[2] / 2 + 0.3)
    expect(view.boards).toHaveLength(shelf.primitives.length)
    expect(view.face.length).toBeGreaterThanOrEqual(5)
  })

  it("on every shelf and case of the kit, no board of the part stands between a visitor's eyes and any point of the card", () => {
    expect(withCards.length).toBeGreaterThan(0)
    for (const part of withCards) {
      for (const slot of part.slots) {
        const pose = cardPose({ slotKind: slot.kind, position: [0, slot.at[1], 0], partTop: part.size[1] })!
        const view = cardView(pose, slot.at, part, 0)
        for (const eye of view.eyes) for (const p of view.face) for (const b of view.boards) expect(through(eye, p, b), `${part.id} ${JSON.stringify(slot.at)} eye ${eye} card ${p}`).toBe(false)
      }
    }
  })
})
