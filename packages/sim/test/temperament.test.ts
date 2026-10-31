import { describe, expect, it } from 'vitest'
import { TemperamentPools, TemperamentRoll } from '@forkling/schema'
import { quirkWeights, rollTemperament } from '../src/temperament.ts'

const pools = TemperamentPools.parse({
  traits: {
    material: ['wood', 'stone', 'clay', 'flowers', 'fibre', 'shells'],
    texture: ['soft', 'rough', 'smooth'],
    place: ['sunbeam', 'high', 'water'],
  },
  likes: 3,
  dislikes: 2,
  quirks: [
    { id: 'hoarder', text: 'Cannot leave a good stone behind.', weights: { pick_up: 2, drop: 0.5 } },
    { id: 'perfectionist', text: 'Redoes anything that wobbles.', weights: { paint: 1.5 }, appraisal: { blocked: 1.5 } },
    { id: 'showman', text: 'Builds where it can be seen.', weights: { pick_up: 1.5 } },
    { id: 'completionist', text: 'Finishes what it starts.' },
  ],
  quirkCount: [2, 3],
})

describe('rollTemperament', () => {
  it('is deterministic for a seed', () => {
    expect(rollTemperament(7, pools)).toEqual(rollTemperament(7, pools))
  })

  it('rolls the number of likes and dislikes the pools ask for', () => {
    const roll = rollTemperament(7, pools)
    expect(roll.likes).toHaveLength(3)
    expect(roll.dislikes).toHaveLength(2)
  })

  it('never likes and dislikes the same thing', () => {
    for (let seed = 0; seed < 50; seed++) {
      const roll = rollTemperament(seed, pools)
      const liked = new Set(roll.likes.map((t) => `${t.category}:${t.value}`))
      for (const t of roll.dislikes) expect(liked.has(`${t.category}:${t.value}`)).toBe(false)
      expect(new Set([...liked, ...roll.dislikes.map((t) => `${t.category}:${t.value}`)]).size).toBe(5)
    }
  })

  it('rolls a number of distinct quirks within the range', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { quirks } = rollTemperament(seed, pools)
      expect(quirks.length).toBeGreaterThanOrEqual(2)
      expect(quirks.length).toBeLessThanOrEqual(3)
      expect(new Set(quirks.map((q) => q.id)).size).toBe(quirks.length)
    }
  })

  it('carries each quirk text so the roll reads on its own', () => {
    const { quirks } = rollTemperament(3, pools)
    for (const q of quirks) expect(q.text).toBe(pools.quirks.find((p) => p.id === q.id)!.text)
  })

  it('makes forklings with different seeds different from each other', () => {
    const rolls = new Set(Array.from({ length: 30 }, (_, seed) => JSON.stringify(rollTemperament(seed, pools))))
    expect(rolls.size).toBeGreaterThanOrEqual(25)
  })

  it('produces a valid temperament file', () => {
    expect(TemperamentRoll.safeParse(rollTemperament(11, pools)).success).toBe(true)
  })

  it('copes with pools smaller than what they ask for', () => {
    const small = TemperamentPools.parse({
      traits: { colour: ['red', 'blue'] },
      likes: 3,
      dislikes: 3,
      quirks: [{ id: 'a', text: 'A.' }, { id: 'b', text: 'B.' }],
      quirkCount: [2, 3],
    })
    const roll = rollTemperament(1, small)
    expect(roll.likes.length + roll.dislikes.length).toBe(2)
    expect(roll.quirks).toHaveLength(2)
  })
})

describe('quirkWeights', () => {
  it('multiplies the weights of the quirks a forkling has, verb by verb', () => {
    const roll = { likes: [], dislikes: [], quirks: [{ id: 'hoarder', text: '' }, { id: 'showman', text: '' }] }
    expect(quirkWeights(roll, pools)).toEqual({ pick_up: 3, drop: 0.5 })
  })

  it('is empty for a forkling without quirks, and ignores quirks the pools no longer have', () => {
    expect(quirkWeights({ likes: [], dislikes: [], quirks: [] }, pools)).toEqual({})
    expect(quirkWeights({ likes: [], dislikes: [], quirks: [{ id: 'gone', text: 'x' }] }, pools)).toEqual({})
  })

  it('makes two seeds choose differently from the same pack, which is the point of quirks', () => {
    const weights = Array.from({ length: 30 }, (_, seed) => JSON.stringify(quirkWeights(rollTemperament(seed, pools), pools)))
    expect(new Set(weights).size).toBeGreaterThanOrEqual(3)
  })
})
