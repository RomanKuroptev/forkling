import { describe, expect, it } from 'vitest'
import { kit } from '@forkling/schema/kit'
import { validatePlace, type PlaceContext } from '../src/validate-place.ts'

/** A small valid place: one room on one floor with a shelf, a frame and a screen, and three exhibits. */
const base = () => ({
  id: 'house-of-lights',
  name: 'House of Lights',
  purpose: 'Where I keep everything I find about signals people sent into the dark.',
  tags: ['lighthouses', 'signals'],
  founded: '2026-11-20',
  chunk: [1, 0],
  related: ['workshop'],
  exterior: { style: 'stone', footprint: [16, 12], floors: 1, palette: 'harbour', sign: 'HOUSE OF LIGHTS' },
  rooms: [
    {
      id: 'hall',
      name: 'Hall',
      size: [10, 8, 4],
      parts: [
        { part: 'shelf-low', at: [-4, 0, 3.7], rot: 0 },
        { part: 'frame-large', at: [0, 1.6, 3.9], rot: 0 },
        { part: 'screen-small', at: [2, 0, 3], rot: 0 },
      ],
    },
  ],
  exhibits: [
    { id: 'keepers-log', kind: 'souvenir', ref: 'souvenirs/2026-11-18-keepers-log', slot: 'hall/0/0', label: "A keeper wrote 'fog, fog, fog' for nine days.", added: '2026-11-18' },
    { id: 'beacon', kind: 'souvenir', ref: 'souvenirs/2026-11-19-beacon', slot: 'hall/1/0', label: 'A beacon at night.', added: '2026-11-19' },
    { id: 'first-work', kind: 'work', ref: 'works/signal-clock', slot: 'hall/2/0', label: 'A clock made of signals.', added: '2026-11-20' },
  ],
  state: { construction: null, lastCareAt: '2026-11-21T19:40:00+01:00', neglect: 0 },
  history: [{ at: '2026-11-20T18:10:00+01:00', verb: 'found', summary: 'Built it because the codes and the lights kept pointing at each other.' }],
})
type P = ReturnType<typeof base>

const files: Record<string, 'quote' | 'fact' | 'image' | 'other'> = {
  'souvenirs/2026-11-18-keepers-log': 'quote',
  'souvenirs/2026-11-19-beacon': 'image',
  'souvenirs/2026-11-20-a-fact': 'fact',
  'works/signal-clock': 'other',
  'trails/2026-11-18-1': 'other',
}
const ctx: PlaceContext = { kit, exists: (path) => path in files, souvenirKind: (path) => (files[path] === 'other' ? undefined : files[path]) }

/** The reasons for the base place after a change to it. */
function reasonsAfter(change: (p: P) => void, context: PlaceContext = ctx): string {
  const p = base()
  change(p)
  return validatePlace(p, context).join(' | ')
}

describe('a valid place', () => {
  it('has no reasons against it', () => {
    expect(validatePlace(base(), ctx)).toEqual([])
  })
  it('is not checked against the files or the interests when the caller does not know them', () => {
    expect(validatePlace(base(), { kit })).toEqual([])
  })
  it('is rejected, with a reason, when it is not even the right shape', () => {
    expect(validatePlace({ id: 'x' }, ctx).length).toBeGreaterThan(0)
    expect(validatePlace(null, ctx).length).toBeGreaterThan(0)
  })
})

