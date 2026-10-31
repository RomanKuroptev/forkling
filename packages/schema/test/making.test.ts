import { describe, expect, it } from 'vitest'
import {
  AnimationSlot,
  BodyPlan,
  Forkling,
  Material,
  ObjectProperties,
  PlanStep,
  Skills,
  SpeciesPack,
  TemperamentPools,
  TemperamentRoll,
  VerbGroup,
  WorldObject,
} from '../src/index.ts'

const pack = {
  id: 'test',
  displayName: 'Test',
  needs: { hunger: { initial: 80, decayPerHour: 10 }, energy: { initial: 90, decayPerHour: 6 } },
  perception: { noticeRadius: 5, eyeHeight: 0.3 },
  locomotion: { walkSpeed: 1.2, runSpeed: 4 },
  actions: [
    { id: 'rest', satisfies: { energy: 30 }, durationSec: [10, 20], target: { type: 'none' }, slot: 'sit', reason: 'I was tired.' },
  ],
}

const verb = (extra: Record<string, unknown>) => ({ ...pack.actions[0]!, ...extra })

describe('vocabularies', () => {
  it('has the body plans, verb groups and materials of M5', () => {
    expect(BodyPlan.options).toEqual(['quadruped', 'upright'])
    expect(VerbGroup.options).toEqual(['body', 'hands', 'making', 'growing', 'mind'])
    for (const m of ['wood', 'stone', 'clay', 'flowers', 'fibre', 'shells', 'produce', 'dish']) {
      expect(Material.safeParse(m).success).toBe(true)
    }
    expect(Material.safeParse('unobtainium').success).toBe(false)
  })

  it('has the animation slots an upright body needs', () => {
    for (const s of ['stand', 'walkUpright', 'work', 'useTool', 'holdUp', 'carry']) {
      expect(AnimationSlot.safeParse(s).success).toBe(true)
    }
  })
})

describe('verbs in a species pack', () => {
  it('defaults an old action to a body verb with no effect and any hands', () => {
    const parsed = SpeciesPack.parse(pack)
    const v = parsed.actions[0]!
    expect(v.group).toBe('body')
    expect(v.effect).toBe('none')
    expect(v.hands).toBe('any')
    expect(v.accepts).toEqual([])
    expect(parsed.bodyPlans).toEqual({ quadruped: ['body'] })
  })

  it('accepts a making verb that works on an object its tool unlocks', () => {
    const parsed = SpeciesPack.parse({
      ...pack,
      bodyPlans: { quadruped: ['body'], upright: ['body', 'hands', 'making'] },
      actions: [
        verb({
          id: 'build',
          group: 'making',
          body: 'upright',
          effect: 'make',
          hands: 'full',
          accepts: ['wood', 'stone'],
          target: { type: 'object', unlocked: true },
          slot: 'work',
        }),
      ],
    })
    expect(parsed.actions[0]!.target).toEqual({ type: 'object', where: {}, unlocked: true })
  })

  it('accepts an object target filtered by properties', () => {
    const parsed = SpeciesPack.parse({
      ...pack,
      bodyPlans: { quadruped: ['body', 'hands'] },
      actions: [verb({ id: 'pick_up', group: 'hands', effect: 'pickUp', target: { type: 'object', where: { carryable: true } } })],
    })
    expect(parsed.actions[0]!.target).toMatchObject({ type: 'object', where: { carryable: true }, unlocked: false })
  })

  it('accepts a target filter for plants and rejects unknown filter keys', () => {
    const verb = (where: Record<string, unknown>) => ({ ...pack, actions: [verb0({ target: { type: 'object', where } })] })
    const verb0 = (extra: Record<string, unknown>) => ({ ...pack.actions[0]!, ...extra })
    expect(SpeciesPack.safeParse(verb({ grows: true })).success).toBe(true)
    expect(SpeciesPack.safeParse(verb({ shiny: true })).success).toBe(false)
  })

  it('rejects a verb whose group no body plan allows', () => {
    expect(SpeciesPack.safeParse({ ...pack, actions: [verb({ group: 'making' })] }).success).toBe(false)
  })

  it('rejects a verb done in a body plan that does not allow its group', () => {
    const bad = {
      ...pack,
      bodyPlans: { quadruped: ['body'], upright: ['body', 'hands'] },
      actions: [verb({ group: 'hands', body: 'quadruped' })],
    }
    expect(SpeciesPack.safeParse(bad).success).toBe(false)
  })

  it('rejects an unknown effect and an unknown material', () => {
    expect(SpeciesPack.safeParse({ ...pack, actions: [verb({ effect: 'teleport' })] }).success).toBe(false)
    expect(SpeciesPack.safeParse({ ...pack, actions: [verb({ accepts: ['unobtainium'] })] }).success).toBe(false)
  })
})

