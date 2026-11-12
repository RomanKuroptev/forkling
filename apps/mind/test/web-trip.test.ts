import { describe, expect, it } from 'vitest'
import { Souvenir, Trail } from '@forkling/schema'
import { WebError } from '../src/web/fetch.ts'
import type { Item } from '../src/web/item.ts'
import type { ReadAnswer } from '../src/web/read.ts'
import type { ReadOutcome } from '../src/web/readcall.ts'
import { MAX_READS_PER_DAY, MAX_SOUVENIRS_PER_TRIP, runTrip, type TripDeps } from '../src/web/trip.ts'

const wiki = 'https://en.wikipedia.org/wiki'
const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ')
const page = (name: string, over: Partial<Item> = {}): Item => ({
  source: 'en.wikipedia.org',
  kind: 'page',
  tier: 'reference',
  url: `${wiki}/${name}`,
  title: name.replace(/_/g, ' '),
  text: `The lamp of ${name} was lit at four. ${words(400)}`,
  links: [1, 2, 3].map((n) => ({ title: `${name} link ${n}`, url: `${wiki}/${name}_${n}` })),
  images: [],
  ...over,
})
const answer = (over: Partial<ReadAnswer> = {}): ReadAnswer => ({ reaction: 'Huh.', topics: ['lamps'], interest: 7, souvenir: null, next: 1, look: null, ...over })
const read = (over: Partial<ReadAnswer> = {}, extra: Partial<ReadOutcome> = {}): ReadOutcome => ({ answer: answer(over), souvenir: {}, usd: 0.002, ...extra })
const keep = (name: string): ReadOutcome =>
  read({ next: null }, { souvenir: { kept: { kind: 'quote', content: `The lamp of ${name} was lit at four.`, why: 'It stayed.' } } })

interface Script {
  /** What `open` gives, by URL: an item or an error. */
  pages?: Record<string, Item | Error>
  /** What `read` says, in order. */
  reads?: ReadOutcome[]
  known?: TripDeps['known']
  readsLeft?: number
}

function setup(s: Script = {}) {
  const opened: string[] = []
  const readItems: string[] = []
  const booked: ReadOutcome[] = []
  let n = 0
  const deps: TripDeps = {
    open: async (url) => {
      opened.push(url)
      const p = s.pages?.[url]
      if (!p) throw new WebError('http', `404 ${url}`, 404)
      if (p instanceof Error) throw p
      return p
    },
    read: async (item) => {
      readItems.push(item.url)
      return s.reads?.[n++] ?? read({ next: null })
    },
    now: () => '2026-11-18T10:12:00.000Z',
    known: s.known ?? { souvenirs: [], readRecently: () => false },
    readsLeft: s.readsLeft ?? MAX_READS_PER_DAY,
    onRead: (_item, outcome) => booked.push(outcome),
  }
  const start = { id: '2026-11-18-1', date: '2026-11-18', purpose: 'find out how lamps were lit', startKind: 'topic' as const, startValue: 'lighthouses', startUrl: `${wiki}/Lighthouse` }
  return { deps, start, opened, readItems, booked }
}

