import { describe, expect, it } from 'vitest'
import { SpeciesPack } from '@forkling/schema'
import blobJson from './fixtures/blob.species.json'
import { createPrng } from '../src/prng.ts'
import { fixableNeeds, pickAction, scoreActions, type ScoreContext } from '../src/utility.ts'

const blob = SpeciesPack.parse(blobJson)
const noon: ScoreContext = { visitorDistance: null, timeOfDay: 12, spotKinds: new Set(['food']) }
const ids = (scored: { action: { id: string } }[]) => scored.map((s) => s.action.id)
const scoreOf = (scored: { action: { id: string }; score: number }[], id: string) =>
  scored.find((s) => s.action.id === id)!.score

describe('scoreActions', () => {
  it('scores the action that satisfies the most urgent need highest', () => {
    const hungry = scoreActions({ hunger: 5, energy: 90, fun: 90 }, blob, noon)
    expect(scoreOf(hungry, 'eat')).toBeGreaterThan(scoreOf(hungry, 'rest'))
    expect(scoreOf(hungry, 'eat')).toBeGreaterThan(scoreOf(hungry, 'roam'))
    const tired = scoreActions({ hunger: 90, energy: 5, fun: 90 }, blob, noon)
    expect(scoreOf(tired, 'rest')).toBeGreaterThan(scoreOf(tired, 'eat'))
  })

  it('applies pack weights as multipliers', () => {
    const needs = { hunger: 50, energy: 50, fun: 50 }
    const plain = scoreActions(needs, SpeciesPack.parse({ ...blobJson, weights: {} }), { ...noon, visitorDistance: 2 })
    const weighted = scoreActions(needs, blob, { ...noon, visitorDistance: 2 })
    expect(scoreOf(weighted, 'greet')).toBeCloseTo(scoreOf(plain, 'greet') * 1.5)
  })

  it('offers visitor actions only while a visitor is within the notice radius', () => {
    const needs = { hunger: 50, energy: 50, fun: 50 }
    expect(ids(scoreActions(needs, blob, noon))).not.toContain('greet')
    expect(ids(scoreActions(needs, blob, { ...noon, visitorDistance: 10 }))).not.toContain('greet')
    expect(ids(scoreActions(needs, blob, { ...noon, visitorDistance: 3 }))).toContain('greet')
  })

  it('offers day-only actions only outside the night', () => {
    const needs = { hunger: 50, energy: 50, fun: 50 }
    const dayPack = SpeciesPack.parse({
      ...blobJson,
      actions: blob.actions.map((a) => (a.id === 'roam' ? { ...a, requires: ['day'] } : a)),
    })
    const at = (timeOfDay: number) => ids(scoreActions(needs, dayPack, { ...noon, timeOfDay }))
    expect(at(12)).toContain('roam')
    expect(at(19)).toContain('roam')
    expect(at(23)).not.toContain('roam')
    expect(at(3)).not.toContain('roam')
  })

  it('drops spot actions when no spot of that kind exists', () => {
    const needs = { hunger: 5, energy: 50, fun: 50 }
    expect(ids(scoreActions(needs, blob, { ...noon, spotKinds: new Set() }))).not.toContain('eat')
  })

  it('makes actions whose needs are already met far less attractive than doing nothing', () => {
    const full = { hunger: 100, energy: 100, fun: 100 }
    const scored = scoreActions(full, blob, { ...noon, visitorDistance: 2 })
    // Ignoring a visitor satisfies nothing, so it should beat eating when full.
    expect(scoreOf(scored, 'ignore')).toBeGreaterThan(scoreOf(scored, 'eat') * 5)
    expect(scoreOf(scored, 'ignore')).toBeGreaterThan(scoreOf(scored, 'rest') * 5)
  })

  it('lets spontaneous actions stay appealing when their needs are met', () => {
    const full = { hunger: 100, energy: 100, fun: 100 }
    const wanderer = SpeciesPack.parse({
      ...blobJson,
      actions: blob.actions.map((a) => (a.id === 'roam' ? { ...a, spontaneous: 0.8 } : a)),
    })
    const plain = scoreOf(scoreActions(full, blob, noon), 'roam')
    const eager = scoreOf(scoreActions(full, wanderer, noon), 'roam')
    expect(eager).toBeGreaterThan(plain * 10)
    // And it never makes an action better than one that is genuinely needed.
    const hungry = scoreActions({ hunger: 10, energy: 100, fun: 100 }, wanderer, noon)
    expect(scoreOf(hungry, 'eat')).toBeGreaterThan(scoreOf(hungry, 'roam') * 3)
  })

  it('still lets a half-met need drive the action fully', () => {
    const half = scoreOf(scoreActions({ hunger: 40, energy: 100, fun: 100 }, blob, noon), 'eat')
    const empty = scoreOf(scoreActions({ hunger: 0, energy: 100, fun: 100 }, blob, noon), 'eat')
    const full = scoreOf(scoreActions({ hunger: 100, energy: 100, fun: 100 }, blob, noon), 'eat')
    expect(empty).toBeGreaterThan(half)
    expect(half).toBeGreaterThan(full * 10)
  })

  it('keeps every eligible score positive so nothing is impossible', () => {
    const scored = scoreActions({ hunger: 100, energy: 100, fun: 100 }, blob, noon)
    for (const s of scored) expect(s.score).toBeGreaterThan(0)
  })

  it('penalises actions that cost a need that is already low', () => {
    const fresh = scoreOf(scoreActions({ hunger: 50, energy: 90, fun: 30 }, blob, noon), 'dash')
    const drained = scoreOf(scoreActions({ hunger: 50, energy: 5, fun: 30 }, blob, noon), 'dash')
    expect(drained).toBeLessThan(fresh)
  })
})