describe('object properties', () => {
  it('fills physical defaults', () => {
    const p = ObjectProperties.parse({})
    expect(p).toMatchObject({ carryable: false, diggable: false, canHide: false, edible: false, soft: false, high: false, storage: false })
    expect(p.size).toBeGreaterThan(0)
  })

  it('rejects a negative weight and an unknown material', () => {
    expect(ObjectProperties.safeParse({ weightKg: -1 }).success).toBe(false)
    expect(ObjectProperties.safeParse({ material: 'jelly' }).success).toBe(false)
  })
})

describe('WorldObject in M5', () => {
  const rock = {
    id: 'sunny-rock',
    kind: 'rock',
    name: 'The sunny rock',
    position: [4, 0, 20],
    model: { asset: 'nature/rock_largeA' },
    reason: 'It gets the morning sun first.',
  }

  it('fills properties, unlocks and state for an old object', () => {
    const parsed = WorldObject.parse(rock)
    expect(parsed.properties.carryable).toBe(false)
    expect(parsed.unlocks).toEqual([])
    expect(parsed.state).toEqual({})
  })

  it('accepts a workbench that unlocks verbs and a source that yields a material', () => {
    expect(WorldObject.safeParse({ ...rock, id: 'workbench', unlocks: ['cut', 'join', 'build'] }).success).toBe(true)
    const source = WorldObject.parse({
      ...rock,
      id: 'driftwood',
      yields: { material: 'wood', max: 5, respawnHours: 24 },
      state: { stock: 3, stockAt: '2026-10-30T12:00:00Z' },
    })
    expect(source.yields?.material).toBe('wood')
  })

  it('marks an object as held in the paws', () => {
    expect(WorldObject.parse({ ...rock, state: { held: true } }).state.held).toBe(true)
  })

  it('accepts a plant that grows and food that spoils', () => {
    const plant = WorldObject.parse({ ...rock, id: 'bean', grows: { hours: 48, gives: 'produce' }, state: { plantedAt: '2026-10-30T12:00:00Z' } })
    expect(plant.grows?.gives).toBe('produce')
    expect(WorldObject.safeParse({ ...rock, id: 'stew', spoilsAfterHours: 12 }).success).toBe(true)
  })

  it('accepts a model made of parts and limits them to 24', () => {
    const part = { shape: 'box', size: [0.4, 0.2, 0.4], at: [0, 0.1, 0], color: '#a67c52' }
    expect(WorldObject.safeParse({ ...rock, model: { parts: [part] } }).success).toBe(true)
    expect(WorldObject.safeParse({ ...rock, model: { parts: [] } }).success).toBe(false)
    expect(WorldObject.safeParse({ ...rock, model: { parts: Array.from({ length: 25 }, () => part) } }).success).toBe(false)
    expect(WorldObject.safeParse({ ...rock, model: { parts: [{ ...part, shape: 'teapot' }] } }).success).toBe(false)
    expect(WorldObject.safeParse({ ...rock, model: { parts: [{ ...part, color: 'red' }] } }).success).toBe(false)
  })

  it('records a made object and its progress', () => {
    const made = WorldObject.parse({
      ...rock,
      id: 'pebble-cairn',
      model: { parts: [{ shape: 'sphere', size: [0.3, 0.3, 0.3], at: [0, 0.15, 0], color: '#888888' }] },
      made: { verb: 'build', materials: ['stone'], skill: 0, sessions: 1, needed: 3, done: false, at: '2026-10-30T12:00:00Z' },
    })
    expect(made.made?.done).toBe(false)
  })

  it('keeps the seed of a made object', () => {
    const made = { verb: 'build', materials: ['stone'], skill: 0, sessions: 1, needed: 1, done: true, at: '2026-10-30T12:00:00Z', seed: 42 }
    expect(WorldObject.parse({ ...rock, made }).made?.seed).toBe(42)
    expect(WorldObject.safeParse({ ...rock, made: { ...made, seed: -1 } }).success).toBe(false)
  })

  it('rejects a made object with no sessions needed', () => {
    const bad = { ...rock, made: { verb: 'build', materials: ['stone'], skill: 0, sessions: 0, needed: 0, done: false, at: '2026-10-30T12:00:00Z' } }
    expect(WorldObject.safeParse(bad).success).toBe(false)
  })
})

