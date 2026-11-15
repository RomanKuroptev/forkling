import { describe, expect, it } from 'vitest'
import { ModelPart, SpeciesPack, WorldObject, type Material } from '@forkling/schema'
import { isWalkable } from '../src/nav.ts'
import {
  DRY_HOURS,
  MAX_CARRY_KG,
  composeMade,
  madeProperties,
  matchesTarget,
  neededSessions,
  objectStatusAt,
  offersSpot,
} from '../src/objects.ts'
import { sunDirection } from '../src/sky.ts'

const T0 = '2026-10-30T12:00:00Z'
const at = (hours: number) => Date.parse(T0) + hours * 3_600_000

const obj = (extra: Record<string, unknown> = {}) =>
  WorldObject.parse({
    id: 'thing',
    kind: 'thing',
    name: 'A thing',
    position: [2, 0, 20],
    model: { asset: 'nature/rock_largeA' },
    reason: 'Because.',
    ...extra,
  })

describe('objectStatusAt: sources', () => {
  const source = (state: Record<string, unknown>) =>
    obj({ yields: { material: 'wood', max: 5, respawnHours: 24 }, state })

  it('is full when nothing was ever taken', () => {
    expect(objectStatusAt(source({}), at(0)).stock).toBe(5)
  })

  it('refills slowly after being taken from', () => {
    const s = source({ stock: 1, stockAt: T0 })
    expect(objectStatusAt(s, at(0)).stock).toBe(1)
    expect(objectStatusAt(s, at(12)).stock).toBe(3)
    expect(objectStatusAt(s, at(48)).stock).toBe(5)
  })

  it('is not a source when it yields nothing', () => {
    expect(objectStatusAt(obj(), at(0)).stock).toBeNull()
  })
})

describe('objectStatusAt: plants', () => {
  const plant = (state: Record<string, unknown>) => obj({ grows: { hours: 48, gives: 'produce' }, state })

  it('stays a seed until watered', () => {
    expect(objectStatusAt(plant({ plantedAt: T0 }), at(100)).stage).toBe('seed')
  })

  it('grows after watering and ripens after its hours', () => {
    const p = plant({ plantedAt: T0, wateredAt: T0 })
    expect(objectStatusAt(p, at(10)).stage).toBe('growing')
    expect(objectStatusAt(p, at(48)).stage).toBe('ripe')
  })

  it('has no stage when it is not a plant', () => {
    expect(objectStatusAt(obj(), at(0)).stage).toBe('none')
  })
})

describe('objectStatusAt: paint and spoiling', () => {
  it('is wet until the paint has dried', () => {
    const painted = obj({ state: { paintedAt: T0 } })
    expect(objectStatusAt(painted, at(DRY_HOURS - 0.5)).wet).toBe(true)
    expect(objectStatusAt(painted, at(DRY_HOURS + 0.5)).wet).toBe(false)
  })

  it('spoils some hours after it was cooked', () => {
    const stew = obj({ spoilsAfterHours: 12, state: { cookedAt: T0 } })
    expect(objectStatusAt(stew, at(11)).spoiled).toBe(false)
    expect(objectStatusAt(stew, at(13)).spoiled).toBe(true)
  })

  it('never spoils without a time limit', () => {
    expect(objectStatusAt(obj({ state: { cookedAt: T0 } }), at(10_000)).spoiled).toBe(false)
  })
})

describe('objectStatusAt: made things', () => {
  const made = (sessions: number, needed: number, done: boolean) =>
    obj({ made: { verb: 'build', materials: ['stone'], skill: 0, sessions, needed, done, at: T0 } })

  it('reports how far along a build is', () => {
    expect(objectStatusAt(made(1, 4, false), at(0)).progress).toBe(0.25)
    expect(objectStatusAt(made(4, 4, true), at(0)).progress).toBe(1)
  })

  it('counts a thing nobody built as finished', () => {
    expect(objectStatusAt(obj(), at(0)).progress).toBe(1)
  })
})

describe('madeProperties', () => {
  const props = (materials: Material[], size = 0.5) => madeProperties(materials, size)

  it('makes wood light and carryable', () => {
    const p = props(['wood'])
    expect(p.material).toBe('wood')
    expect(p.carryable).toBe(true)
    expect(p.weightKg).toBeLessThanOrEqual(MAX_CARRY_KG)
  })

  it('makes stone heavy and not carryable', () => {
    const p = props(['stone', 'stone', 'stone'])
    expect(p.material).toBe('stone')
    expect(p.carryable).toBe(false)
    expect(p.weightKg).toBeGreaterThan(MAX_CARRY_KG)
  })

  it('makes flowers and fibre soft, and stone not', () => {
    expect(props(['flowers', 'fibre']).soft).toBe(true)
    expect(props(['stone']).soft).toBe(false)
  })

  it('names the commonest material, and only food is edible', () => {
    expect(props(['wood', 'stone', 'stone']).material).toBe('stone')
    expect(props(['dish']).edible).toBe(true)
    expect(props(['wood']).edible).toBe(false)
  })

  it('records the size it was given, and big things can hide a small one', () => {
    expect(props(['wood'], 0.4).size).toBe(0.4)
    expect(props(['wood'], 0.4).canHide).toBe(false)
    expect(props(['wood'], 1.2).canHide).toBe(true)
  })
})

