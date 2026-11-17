import { describe, expect, it } from 'vitest'
import { isStrangerStart, DIARY_PREFIX_WORDS, DIARY_SIMILARITY, WRITING_LOOKBACK, WRITING_SIMILARITY, boredomCount, diaryNudges, doorStats, drawStats, textNovelty, titleOfUrl, writingNudges } from '../src/text-nudge.ts'

const DAY = 86_400_000
const at = (day: number, h = 10) => new Date(Date.UTC(2026, 10, day, h)).toISOString()
const w = (id: string, day: number, text: string) => ({ id, at: at(day), text })
const since = Date.UTC(2026, 10, 10)

describe('repeated writing (spec 12.3: similarity over 0.35 with one of the last 30, or more than 1 worn phrase)', () => {
  it('fires for a text much like an earlier one, and names it', () => {
    const list = [w('a', 5, 'the fog came in over the harbour and the lamps went out one by one'), w('b', 11, 'the fog came in over the harbour and the lamps went out one by one tonight')]
    expect(writingNudges(list, { sinceMs: since }).map((n) => n.id)).toEqual(['b'])
  })
  it('does not fire for different texts, nor for an old text (it is compared, but only this week\'s are reported)', () => {
    const list = [w('a', 5, 'the fog came in over the harbour and the lamps went out'), w('b', 6, 'the fog came in over the harbour and the lamps went out'), w('c', 11, 'a completely different thing about moss, stones and a small brown bird')]
    expect(writingNudges(list, { sinceMs: since })).toEqual([])
  })
  it('fires for a text with more than one worn phrase (a 3 to 5 word phrase used 4 or more times before)', () => {
    const base = 'staring into the void again and again'
    const earlier = Array.from({ length: 4 }, (_, i) => w(`e${i}`, 1 + i, `${base} number ${i} walks off ${'xyzzy'.repeat(i + 1)} alone quietly`))
    const worn = w('n', 11, 'today staring into the void again and again with a mug of tea')
    expect(writingNudges([...earlier, worn], { sinceMs: since }).map((n) => n.id)).toContain('n')
  })
  it('compares with the last 30 only', () => {
    expect(WRITING_LOOKBACK).toBe(30)
    expect(WRITING_SIMILARITY).toBe(0.35)
    const old = w('old', 1, 'the fog came in over the harbour and the lamps went out one by one')
    const filler = Array.from({ length: 30 }, (_, i) => w(`f${i}`, 2 + (i % 8), `filler text ${i} about ${'q'.repeat(i + 1)} and nothing else in particular here`))
    const again = w('again', 11, 'the fog came in over the harbour and the lamps went out one by one')
    expect(writingNudges([old, ...filler, again], { sinceMs: since }).map((n) => n.id)).not.toContain('again')
  })
})

describe('repeated diary (spec 12.3: the same first 5 words as one of the last 14, or similarity over 0.3)', () => {
  const d = (date: string, text: string) => ({ date, text })
  it('fires for the same first 5 words, whatever follows', () => {
    expect(DIARY_PREFIX_WORDS).toBe(5)
    expect(DIARY_SIMILARITY).toBe(0.3)
    const list = [d('2026-11-08', 'Today was quiet and grey. I read about moss and kept a quote.'), d('2026-11-11', 'Today was quiet and grey, but then something odd happened with a lamp.')]
    expect(diaryNudges(list, { sinceMs: since }).map((n) => n.id)).toEqual(['2026-11-11'])
  })
  it('fires for a similar entry with a different start, and not for a different one', () => {
    const a = d('2026-11-08', 'I kept three quotes about lighthouses and wrote a short plaque for the hall of lamps tonight.')
    const same = d('2026-11-11', 'Tonight I kept three quotes about lighthouses and wrote a short plaque for the hall of lamps.')
    const other = d('2026-11-12', 'The mist stayed all morning, so I mostly sat by the window and listened to the rain on glass.')
    expect(diaryNudges([a, same, other], { sinceMs: since }).map((n) => n.id)).toEqual(['2026-11-11'])
  })
})

describe('textNovelty (spec 12.6: the average highest similarity of the week\'s texts)', () => {
  it('averages, over this week\'s texts, each one\'s highest similarity with the ones before it, and counts the two nudges', () => {
    const writings = [w('a', 5, 'the fog came in over the harbour and the lamps went out one by one'), w('b', 11, 'the fog came in over the harbour and the lamps went out one by one'), w('c', 12, 'moss grows on the north side of old stones in the wood')]
    const n = textNovelty({ writings, diaries: [], sinceMs: since })
    expect(n.texts).toBe(2)
    expect(n.meanMaxSimilarity).toBeCloseTo(0.5, 5)
    expect(n.repeatedWriting).toBe(1)
    expect(n.repeatedDiary).toBe(0)
  })
  it('is zero for a week with no texts', () => {
    expect(textNovelty({ writings: [], diaries: [], sinceMs: since })).toEqual({ texts: 0, meanMaxSimilarity: 0, repeatedWriting: 0, repeatedDiary: 0 })
  })
})

