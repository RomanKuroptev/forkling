import { describe, expect, it } from 'vitest'
import { SpeciesPack } from '@forkling/schema'
import blobJson from './fixtures/blob.species.json'
import { createPrng } from '../src/prng.ts'
import { pickAction, scoreActions, type ScoreContext } from '../src/utility.ts'

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

  it('drops spot actions when no spot of that kind exists', () => {
    const needs = { hunger: 5, energy: 50, fun: 50 }
    expect(ids(scoreActions(needs, blob, { ...noon, spotKinds: new Set() }))).not.toContain('eat')
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
  const scored = scoreActions({ hunger: 5, energy: 90, fun: 90 }, blob, noon)
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
    expect(eatShare).toBeGreaterThan(0.6)
    expect(eatShare).toBeLessThan(1)
  })
})
