import { describe, expect, it } from 'vitest'
import { newSince, ratio, shares, topShare } from '../src/source-mix.ts'

describe('source mix', () => {
  it('shares counts out, biggest first, ties by name', () => {
    expect(shares({ b: 1, a: 1, wiki: 6 })).toEqual([
      { key: 'wiki', count: 6, share: 0.75 },
      { key: 'a', count: 1, share: 0.125 },
      { key: 'b', count: 1, share: 0.125 },
    ])
  })

  it('nothing counted gives no shares and no top', () => {
    expect(shares({})).toEqual([])
    expect(topShare({})).toBeNull()
    expect(topShare({ a: 0 })).toBeNull()
  })

  it('the top share is the biggest key', () => {
    expect(topShare({ a: 1, wiki: 3 })).toEqual({ key: 'wiki', count: 3, share: 0.75 })
  })

  it('a ratio of nothing is null, not 0', () => {
    expect(ratio(1, 4)).toBe(0.25)
    expect(ratio(0, 0)).toBeNull()
  })

  it('new since: what is in the current list and was in none of the earlier ones', () => {
    expect(newSince([['a', 'b'], ['c']], ['a', 'c', 'd', 'e', 'd'])).toEqual(['d', 'e'])
    expect(newSince([], ['a'])).toEqual(['a'])
  })
})
