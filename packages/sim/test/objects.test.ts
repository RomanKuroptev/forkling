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
import { starterWorld, worldWithObjects } from '../src/starter.ts'
import { collectSpots } from '../src/world.ts'

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

describe('spots from properties and unlocks', () => {
  const pack = SpeciesPack.parse({
    id: 'test',
    displayName: 'Test',
    needs: { energy: { initial: 80, decayPerHour: 5 } },
    perception: { noticeRadius: 5, eyeHeight: 0.3 },
    locomotion: { walkSpeed: 1, runSpeed: 3 },
    bodyPlans: { upright: ['body', 'hands', 'making'] },
    actions: [
      { id: 'rest', satisfies: {}, durationSec: [1, 2], target: { type: 'none' }, slot: 'sit', reason: 'Resting.' },
      {
        id: 'pick_up',
        group: 'hands',
        effect: 'pickUp',
        satisfies: {},
        durationSec: [1, 2],
        target: { type: 'object', where: { carryable: true } },
        slot: 'work',
        reason: 'Mine.',
      },
      {
        id: 'build',
        group: 'making',
        effect: 'make',
        satisfies: {},
        durationSec: [1, 2],
        target: { type: 'object', unlocked: true },
        slot: 'work',
        reason: 'Making.',
      },
    ],
  })
  const bench = obj({ id: 'workbench', position: [2, 0, 20], unlocks: ['build'] })
  const stick = obj({ id: 'stick', position: [8, 0, 22], properties: { carryable: true, weightKg: 0.4 } })
  const world = worldWithObjects([bench, stick])
  const spots = collectSpots(pack, world.cfg, world.nav, world.spawn, sunDirection(12), world.objects)

  it('offers each verb the objects its target matches', () => {
    expect(spots['for:build']).toHaveLength(1)
    expect(spots['for:pick_up']).toHaveLength(1)
  })

  it('still offers every object by its own id', () => {
    expect(spots.workbench).toHaveLength(1)
    expect(spots.stick).toHaveLength(1)
  })

  it('offers nothing for a verb no object matches', () => {
    const none = collectSpots(pack, world.cfg, world.nav, world.spawn, sunDirection(12), [stick])
    expect(none['for:build']).toBeUndefined()
  })
})

describe('object footprints follow size', () => {
  const blocked = (objects: WorldObject[]) => {
    const nav = worldWithObjects(objects).nav.grid
    let n = 0
    for (let x = -2; x <= 6; x += 0.5) for (let z = 18; z <= 22; z += 0.5) if (!isWalkable(nav, x, z)) n++
    return n
  }
  const part = { shape: 'box', size: [0.2, 0.2, 0.2], at: [0, 0.1, 0], color: '#a67c52' }
  const made = (size: number) => obj({ id: `made-${size}`.replace('.', '-'), model: { parts: [part] }, properties: { size } })

  it('blocks more ground for a big made thing than a small one', () => {
    const none = blocked([])
    const small = blocked([made(0.2)])
    const big = blocked([made(3)])
    expect(small).toBeGreaterThanOrEqual(none)
    expect(big).toBeGreaterThan(small)
  })

  it('still sees a placed object where the island has none', () => {
    expect(worldWithObjects([made(1)]).placements.length).toBe(starterWorld().placements.length + 1)
  })
})

describe('offersSpot', () => {
  it('counts a high object as a perch, and an old affordance as itself', () => {
    expect(offersSpot(obj({ properties: { high: true } }), 'perch')).toBe(true)
    expect(offersSpot(obj({ affordances: ['perch'] }), 'perch')).toBe(true)
    expect(offersSpot(obj(), 'perch')).toBe(false)
    expect(offersSpot(obj({ properties: { high: true } }), 'sunbeam')).toBe(false)
  })

  it('gives a high object one perch spot, not two, even if it also says perch the old way', () => {
    const rock = obj({ id: 'tall', affordances: ['perch'], properties: { high: true } })
    const world = worldWithObjects([rock])
    const spots = collectSpots(
      SpeciesPack.parse({ id: 'x', displayName: 'X', needs: { energy: { initial: 50, decayPerHour: 1 } }, perception: { noticeRadius: 3, eyeHeight: 0.3 }, locomotion: { walkSpeed: 1, runSpeed: 2 }, actions: [{ id: 'sit', satisfies: {}, durationSec: [1, 2], target: { type: 'none' }, slot: 'sit', reason: 'Sitting.' }] }),
      world.cfg, world.nav, world.spawn, sunDirection(12), world.objects,
    )
    const own = spots.perch!.filter((p) => Math.hypot(p.x - 2, p.z - 20) < 5)
    expect(own).toHaveLength(1)
  })
})
