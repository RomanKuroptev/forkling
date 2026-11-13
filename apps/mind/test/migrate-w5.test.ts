import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { migrateToW5 } from '../src/migrate-w5.ts'

const template = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))

let world: string
const put = (rel: string, content: string) => {
  mkdirSync(dirname(join(world, rel)), { recursive: true })
  writeFileSync(join(world, rel), content)
}

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'w5-'))
  put('forkling.json', JSON.stringify({ name: 'Merge', species: 'cat' }))
})

describe('migrate-w5: Home and the Workshop for a world that has no places yet', () => {
  it('only prints the plan without --apply, and touches nothing', () => {
    const plan = migrateToW5(world, template, { apply: false })
    expect(plan.applied).toBe(false)
    expect(plan.writes.sort()).toEqual(['places/home.json', 'places/workshop.json'])
    expect(existsSync(join(world, 'places'))).toBe(false)
  })

  it('writes the two place files, both valid places', () => {
    const plan = migrateToW5(world, template, { apply: true })
    expect(plan.applied).toBe(true)
    for (const id of ['home', 'workshop']) expect(Place.safeParse(JSON.parse(readFileSync(join(world, `places/${id}.json`), 'utf8'))).success).toBe(true)
  })

  it('is safe to run twice, and never overwrites a place Merge has changed', () => {
    migrateToW5(world, template, { apply: true })
    const changed = { ...JSON.parse(readFileSync(join(world, 'places/home.json'), 'utf8')), name: 'My Home' }
    writeFileSync(join(world, 'places/home.json'), JSON.stringify(changed))
    const again = migrateToW5(world, template, { apply: true })
    expect(again.writes).toEqual([])
    expect(JSON.parse(readFileSync(join(world, 'places/home.json'), 'utf8')).name).toBe('My Home')
  })

  it('writes only what is missing', () => {
    put('places/workshop.json', '{}')
    expect(migrateToW5(world, template, { apply: false }).writes).toEqual(['places/home.json'])
  })

  it('refuses a folder that is not a world', () => {
    expect(() => migrateToW5(join(world, 'nowhere'), template, { apply: false })).toThrow(/not a world/)
  })
})
