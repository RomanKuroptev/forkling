import { describe, expect, it } from 'vitest'
import { kit } from '@forkling/schema/kit'
import { FIXTURE_NOW, makeFixtureWorld } from '@forkling/sim/fixture'
import { thinMarks } from '../src/qa/marks.ts'

const fixture = makeFixtureWorld(1, 10)
const DAY = 86_400_000

describe('thin marks of neglect that hang in a room (issue 336)', () => {
  it('none in places dusty and overgrown: their cobwebs are neon strands', () => {
    for (const days of [15, 30]) {
      const nowMs = Date.parse(FIXTURE_NOW) + days * DAY
      const places = fixture.places.map((p) => ({ ...p, state: { ...p.state, lastCareAt: FIXTURE_NOW, closed: null } }))
      expect(thinMarks({ places, kit, heightAt: () => 0, nowMs }), `${days} days`).toEqual([])
    }
  })
})