describe('a trip', () => {
  it('reads the start, follows the link the read call chose, and stops when it says stop', async () => {
    const s = setup({ pages: { [`${wiki}/Lighthouse`]: page('Lighthouse'), [`${wiki}/Lighthouse_2`]: page('Lighthouse_2'), [`${wiki}/Lighthouse_2_1`]: page('Lighthouse_2_1') }, reads: [read({ next: 2 }), read({ next: 1 }), read({ next: null })] })
    const r = await runTrip(s.deps, s.start)
    expect(s.opened).toEqual([`${wiki}/Lighthouse`, `${wiki}/Lighthouse_2`, `${wiki}/Lighthouse_2_1`])
    expect(r.reads).toBe(3)
    expect(Trail.safeParse(r.trail).success).toBe(true)
    expect(r.trail).toMatchObject({ id: '2026-11-18-1', date: '2026-11-18', purpose: 'find out how lamps were lit', start: { kind: 'topic', value: 'lighthouses' } })
    expect(r.trail.pages.map((p) => p.title)).toEqual(['Lighthouse', 'Lighthouse 2', 'Lighthouse 2 1'])
    expect(r.trail.pages[0]).toMatchObject({ url: `${wiki}/Lighthouse`, fetchedAt: '2026-11-18T10:12:00.000Z', reaction: 'Huh.', topics: ['lamps'], interest: 7 })
  })

  it('never goes past 6 reads in a trip, or past what the day still allows', async () => {
    const chain = Object.fromEntries(Array.from({ length: 12 }, (_, n) => [`${wiki}/P${n}`, page(`P${n}`, { links: [{ title: 'next', url: `${wiki}/P${n + 1}` }] })]))
    const forever = Array.from({ length: 12 }, () => read({ next: 1 }))
    const six = setup({ pages: { ...chain }, reads: forever })
    const a = await runTrip(six.deps, { ...six.start, startUrl: `${wiki}/P0` })
    expect(a.reads).toBe(6)
    expect(a.trail.pages).toHaveLength(6)
    const two = setup({ pages: { ...chain }, reads: forever, readsLeft: 2 })
    expect((await runTrip(two.deps, { ...two.start, startUrl: `${wiki}/P0` })).reads).toBe(2)
    const none = setup({ pages: { ...chain }, readsLeft: 0 })
    const z = await runTrip(none.deps, { ...none.start, startUrl: `${wiki}/P0` })
    expect(z.reads).toBe(0)
    expect(none.opened).toEqual([])
    expect(z.notes.join(' ')).toMatch(/no reads left/)
  })

  it('does not read a page twice: a link back to one already read ends the trip', async () => {
    const s = setup({ pages: { [`${wiki}/Lighthouse`]: page('Lighthouse', { links: [{ title: 'self', url: `${wiki}/Lighthouse` }] }) }, reads: [read({ next: 1 })] })
    const r = await runTrip(s.deps, s.start)
    expect(r.reads).toBe(1)
  })

  it('ignores a link number that was not offered, and stops', async () => {
    const s = setup({ pages: { [`${wiki}/Lighthouse`]: page('Lighthouse') }, reads: [read({ next: 9 })] })
    expect((await runTrip(s.deps, s.start)).reads).toBe(1)
  })

  it('hands each outcome to the caller before the next read, so its cost is booked in time', async () => {
    const order: string[] = []
    const s = setup({ pages: { [`${wiki}/Lighthouse`]: page('Lighthouse'), [`${wiki}/Lighthouse_1`]: page('Lighthouse_1') }, reads: [read({ next: 1 }), read({ next: null })] })
    s.deps.onRead = (item) => order.push(`book ${item.title}`)
    const inner = s.deps.read
    s.deps.read = async (item) => {
      order.push(`read ${item.title}`)
      return inner(item)
    }
    await runTrip(s.deps, s.start)
    expect(order).toEqual(['read Lighthouse', 'book Lighthouse', 'read Lighthouse 1', 'book Lighthouse 1'])
  })
})

describe('what a trip feeds into interests', () => {
  it('lists each page topic as a page event, and a kept souvenir adds a souvenir event for the page topics', async () => {
    const s = setup({ pages: { [`${wiki}/Lighthouse`]: page('Lighthouse') }, reads: [{ ...keep('Lighthouse'), answer: answer({ topics: ['lamps', 'fog'], next: null, souvenir: null }) }] })
    const r = await runTrip(s.deps, s.start)
    expect(r.feeds.map(({ topic, event, souvenirId }) => ({ topic, event, ...(souvenirId ? { souvenirId } : {}) }))).toEqual([
      { topic: 'lamps', event: 'page' },
      { topic: 'fog', event: 'page' },
      { topic: 'lamps', event: 'souvenir', souvenirId: r.souvenirs[0]!.id },
      { topic: 'fog', event: 'souvenir', souvenirId: r.souvenirs[0]!.id },
    ])
    expect(r.feeds.every((f) => f.url === `${wiki}/Lighthouse` && f.title === 'Lighthouse')).toBe(true)
  })

  it('cleans the topics the model gave', async () => {
    const s = setup({ pages: { [`${wiki}/Lighthouse`]: page('Lighthouse') }, reads: [read({ topics: ['  Lamps ', 'lamps', 'one two three four five'], next: null })] })
    expect((await runTrip(s.deps, s.start)).trail.pages[0]!.topics).toEqual(['lamps', 'one two three four'])
  })
})

