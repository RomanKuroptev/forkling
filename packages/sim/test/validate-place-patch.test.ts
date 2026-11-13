import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { validatePlacePatch, type PatchContext } from '../src/validate-place-patch.ts'
import { base, ctx } from './helpers/place-fixture.ts'

const NOW = '2026-11-25T10:00:00+01:00'
const pctx: PatchContext = { ...ctx, nowIso: NOW, placeIds: new Set(['house-of-lights', 'workshop', 'home']), renamesThisWeek: 0 }

/** The place after a patch, or the reasons it was refused. */
function run(patch: unknown, context: PatchContext = pctx) {
  const before = base()
  const frozen = JSON.stringify(before)
  const result = validatePlacePatch(before, patch, context)
  expect(JSON.stringify(before), 'the input place must not change').toBe(frozen)
  return result
}
const reasons = (patch: unknown, context?: PatchContext) => {
  const r = run(patch, context)
  return r.ok ? '' : r.reasons.join(' | ')
}
const placeAfter = (patch: unknown, context?: PatchContext) => {
  const r = run(patch, context)
  if (!r.ok) throw new Error(`refused: ${r.reasons.join(' | ')}`)
  return r.place
}

const add = (id: string, slot: string, over: Record<string, unknown> = {}) => ({ op: 'add', exhibit: { id, kind: 'souvenir', ref: 'souvenirs/2026-11-20-a-fact', slot, label: 'A fact.', ...over } })
const tend = (over: Record<string, unknown> = {}) => ({ verb: 'tend', summary: 'Rearranged the hall.', ...over })

