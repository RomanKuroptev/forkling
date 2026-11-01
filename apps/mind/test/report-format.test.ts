import { describe, expect, it } from 'vitest'
import { SpeciesPack } from '@forkling/schema'
import type { SimReport } from '@forkling/sim'
import { defaultSteps, formatReport } from '../src/report-format.ts'
import { loadSpecies } from '../src/species.ts'

const cat = loadSpecies('cat')

const report: SimReport = {
  days: 14,
  seed: 5,
  awakeHours: 224,
  timePerVerb: { explore: 40_000, sit: 20_000, eat: 5_000 },
  focus: { seconds: 700_000, onPlanSeconds: 490_000, share: 0.7, interruptions: 120, interruptionsByCause: { critical: 90, other: 30 }, interruptedByVerb: { eat: 80, nap: 10 } },
  needs: {
    hunger: { min: 0, mean: 41.2, awakeCriticalMinutes: 300, longestAwakeCriticalMinutes: 40, asleepCriticalMinutes: 5000, hoursToEmpty: 0.83 },
    curiosity: { min: 3, mean: 38, awakeCriticalMinutes: 120, longestAwakeCriticalMinutes: 20, asleepCriticalMinutes: 0, hoursToEmpty: 0.83 },
  },
  intentions: 5000,
}

describe('formatReport', () => {
  const text = formatReport(report)

  it('leads with how much of the plan the body did, and what broke it off', () => {
    expect(text).toMatch(/plan: the body spent 70\.0% of the plan window on the planned verb/)
    expect(text).toMatch(/120 interruptions, 90 by a need running low/)
    expect(text).toMatch(/eat 80/)
  })

  it('lists each need with its lowest, average and critical time, awake and asleep', () => {
    expect(text).toMatch(/hunger\s+min 0\s+mean 41\.2\s+awake critical 300 min \(longest 40\)\s+asleep critical 5000 min\s+empties in 0\.8 h/)
  })

  it('lists the time per verb, most first, as a share of the run', () => {
    expect(text.indexOf('explore')).toBeLessThan(text.indexOf('sit '))
    expect(text).toMatch(/explore\s+11\.1 h/)
  })
})

describe('defaultSteps', () => {
  const steps = defaultSteps(cat.pack)

  it('uses verbs a body can do on its own: no visitors, no effects, no hands, nothing only for night', () => {
    expect(steps.length).toBeGreaterThan(0)
    for (const s of steps) {
      const action = cat.pack.actions.find((a) => a.id === s.verb)!
      expect(action.effect ?? 'none').toBe('none')
      expect(action.target.type).not.toBe('visitor')
      expect(action.requires).not.toContain('visitorNearby')
      expect(action.requires).not.toContain('night')
      expect(action.hands).toBe('any')
      expect(s.minutes).toBe(25)
    }
    expect(steps.map((s) => s.verb)).toContain('explore')
  })

  it('has nothing to offer a pack with no such verb', () => {
    const none = SpeciesPack.parse({ ...cat.pack, actions: cat.pack.actions.filter((a) => a.id === 'follow'), weights: {} })
    expect(defaultSteps(none)).toEqual([])
  })
})
