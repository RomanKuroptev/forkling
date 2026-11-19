import { describe, expect, it } from 'vitest'
import { geometryFindings, type GeometryInput } from '../../src/world/geometry.ts'
import type { SceneObject } from '../../src/world/open.ts'

/**
 * Planted flaws for the place-sign checks the world explorer found (issues 356, 359, 363, 366; audit steps QW.2): a porch column
 * through a sign, a sign that says the name twice, one that names another place, and a title bar that cuts the name.
 */
const NOW = Date.parse('2026-11-26T13:00:00Z')
const o = (id: string, kind: SceneObject['kind'], min: [number, number, number], max: [number, number, number], extra: Partial<SceneObject> = {}): SceneObject => ({ id, kind, box: { min, max }, visible: true, material: 'solid', ...extra })
const place = (id: string, name: string, sign: string, purpose: string) => ({ id, name, purpose, founded: '2026-11-11', exterior: { sign, footprint: [12, 10] }, state: { construction: null, closed: null } })

/** Home and the Workshop with good signs, Home's porch columns behind its sign, Merge in view. */
function clean(): GeometryInput {
  return {
    fixture: 'test',
    now: NOW,
    places: [place('home', 'Home', 'Come in', 'Where my days start and end.'), place('workshop', 'Workshop', 'Tools', 'Where I make things.')] as never,
    works: [],
    scene: [
      o('home', 'place', [-14, 0, -5], [-2, 4, 7.6]),
      o('workshop', 'place', [2, 0, -5], [14, 4, 7.6]),
      o('home/column-0', 'column', [-5.9, 0, 5.7], [-5.1, 3.2, 6.5], { place: 'home' }),
      o('home/column-1', 'column', [-3.4, 0, 5.7], [-2.6, 3.2, 6.5], { place: 'home' }),
      o('home/sign', 'sign', [-6.1, 0.9, 7.6], [-3.5, 2.1, 7.6], { place: 'home', text: 'Home Come in' }),
      o('workshop/sign', 'sign', [9.9, 0.9, 7.6], [12.5, 2.1, 7.6], { place: 'workshop', text: 'Workshop Tools' }),
      o('home/title', 'label', [-13, 6, 5], [-3, 7, 5], { place: 'home', text: 'HOME' }),
      o('merge', 'merge', [0, 0, 8], [0.5, 0.9, 9]),
    ],
    ground: () => ({ y: 0, chunk: 'owned' }),
    start: { eye: [0, 1.6, 25], yaw: Math.PI, pitch: 0, aspect: 1.6 },
  }
}

const ids = (input: GeometryInput) => geometryFindings(input).map((f) => f.fingerprint)

describe('place-sign checks (issues 356, 359, 363, 366)', () => {
  it('find nothing when the columns stand behind the sign and it says something of its own', () => {
    expect(geometryFindings(clean())).toEqual([])
  })

  it('planted: a porch column through the sign hides it from the front (issue 356)', () => {
    const w = clean()
    w.scene[2] = o('home/column-0', 'column', [-5.9, 0, 7.2], [-5.1, 3.2, 8.0], { place: 'home' })
    const f = geometryFindings(w).find((x) => x.fingerprint === 'world.sign-hidden|test|home/sign')
    expect(f?.severity).toBe('major')
  })

  it('planted: columns standing in front of the sign hide it (issue 366)', () => {
    const w = clean()
    w.scene[2] = o('home/column-0', 'column', [-5.5, 0, 8.5], [-4.7, 3.2, 9.3], { place: 'home' })
    w.scene[3] = o('home/column-1', 'column', [-4.3, 0, 8.5], [-3.5, 3.2, 9.3], { place: 'home' })
    expect(ids(w)).toContain('world.sign-hidden|test|home/sign')
  })

  it('planted: a sign that only says the name again (issue 359)', () => {
    const w = clean()
    w.places = [place('home', 'Home', 'HOME', 'Where my days start and end.'), place('workshop', 'Workshop', 'Tools', 'Where I make things.')] as never
    w.scene[4] = { ...w.scene[4]!, text: 'Home HOME' }
    const f = geometryFindings(w).find((x) => x.fingerprint === 'world.sign-repeats-name|test|home/sign')
    expect(f?.severity).toBe('major')
  })

  it('planted: Home\'s sign names the Workshop (issue 363)', () => {
    const w = clean()
    w.scene[4] = { ...w.scene[4]!, text: 'Home PATCH BENCH: WORKSHOP' }
    const f = geometryFindings(w).find((x) => x.fingerprint === 'world.sign-names-other|test|home/sign')
    expect(f?.severity).toBe('major')
    expect(f?.what).toContain('workshop')
  })

  it('planted: a title bar cut at 24 characters (issue 366)', () => {
    const w = clean()
    w.places = [place('home', 'Hillside Room, Five Lamps', 'Lamps that answer the hill', 'x'), place('workshop', 'Workshop', 'Tools', 'Where I make things.')] as never
    w.scene[4] = { ...w.scene[4]!, text: 'Hillside Room, Five Lamps Lamps that answer the hill' }
    w.scene[6] = { ...w.scene[6]!, text: 'HILLSIDE ROOM, FIVE LAMP' }
    expect(ids(w)).toContain('world.label-cut|test|home/title')
  })
})