describe('Forkling in M5', () => {
  const forkling = {
    name: 'Merge',
    species: 'cat',
    needs: { hunger: 70 },
    position: [0, 0, 22],
    mood: 'curious',
    intention: { type: 'lounge', startedAt: '2026-10-30T12:00:00Z', seed: 7, reason: 'The beach is warm.' },
    lastTickAt: '2026-10-30T12:00:00Z',
  }

  it('starts with empty paws, an empty store and neutral feelings', () => {
    const parsed = Forkling.parse(forkling)
    expect(parsed.holding).toBeUndefined()
    expect(parsed.stored).toEqual({})
    expect(parsed.feelings).toEqual({ valence: 0, arousal: 0.3 })
  })

  it('holds a material or an object, never nonsense', () => {
    expect(Forkling.safeParse({ ...forkling, holding: { material: 'wood' } }).success).toBe(true)
    expect(Forkling.safeParse({ ...forkling, holding: { objectId: 'yarn-ball' } }).success).toBe(true)
    expect(Forkling.safeParse({ ...forkling, holding: { material: 'jelly' } }).success).toBe(false)
  })

  it('stores whole numbers of known materials', () => {
    expect(Forkling.safeParse({ ...forkling, stored: { wood: 3, stone: 1 } }).success).toBe(true)
    expect(Forkling.safeParse({ ...forkling, stored: { wood: 1.5 } }).success).toBe(false)
    expect(Forkling.safeParse({ ...forkling, stored: { jelly: 1 } }).success).toBe(false)
  })

  it('keeps feelings in range', () => {
    expect(Forkling.safeParse({ ...forkling, feelings: { valence: 2, arousal: 0.5 } }).success).toBe(false)
    expect(Forkling.safeParse({ ...forkling, feelings: { valence: -0.4, arousal: 0.9 } }).success).toBe(true)
  })
})

describe('PlanStep in M5', () => {
  const step = { verb: 'build', targetId: 'workbench', reason: 'I want a cairn.', minutes: 30 }

  it('accepts materials and a name for what is being made', () => {
    expect(PlanStep.safeParse({ ...step, materials: ['stone', 'stone'], makes: 'a pebble cairn' }).success).toBe(true)
  })

  it('limits the name, the materials and rejects unknown materials', () => {
    expect(PlanStep.safeParse({ ...step, makes: 'x'.repeat(41) }).success).toBe(false)
    expect(PlanStep.safeParse({ ...step, makes: '' }).success).toBe(false)
    expect(PlanStep.safeParse({ ...step, materials: Array.from({ length: 5 }, () => 'stone') }).success).toBe(false)
    expect(PlanStep.safeParse({ ...step, materials: ['jelly'] }).success).toBe(false)
  })
})

describe('Skills (brain/skills.json)', () => {
  it('maps a verb group to xp and a level', () => {
    expect(Skills.parse({ making: { xp: 12, level: 1 } })).toEqual({ making: { xp: 12, level: 1 } })
  })

  it('defaults to nothing practised and keeps levels between 0 and 10', () => {
    expect(Skills.parse({})).toEqual({})
    expect(Skills.safeParse({ making: { xp: 0, level: 11 } }).success).toBe(false)
    expect(Skills.safeParse({ juggling: { xp: 0, level: 1 } }).success).toBe(false)
  })
})

describe('temperament', () => {
  const pools = {
    traits: {
      colour: ['red', 'green', 'blue'],
      texture: ['soft', 'rough'],
    },
    likes: 2,
    dislikes: 1,
    quirks: [
      { id: 'hoarder', text: 'Cannot leave a good stone behind.', weights: { pick_up: 2 } },
      { id: 'perfectionist', text: 'Redoes anything that wobbles.' },
    ],
    quirkCount: [1, 2],
  }

  it('parses the pools of a species pack and fills defaults', () => {
    const parsed = TemperamentPools.parse({ traits: pools.traits, quirks: pools.quirks })
    expect(parsed.likes).toBe(3)
    expect(parsed.dislikes).toBe(2)
    expect(parsed.quirkCount).toEqual([2, 3])
    expect(parsed.quirks[1]!.weights).toEqual({})
  })

  it('rejects pools too small to roll from', () => {
    expect(TemperamentPools.safeParse({ ...pools, traits: { colour: ['red'] } }).success).toBe(false)
    expect(TemperamentPools.safeParse({ ...pools, quirks: [pools.quirks[0]] }).success).toBe(false)
    expect(TemperamentPools.safeParse({ ...pools, quirkCount: [3, 1] }).success).toBe(false)
  })

  it('rejects duplicate quirk ids', () => {
    expect(TemperamentPools.safeParse({ ...pools, quirks: [pools.quirks[0], pools.quirks[0]] }).success).toBe(false)
  })

  it('parses a rolled temperament', () => {
    const roll = TemperamentRoll.parse({
      likes: [{ category: 'colour', value: 'green' }],
      dislikes: [{ category: 'texture', value: 'rough' }],
      quirks: [{ id: 'hoarder', text: 'Cannot leave a good stone behind.' }],
    })
    expect(roll.quirks[0]!.id).toBe('hoarder')
  })
})