describe('the souvenirs of a trip', () => {
  it('keeps a quote with its source, in the shape of spec 6.3, and names it by date and title', async () => {
    const s = setup({ pages: { [`${wiki}/Lighthouse`]: page('Lighthouse') }, reads: [keep('Lighthouse')] })
    const r = await runTrip(s.deps, s.start)
    expect(r.souvenirs).toHaveLength(1)
    expect(Souvenir.safeParse(r.souvenirs[0]).success).toBe(true)
    expect(r.souvenirs[0]).toMatchObject({
      id: '2026-11-18-lighthouse',
      kind: 'quote',
      content: 'The lamp of Lighthouse was lit at four.',
      why: 'It stayed.',
      topics: ['lamps'],
      source: { url: `${wiki}/Lighthouse`, title: 'Lighthouse', fetchedAt: '2026-11-18T10:12:00.000Z' },
      licence: null,
      placedIn: null,
    })
    expect(r.trail.pages[0]!.souvenirId).toBe('2026-11-18-lighthouse')
  })

  it('keeps a fact with the excerpt it rests on', async () => {
    const fact = read({ next: null }, { souvenir: { kept: { kind: 'fact', content: 'The lamp was lit daily.', evidence: 'was lit at four.', why: 'x' } } })
    const r = await runTrip(setup({ pages: { [`${wiki}/Lighthouse`]: page('Lighthouse') }, reads: [fact] }).deps, setup().start)
    expect(r.souvenirs[0]).toMatchObject({ kind: 'fact', evidence: 'was lit at four.' })
  })

  it('drops a souvenir from a page it already kept one from, and a near copy of an earlier one, and says why', async () => {
    const known = { souvenirs: [{ id: '2026-11-10-old', url: `${wiki}/Lighthouse`, content: 'Another thing.' }, { id: '2026-11-11-copy', url: 'https://example.org/x', content: 'The lamp of Lighthouse_1 was lit at four.' }], readRecently: () => false }
    const s = setup({
      pages: { [`${wiki}/Lighthouse`]: page('Lighthouse'), [`${wiki}/Lighthouse_1`]: page('Lighthouse_1') },
      reads: [{ ...keep('Lighthouse'), answer: answer({ next: 1, souvenir: null }) }, keep('Lighthouse_1')],
      known,
    })
    const r = await runTrip(s.deps, s.start)
    expect(r.souvenirs).toEqual([])
    expect(r.dropped.map((d) => d.reason)).toEqual([expect.stringMatching(/same source/), expect.stringMatching(/near copy/)])
    expect(r.notes.join(' ')).toMatch(/souvenir dropped/)
  })

  it('keeps at most 3 a trip, and gives two from one title different ids', async () => {
    const same = (n: number): ReadOutcome => ({ ...keep('X'), answer: answer({ next: 1 }), souvenir: { kept: { kind: 'quote', content: `Distinct sentence number ${n} about ${['moss', 'tides', 'copper', 'owls'][n]} and nothing else`, why: 'w' } } })
    const text = (n: number) => `Distinct sentence number ${n} about ${['moss', 'tides', 'copper', 'owls'][n]} and nothing else ${words(350)}`
    const pages = Object.fromEntries([0, 1, 2, 3].map((n) => [`${wiki}/T${n}`, page(`T${n}`, { title: 'Same title', text: text(n), links: [{ title: 'next', url: `${wiki}/T${n + 1}` }] })]))
    const s = setup({ pages, reads: [0, 1, 2, 3].map(same) })
    const r = await runTrip(s.deps, { ...s.start, startUrl: `${wiki}/T0` })
    expect(r.souvenirs).toHaveLength(MAX_SOUVENIRS_PER_TRIP)
    expect(r.souvenirs.map((x) => x.id)).toEqual(['2026-11-18-same-title', '2026-11-18-same-title-2', '2026-11-18-same-title-3'])
    expect(r.dropped.map((d) => d.reason)).toEqual([expect.stringMatching(/3 souvenirs a trip/)])
  })

  it('does not keep what the code judged wrong, and passes the reason on', async () => {
    const bad = read({ next: null }, { souvenir: { dropped: 'quote not found word for word' } })
    const r = await runTrip(setup({ pages: { [`${wiki}/Lighthouse`]: page('Lighthouse') }, reads: [bad] }).deps, setup().start)
    expect(r.souvenirs).toEqual([])
    expect(r.dropped).toEqual([{ title: 'Lighthouse', reason: 'quote not found word for word' }])
  })
})

