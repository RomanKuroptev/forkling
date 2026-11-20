import { describe, expect, it } from 'vitest'
import type { GeometryInput } from '../../src/world/geometry.ts'
import type { SceneObject } from '../../src/world/open.ts'
import { siteFindings } from '../../src/world/site.ts'

/**
 * The construction site, second pass (issues 426, 427, 330; audit QW.2): in a place being built no exhibit is drawn solid, every
 * sign stands on posts on the ground, and no wire edge is drawn twice side by side. Planted: a solid exhibit card in the wire, a sign
 * with no posts, and two parallel wire lines 2 cm apart.
 */
const NOW = Date.parse('2026-11-26T13:00:00Z')
const o = (id: string, kind: SceneObject['kind'], min: [number, number, number], max: [number, number, number], extra: Partial<SceneObject> = {}): SceneObject => ({ id, kind, box: { min, max }, visible: true, material: 'solid', ...extra })
const building = { construction: { kind: 'expand', finishesAt: '2026-11-27T12:00:00Z' }, closed: null }
const done = { construction: null, closed: null }

/** A cube's twelve edges, each once. */
const cube = (x: number, y: number, z: number, s: number): [[number, number, number], [number, number, number]][] => {
  const c = (i: number): [number, number, number] => [x + (i & 1 ? s : 0), y + (i & 2 ? s : 0), z + (i & 4 ? s : 0)]
  const out: [[number, number, number], [number, number, number]][] = []
  for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) if (!(i & bit)) out.push([c(i), c(i | bit)])
  return out
}

/** One place being built and one finished, drawn right: wire with each edge once, wire exhibits, both signs on posts. */
function world(): GeometryInput {
  const posts = (x: number, z: number) => [
    { min: [x - 1.26, 0, z - 0.06], max: [x - 1.14, 2.1, z + 0.06] },
    { min: [x + 1.14, 0, z - 0.06], max: [x + 1.26, 2.1, z + 0.06] },
  ] as SceneObject['support']
  return {
    fixture: 'test',
    now: NOW,
    places: [
      { id: 'lab', name: 'Lamp Lab', exterior: { footprint: [8, 8] }, state: building },
      { id: 'home', name: 'Home', exterior: { footprint: [8, 8] }, state: done },
    ] as never,
    works: [],
    scene: [
      o('lab', 'place', [-4, 0, -4], [4, 4, 4], { material: 'wireframe', wire: [...cube(-4, 0, -4, 8), ...cube(-1, 0, -1, 0.5)] }),
      o('lab/kept', 'exhibit', [-1, 1, -1], [-0.6, 1.3, -0.9], { place: 'lab', exhibitKind: 'souvenir', slot: 'shelf', material: 'wireframe', card: { shows: 'text', text: 'A quote · words' } }),
      o('lab/sign', 'sign', [2, 0.9, 6.6], [4.6, 2.1, 6.6], { place: 'lab', support: posts(3.3, 6.5) }),
      o('home', 'place', [16, 0, -4], [24, 4, 4]),
      o('home/kept', 'exhibit', [19, 1, -1], [19.4, 1.3, -0.9], { place: 'home', exhibitKind: 'souvenir', slot: 'frame', card: { shows: 'picture', text: 'A picture' } }),
      o('home/sign', 'sign', [22, 0.9, 6.6], [24.6, 2.1, 6.6], { place: 'home', support: posts(23.3, 6.5) }),
    ],
    ground: () => ({ y: 0, chunk: 'owned' }),
    start: { eye: [0, 1.6, 25], yaw: Math.PI, pitch: 0, aspect: 1.6 },
  }
}

const ids = (input: GeometryInput) => siteFindings(input).map((f) => f.fingerprint)

describe('the construction site finish checks', () => {
  it('find nothing at a site drawn right', () => {
    expect(siteFindings(world())).toEqual([])
  })

  it('planted: a solid exhibit inside a place being built', () => {
    const w = world()
    w.scene[1] = { ...w.scene[1]!, material: 'solid' }
    const found = siteFindings(w).find((f) => f.fingerprint === 'world.site-exhibit-solid|test|lab/kept')
    expect(found?.severity).toBe('major')
  })

  it('planted: a card showing its picture inside a place being built', () => {
    const w = world()
    w.scene[1] = { ...w.scene[1]!, card: { shows: 'picture', text: 'A picture' } }
    expect(ids(w)).toContain('world.site-exhibit-solid|test|lab/kept')
  })

  it('planted: a sign with no posts under it', () => {
    const w = world()
    w.scene[2] = { ...w.scene[2]!, support: [] }
    const found = siteFindings(w).find((f) => f.fingerprint === 'world.sign-unsupported|test|lab/sign')
    expect(found?.severity).toBe('major')
  })

  it('planted: a sign whose viewer lists nothing under it, and one lifted off its posts', () => {
    const w = world()
    const { support: _, ...bare } = w.scene[5]!
    w.scene[5] = bare
    w.scene[2] = { ...w.scene[2]!, box: { min: [2, 3, 6.6], max: [4.6, 4.2, 6.6] } }
    expect(ids(w)).toEqual(expect.arrayContaining(['world.sign-unsupported|test|home/sign', 'world.sign-unsupported|test|lab/sign']))
  })

  it('planted: two parallel wire lines 2 cm apart, the same edge drawn twice', () => {
    const w = world()
    w.scene[0] = { ...w.scene[0]!, wire: [...w.scene[0]!.wire!, [[-4, 0.02, -4], [2, 0.02, -4]]] }
    const found = siteFindings(w).find((f) => f.fingerprint === 'world.wire-doubled|test|lab')
    expect(found?.severity).toBe('major')
  })

  it('lines that meet end to end, cross, or run 30 cm apart are not doubled', () => {
    const w = world()
    w.scene[0] = { ...w.scene[0]!, wire: [[[0, 0, 0], [1, 0, 0]], [[1, 0, 0], [2, 0, 0]], [[0.5, -1, 0], [0.5, 1, 0]], [[0, 0.3, 0], [2, 0.3, 0]]] }
    expect(siteFindings(w)).toEqual([])
  })
})
