import { describe, expect, it } from 'vitest'
import { SpeciesPack, WorldObject } from '@forkling/schema'
import makerJson from './fixtures/maker.species.json'
import { runHeadless } from '../src/headless.ts'
import { initialNeeds } from '../src/needs.ts'
import { starterWorld, worldWithObjects } from '../src/starter.ts'
import { scoreActions } from '../src/utility.ts'

const pack = SpeciesPack.parse(makerJson)
const spawn = starterWorld().spawn

const house = WorldObject.parse({
  id: 'house',
  kind: 'house',
  name: 'The house',
  position: [spawn.x - 6, 0, spawn.z - 3],
  model: { parts: [{ shape: 'box', size: [2, 1.5, 2], at: [0, 0.75, 0], color: '#a67c52' }] },
  reason: 'Somewhere to be.',
})
const world = worldWithObjects([house])

describe('quirks in the utility AI', () => {
  const score = (id: string, quirkWeights?: Record<string, number>) =>
    scoreActions(initialNeeds(pack), pack, {
      visitorDistance: null,
      timeOfDay: 12,
      spotKinds: new Set(['for:go_to']),
      ...(quirkWeights ? { quirkWeights } : {}),
    }).find((s) => s.action.id === id)!.score

  it('multiplies a verb score by what its quirks say', () => {
    expect(score('rest', { rest: 4 })).toBeCloseTo(score('rest') * 4)
    expect(score('go_to', { rest: 4 })).toBeCloseTo(score('go_to'))
  })

  it('lays on top of the pack weights instead of replacing them', () => {
    const weighted = SpeciesPack.parse({ ...makerJson, weights: { rest: 2 } })
    const ctx = { visitorDistance: null, timeOfDay: 12, spotKinds: new Set<string>(), quirkWeights: { rest: 3 } }
    const plain = scoreActions(initialNeeds(weighted), weighted, { ...ctx, quirkWeights: {} }).find((s) => s.action.id === 'rest')!.score
    const quirky = scoreActions(initialNeeds(weighted), weighted, ctx).find((s) => s.action.id === 'rest')!.score
    expect(quirky).toBeCloseTo(plain * 3)
  })
})

describe('quirks in the body', () => {
  const rests = (quirkWeights: Record<string, number>) =>
    runHeadless({ pack, world, startHour: 12, seed: 4, seconds: 1800, quirkWeights }).targets.filter((t) => t.startsWith('rest:')).length

  it('make two forklings of one pack spend their time differently', () => {
    const idle = rests({ rest: 8 })
    const busy = rests({ go_to: 8 })
    expect(idle).toBeGreaterThan(busy)
  })
})
