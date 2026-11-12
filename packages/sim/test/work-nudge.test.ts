import { describe, expect, it } from 'vitest'
import { workNovelty, workNudges, type WorkLike } from '../src/work-nudge.ts'

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 10)).toISOString()
const work = (n: number, title: string, about: string, kind = 'art', over: Partial<WorkLike> = {}): WorkLike => ({ id: `w${n}`, title, about, kind, made: day(n), status: 'shelf', ...over })
const SINCE = Date.parse(day(1))

describe('workNudges (spec 12.3: repeated work; measured, never enforced)', () => {
  it('fires for a work whose title is more than half the same as one of the last 10', () => {
    const works = [work(1, 'Tide pool clock one two three', 'a clock'), work(2, 'Tide pool clock one two three', 'something else entirely', 'game')]
    expect(workNudges(works, { sinceMs: SINCE })).toEqual([{ id: 'w2', why: 'its title is like an earlier one' }])
  })

  it('fires for an about that is more than half the same', () => {
    const about = 'a small lamp that hums when nobody is in the room at all'
    const works = [work(1, 'First thing', about), work(2, 'A quite different name', about, 'game')]
    expect(workNudges(works, { sinceMs: SINCE })).toEqual([{ id: 'w2', why: 'its about is like an earlier one' }])
  })

  it('fires for a third work of the same kind in a row', () => {
    const works = [work(1, 'Alpha', 'first words here', 'art'), work(2, 'Bravo', 'second set of words', 'art'), work(3, 'Charlie', 'a third and unlike text', 'art')]
    expect(workNudges(works, { sinceMs: SINCE })).toEqual([{ id: 'w3', why: 'it is the same kind as each of the previous two' }])
  })

  it('does not fire for the first works, or for a different mix of kinds', () => {
    const works = [work(1, 'Alpha', 'first words here', 'art'), work(2, 'Bravo', 'second set of words', 'game'), work(3, 'Charlie', 'a third and unlike text', 'art')]
    expect(workNudges(works, { sinceMs: SINCE })).toEqual([])
    expect(workNudges([], { sinceMs: SINCE })).toEqual([])
  })

  it('looks back 10 works and no further', () => {
    const old = work(1, 'The very same title as the last one here', 'unlike one', 'tool')
    const titles = ['Moss garden study', 'Kettle song loop', 'Paper boat race', 'Lantern fog walk', 'River glass maze', 'Cactus clock face', 'Salt wind chimes', 'Copper bee swarm', 'Pine needle rain', 'Quiet harbor map']
    const abouts = ['grows slowly in a damp corner', 'whistles when the water boils', 'floats down a gutter in spring', 'lights a path through thick mist', 'bends the light into a puzzle', 'tells time with spines', 'rings in the afternoon breeze', 'hums around a paper flower', 'falls softly on a tin roof', 'shows where the boats sleep']
    const filler = titles.map((title, i) => work(i + 2, title, abouts[i]!, i % 2 ? 'game' : 'sound'))
    const last = work(12, 'The very same title as the last one here', 'wholly different words', 'zine')
    expect(workNudges([old, ...filler, last], { sinceMs: SINCE }).map((n) => n.id)).toEqual([])
    expect(workNudges([old, ...filler.slice(0, 5), last], { sinceMs: SINCE }).map((n) => n.id)).toEqual(['w12'])
  })

  it('leaves out scraps, and reports a work once however many ways it repeats', () => {
    const about = 'the same lamp text said again in the very same words'
    const works = [
      work(1, 'Lamp one', about, 'art'),
      work(2, 'Scrapped lamp', about, 'art', { status: 'scrap' }),
      work(3, 'Lamp one', about, 'art'),
    ]
    const found = workNudges(works, { sinceMs: SINCE })
    expect(found.map((n) => n.id)).toEqual(['w3', 'w3'])
    expect(workNovelty(works, { sinceMs: SINCE }).wouldFire).toBe(1)
  })

  it('reports only works made since the cut-off, but compares them with earlier ones', () => {
    const works = [work(1, 'Same title words here again', 'one'), work(20, 'Same title words here again', 'two', 'game')]
    expect(workNudges(works, { sinceMs: Date.parse(day(10)) }).map((n) => n.id)).toEqual(['w20'])
    expect(workNudges(works, { sinceMs: Date.parse(day(25)) })).toEqual([])
  })
})

describe('workNovelty (the work block of the weekly novelty numbers, spec 12.6)', () => {
  it('counts the works of the week, per kind, and how many repeated', () => {
    const works = [work(1, 'Alpha', 'one', 'art'), work(2, 'Bravo', 'two', 'art'), work(3, 'Charlie', 'three', 'art'), work(4, 'Delta', 'four', 'game', { status: 'scrap' })]
    expect(workNovelty(works, { sinceMs: SINCE })).toEqual({ made: 3, wouldFire: 1, byKind: { art: 3 } })
  })
})
