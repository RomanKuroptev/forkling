import { describe, expect, it } from 'vitest'
import { Place, repairPlaceJson } from '../src/index.ts'
import workshop from '../../../templates/forkling-world/places/workshop.json' with { type: 'json' }

// Merge's live places/workshop.json had an exhibit id of 42 characters (install wrote `screen-<work id>` cut at 60),
// one over PartId's 41, so every reader dropped the whole Workshop.
const LONG = 'screen-a-door-that-opens-only-when-watched'

const withExhibits = (ids: string[]) => ({
  ...workshop,
  exhibits: ids.map((id, i) => ({ id, kind: 'work', ref: `works/w${i}`, slot: `main/0/${i}`, label: 'x', added: '2026-11-22' })),
})

describe('repairPlaceJson', () => {
  it('a place with an over-long exhibit id fails the schema as it is', () => {
    expect(LONG.length).toBe(42)
    expect(Place.safeParse(withExhibits([LONG])).success).toBe(false)
  })

  it('cuts an over-long exhibit id to 41 characters so the place reads again', () => {
    const parsed = Place.safeParse(repairPlaceJson(withExhibits([LONG])))
    expect(parsed.success).toBe(true)
    expect(parsed.data!.exhibits[0]!.id).toBe(LONG.slice(0, 41))
  })

  it('never ends an id with a dash and keeps cut ids unique', () => {
    const a = `${'a'.repeat(40)}-one`
    const b = `${'a'.repeat(40)}-two`
    const parsed = Place.parse(repairPlaceJson(withExhibits([a, b])))
    const ids = parsed.exhibits.map((e) => e.id)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]{0,40}$/)
    expect(ids.every((id) => !id.endsWith('-'))).toBe(true)
  })

  it('leaves a valid place exactly as it is, and anything else alone', () => {
    const good = withExhibits(['screen-short'])
    expect(repairPlaceJson(good)).toBe(good)
    expect(repairPlaceJson(null)).toBe(null)
    expect(repairPlaceJson('x')).toBe('x')
    // Not a dash-word id at all: not guessed at, so the schema still refuses it.
    const odd = withExhibits(['Screen With Spaces And Capitals That Is Far Too Long'])
    expect(Place.safeParse(repairPlaceJson(odd)).success).toBe(false)
  })
})
