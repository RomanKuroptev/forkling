import { describe, expect, it } from 'vitest'
import { PlaceRequest } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { buildFoundBuildUser } from '../src/builds/found-build.ts'
import { buildFoundUser } from '../src/builds/found.ts'

/** Pins the two job prompts of a founding (spec v4 2.3): the found call that writes the founding text, and the kit build call. */
describe('founding job prompt golden files', () => {
  it('the found call', async () => {
    const prompt = buildFoundUser({
      name: 'Lantern Hall',
      reason: 'I keep making small lamps and want one room that is all of them.',
      kept: [{ id: 's1', kind: 'quote', content: 'A find is only as good as its terrain model.', why: 'it says it plainly' }],
      places: [{ id: 'home', name: 'Home', tags: ['home'], purpose: 'Where my days start and end.' }],
      interests: ['installation art', 'digital elevation model', 'liminality'],
      openWishes: [{ name: 'Lamp rail', count: 2 }],
      constraint: 'Use only two colours.',
    })
    await expect(prompt).toMatchFileSnapshot('golden/found-call.txt')
  })

  it('the kit build call', async () => {
    const request = PlaceRequest.parse({
      id: 'lantern-hall',
      kind: 'place',
      name: 'Lantern Hall',
      purpose: 'One room that is all of my lamps.',
      tags: ['installation art'],
      chunk: [1, 0],
      related: ['home'],
      souvenirs: [],
      written: '2026-11-02T10:00:00Z',
      status: 'open',
      statusAt: null,
      note: null,
      body: 'I want one lamp over each thing I made, and a long shelf.',
    })
    await expect(buildFoundBuildUser({ request, kit, chunk: [1, 0] })).toMatchFileSnapshot('golden/found-build.txt')
  })
})
