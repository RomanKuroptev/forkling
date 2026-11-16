import { describe, expect, it } from 'vitest'
import {
  AnimationSlot,
  BodyPlan,
  Forkling,
  Material,
  PlanStep,
  Skills,
  SpeciesPack,
  VerbGroup,
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
  it('defaults an old action to a body verb', () => {
    const parsed = SpeciesPack.parse(pack)
    const v = parsed.actions[0]!
    expect(v.group).toBe('body')
    expect(parsed.bodyPlans).toEqual({ quadruped: ['body'] })
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

})

describe('Forkling in M5', () => {
  const forkling = {
    name: 'Merge',
    species: 'cat',
    needs: { hunger: 70 },
    position: [0, 0, 22],
    mood: 0.1,
    intention: { type: 'lounge', startedAt: '2026-10-30T12:00:00Z', seed: 7, reason: 'The beach is warm.' },
    lastTickAt: '2026-10-30T12:00:00Z',
  }

  it('starts rested', () => {
    const parsed = Forkling.parse(forkling)
    expect(parsed.energy).toBe(0.5)
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
