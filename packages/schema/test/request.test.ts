import { describe, expect, it } from 'vitest'
import { MAX_OPEN_PLACE_REQUESTS, MAX_OPEN_WISHES, PlaceRequest, Wish, formatRequest, isOpenRequest, isOpenWish, parseRequest } from '../src/index.ts'

const request = {
  id: 'house-of-lights',
  kind: 'place',
  name: 'House of Lights',
  purpose: 'Where I keep everything I find about signals people sent into the dark.',
  tags: ['lighthouses', 'signals'],
  chunk: [1, 0],
  related: ['radio-booth'],
  souvenirs: ['2026-11-18-keepers-log'],
  written: '2026-11-20T18:10:00+01:00',
  status: 'open',
  statusAt: null,
  note: null,
  body: 'I keep coming back to the keeper who wrote fog nine days in a row. I want a house with a lamp in every window.',
}

describe('PlaceRequest (spec 10.3)', () => {
  it('parses an open place request', () => {
    expect(PlaceRequest.parse(request)).toMatchObject({ kind: 'place', status: 'open', note: null })
  })

  it('has the limits: name 3 to 40, purpose 160, 1 to 3 tags, 5 souvenirs, a body of 200 words', () => {
    const ok = (patch: object) => PlaceRequest.safeParse({ ...request, ...patch }).success
    expect(ok({ name: 'ab' })).toBe(false)
    expect(ok({ name: 'x'.repeat(41) })).toBe(false)
    expect(ok({ purpose: 'x'.repeat(160) })).toBe(true)
    expect(ok({ purpose: 'x'.repeat(161) })).toBe(false)
    expect(ok({ tags: [] })).toBe(false)
    expect(ok({ tags: ['a', 'b', 'c', 'd'] })).toBe(false)
    expect(ok({ souvenirs: ['a', 'b', 'c', 'd', 'e'] })).toBe(true)
    expect(ok({ souvenirs: ['a', 'b', 'c', 'd', 'e', 'f'] })).toBe(false)
    expect(ok({ body: Array(200).fill('word').join(' ') })).toBe(true)
    expect(ok({ body: Array(201).fill('word').join(' ') })).toBe(false)
  })

  it('takes only the statuses of 10.3 and 9.9', () => {
    for (const status of ['open', 'building', 'built', 'declined', 'self-built', 'withdrawn']) {
      expect(PlaceRequest.safeParse({ ...request, status, statusAt: status === 'open' ? null : '2026-11-22T10:00:00Z', note: status === 'declined' ? 'not now' : null }).success).toBe(true)
    }
    expect(PlaceRequest.safeParse({ ...request, status: 'maybe' }).success).toBe(false)
  })

  it('a gift is a request Merge never asked for, so it starts built', () => {
    const gift = { ...request, kind: 'gift', status: 'built', statusAt: '2026-11-25T10:00:00Z', note: 'A small harbour, because you wrote about boats.' }
    expect(PlaceRequest.safeParse(gift).success).toBe(true)
    expect(PlaceRequest.safeParse({ ...gift, status: 'open', statusAt: null }).success).toBe(false)
  })

  it("Roman's note is up to 80 words, and a decline says why", () => {
    const done = { ...request, status: 'built', statusAt: '2026-11-22T10:00:00Z' }
    expect(PlaceRequest.safeParse({ ...done, note: Array(80).fill('w').join(' ') }).success).toBe(true)
    expect(PlaceRequest.safeParse({ ...done, note: Array(81).fill('w').join(' ') }).success).toBe(false)
    expect(PlaceRequest.safeParse({ ...request, status: 'declined', statusAt: '2026-11-22T10:00:00Z', note: null }).success).toBe(false)
  })

  it('a status other than open has a time, and open has none', () => {
    expect(PlaceRequest.safeParse({ ...request, status: 'building', statusAt: null }).success).toBe(false)
    expect(PlaceRequest.safeParse({ ...request, status: 'open', statusAt: '2026-11-22T10:00:00Z' }).success).toBe(false)
  })
})

