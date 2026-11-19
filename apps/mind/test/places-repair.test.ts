import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parsePlaces } from '../src/places.ts'

const workshop = JSON.parse(readFileSync(fileURLToPath(new URL('../../../templates/forkling-world/places/workshop.json', import.meta.url)), 'utf8'))

describe('the mind reads a place with an exhibit id over 41 characters (Merge lost its Workshop to one)', () => {
  it('keeps the place, with the id cut to fit', () => {
    const exhibit = { id: 'screen-a-door-that-opens-only-when-watched', kind: 'work', ref: 'works/a-door', slot: 'bench-room/4/0', label: 'A door', added: '2026-11-22' }
    const places = parsePlaces([JSON.stringify({ ...workshop, exhibits: [exhibit] })])
    expect(places.map((p) => p.id)).toEqual([workshop.id])
    expect(places[0]!.exhibits[0]!.id).toBe('screen-a-door-that-opens-only-when-watche')
  })
})
