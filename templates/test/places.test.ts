import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { layoutProblems, neglectFor, toLandPlace, validatePlace } from '@forkling/sim'

const dir = fileURLToPath(new URL('../forkling-world/places/', import.meta.url))
const load = (id: string) => Place.parse(JSON.parse(readFileSync(`${dir}${id}.json`, 'utf8')))
const home = load('home')
const workshop = load('workshop')
const ctx = { kit, exists: (path: string) => path !== '', souvenirKind: () => undefined }

describe('templates/forkling-world places: Home and the Workshop (spec 4.1, 5, W5)', () => {
  it('are valid place files that obey the limits of 5.2, the kit and the slot rules', () => {
    expect(validatePlace(home, ctx)).toEqual([])
    expect(validatePlace(workshop, ctx)).toEqual([])
  })

  it('share the founding clearing, chunk (0, 0), side by side, without overlapping', () => {
    expect(home.chunk).toEqual([0, 0])
    expect(workshop.chunk).toEqual([0, 0])
    expect(home.offset[0]).toBeLessThan(0)
    expect(workshop.offset[0]).toBeGreaterThan(0)
    expect(layoutProblems([toLandPlace(home), toLandPlace(workshop)])).toEqual([])
  })

  it('have the ids the plan and the mind already use', () => {
    expect(home.id).toBe('home')
    expect(workshop.id).toBe('workshop')
  })

  it('give Home a desk to read and write at, a bed to rest in and a shelf', () => {
    const parts = home.rooms.flatMap((r) => r.parts.map((p) => p.part))
    for (const part of ['desk', 'chair', 'cat-bed', 'shelf-low']) expect(parts, part).toContain(part)
  })

  it('give the Workshop a bench, a few screens for works, and the terminal that opens the gallery of every work', () => {
    const parts = workshop.rooms.flatMap((r) => r.parts.map((p) => p.part))
    expect(parts).toContain('workbench')
    expect(parts.filter((p) => p === 'screen-small' || p === 'screen-large').length).toBeGreaterThanOrEqual(4)
    expect(parts).toContain('terminal')
    expect(workshop.exhibits.filter((e) => e.kind === 'gallery')).toHaveLength(1)
  })

  it('leave the screens free for works, and start with no neglect (Home and the Workshop never pass level 1)', () => {
    expect(workshop.exhibits.filter((e) => e.kind === 'work')).toEqual([])
    const now = Date.parse('2027-06-01T00:00:00Z')
    expect(neglectFor({ id: home.id, lastCareAt: home.state.lastCareAt, founded: home.founded }, now)).toBeLessThanOrEqual(1)
    expect(neglectFor({ id: workshop.id, lastCareAt: workshop.state.lastCareAt, founded: workshop.founded }, now)).toBeLessThanOrEqual(1)
  })

  it('carry no personality text: names and purposes are plain, and no interest is assumed (the seed is the only authored text)', () => {
    expect(home.tags).toEqual(['home'])
    expect(workshop.tags).toEqual(['workshop'])
    expect(home.history).toHaveLength(1)
  })
})
