import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { buildExpandUser, type ExpandPromptInput } from '../src/builds/expand.ts'

const home = Place.parse(JSON.parse(readFileSync(fileURLToPath(new URL('../../../templates/forkling-world/places/home.json', import.meta.url)), 'utf8')))
const wide = Place.parse({ ...home, offset: [0, 0], exterior: { ...home.exterior, footprint: [20, 14] }, tags: ['home', 'signals'] })

const base: ExpandPromptInput = {
  place: wide,
  kit,
  reason: 'The main room is full and I want more space for it.',
  tag: null,
  kept: [],
  works: [],
  others: [{ id: 'workshop', name: 'Workshop', chunk: [0, 0] }],
  openWishes: [],
}

/** Pins the expand job's prompt for the three ways an expand is chosen (spec v4 2.2): by making, by reading, and not earned at all. */
describe('expand job prompt golden files', () => {
  it('a made expand: the works behind the room', async () => {
    const works = [
      { ref: 'works/lamp-garden', label: 'A garden of lamps that follow the cursor' },
      { ref: 'works/slow-tide', label: 'A tide that takes a minute to come in' },
      { ref: 'works/small-door', label: 'A door that is a little too small' },
    ]
    await expect(buildExpandUser({ ...base, works })).toMatchFileSnapshot('golden/expand-made.txt')
  })
  it('a read expand: the family and the souvenirs behind the room', async () => {
    const kept = [{ id: 's1', kind: 'quote', content: 'A keeper wrote fog, fog, fog.', why: 'it stuck' }]
    await expect(buildExpandUser({ ...base, tag: 'signals', kept })).toMatchFileSnapshot('golden/expand-read.txt')
  })
  it('an unearned expand: only the reason Merge gave', async () => {
    await expect(buildExpandUser(base)).toMatchFileSnapshot('golden/expand-unearned.txt')
  })
})