describe('stranger\'s doors (spec 12.3, 12.6)', () => {
  it('is the share of the week\'s trips that started through a stranger\'s door, and the finished days with trips but no such start', () => {
    const days = [
      { date: '2026-11-10', trips: 3, strangers: 1 },
      { date: '2026-11-11', trips: 2, strangers: 0 },
      { date: '2026-11-12', trips: 0, strangers: 0 },
      { date: '2026-11-13', trips: 1, strangers: 0 },
    ]
    expect(doorStats(days, '2026-11-13')).toEqual({ trips: 6, strangers: 1, share: 1 / 6, noDoorDays: 1 })
  })
  it('does not call today a day without a door: it has not passed yet', () => {
    expect(doorStats([{ date: '2026-11-13', trips: 2, strangers: 0 }], '2026-11-13').noDoorDays).toBe(0)
  })
  it('has share 0 for no trips', () => {
    expect(doorStats([], '2026-11-13')).toEqual({ trips: 0, strangers: 0, share: 0, noDoorDays: 0 })
  })
})

describe('collisions and constraints (spec 12.6)', () => {
  it('counts the week\'s works that were offered a collision, and those where Merge refused the constraint', () => {
    const work = (id: string, made: string, over: Record<string, unknown> = {}) => ({ id, made, status: 'shelf', constraint: null, collision: null, ...over })
    const works = [
      work('a', at(11), { collision: ['x', 'y'], constraint: { text: 'two colours', refused: false, reason: null } }),
      work('b', at(12), { constraint: { text: 'make it tiny', refused: true, reason: 'it would be a lie' } }),
      work('c', at(5), { collision: ['x', 'y'] }),
      work('d', at(12), { status: 'scrap', collision: ['x', 'y'] }),
    ]
    expect(drawStats(works, { sinceMs: since })).toEqual({ collisionsUsed: 1, constraintsOffered: 2, constraintsRefused: 1 })
  })
})

describe('boredom (spec 12.4 item 8: 3 or more would-fires in one day)', () => {
  it('adds up the nudges that fired today and says yes from 3', () => {
    expect(boredomCount({ repeatedWork: 1, repeatedPlace: 1, stuck: 0, repeatedWriting: 0, repeatedDiary: 0 })).toBe(2)
    expect(boredomCount({ repeatedWork: 1, repeatedPlace: 1, stuck: 1, repeatedWriting: 0, repeatedDiary: 0 })).toBe(3)
  })
})
void DAY

describe('isStrangerStart (a trip whose start page matches none of the top 5 interests at wake, marked door or not; audit 17 Nov)', () => {
  const top = ['lighthouse', 'logic gates', 'moss', 'tides', 'looms']
  const feed = (url: string) => ({ kind: 'feed' as const, value: url, url })
  it('is a stranger when a front-page link has a title outside the top 5, whether or not it was one of the doors', () => {
    expect(isStrangerStart(feed('https://en.wikipedia.org/wiki/Octopus'), top, 'Octopus')).toBe(true)
    expect(isStrangerStart(feed('https://en.wikipedia.org/wiki/Liminality'), top, 'Liminality')).toBe(true)
  })
  it('is not a stranger when the title of the start page is among the top 5, however it is spelled', () => {
    expect(isStrangerStart(feed('https://en.wikipedia.org/wiki/Lighthouse'), top, 'Lighthouse')).toBe(false)
    expect(isStrangerStart(feed('https://en.wikipedia.org/wiki/Logic_gate'), top, 'Logic  Gate')).toBe(false)
  })
  it('reads the title from the address when the link had none', () => {
    expect(isStrangerStart(feed('https://en.wikipedia.org/wiki/Logic_gates'), top)).toBe(false)
    expect(isStrangerStart(feed('https://en.wikipedia.org/wiki/Octopus'), top)).toBe(true)
  })
  it('is a stranger when a topic is outside the top 5 interests, and not when it is among them', () => {
    expect(isStrangerStart({ kind: 'topic', value: 'octopus', url: 'x' }, top)).toBe(true)
    expect(isStrangerStart({ kind: 'topic', value: 'Logic  Gates', url: 'x' }, top)).toBe(false)
  })
  it('is not a stranger when it goes back to an earlier souvenir', () => {
    expect(isStrangerStart({ kind: 'souvenir', value: 'a', url: 'x' }, top)).toBe(false)
  })
})

describe('titleOfUrl', () => {
  it('is the last part of the address, decoded, with underscores and dashes as spaces', () => {
    expect(titleOfUrl('https://en.wikipedia.org/wiki/Marc_Aug%C3%A9')).toBe('Marc Augé')
    expect(titleOfUrl('https://github.com/alice/glitch-lab')).toBe('glitch lab')
    expect(titleOfUrl('https://imgflip.com/meme/181913649')).toBe('181913649')
    expect(titleOfUrl('not a url')).toBe('not a url')
  })
})
