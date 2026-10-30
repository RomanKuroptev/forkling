import { describe, expect, it } from 'vitest'
import { parseRoute } from '../src/world/route.ts'

describe('parseRoute', () => {
  it('reads owner and repo after the base path', () => {
    expect(parseRoute('/forkling/RomanKuroptev/merge', '/forkling/', '')).toEqual({
      kind: 'world',
      ref: { owner: 'RomanKuroptev', repo: 'merge' },
    })
  })

  it('works with the dev base and a trailing slash', () => {
    expect(parseRoute('/someone/my-cat/', '/', '')).toEqual({ kind: 'world', ref: { owner: 'someone', repo: 'my-cat' } })
  })

  it('picks up a branch from ?ref=', () => {
    expect(parseRoute('/a/b', '/', '?ref=builder/new-box&debug')).toEqual({
      kind: 'world',
      ref: { owner: 'a', repo: 'b', ref: 'builder/new-box' },
    })
  })

  it('treats the bare base as home', () => {
    expect(parseRoute('/forkling/', '/forkling/', '')).toEqual({ kind: 'home' })
    expect(parseRoute('/forkling', '/forkling/', '')).toEqual({ kind: 'home' })
    expect(parseRoute('/', '/', '')).toEqual({ kind: 'home' })
  })

  it('rejects paths that cannot be a GitHub repo', () => {
    expect(parseRoute('/only-owner', '/', '').kind).toBe('invalid')
    expect(parseRoute('/bad owner/repo', '/', '').kind).toBe('invalid')
    expect(parseRoute('/a/b/c', '/', '').kind).toBe('invalid')
    expect(parseRoute('/a/b', '/', '?ref=../../etc').kind).toBe('invalid')
  })
})
