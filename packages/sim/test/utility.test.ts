import { describe, expect, it } from 'vitest'
import { SpeciesPack } from '@forkling/schema'
import blobJson from './fixtures/blob.species.json'
import { createPrng } from '../src/prng.ts'
import { pickAction, scoreActions, type ScoreContext } from '../src/utility.ts'

const blob = SpeciesPack.parse(blobJson)
const withHands = (id: string, hands: 'empty' | 'full') => SpeciesPack.parse({ ...blobJson, actions: blob.actions.map((a) => (a.id === id ? { ...a, hands, effect: 'none' } : a)) })
const noon: ScoreContext = { visitorDistance: null, timeOfDay: 12, spotKinds: new Set(['food']) }
const ids = (scored: { action: { id: string } }[]) => scored.map((s) => s.action.id)
const scoreOf = (scored: { action: { id: string }; score: number }[], id: string) => scored.find((s) => s.action.id === id)!.score

describe('scoreActions', () => {
  it('applies pack weights as multipliers', () => {
    const plain = scoreActions(SpeciesPack.parse({ ...blobJson, weights: {} }), { ...noon, visitorDistance: 2 })
    const weighted = scoreActions(blob, { ...noon, visitorDistance: 2 })
    expect(scoreOf(weighted, 'greet')).toBeCloseTo(scoreOf(plain, 'greet') * 1.5)
  })

  it('offers visitor actions only while a visitor is within the notice radius', () => {
    expect(ids(scoreActions(blob, noon))).not.toContain('greet')
    expect(ids(scoreActions(blob, { ...noon, visitorDistance: 10 }))).not.toContain('greet')
    expect(ids(scoreActions(blob, { ...noon, visitorDistance: 3 }))).toContain('greet')
  })

  it('offers day-only actions only outside the night', () => {
    const dayPack = SpeciesPack.parse({
      ...blobJson,
      actions: blob.actions.map((a) => (a.id === 'roam' ? { ...a, requires: ['day'] } : a)),
    })
    const at = (timeOfDay: number) => ids(scoreActions(dayPack, { ...noon, timeOfDay }))
    expect(at(12)).toContain('roam')
    expect(at(19)).toContain('roam')
    expect(at(23)).not.toContain('roam')
    expect(at(3)).not.toContain('roam')
  })

  it('drops spot actions when no spot of that kind exists', () => {
    expect(ids(scoreActions(blob, { ...noon, spotKinds: new Set() }))).not.toContain('eat')
    expect(ids(scoreActions(blob, noon))).toContain('eat')
  })

  it('keeps every eligible score positive so nothing is impossible', () => {
    for (const s of scoreActions(blob, noon)) expect(s.score).toBeGreaterThan(0)
  })
})

describe('pickAction', () => {
  // The same baseline for everything, with a weight that makes eating the likelier draw.
  const scored = scoreActions(SpeciesPack.parse({ ...blobJson, weights: { eat: 3 } }), noon)
  const picks = (seed: number, n: number) => {
    const rng = createPrng(seed)
    return Array.from({ length: n }, () => pickAction(scored, rng).id)
  }

  it('is deterministic for a seed', () => {
    expect(picks(5, 20)).toEqual(picks(5, 20))
  })

  it('favours the higher score but does not always pick it', () => {
    const all = picks(11, 500)
    const eatShare = all.filter((p) => p === 'eat').length / all.length
    expect(eatShare).toBeGreaterThan(0.4)
    expect(eatShare).toBeLessThan(0.95)
    expect(all.filter((p) => p === 'rest').length).toBeGreaterThan(0)
  })
})

describe('mood', () => {
  // The blob's `dash` runs; its `rest` sits or sleeps.
  const ratio = (feelings: { valence: number; arousal: number } | undefined) => {
    const scored = scoreActions(blob, { ...noon, ...(feelings ? { feelings } : {}) })
    return scoreOf(scored, 'dash') / scoreOf(scored, 'rest')
  }
  const calm = { valence: 0, arousal: 0.3 }

  it('changes nothing when it is not given, or when it is calm and neither glad nor sad', () => {
    expect(ratio(calm)).toBeCloseTo(ratio(undefined), 6)
  })

  it('favours energetic verbs when it is wound up and glad, and restful ones when it is low and calm', () => {
    expect(ratio({ valence: 0.6, arousal: 0.9 })).toBeGreaterThan(ratio(calm) * 1.3)
    expect(ratio({ valence: -0.8, arousal: 0.05 })).toBeLessThan(ratio(calm) * 0.7)
  })

  it('never changes a score by more than 40% either way, so mood bends choices and does not take them over', () => {
    const base = scoreActions(blob, noon)
    for (const feelings of [{ valence: 1, arousal: 1 }, { valence: -1, arousal: 0 }]) {
      for (const s of scoreActions(blob, { ...noon, feelings })) {
        const r = s.score / scoreOf(base, s.action.id)
        expect(r).toBeGreaterThanOrEqual(0.7 - 1e-9)
        expect(r).toBeLessThanOrEqual(1.4 + 1e-9)
      }
    }
  })
})

describe('paws', () => {
  // The blob's `stash` needs something in its paws, and `grab` needs them empty.
  it('keeps a verb that needs empty paws out of the draw while it holds something', () => {
    expect(ids(scoreActions(withHands('grab', 'empty'), { ...noon, holding: true, spotKinds: new Set(['food', 'for:grab']) }))).not.toContain('grab')
    expect(ids(scoreActions(withHands('grab', 'empty'), { ...noon, holding: false, spotKinds: new Set(['food', 'for:grab']) }))).toContain('grab')
  })

  it('keeps a verb that needs something in its paws out of the draw while they are empty', () => {
    expect(ids(scoreActions(withHands('stash', 'full'), { ...noon, holding: false, spotKinds: new Set(['food', 'for:stash']) }))).not.toContain('stash')
    expect(ids(scoreActions(withHands('stash', 'full'), { ...noon, holding: true, spotKinds: new Set(['food', 'for:stash']) }))).toContain('stash')
  })

  it('does not decide when it is not told what the paws hold', () => {
    expect(ids(scoreActions(withHands('stash', 'full'), { ...noon, spotKinds: new Set(['food', 'for:stash']) }))).toContain('stash')
  })
})

describe('the night', () => {
  const nightRest = SpeciesPack.parse({ ...blobJson, actions: blob.actions.map((a) => (a.id === 'rest' ? { ...a, requires: ['night'] } : a)) })

  it('offers only what is for the night while it is bed time, whatever else is allowed', () => {
    const asleep = ids(scoreActions(nightRest, { ...noon, timeOfDay: 2, asleep: true }))
    expect(asleep).toEqual(['rest'])
    // Awake, the same pack offers the rest of its verbs, such as eating.
    expect(ids(scoreActions(nightRest, { ...noon, timeOfDay: 12, asleep: false }))).toContain('eat')
  })

  it('leaves a run that does not say whether it is bed time as it was', () => {
    expect(ids(scoreActions(blob, noon))).toContain('eat')
  })
})