/** One case for each row of the limits table in spec 5.2, plus the edges either side where a number is involved. */
describe('the limits of spec 5.2 (each one is rejected)', () => {
  const cases: [string, (p: P) => void, RegExp][] = [
    ['name under 3 characters', (p) => (p.name = 'ab'), /name/],
    ['name over 40 characters', (p) => (p.name = 'x'.repeat(41)), /name/],
    ['purpose over 160 characters', (p) => (p.purpose = 'x'.repeat(161)), /purpose/],
    ['no tags', (p) => (p.tags = []), /tags/],
    ['more than 3 tags', (p) => (p.tags = ['a', 'b', 'c', 'd']), /tags/],
    ['footprint wider than 24 m', (p) => (p.exterior.footprint = [25, 12]), /footprint/],
    ['footprint deeper than 24 m', (p) => (p.exterior.footprint = [16, 25]), /footprint/],
    ['no floors', (p) => (p.exterior.floors = 0), /floors must be 1 to 3/],
    ['more than 3 floors', (p) => (p.exterior.floors = 4), /floors must be 1 to 3/],
    ['a building taller than 12 m', (p) => { p.exterior.floors = 3; p.rooms[0]!.size = [10, 8, 5] }, /height/],
    ['no rooms', (p) => { p.rooms = []; p.exhibits = [] }, /rooms must be 1 to 6/],
    ['more than 6 rooms', (p) => { p.rooms = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, name: `R${i}`, size: [2, 2, 3], parts: [], at: [-7 + i * 2, 0], floor: 0 })) as never; p.exhibits = [] }, /rooms must be 1 to 6/],
    ['a room outside the footprint', (p) => (p.rooms[0]!.size = [20, 8, 4]), /inside the footprint/],
    ['two rooms overlapping on the same floor', (p) => { p.rooms.push({ id: 'annex', name: 'Annex', size: [4, 4, 4], parts: [], at: [0, 0], floor: 0 } as never) }, /overlap/],
    ['a room on a floor the building does not have', (p) => { (p.rooms[0] as { floor?: number }).floor = 1 }, /floor/],
    ['more than 40 parts in a room', (p) => { p.rooms[0]!.parts = Array.from({ length: 41 }, () => ({ part: 'crate', at: [0, 0, 0], rot: 0 })); p.exhibits = [] }, /40 parts/],
    ['a part outside its room', (p) => p.rooms[0]!.parts.push({ part: 'crate', at: [6, 0, 0], rot: 0 }), /outside/],
    ['more than 30 exhibits', (p) => { p.rooms[0]!.parts.push(...Array.from({ length: 11 }, () => ({ part: 'shelf-low', at: [0, 0, 0], rot: 0 }))); p.exhibits = Array.from({ length: 31 }, (_, i) => ({ id: `e${i}`, kind: 'souvenir', ref: 'souvenirs/2026-11-18-keepers-log', slot: `hall/${3 + Math.floor(i / 3)}/${i % 3}`, label: 'x', added: '2026-11-18' })) }, /exhibits must be at most 30/],
    ['an exhibit in a slot of the wrong kind (a work in a frame)', (p) => { p.exhibits[2]!.slot = 'hall/1/0'; p.exhibits[1]!.slot = 'hall/2/0' }, /slot/],
    ['an image souvenir in a plaque slot', (p) => { p.rooms[0]!.parts.push({ part: 'plaque-stand', at: [0, 0, 0], rot: 0 }); p.exhibits[1]!.slot = 'hall/3/0' }, /slot/],
    ['two exhibits in one slot', (p) => (p.exhibits[1]!.slot = 'hall/0/0'), /one exhibit per slot|twice/],
    ['an exhibit in a room that does not exist', (p) => (p.exhibits[0]!.slot = 'cellar/0/0'), /slot/],
    ['an exhibit in a part that does not exist', (p) => (p.exhibits[0]!.slot = 'hall/9/0'), /slot/],
    ['an exhibit in a slot the part does not have', (p) => (p.exhibits[0]!.slot = 'hall/0/3'), /slot/],
    ['a label over 120 characters', (p) => (p.exhibits[0]!.label = 'x'.repeat(121)), /label/],
    ['a history summary over 140 characters', (p) => (p.history[0]!.summary = 'x'.repeat(141)), /summary/],
    ['a footprint pushed out of its chunk by its offset', (p) => { (p as { offset?: number[] }).offset = [10, 0] }, /inside its chunk/],
    ['a sign over 24 characters', (p) => (p.exterior.sign = 'X'.repeat(25)), /sign/],
    ['more than 50 history entries', (p) => { p.history = Array.from({ length: 51 }, (_, i) => ({ at: `2026-11-20T18:${String(i).padStart(2, '0')}:00+01:00`, verb: 'tend', summary: 'x' })) as never }, /history/],
  ]
  it.each(cases)('%s', (_name, change, expected) => {
    expect(reasonsAfter(change)).toMatch(expected)
  })

  it('accepts the numbers on the edge of each limit', () => {
    expect(reasonsAfter((p) => { p.name = 'abc' })).toBe('')
    expect(reasonsAfter((p) => { p.name = 'x'.repeat(40); p.purpose = 'x'.repeat(160); p.exterior.sign = 'X'.repeat(24) })).toBe('')
    expect(reasonsAfter((p) => { p.tags = ['a', 'b', 'c'] })).toBe('')
    expect(reasonsAfter((p) => { p.exterior.footprint = [24, 24]; p.rooms[0]!.size = [24, 24, 4] })).toBe('')
    expect(reasonsAfter((p) => { p.exterior.floors = 3; p.rooms[0]!.size = [10, 8, 4] })).toBe('')
    expect(reasonsAfter((p) => { p.exhibits[0]!.label = 'x'.repeat(120); p.history[0]!.summary = 'x'.repeat(140) })).toBe('')
  })

  it('lets two rooms share a floor when they do not overlap, and the same space on different floors', () => {
    expect(reasonsAfter((p) => { p.rooms[0]!.size = [8, 8, 4]; p.rooms.push({ id: 'annex', name: 'Annex', size: [4, 4, 4], parts: [], at: [6, 0], floor: 0 } as never) })).toBe('')
    expect(reasonsAfter((p) => { p.exterior.floors = 2; p.rooms.push({ id: 'attic', name: 'Attic', size: [10, 8, 4], parts: [], at: [0, 0], floor: 1 } as never) })).toBe('')
  })
})