describe('requests/<id>.md', () => {
  it('formats and parses back to the same request', () => {
    expect(parseRequest(formatRequest(PlaceRequest.parse(request)))).toEqual(PlaceRequest.parse(request))
  })

  it("keeps Roman's hand edit: a bare word is a string, so `status: built` works", () => {
    const text = formatRequest(PlaceRequest.parse(request)).replace('status: "open"', 'status: built').replace('statusAt: null', 'statusAt: 2026-11-22T10:00:00Z').replace('note: null', 'note: A lighthouse with two rooms.')
    expect(parseRequest(text)).toMatchObject({ status: 'built', statusAt: '2026-11-22T10:00:00Z', note: 'A lighthouse with two rooms.' })
  })

  it('refuses text with no front matter, an unknown key, or a body that is not there', () => {
    expect(parseRequest('just words')).toBeNull()
    expect(parseRequest(formatRequest(PlaceRequest.parse(request)).replace('kind:', 'colour: red\nkind:'))).toBeNull()
    expect(parseRequest('---\nid: a\n---\n')).toBeNull()
  })

  it('keeps a body that holds dashes and front-matter lookalikes as the body', () => {
    const tricky = { ...request, body: 'First.\n---\nstatus: built\n---\nLast.' }
    expect(parseRequest(formatRequest(PlaceRequest.parse(tricky)))?.body).toBe(tricky.body)
  })
})

const wish = {
  id: 'spiral-staircase',
  name: 'Spiral staircase',
  description: 'A staircase that turns, for the lamp room of the House of Lights.',
  forPlace: 'house-of-lights',
  count: 1,
  written: '2026-11-21T10:00:00Z',
  status: 'open',
  statusAt: null,
  note: null,
}

describe('Wish (spec 5.3, 10.3)', () => {
  it('parses, and wishing the same part again is a count', () => {
    expect(Wish.parse(wish)).toMatchObject({ count: 1, status: 'open' })
    expect(Wish.safeParse({ ...wish, count: 0 }).success).toBe(false)
    expect(Wish.safeParse({ ...wish, count: 4 }).success).toBe(true)
  })

  it('has a description of up to 200 characters and the statuses of 10.3', () => {
    expect(Wish.safeParse({ ...wish, description: 'x'.repeat(200) }).success).toBe(true)
    expect(Wish.safeParse({ ...wish, description: 'x'.repeat(201) }).success).toBe(false)
    for (const status of ['building', 'built', 'declined', 'unanswered', 'withdrawn']) {
      expect(Wish.safeParse({ ...wish, status, statusAt: '2026-11-22T10:00:00Z', note: status === 'declined' ? 'no' : null }).success).toBe(true)
    }
    expect(Wish.safeParse({ ...wish, status: 'self-built', statusAt: '2026-11-22T10:00:00Z' }).success).toBe(false)
  })

  it('a wish is for an existing place or for none', () => {
    expect(Wish.safeParse({ ...wish, forPlace: null }).success).toBe(true)
  })
})

describe('what is open', () => {
  it('building counts as open, so a place request in progress still takes one of the 2', () => {
    expect(isOpenRequest({ status: 'open' })).toBe(true)
    expect(isOpenRequest({ status: 'building' })).toBe(true)
    for (const status of ['built', 'declined', 'self-built', 'withdrawn'] as const) expect(isOpenRequest({ status })).toBe(false)
  })

  it('open and building wishes are open', () => {
    expect(isOpenWish({ status: 'open' })).toBe(true)
    expect(isOpenWish({ status: 'building' })).toBe(true)
    for (const status of ['built', 'declined', 'unanswered', 'withdrawn'] as const) expect(isOpenWish({ status })).toBe(false)
  })

  it('the limits are 2 place requests and 5 wishes', () => {
    expect(MAX_OPEN_PLACE_REQUESTS).toBe(2)
    expect(MAX_OPEN_WISHES).toBe(5)
  })
})
