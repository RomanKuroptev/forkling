import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { expectedFromFiles, sceneListsFiles } from '../../src/world/scene-lists-files.ts'
import type { SceneObject } from '../../src/world/open.ts'

const world = (places: Record<string, unknown>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-scene-'))
  mkdirSync(join(dir, 'places'), { recursive: true })
  for (const [id, place] of Object.entries(places)) writeFileSync(join(dir, 'places', `${id}.json`), JSON.stringify(place))
  return dir
}
const place = (id: string, rooms: string[], works: string[]) => ({
  id,
  rooms: rooms.map((r) => ({ id: r })),
  exhibits: works.map((w) => ({ id: w, kind: 'work' })),
})
const entry = (id: string, kind: SceneObject['kind']): SceneObject => ({ id, kind, box: null, visible: true, material: 'solid' })

describe('every place, room and work in the files, and Merge, are in the scene', () => {
  it('reads the raw place files, not only the ones that fit the schema', () => {
    const dir = world({ home: place('home', ['main'], []), workshop: place('workshop', ['bench'], ['screen-a-work']) })
    expect(expectedFromFiles(dir)).toEqual([
      { id: 'home', kind: 'place', file: 'places/home.json' },
      { id: 'home/main', kind: 'room', file: 'places/home.json' },
      { id: 'workshop', kind: 'place', file: 'places/workshop.json' },
      { id: 'workshop/bench', kind: 'room', file: 'places/workshop.json' },
      { id: 'workshop/screen-a-work', kind: 'work', file: 'places/workshop.json' },
    ])
  })

  it('passes when the scene has them all', () => {
    const dir = world({ home: place('home', ['main'], ['w']) })
    expect(sceneListsFiles(dir, [entry('home', 'place'), entry('home/main', 'room'), entry('home/w', 'work'), entry('merge', 'merge')], 'day-7')).toEqual([])
  })

  it('planted: a place left out of the world (the engine wrote an exhibit id too long for the schema) is a major finding that says why', () => {
    const dir = world({ home: place('home', [], []), workshop: { ...place('workshop', ['bench'], []), exhibits: [{ id: 'screen-a-door-that-opens-only-when-watched', kind: 'work' }] } })
    const found = sceneListsFiles(dir, [entry('home', 'place'), entry('merge', 'merge')], 'day-7')
    const ws = found.find((f) => f.fingerprint === 'world.scene-lists-files|day-7|place|workshop')!
    expect(ws).toMatchObject({ severity: 'major', fixture: 'day-7', where: 'places/workshop.json' })
    expect(ws.what).toContain('does not fit the schema')
    // Its rooms and works are not listed one by one when the whole place is missing.
    expect(found).toHaveLength(1)
  })

  it('planted: a missing work and a missing Merge are each a finding', () => {
    const dir = world({ home: place('home', [], ['gone']) })
    const found = sceneListsFiles(dir, [entry('home', 'place')], 'day-0')
    expect(found.map((f) => f.fingerprint).sort()).toEqual(['world.scene-lists-files|day-0|merge|merge', 'world.scene-lists-files|day-0|work|home/gone'])
  })

  it('planted: something twice in the scene is a finding', () => {
    const dir = world({ home: place('home', [], []) })
    const found = sceneListsFiles(dir, [entry('home', 'place'), entry('home', 'place'), entry('merge', 'merge')], 'day-0')
    expect(found).toHaveLength(1)
    expect(found[0]!.title).toMatch(/twice/)
  })

  it('a place file that is not JSON at all is named', () => {
    const dir = world({})
    writeFileSync(join(dir, 'places', 'broken.json'), '{ nope')
    expect(readFileSync(join(dir, 'places', 'broken.json'), 'utf8')).toBe('{ nope')
    const found = sceneListsFiles(dir, [entry('merge', 'merge')], 'day-0')
    expect(found[0]!.what).toContain('not JSON')
  })
})
