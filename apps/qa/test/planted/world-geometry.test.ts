import { describe, expect, it } from 'vitest'
import { geometryFindings, type GeometryInput } from '../../src/world/geometry.ts'
import type { SceneObject } from '../../src/world/open.ts'

const NOW = Date.parse('2026-11-26T13:00:00Z')
const o = (id: string, kind: SceneObject['kind'], min: [number, number, number], max: [number, number, number], extra: Partial<SceneObject> = {}): SceneObject => ({ id, kind, box: { min, max }, visible: true, material: 'solid', ...extra })
const place = (id: string, over: Record<string, unknown> = {}) => ({ id, name: id === 'home' ? 'Home' : 'Workshop', exterior: { sign: id === 'home' ? 'Come in' : 'Tools', footprint: [12, 10] }, state: { construction: null, closed: null }, ...over })

/** A clean little world: two places side by side on flat ground, their signs, Merge in view. */
function clean(): GeometryInput {
  return {
    fixture: 'test',
    now: NOW,
    places: [place('home'), place('workshop')] as never,
    works: [{ id: 'w1', status: 'shelf', installedIn: 'workshop/bench/0/0' }] as never,
    scene: [
      o('home', 'place', [-14, 0, -5], [-2, 4, 5]),
      o('workshop', 'place', [2, 0, -5], [14, 4, 5]),
      o('home/main', 'room', [-13, 0, -4], [-3, 3, 4], { place: 'home' }),
      o('workshop/bench', 'room', [3, 0, -4], [13, 3, 4], { place: 'workshop' }),
      o('workshop/screen-w1', 'work', [7, 1, -4], [8, 1.5, -3.9], { place: 'workshop', ref: 'works/w1' }),
      o('home/sign', 'sign', [-9, 0.9, 6], [-7, 2.1, 6], { place: 'home', text: 'Home Come in' }),
      o('workshop/sign', 'sign', [7, 0.9, 6], [9, 2.1, 6], { place: 'workshop', text: 'Workshop Tools' }),
      o('merge', 'merge', [0, 0, 8], [0.5, 0.9, 9]),
    ],
    ground: () => ({ y: 0, chunk: 'owned' }),
    start: { eye: [0, 1.6, 25], yaw: Math.PI, pitch: 0, aspect: 1.6 },
  }
}

const ids = (input: GeometryInput) => geometryFindings(input).map((f) => f.fingerprint)

describe('world geometry checks (audit spec 7.2)', () => {
  it('find nothing in a clean world', () => {
    expect(geometryFindings(clean())).toEqual([])
  })

  it('planted: a place pushed through another is a major finding', () => {
    const w = clean()
    w.scene[1] = o('workshop', 'place', [-6, 0, -5], [6, 4, 5])
    expect(ids(w)).toContain('world.places-overlap|test|home+workshop')
  })

  it('planted: two rooms of one place inside each other', () => {
    const w = clean()
    w.scene.push(o('workshop/store', 'room', [10, 0, -4], [13, 3, 0], { place: 'workshop' }))
    expect(ids(w)).toContain('world.rooms-overlap|test|workshop/bench+workshop/store')
  })

  it('planted: a floating sign and a sunk place', () => {
    const w = clean()
    w.scene[5] = o('home/sign', 'sign', [-9, 3.9, 6], [-7, 5.1, 6], { place: 'home', text: 'Home Come in' })
    w.scene[1] = o('workshop', 'place', [2, -0.5, -5], [14, 3.5, 5])
    expect(ids(w)).toEqual(expect.arrayContaining(['world.floating|test|home/sign', 'world.not-on-ground|test|workshop']))
  })

  it('planted: a place on fog, outside the land', () => {
    const w = clean()
    w.ground = (x) => ({ y: 0, chunk: x > 10 ? 'fog' : 'owned' })
    expect(ids(w)).toContain('world.outside-land|test|workshop')
  })

  it('planted: a place being built that is not wireframe, and a finished one that is', () => {
    const w = clean()
    w.places = [place('home', { state: { construction: { kind: 'found', finishesAt: '2026-11-27T13:00:00Z' }, closed: null } }), place('workshop')] as never
    w.scene[1] = { ...w.scene[1]!, material: 'wireframe' }
    expect(ids(w)).toEqual(expect.arrayContaining(['world.wireframe-state|test|home', 'world.wireframe-state|test|workshop']))
  })

  it('planted: a sign that says something else than its file, and one that is cut', () => {
    const w = clean()
    w.scene[5] = { ...w.scene[5]!, text: 'Home Go away' }
    w.scene[6] = { ...w.scene[6]!, text: 'Workshop To…' }
    const found = geometryFindings(w)
    expect(found.find((f) => f.fingerprint === 'world.label-text|test|home/sign')!.severity).toBe('major')
    expect(found.find((f) => f.fingerprint === 'world.label-cut|test|workshop/sign')!.severity).toBe('minor')
  })

  it('planted: Merge too big, under the ground, or out of the start view', () => {
    const w = clean()
    w.scene[7] = o('merge', 'merge', [100, -1, -40], [104, 6, -36])
    expect(ids(w)).toEqual(expect.arrayContaining(['world.merge-size|test|merge', 'world.not-on-ground|test|merge', 'world.merge-in-view|test|merge']))
  })

  it('planted: a work its file says is installed in the Workshop but is not there', () => {
    const w = clean()
    w.scene = w.scene.filter((s) => s.kind !== 'work')
    expect(ids(w)).toContain('world.work-not-installed|test|w1')
  })

  it('counts the finished works shown nowhere in the world (only on the site) as one finding', () => {
    const w = clean()
    w.works = [...(w.works as never[]), { id: 'w2', status: 'shelf', installedIn: null }, { id: 'w3', status: 'scrap', installedIn: null }] as never
    const f = geometryFindings(w).find((x) => x.id === 'world.work-shown')!
    expect(f).toMatchObject({ severity: 'major', fingerprint: 'world.work-shown|test' })
    expect(f.what).toContain('1 of 2 finished works')
    expect(f.what).toContain('w2')
  })
})