describe('tend (spec 5.4: up to 3 exhibit changes, up to 2 labels, the sign, the lamps; no parts)', () => {
  it('adds an exhibit to a free slot, dates it today, and counts as care: lastCareAt, neglect 0, a history line', () => {
    const p = placeAfter(tend({ exhibits: [add('a-fact', 'hall/0/1')] }))
    expect(p.exhibits.find((e) => e.id === 'a-fact')).toMatchObject({ slot: 'hall/0/1', added: '2026-11-25', kind: 'souvenir' })
    expect(p.state.lastCareAt).toBe(NOW)
    expect(p.state.neglect).toBe(0)
    expect(p.history.at(-1)).toEqual({ at: NOW, verb: 'tend', summary: 'Rearranged the hall.' })
  })

  it('takes up to 3 exhibit changes (add, move, remove) and refuses a 4th', () => {
    const three = tend({ exhibits: [add('f1', 'hall/0/1'), add('f2', 'hall/0/2'), { op: 'remove', id: 'beacon' }] })
    expect(reasons(three)).toBe('')
    const four = tend({ exhibits: [add('f1', 'hall/0/1'), add('f2', 'hall/0/2'), { op: 'remove', id: 'beacon' }, { op: 'remove', id: 'first-work' }] })
    expect(reasons(four)).toMatch(/at most 3 exhibit changes/)
  })

  it('moves an exhibit to a free slot of the right kind, and refuses a taken slot, a wrong kind or an unknown exhibit', () => {
    expect(placeAfter(tend({ exhibits: [{ op: 'move', id: 'keepers-log', slot: 'hall/0/2' }] })).exhibits.find((e) => e.id === 'keepers-log')!.slot).toBe('hall/0/2')
    expect(reasons(tend({ exhibits: [{ op: 'move', id: 'keepers-log', slot: 'hall/1/0' }] }))).toMatch(/slot/)
    expect(reasons(tend({ exhibits: [{ op: 'move', id: 'keepers-log', slot: 'hall/2/0' }] }))).toMatch(/slot/)
    expect(reasons(tend({ exhibits: [{ op: 'move', id: 'nothing', slot: 'hall/0/2' }] }))).toMatch(/nothing/)
  })

  it('removes an exhibit, and refuses one that is not there', () => {
    expect(placeAfter(tend({ exhibits: [{ op: 'remove', id: 'beacon' }] })).exhibits.map((e) => e.id)).toEqual(['keepers-log', 'first-work'])
    expect(reasons(tend({ exhibits: [{ op: 'remove', id: 'ghost' }] }))).toMatch(/ghost/)
  })

  it('rewrites up to 2 labels, within 120 characters, of exhibits that exist', () => {
    expect(placeAfter(tend({ labels: [{ id: 'beacon', label: 'A beacon, lit at dusk.' }] })).exhibits.find((e) => e.id === 'beacon')!.label).toBe('A beacon, lit at dusk.')
    expect(reasons(tend({ labels: [{ id: 'beacon', label: 'a' }, { id: 'keepers-log', label: 'b' }, { id: 'first-work', label: 'c' }] }))).toMatch(/at most 2 labels/)
    expect(reasons(tend({ labels: [{ id: 'beacon', label: 'x'.repeat(121) }] }))).toMatch(/label/)
    expect(reasons(tend({ labels: [{ id: 'ghost', label: 'a' }] }))).toMatch(/ghost/)
  })

  it('changes the sign (24 characters) and turns the lamps off and on', () => {
    expect(placeAfter(tend({ sign: 'LIGHT HOUSE' })).exterior.sign).toBe('LIGHT HOUSE')
    expect(reasons(tend({ sign: 'X'.repeat(25) }))).toMatch(/sign/)
    expect(placeAfter(tend({ lamps: false })).state.lamps).toBe(false)
    expect(placeAfter(tend({ lamps: true })).state.lamps).toBe(true)
  })

  it('never adds or removes a part, or changes anything else: such a patch is not a tend', () => {
    expect(reasons(tend({ parts: [{ part: 'crate', at: [0, 0, 0], rot: 0 }] }))).toMatch(/parts|Unrecognized/)
    expect(reasons(tend({ name: 'New Name' }))).toMatch(/name|Unrecognized/)
  })

  it('makes sure exhibits point at files that exist, in the right folder', () => {
    expect(reasons(tend({ exhibits: [add('x', 'hall/0/1', { ref: 'souvenirs/missing' })] }))).toMatch(/missing/)
    expect(reasons(tend({ exhibits: [add('x', 'hall/0/1', { ref: 'works/signal-clock' })] }))).toMatch(/ref/)
  })

  it('keeps the whole file inside the limits of 5.2: a 31st exhibit is refused', () => {
    const roomy = base()
    roomy.rooms[0]!.parts.push(...Array.from({ length: 10 }, () => ({ part: 'shelf-low', at: [0, 0, 0] as [number, number, number], rot: 0 })))
    roomy.exhibits = Array.from({ length: 30 }, (_, i) => ({ id: `e${i}`, kind: 'souvenir', ref: 'souvenirs/2026-11-18-keepers-log', slot: `hall/${3 + Math.floor(i / 3)}/${i % 3}`, label: 'x', added: '2026-11-18' })) as never
    const r = validatePlacePatch(roomy, tend({ exhibits: [add('one-more', 'hall/0/0')] }), pctx)
    expect(r.ok ? '' : r.reasons.join(' ')).toMatch(/exhibits must be at most 30/)
  })

  it('wants a summary of 1 to 140 characters, which becomes the history line', () => {
    expect(reasons(tend({ summary: '' }))).toMatch(/summary/)
    expect(reasons(tend({ summary: 'x'.repeat(141) }))).toMatch(/summary/)
    expect(reasons({ verb: 'tend' })).toMatch(/summary/)
  })

  it('keeps only the last 50 history entries', () => {
    const full = base()
    full.history = Array.from({ length: 50 }, (_, i) => ({ at: `2026-11-20T18:${String(i).padStart(2, '0')}:00+01:00`, verb: 'tend', summary: `entry ${i}` })) as never
    const r = validatePlacePatch(full, tend({ lamps: false }), pctx)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.place.history).toHaveLength(50)
      expect(r.place.history[0]!.summary).toBe('entry 1')
      expect(r.place.history.at(-1)!.verb).toBe('tend')
    }
  })
})

