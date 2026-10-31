import { describe, expect, it } from 'vitest'
import { TemperamentPools, WorldObject, type TemperamentRoll } from '@forkling/schema'
import { appraise, decayFeelings, eventsFromStep, moodLabel, type Feelings } from '../src/appraisal.ts'

const pools = TemperamentPools.parse({
  traits: { material: ['stone', 'wood'], texture: ['soft', 'rough'] },
  quirks: [
    { id: 'perfectionist', text: 'Minds a wobble.', appraisal: { blocked: 2, finished: 1.5 } },
    { id: 'laid-back', text: 'Shrugs.', appraisal: { blocked: 0.25 } },
  ],
})

const calm: Feelings = { valence: 0, arousal: 0.3 }
const roll = (extra: Partial<TemperamentRoll> = {}): TemperamentRoll => ({ likes: [], dislikes: [], quirks: [], ...extra })
const quirk = (id: string) => ({ id, text: '' })

describe('appraise', () => {
  it('feels good about finishing something and bad about being blocked', () => {
    expect(appraise(calm, [{ kind: 'finished' }], roll(), pools).valence).toBeGreaterThan(0.2)
    expect(appraise(calm, [{ kind: 'blocked' }], roll(), pools).valence).toBeLessThan(-0.2)
  })

  it('is stirred up by surprises and blocks, and not by quiet progress', () => {
    expect(appraise(calm, [{ kind: 'novelty' }], roll(), pools).arousal).toBeGreaterThan(calm.arousal + 0.2)
    expect(appraise(calm, [{ kind: 'blocked' }], roll(), pools).arousal).toBeGreaterThan(calm.arousal + 0.15)
    expect(appraise(calm, [{ kind: 'gathered' }], roll(), pools).arousal - calm.arousal).toBeLessThan(0.1)
  })

  it('likes what it likes: the same event pleases a forkling that likes stone and sours one that dislikes it', () => {
    const event = [{ kind: 'gathered', tags: ['stone'] }]
    const fond = appraise(calm, event, roll({ likes: [{ category: 'material', value: 'stone' }] }), pools)
    const averse = appraise(calm, event, roll({ dislikes: [{ category: 'material', value: 'stone' }] }), pools)
    const neutral = appraise(calm, event, roll(), pools)
    expect(fond.valence).toBeGreaterThan(neutral.valence)
    expect(averse.valence).toBeLessThan(neutral.valence)
    expect(fond.valence).toBeGreaterThan(0)
    expect(averse.valence).toBeLessThan(0)
  })

  it('matches likes on any tag of the event, not only the material', () => {
    const fond = appraise(calm, [{ kind: 'painted', tags: ['made', 'soft'] }], roll({ likes: [{ category: 'texture', value: 'soft' }] }), pools)
    const plain = appraise(calm, [{ kind: 'painted', tags: ['made', 'soft'] }], roll(), pools)
    expect(fond.valence).toBeGreaterThan(plain.valence)
  })

  it('lets quirks change how much an event matters', () => {
    const event = [{ kind: 'blocked' }]
    const fussy = appraise(calm, event, roll({ quirks: [quirk('perfectionist')] }), pools)
    const plain = appraise(calm, event, roll(), pools)
    const easy = appraise(calm, event, roll({ quirks: [quirk('laid-back')] }), pools)
    expect(fussy.valence).toBeLessThan(plain.valence)
    expect(easy.valence).toBeGreaterThan(plain.valence)
  })

  it('gives two forklings different moods from the same day', () => {
    const day = [{ kind: 'gathered', tags: ['stone'] }, { kind: 'blocked' }, { kind: 'finished' }]
    const a = appraise(calm, day, roll({ likes: [{ category: 'material', value: 'stone' }], quirks: [quirk('laid-back')] }), pools)
    const b = appraise(calm, day, roll({ dislikes: [{ category: 'material', value: 'stone' }], quirks: [quirk('perfectionist')] }), pools)
    expect(moodLabel(a)).not.toBe(moodLabel(b))
  })

  it('stays within range however much happens', () => {
    const lots = Array.from({ length: 50 }, () => ({ kind: 'blocked' }))
    const low = appraise(calm, lots, roll(), pools)
    expect(low.valence).toBe(-1)
    expect(low.arousal).toBeLessThanOrEqual(1)
    const high = appraise(calm, Array.from({ length: 50 }, () => ({ kind: 'finished' })), roll(), pools)
    expect(high.valence).toBe(1)
  })

  it('ignores event kinds it does not know, and does nothing with no events', () => {
    expect(appraise(calm, [{ kind: 'moonlanding' }], roll(), pools)).toEqual(calm)
    expect(appraise(calm, [], roll(), pools)).toEqual(calm)
  })

  it('does not change its input', () => {
    const before = { ...calm }
    appraise(calm, [{ kind: 'finished' }], roll(), pools)
    expect(calm).toEqual(before)
  })
})

