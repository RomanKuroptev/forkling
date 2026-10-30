import { describe, expect, it } from 'vitest'
import { AnimationMap, AnimationSlot, NeedId, SpeciesPack } from '../src/index.ts'

const base = {
  id: 'test',
  displayName: 'Test',
  needs: {
    hunger: { initial: 80, decayPerHour: 10 },
    energy: { initial: 90, decayPerHour: 6 },
  },
  perception: { noticeRadius: 5, eyeHeight: 0.3 },
  locomotion: { walkSpeed: 1.2, runSpeed: 4 },
  actions: [
    {
      id: 'eat',
      satisfies: { hunger: 60 },
      durationSec: [10, 20],
      target: { type: 'spot', kind: 'food' },
      slot: 'idle',
      reason: 'I was hungry.',
    },
    {
      id: 'nap',
      satisfies: { energy: 50 },
      durationSec: [30, 60],
      target: { type: 'none' },
      slot: 'sleep',
      reason: 'I was tired.',
    },
  ],
  weights: { eat: 1.2 },
}

describe('vocabularies', () => {
  it('includes the shared needs from CLAUDE.md', () => {
    for (const n of ['hunger', 'energy', 'curiosity', 'affection', 'fun', 'social']) {
      expect(NeedId.safeParse(n).success).toBe(true)
    }
    expect(NeedId.safeParse('mana').success).toBe(false)
  })

  it('includes the engine animation slots', () => {
    for (const s of ['idle', 'walk', 'run', 'sit', 'sleep', 'jump', 'happy']) {
      expect(AnimationSlot.safeParse(s).success).toBe(true)
    }
  })
})

describe('SpeciesPack', () => {
  it('parses a valid pack and fills defaults', () => {
    const pack = SpeciesPack.parse(base)
    expect(pack.actions[0]!.gait).toBe('walk')
    expect(pack.actions[0]!.requires).toEqual([])
    expect(pack.starterSpots).toEqual([])
  })

  it('rejects a need outside the shared vocabulary', () => {
    const bad = { ...base, needs: { mana: { initial: 50, decayPerHour: 1 } } }
    expect(SpeciesPack.safeParse(bad).success).toBe(false)
  })

  it('rejects negative decay and out-of-range initial values', () => {
    expect(SpeciesPack.safeParse({ ...base, needs: { hunger: { initial: 50, decayPerHour: -1 } } }).success).toBe(false)
    expect(SpeciesPack.safeParse({ ...base, needs: { hunger: { initial: 150, decayPerHour: 1 } } }).success).toBe(false)
  })

  it('rejects actions that satisfy a need the pack does not declare', () => {
    const bad = { ...base, actions: [{ ...base.actions[0]!, satisfies: { curiosity: 10 } }] }
    expect(SpeciesPack.safeParse(bad).success).toBe(false)
  })

  it('rejects duplicate action ids and weights for unknown actions', () => {
    expect(SpeciesPack.safeParse({ ...base, actions: [base.actions[0], base.actions[0]] }).success).toBe(false)
    expect(SpeciesPack.safeParse({ ...base, weights: { fly: 2 } }).success).toBe(false)
  })

  it('rejects a duration range that is backwards', () => {
    const bad = { ...base, actions: [{ ...base.actions[0]!, durationSec: [20, 10] }] }
    expect(SpeciesPack.safeParse(bad).success).toBe(false)
  })

  it('requires at least one action and one need', () => {
    expect(SpeciesPack.safeParse({ ...base, actions: [] }).success).toBe(false)
    expect(SpeciesPack.safeParse({ ...base, needs: {} }).success).toBe(false)
  })
})

describe('AnimationMap', () => {
  it('maps a subset of slots to clip names', () => {
    expect(AnimationMap.parse({ idle: 'Idle', walk: 'Walk' })).toEqual({ idle: 'Idle', walk: 'Walk' })
  })

  it('rejects unknown slots', () => {
    expect(AnimationMap.safeParse({ fly: 'Fly' }).success).toBe(false)
  })
})