describe('revisit (spec 5.4: no change except lastCareAt and a history line)', () => {
  it('sets only lastCareAt (and so resets neglect) and adds a history line', () => {
    const before = base()
    before.state.neglect = 2
    const r = validatePlacePatch(before, { verb: 'revisit', summary: 'Walked through and reread its history.' }, pctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const was = Place.parse(before)
    expect(r.place.state).toEqual({ ...was.state, lastCareAt: NOW, neglect: 0 })
    expect(r.place.history.at(-1)).toEqual({ at: NOW, verb: 'revisit', summary: 'Walked through and reread its history.' })
    expect({ ...r.place, state: was.state, history: was.history }).toEqual(was)
  })
  it('refuses anything else in a revisit', () => {
    expect(reasons({ verb: 'revisit', summary: 'x', lamps: false })).toMatch(/lamps|Unrecognized/)
    expect(reasons({ verb: 'revisit', summary: 'x', exhibits: [] })).toMatch(/exhibits|Unrecognized/)
  })
})

describe('expand (spec 5.4: a room, an enlarged room, or a path; up to 15 parts)', () => {
  const annex = (over: Record<string, unknown> = {}) => ({ id: 'annex', name: 'Annex', size: [3, 4, 4], at: [6.5, 0], floor: 0, parts: [{ part: 'desk', at: [0, 0, 0], rot: 0 }], ...over })
  const expand = (change: unknown, over: Record<string, unknown> = {}) => ({ verb: 'expand', summary: 'Added an annex for the notes.', change, ...over })

  it('adds a room with its parts, and counts as care', () => {
    const p = placeAfter(expand({ kind: 'room', room: annex() }))
    expect(p.rooms.map((r) => r.id)).toEqual(['hall', 'annex'])
    expect(p.history.at(-1)).toMatchObject({ verb: 'expand' })
    expect(p.state.lastCareAt).toBe(NOW)
  })
  it('allows up to 15 parts in the new room and refuses 16, an unknown part, an overlapping room, and a 7th room', () => {
    const parts = (n: number) => Array.from({ length: n }, () => ({ part: 'crate', at: [0, 0, 0], rot: 0 }))
    expect(reasons(expand({ kind: 'room', room: annex({ parts: parts(15) }) }))).toBe('')
    expect(reasons(expand({ kind: 'room', room: annex({ parts: parts(16) }) }))).toMatch(/at most 15 parts/)
    expect(reasons(expand({ kind: 'room', room: annex({ parts: [{ part: 'dragon-egg', at: [0, 0, 0], rot: 0 }] }) }))).toMatch(/dragon-egg/)
    expect(reasons(expand({ kind: 'room', room: annex({ at: [0, 0], size: [4, 4, 4] }) }))).toMatch(/overlap/)
    const six = base()
    six.rooms = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, name: `R${i}`, size: [2, 2, 3], at: [-7 + i * 2.5, 0], floor: 0, parts: [] })) as never
    six.exhibits = []
    const r = validatePlacePatch(six, expand({ kind: 'room', room: annex({ at: [7.5, 4], size: [2, 2, 3] }) }), pctx)
    expect(r.ok ? '' : r.reasons.join(' ')).toMatch(/rooms must be 1 to 6/)
  })
  it('refuses a room whose id is taken', () => {
    expect(reasons(expand({ kind: 'room', room: annex({ id: 'hall' }) }))).toMatch(/room id/)
  })

  it('enlarges a room (never shrinks it), moves its parts, and adds up to 15', () => {
    const small = base()
    small.rooms[0]!.size = [8, 8, 4]
    const ok = validatePlacePatch(small, expand({ kind: 'enlarge', roomId: 'hall', size: [10, 8, 4], moves: [{ index: 0, at: [-4.5, 0, 3.7] }] }), pctx)
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.place.rooms[0]!.size).toEqual([10, 8, 4])
      expect(ok.place.rooms[0]!.parts[0]!.at).toEqual([-4.5, 0, 3.7])
    }
    expect(reasons(expand({ kind: 'enlarge', roomId: 'hall', size: [8, 8, 4] }))).toMatch(/shrink|enlarge/)
    expect(reasons(expand({ kind: 'enlarge', roomId: 'hall', size: [30, 8, 4] }))).toMatch(/inside the footprint/)
    expect(reasons(expand({ kind: 'enlarge', roomId: 'cellar', size: [12, 8, 4] }))).toMatch(/cellar/)
    expect(reasons(expand({ kind: 'enlarge', roomId: 'hall', size: [11, 8, 4], moves: [{ index: 9, at: [0, 0, 0] }] }))).toMatch(/part/)
    expect(reasons(expand({ kind: 'enlarge', roomId: 'hall', size: [11, 8, 4], addParts: Array.from({ length: 16 }, () => ({ part: 'crate', at: [0, 0, 0], rot: 0 })) }))).toMatch(/at most 15 parts/)
  })

  it('adds one path to another place that exists, and refuses itself, a stranger and a path it already has', () => {
    expect(placeAfter(expand({ kind: 'path', to: 'workshop' })).paths).toEqual([{ to: 'workshop', at: '2026-11-25' }])
    expect(reasons(expand({ kind: 'path', to: 'house-of-lights' }))).toMatch(/itself/)
    expect(reasons(expand({ kind: 'path', to: 'nowhere' }))).toMatch(/nowhere/)
    const twice = placeAfter(expand({ kind: 'path', to: 'workshop' }))
    const again = validatePlacePatch(twice, expand({ kind: 'path', to: 'workshop' }), pctx)
    expect(again.ok ? '' : again.reasons.join(' ')).toMatch(/already/)
  })

  it('does nothing while the place is under construction (spec 2.5, 4.5)', () => {
    const building = base()
    building.state.construction = { kind: 'expand', finishesAt: '2026-11-25T12:00:00+01:00' } as never
    const r = validatePlacePatch(building, expand({ kind: 'path', to: 'workshop' }), pctx)
    expect(r.ok ? '' : r.reasons.join(' ')).toMatch(/construction/)
  })

  it('is exactly one change', () => {
    expect(reasons(expand({ kind: 'path', to: 'workshop', room: annex() }))).toMatch(/Unrecognized|change/)
    expect(reasons({ verb: 'expand', summary: 'x', change: [] })).toMatch(/change/)
  })
})