describe('what the place names must exist (spec 11.1)', () => {
  it('rejects a part, a style or a palette that is not in the kit', () => {
    expect(reasonsAfter((p) => p.rooms[0]!.parts.push({ part: 'dragon-egg', at: [0, 0, 0], rot: 0 }))).toMatch(/dragon-egg/)
    expect(reasonsAfter((p) => (p.exterior.style = 'castle'))).toMatch(/style.*castle/)
    expect(reasonsAfter((p) => (p.exterior.palette = 'neon'))).toMatch(/palette.*neon/)
  })

  it('rejects an exhibit that points at a file that does not exist, or a file of another kind', () => {
    expect(reasonsAfter((p) => (p.exhibits[0]!.ref = 'souvenirs/nothing'))).toMatch(/souvenirs\/nothing/)
    expect(reasonsAfter((p) => (p.exhibits[0]!.ref = 'works/signal-clock'))).toMatch(/ref/)
    expect(reasonsAfter((p) => (p.exhibits[2]!.ref = 'souvenirs/2026-11-18-keepers-log'))).toMatch(/ref/)
  })

  it('puts a quote on a plaque stand and a fact in a case, but an image only in a frame, shelf or case', () => {
    const withStand = (p: P) => p.rooms[0]!.parts.push({ part: 'plaque-stand', at: [0, 0, 0], rot: 0 })
    expect(reasonsAfter((p) => { withStand(p); p.exhibits[0]!.slot = 'hall/3/0' })).toBe('')
    expect(reasonsAfter((p) => { p.rooms[0]!.parts.push({ part: 'case-glass', at: [0, 0, 0], rot: 0 }); (p.exhibits as { id: string; kind: string; ref: string; slot: string; label: string; added: string }[]).push({ id: 'a-fact', kind: 'souvenir', ref: 'souvenirs/2026-11-20-a-fact', slot: 'hall/3/0', label: 'A fact.', added: '2026-11-20' }) })).toBe('')
    expect(reasonsAfter((p) => { withStand(p); p.exhibits[1]!.slot = 'hall/3/0' })).toMatch(/slot/)
  })

  it('takes a gallery exhibit with no file in a terminal, and only there', () => {
    const gallery = { id: 'all-works', kind: 'gallery', ref: null, label: 'Every work I have made.', added: '2026-11-20' }
    expect(reasonsAfter((p) => { p.rooms[0]!.parts.push({ part: 'terminal', at: [0, 0, 0], rot: 0 }); (p.exhibits as unknown[]).push({ ...gallery, slot: 'hall/3/0' }) })).toBe('')
    expect(reasonsAfter((p) => { (p.exhibits as unknown[]).push({ ...gallery, slot: 'hall/0/1' }) })).toMatch(/slot/)
  })

  it('checks the tags against the interests when the caller gives them (at founding), and not otherwise', () => {
    const interests = new Set(['lighthouses'])
    expect(reasonsAfter(() => {}, { ...ctx, interests })).toMatch(/tags.*signals/)
    expect(reasonsAfter(() => {}, { ...ctx, interests: new Set(['lighthouses', 'signals']) })).toBe('')
  })

  it('rejects two exhibits, two rooms or two ids that share an id', () => {
    expect(reasonsAfter((p) => (p.exhibits[1]!.id = 'keepers-log'))).toMatch(/exhibit id/)
    expect(reasonsAfter((p) => p.rooms.push({ id: 'hall', name: 'Hall 2', size: [2, 2, 3], parts: [], at: [7, 0], floor: 0 } as never))).toMatch(/room id/)
  })
})

describe('where a place stands in its chunk (the founding clearing holds two, side by side)', () => {
  it('takes an offset from the middle of the chunk, as long as the footprint stays inside the chunk', () => {
    expect(reasonsAfter((p) => { (p as { offset?: number[] }).offset = [0, 0] })).toBe('')
    expect(reasonsAfter((p) => { p.exterior.footprint = [12, 10]; p.rooms[0]!.size = [10, 8, 4]; (p as { offset?: number[] }).offset = [-10, 0] })).toBe('')
    expect(reasonsAfter((p) => { p.exterior.footprint = [12, 10]; p.rooms[0]!.size = [10, 8, 4]; (p as { offset?: number[] }).offset = [-11, 0] })).toMatch(/inside its chunk/)
  })
})