describe('decayFeelings', () => {
  it('lets feelings fade towards calm over hours', () => {
    const upset: Feelings = { valence: -0.8, arousal: 0.9 }
    const later = decayFeelings(upset, 3)
    expect(later.valence).toBeGreaterThan(upset.valence)
    expect(later.valence).toBeLessThan(0)
    expect(later.arousal).toBeLessThan(upset.arousal)
    expect(later.arousal).toBeGreaterThan(0.3)
    const muchLater = decayFeelings(upset, 48)
    expect(muchLater.valence).toBeCloseTo(0, 1)
    expect(muchLater.arousal).toBeCloseTo(0.3, 1)
  })

  it('leaves calm alone, and does not move for no time', () => {
    expect(decayFeelings(calm, 5)).toEqual(calm)
    const upset: Feelings = { valence: -0.5, arousal: 0.8 }
    expect(decayFeelings(upset, 0)).toEqual(upset)
  })

  it('also lifts a low mood and soothes a good one', () => {
    expect(decayFeelings({ valence: -0.6, arousal: 0.3 }, 2).valence).toBeGreaterThan(-0.6)
    expect(decayFeelings({ valence: 0.6, arousal: 0.3 }, 2).valence).toBeLessThan(0.6)
  })
})

describe('moodLabel', () => {
  const label = (valence: number, arousal: number) => moodLabel({ valence, arousal })

  it('names the corners of feeling in plain words', () => {
    expect(label(0.7, 0.8)).toBe('delighted')
    expect(label(0.7, 0.3)).toBe('content')
    expect(label(0.3, 0.7)).toBe('pleased')
    expect(label(0, 0.7)).toBe('curious')
    expect(label(0, 0.1)).toBe('sleepy')
    expect(label(0, 0.3)).toBe('calm')
    expect(label(-0.3, 0.7)).toBe('frustrated')
    expect(label(-0.3, 0.3)).toBe('uneasy')
    expect(label(-0.7, 0.8)).toBe('upset')
    expect(label(-0.7, 0.2)).toBe('down')
  })

  it('always fits a mood field', () => {
    for (let v = -1; v <= 1; v += 0.1) for (let a = 0; a <= 1; a += 0.1) expect(label(v, a).length).toBeLessThanOrEqual(40)
  })
})

describe('eventsFromStep', () => {
  const stone = WorldObject.parse({
    id: 'cairn',
    kind: 'made',
    name: 'A cairn',
    position: [0, 0, 0],
    model: { asset: 'nature/rock_largeA' },
    properties: { material: 'stone', soft: false, high: true },
    reason: 'Because.',
  })
  const cushion = WorldObject.parse({
    id: 'cushion',
    kind: 'made',
    name: 'A cushion',
    position: [0, 0, 0],
    model: { asset: 'nature/rock_largeA' },
    properties: { material: 'fibre', soft: true },
    reason: 'Because.',
  })

  it('tags an event with its kind, material and what the object is like', () => {
    const [event] = eventsFromStep([{ kind: 'finished', objectId: 'cairn' }], [stone])
    expect(event!.kind).toBe('finished')
    expect(event!.tags).toEqual(expect.arrayContaining(['stone', 'high', 'made']))
    expect(event!.tags).not.toContain('soft')
  })

  it('tags a gathered material even when there is no object left to look at', () => {
    const [event] = eventsFromStep([{ kind: 'harvested', objectId: 'gone', material: 'produce' }], [])
    expect(event!.tags).toContain('produce')
  })

  it('sees softness', () => {
    const [event] = eventsFromStep([{ kind: 'finished', objectId: 'cushion' }], [cushion])
    expect(event!.tags).toEqual(expect.arrayContaining(['fibre', 'soft']))
  })
})