describe('neededSessions', () => {
  it('takes a session for every two materials, at least one', () => {
    expect(neededSessions(['wood'])).toBe(1)
    expect(neededSessions(['wood', 'wood'])).toBe(1)
    expect(neededSessions(['wood', 'wood', 'stone'])).toBe(2)
    expect(neededSessions(Array.from({ length: 8 }, () => 'stone' as const))).toBe(4)
  })
})

describe('composeMade', () => {
  const input = { materials: ['stone', 'stone', 'wood', 'stone'] as Material[], skill: 0, sessions: 2, needed: 2, seed: 99 }

  it('is deterministic', () => {
    expect(composeMade(input)).toEqual(composeMade(input))
  })

  it('differs with the seed', () => {
    expect(composeMade({ ...input, seed: 100 }).parts).not.toEqual(composeMade(input).parts)
  })

  it('makes valid parts, never more than 24', () => {
    const big = composeMade({ ...input, materials: Array.from({ length: 12 }, () => 'wood' as const), sessions: 6, needed: 6 })
    expect(big.parts.length).toBeLessThanOrEqual(24)
    for (const part of big.parts) expect(ModelPart.safeParse(part).success).toBe(true)
    expect(big.size).toBeGreaterThan(0)
  })

  it('colours parts by material', () => {
    const colours = (m: Material) => composeMade({ ...input, materials: [m], sessions: 1, needed: 1 }).parts.map((p) => p.color)
    expect(colours('stone')).not.toEqual(colours('wood'))
  })

  it('shows progress: an unfinished build is smaller and has fewer parts', () => {
    const half = composeMade({ ...input, sessions: 1 })
    const full = composeMade(input)
    expect(half.parts.length).toBeLessThan(full.parts.length)
    expect(half.size).toBeLessThan(full.size)
  })

  it('shows skill: a beginner wobbles and an expert stacks neatly', () => {
    const wobble = (skill: number) => {
      const { parts } = composeMade({ ...input, skill })
      return Math.max(...parts.map((p) => Math.hypot(p.at[0], p.at[2])))
    }
    expect(wobble(0)).toBeGreaterThan(0.02)
    expect(wobble(10)).toBe(0)
  })

  it('shows skill in size too: practised hands make bigger things', () => {
    expect(composeMade({ ...input, skill: 10 }).size).toBeGreaterThan(composeMade({ ...input, skill: 0 }).size)
  })
})

describe('matchesTarget', () => {
  it('matches by properties', () => {
    const stick = obj({ properties: { carryable: true, weightKg: 0.5, material: 'wood' } })
    expect(matchesTarget({ type: 'object', where: { carryable: true }, unlocked: false }, 'pick_up', stick)).toBe(true)
    expect(matchesTarget({ type: 'object', where: { carryable: false }, unlocked: false }, 'pick_up', stick)).toBe(false)
    expect(matchesTarget({ type: 'object', where: { material: 'wood' }, unlocked: false }, 'pick_up', stick)).toBe(true)
    expect(matchesTarget({ type: 'object', where: { material: 'stone' }, unlocked: false }, 'pick_up', stick)).toBe(false)
  })

  it('treats yields as a property of sources', () => {
    const source = obj({ yields: { material: 'wood', max: 3, respawnHours: 10 } })
    expect(matchesTarget({ type: 'object', where: { yields: true }, unlocked: false }, 'pick_up', source)).toBe(true)
    expect(matchesTarget({ type: 'object', where: { yields: true }, unlocked: false }, 'pick_up', obj())).toBe(false)
  })

  it('matches an object that unlocks the verb', () => {
    const bench = obj({ unlocks: ['build'] })
    expect(matchesTarget({ type: 'object', where: {}, unlocked: true }, 'build', bench)).toBe(true)
    expect(matchesTarget({ type: 'object', where: {}, unlocked: true }, 'cook', bench)).toBe(false)
  })

  it('matches anything when the filter is empty', () => {
    expect(matchesTarget({ type: 'object', where: {}, unlocked: false }, 'inspect', obj())).toBe(true)
  })
})
