import { describe, expect, it } from 'vitest'
import { fixedRoute, parseRoute, worldSiteRedirect } from '../src/world/route.ts'

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

describe("one address: the viewer inside a forkling's site (step 7)", () => {
  it('fixedRoute always shows the one world the build was made for, whatever the path', () => {
    expect(fixedRoute('RomanKuroptev/merge', '')).toEqual({ kind: 'world', ref: { owner: 'RomanKuroptev', repo: 'merge' } })
    expect(fixedRoute('RomanKuroptev/merge', '?ref=dev&x=1')).toEqual({ kind: 'world', ref: { owner: 'RomanKuroptev', repo: 'merge', ref: 'dev' } })
    expect(fixedRoute('not a repo', '').kind).toBe('invalid')
  })

  const SITE = 'https://romankuroptev.github.io/merge/'
  it("sends a visit for Merge's world from the engine's own address to the site's /world/, keeping the query", () => {
    expect(worldSiteRedirect({ kind: 'home' }, '?time=22&at=1,2', SITE)).toBe(`${SITE}world/?time=22&at=1,2`)
    expect(worldSiteRedirect({ kind: 'world', ref: { owner: 'RomanKuroptev', repo: 'merge' } }, '', SITE)).toBe(`${SITE}world/`)
    expect(worldSiteRedirect({ kind: 'world', ref: { owner: 'romankuroptev', repo: 'Merge' } }, '?mind=x', SITE)).toBe(`${SITE}world/?mind=x`)
  })

  it('leaves other worlds, the local files and the fixture where they are', () => {
    expect(worldSiteRedirect({ kind: 'world', ref: { owner: 'someone', repo: 'cat' } }, '', SITE)).toBeNull()
    expect(worldSiteRedirect({ kind: 'home' }, '?world=local', SITE)).toBeNull()
    expect(worldSiteRedirect({ kind: 'home' }, '?world=local&fixture=10', SITE)).toBeNull()
    expect(worldSiteRedirect({ kind: 'home' }, '', undefined)).toBeNull()
    expect(worldSiteRedirect({ kind: 'invalid', reason: 'x' }, '', SITE)).toBeNull()
  })

  it('reads ?world=owner/repo as a visit for that world', () => {
    expect(worldSiteRedirect({ kind: 'home' }, '?world=RomanKuroptev/merge', SITE)).toBe(`${SITE}world/`)
    expect(worldSiteRedirect({ kind: 'home' }, '?world=someone/cat', SITE)).toBeNull()
  })
})
