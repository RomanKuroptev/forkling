import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Place, WorkMeta } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { validatePlace } from '@forkling/sim'
import { planInstalls, screenSlots } from '../src/builds/install.ts'

const workshop = Place.parse(JSON.parse(readFileSync(fileURLToPath(new URL('../../../templates/forkling-world/places/workshop.json', import.meta.url)), 'utf8')))
const NOW = '2026-11-13T12:00:00.000Z'

const work = (id: string, made: string, over: Record<string, unknown> = {}) =>
  WorkMeta.parse({ id, title: id, kind: 'game', about: 'a thing', interest: null, made, status: 'shelf', size: 'full', ...over })
const day = (n: number) => `2026-11-${String(n).padStart(2, '0')}T10:00:00Z`
const workExhibits = (p: Place) => p.exhibits.filter((e) => e.kind === 'work')

describe('the Workshop screens', () => {
  it('are the four screen slots of the place, in order', () => {
    expect(screenSlots(workshop, kit)).toHaveLength(4)
    expect(screenSlots(workshop, kit)[0]).toBe('bench-room/4/0')
  })
})

describe('installing works on screens (spec 7, W5: newest on the screens, the oldest sketch rotates off)', () => {
  it('puts a new shelved work on a free screen, records where, and adds a history line, without counting as care', () => {
    const r = planInstalls(workshop, [work('clock', day(5))], kit, NOW)
    expect(r.place).not.toBeNull()
    expect(workExhibits(r.place!)).toEqual([expect.objectContaining({ ref: 'works/clock', slot: 'bench-room/4/0', added: '2026-11-13' })])
    expect(r.workUpdates.map((w) => [w.id, w.installedIn])).toEqual([['clock', 'workshop/bench-room/4/0']])
    expect(r.place!.history.at(-1)).toMatchObject({ verb: 'install', at: NOW })
    expect(r.place!.state).toEqual(workshop.state)
    expect(validatePlace(r.place!, { kit, exists: () => true })).toEqual([])
  })

  it('does nothing when everything is already installed (so a quiet tick writes nothing)', () => {
    const first = planInstalls(workshop, [work('clock', day(5))], kit, NOW)
    const again = planInstalls(first.place!, [{ ...first.workUpdates[0]! }], kit, NOW)
    expect(again.place).toBeNull()
    expect(again.workUpdates).toEqual([])
  })

  it('fills the four screens with the newest works, and each new one takes the next free screen', () => {
    const r = planInstalls(workshop, [work('a', day(1)), work('b', day(2)), work('c', day(3)), work('d', day(4))], kit, NOW)
    expect(workExhibits(r.place!)).toHaveLength(4)
    expect(new Set(workExhibits(r.place!).map((e) => e.slot)).size).toBe(4)
  })

  it('when the screens are full, a newer work takes the screen of the oldest one on show, and only that one', () => {
    const all = [work('a', day(1), { size: 'sketch' }), work('b', day(2)), work('c', day(3)), work('d', day(4))]
    const full = planInstalls(workshop, all, kit, NOW)
    const installed = all.map((w) => full.workUpdates.find((u) => u.id === w.id) ?? w)
    const next = planInstalls(full.place!, [...installed, work('new', day(9))], kit, NOW)
    expect(workExhibits(next.place!).map((e) => e.ref).sort()).toEqual(['works/b', 'works/c', 'works/d', 'works/new'])
    expect(next.workUpdates.find((w) => w.id === 'a')?.installedIn).toBeNull()
    // The new work takes the screen the oldest had.
    expect(next.workUpdates.find((w) => w.id === 'new')?.installedIn).toBe(full.workUpdates.find((u) => u.id === 'a')?.installedIn)
    // And a second pass changes nothing: the work that rotated off does not come back over an older one.
    const settled = [...installed.map((w) => next.workUpdates.find((u) => u.id === w.id) ?? w), next.workUpdates.find((w) => w.id === 'new')!]
    expect(planInstalls(next.place!, settled, kit, NOW).place).toBeNull()
  })

  it('does not install a work older than everything on the screens', () => {
    const four = [work('a', day(1)), work('b', day(2)), work('c', day(3)), work('d', day(4))]
    const full = planInstalls(workshop, four, kit, NOW)
    const installed = four.map((w) => full.workUpdates.find((u) => u.id === w.id) ?? w)
    const older = planInstalls(full.place!, [...installed, work('ancient', '2026-10-01T00:00:00Z')], kit, NOW)
    expect(older.place).toBeNull()
  })

  it('takes a work off its screen when it is put away or scrapped, and frees the screen', () => {
    const first = planInstalls(workshop, [work('clock', day(5))], kit, NOW)
    const retired = work('clock', day(5), { status: 'retired', retireReason: 'done with it', installedIn: first.workUpdates[0]!.installedIn })
    const r = planInstalls(first.place!, [retired], kit, NOW)
    expect(workExhibits(r.place!)).toEqual([])
    expect(r.workUpdates[0]).toMatchObject({ id: 'clock', installedIn: null })
  })

  it('leaves the gallery terminal alone: it lists every shelved work, whether or not one is on a screen', () => {
    const r = planInstalls(workshop, [work('a', day(1))], kit, NOW)
    expect(r.place!.exhibits.some((e) => e.kind === 'gallery' && e.id === 'all-works')).toBe(true)
  })

  it('puts nothing anywhere for a place that has no screens', () => {
    const home = Place.parse(JSON.parse(readFileSync(fileURLToPath(new URL('../../../templates/forkling-world/places/home.json', import.meta.url)), 'utf8')))
    expect(planInstalls(home, [work('a', day(1))], kit, NOW).place).toBeNull()
  })
})