describe('when a page cannot be read', () => {
  it('tries the other links of the page before once, and ends the trip at a second failure', async () => {
    const s = setup({
      pages: { [`${wiki}/Lighthouse`]: page('Lighthouse'), [`${wiki}/Lighthouse_1`]: new WebError('timeout', 'slow'), [`${wiki}/Lighthouse_2`]: new WebError('http', '500', 500) },
      reads: [read({ next: 1 })],
    })
    const r = await runTrip(s.deps, s.start)
    expect(s.opened).toEqual([`${wiki}/Lighthouse`, `${wiki}/Lighthouse_1`, `${wiki}/Lighthouse_2`])
    expect(r.reads).toBe(3)
    expect(r.trail.pages.map((p) => p.failed)).toEqual([undefined, expect.stringMatching(/timeout/), expect.stringMatching(/500/)])
    expect(r.stats.find((x) => x.host === 'en.wikipedia.org')).toMatchObject({ reads: 3, failures: 2 })
  })

  it('goes on from the other link when the retry works', async () => {
    const s = setup({
      pages: { [`${wiki}/Lighthouse`]: page('Lighthouse'), [`${wiki}/Lighthouse_1`]: new WebError('timeout', 'slow'), [`${wiki}/Lighthouse_2`]: page('Lighthouse_2') },
      reads: [read({ next: 1 }), read({ next: null })],
    })
    const r = await runTrip(s.deps, s.start)
    expect(r.trail.pages.map((p) => p.title)).toEqual(['Lighthouse', 'Lighthouse_1', 'Lighthouse 2'])
    expect(r.trail.pages[1]!.failed).toMatch(/timeout/)
    expect(r.reads).toBe(3)
  })

  it('writes a trail even when the start cannot be fetched, and stops', async () => {
    const s = setup({ pages: { [`${wiki}/Lighthouse`]: new WebError('http', '404', 404) } })
    const r = await runTrip(s.deps, s.start)
    expect(Trail.safeParse(r.trail).success).toBe(true)
    expect(r.trail.pages).toHaveLength(1)
    expect(r.trail.pages[0]).toMatchObject({ url: `${wiki}/Lighthouse`, failed: expect.stringContaining('404') })
    expect(r.reads).toBe(1)
  })

  it('does not count a skipped page as a read, and ends a trip whose start is skipped', async () => {
    const skipped = read({}, { answer: null, skipped: 'a page under 300 words (12)' })
    const start = setup({ pages: { [`${wiki}/Lighthouse`]: page('Lighthouse') }, reads: [skipped] })
    const a = await runTrip(start.deps, start.start)
    expect(a.reads).toBe(0)
    expect(a.notes.join(' ')).toMatch(/skipped/)
    expect(a.trail.pages).toHaveLength(1)
    const mid = setup({ pages: { [`${wiki}/Lighthouse`]: page('Lighthouse'), [`${wiki}/Lighthouse_1`]: page('Lighthouse_1'), [`${wiki}/Lighthouse_2`]: page('Lighthouse_2') }, reads: [read({ next: 1 }), skipped, read({ next: null })] })
    const b = await runTrip(mid.deps, mid.start)
    expect(b.reads).toBe(2)
    expect(b.trail.pages.map((p) => p.title)).toEqual(['Lighthouse', 'Lighthouse 2'])
  })

  it('ends the trip, with a note, when the read call gave nothing usable', async () => {
    const s = setup({ pages: { [`${wiki}/Lighthouse`]: page('Lighthouse') }, reads: [{ answer: null, souvenir: {}, usd: 0, note: 'over the budget' }] })
    const r = await runTrip(s.deps, s.start)
    expect(r.notes.join(' ')).toMatch(/over the budget/)
    expect(r.trail.pages[0]).toMatchObject({ url: `${wiki}/Lighthouse`, failed: 'over the budget' })
  })
})

describe('what a trip says about its hosts', () => {
  it('counts reads, souvenirs and boring pages per host, and adds up what the calls cost', async () => {
    const s = setup({
      pages: { [`${wiki}/Lighthouse`]: page('Lighthouse'), 'https://esolangs.org/wiki/Bf': page('Bf', { source: 'esolangs.org', url: 'https://esolangs.org/wiki/Bf', links: [] }) },
      reads: [
        { ...read({ next: 1, interest: 2 }), usd: 0.003 },
        { ...keep('Bf'), usd: 0.004 },
      ],
    })
    s.deps.open = ((open) => async (url: string) => (url === `${wiki}/Lighthouse_1` ? page('Bf', { source: 'esolangs.org', url: 'https://esolangs.org/wiki/Bf', links: [] }) : open(url)))(s.deps.open)
    const r = await runTrip(s.deps, s.start)
    expect(r.stats).toEqual([
      { host: 'en.wikipedia.org', reads: 1, souvenirs: 0, boring: 1, failures: 0 },
      { host: 'esolangs.org', reads: 1, souvenirs: 1, boring: 0, failures: 0 },
    ])
    expect(r.usd).toBeCloseTo(0.007, 6)
  })
})