describe('pickAction', () => {
  // Hungry and fairly tired, so eating leads but resting is a real alternative.
  const scored = scoreActions({ hunger: 20, energy: 35, fun: 90 }, blob, noon)
  const picks = (seed: number, n: number) => {
    const rng = createPrng(seed)
    return Array.from({ length: n }, () => pickAction(scored, rng).id)
  }

  it('is deterministic for a seed', () => {
    expect(picks(5, 20)).toEqual(picks(5, 20))
  })

  it('mostly picks the best action but not always', () => {
    const all = picks(11, 500)
    const eatShare = all.filter((p) => p === 'eat').length / all.length
    expect(eatShare).toBeGreaterThan(0.5)
    expect(eatShare).toBeLessThan(0.95)
    expect(all.filter((p) => p === 'rest').length).toBeGreaterThan(0)
  })
})

describe('the night', () => {
  const nightRest = SpeciesPack.parse({ ...blobJson, actions: blob.actions.map((a) => (a.id === 'rest' ? { ...a, requires: ['night'] } : a)) })

  it('offers only what is for the night while it is bed time, whatever else is allowed', () => {
    const needs = { hunger: 5, energy: 50, fun: 50 }
    const asleep = ids(scoreActions(needs, nightRest, { ...noon, timeOfDay: 2, asleep: true }))
    expect(asleep).toEqual(['rest'])
    // Awake, the same pack offers the rest of its verbs, such as eating.
    expect(ids(scoreActions(needs, nightRest, { ...noon, timeOfDay: 12, asleep: false }))).toContain('eat')
  })

  it('leaves a run that does not say whether it is bed time as it was', () => {
    expect(ids(scoreActions({ hunger: 50, energy: 50, fun: 50 }, blob, noon))).toContain('eat')
  })
})

describe('fixableNeeds', () => {
  const without = (...ids: string[]) => SpeciesPack.parse({ ...blobJson, actions: blob.actions.filter((a) => !ids.includes(a.id)) })

  it('names every need that some action eligible right now would raise', () => {
    expect([...fixableNeeds(blob, noon)].sort()).toEqual(['energy', 'fun', 'hunger'])
  })

  it('leaves out a need whose only source is not on offer', () => {
    // Eating needs a food spot, and there is none here.
    expect(fixableNeeds(blob, { ...noon, spotKinds: new Set() }).has('hunger')).toBe(false)
    expect(fixableNeeds(blob, noon).has('hunger')).toBe(true)
  })

  it('does not count an action that needs a visitor when no visitor is near', () => {
    const lonely = without('roam', 'dash')
    expect(fixableNeeds(lonely, noon).has('fun')).toBe(false)
    expect(fixableNeeds(lonely, { ...noon, visitorDistance: 2 }).has('fun')).toBe(true)
  })

  it('does not count an action that costs the need or raises nothing', () => {
    const fixable = fixableNeeds(without('rest'), noon)
    // dash costs energy, so with no rest nothing raises it.
    expect(fixable.has('energy')).toBe(false)
  })

  it('respects the time of day', () => {
    const night = SpeciesPack.parse({ ...blobJson, actions: blob.actions.map((a) => (a.id === 'rest' ? { ...a, requires: ['night'] } : a)) })
    expect(fixableNeeds(night, { ...noon, timeOfDay: 12, asleep: false }).has('energy')).toBe(false)
    expect(fixableNeeds(night, { ...noon, timeOfDay: 1, asleep: true }).has('energy')).toBe(true)
  })
})