describe('rename (spec 5.4: up to 2 places a week; the id never changes)', () => {
  const rename = (name: string, over: Record<string, unknown> = {}) => ({ verb: 'rename', name, summary: 'It is more a lighthouse now.', ...over })
  it('changes only the name, and adds a history line', () => {
    const p = placeAfter(rename('The Lamp House'))
    expect(p.name).toBe('The Lamp House')
    expect(p.id).toBe('house-of-lights')
    expect(p.history.at(-1)).toMatchObject({ verb: 'rename', summary: 'It is more a lighthouse now.' })
  })
  it('keeps the name to 3 to 40 characters', () => {
    expect(reasons(rename('ab'))).toMatch(/name/)
    expect(reasons(rename('x'.repeat(41)))).toMatch(/name/)
  })
  it('allows a rename while fewer than 2 places were renamed this week, and refuses it after', () => {
    expect(reasons(rename('The Lamp House'), { ...pctx, renamesThisWeek: 1 })).toBe('')
    expect(reasons(rename('The Lamp House'), { ...pctx, renamesThisWeek: 2 })).toMatch(/at most 2 renames a week/)
  })
})

describe('a patch that is not a patch', () => {
  it('is refused with a reason for an unknown verb, nothing at all, or a string', () => {
    expect(reasons({ verb: 'demolish', summary: 'x' })).not.toBe('')
    expect(reasons(null)).not.toBe('')
    expect(reasons('tend the place')).not.toBe('')
  })
})
