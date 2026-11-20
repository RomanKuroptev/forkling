import { describe, expect, it } from 'vitest'
import type { SceneObject } from '../../src/world/open.ts'
import { cardCoveredFindings } from '../../src/world/card-cover.ts'

type V = [number, number, number]
/** Home's low shelf (1.4 x 0.9 x 0.4) in its own frame: two boards, two sides and a back, as the kit draws it. */
const boards = [
  { min: [-0.7, 0.84, -0.2] as V, max: [0.7, 0.9, 0.2] as V },
  { min: [-0.7, 0.42, -0.2] as V, max: [0.7, 0.48, 0.2] as V },
  { min: [-0.7, 0, -0.2] as V, max: [-0.64, 0.9, 0.2] as V },
  { min: [0.64, 0, -0.2] as V, max: [0.7, 0.9, 0.2] as V },
  { min: [-0.7, 0, -0.2] as V, max: [0.7, 0.9, -0.16] as V },
]
const eyes: V[] = [0.5, 0.8, 1.4].map((z): V => [-0.45, 1.6, z])
/** A card 0.36 by 0.27 on the lower board, its bottom edge `front` m out from the slot, leaning back by `tilt`. */
const card = (front: number, tilt: number): V[] => {
  const pt = (x: number, y: number): V => [-0.45 + x, 0.48 + y * Math.cos(tilt), front + y * Math.sin(tilt)]
  return [pt(-0.17, 0.01), pt(0.17, 0.01), pt(0.17, 0.26), pt(-0.17, 0.26), pt(0, 0.26)]
}
const exhibit = (face: V[]): SceneObject => ({ id: 'home/canopy-botany-note', kind: 'exhibit', place: 'home', slot: 'shelf', at: 'home/main/3/0', box: { min: [10, 0.4, 12], max: [10.4, 0.8, 12.6] }, visible: true, material: 'solid', view: { eyes, face, boards } })

describe("a card's face is not covered by the shelf above it (issue 453; audit QW.2)", () => {
  it('finds nothing for a card standing at the front edge of the board, leaning back a little', () => {
    expect(cardCoveredFindings('test', [exhibit(card(0.19, -0.08))])).toEqual([])
  })

  it("planted: a card set back on the board and leaning back, as Home's were, has its top line under the board above: a major look finding", () => {
    const found = cardCoveredFindings('test', [exhibit(card(0.16, -0.2))])
    expect(found.map((f) => f.fingerprint)).toEqual(['world.card-covered|test|home/canopy-botany-note'])
    expect(found[0]).toMatchObject({ severity: 'major', fixKind: 'look', where: 'apps/viewer/src/world/exhibitCards.ts' })
    expect(found[0]!.what).toContain('top')
  })

  it('leaves alone a card that is not drawn now, and an exhibit with no card view (a work screen)', () => {
    expect(cardCoveredFindings('test', [{ ...exhibit(card(0.16, -0.2)), visible: false }])).toEqual([])
    const { view: _, ...screen } = exhibit(card(0.16, -0.2))
    expect(cardCoveredFindings('test', [screen])).toEqual([])
  })
})
