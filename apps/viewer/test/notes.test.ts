import { describe, expect, it } from 'vitest'
import { Note, type Place } from '@forkling/schema'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { fixtureNotes } from '../src/world/fixtureNotes.ts'
import { NOTE_MARK_LIMIT, PAPER_COLORS, noteMarks } from '../src/world/noteMarks.ts'
import { checkNoteInput, readNotesResponse, sendNote, startNotesSync } from '../src/world/notesClient.ts'
import { createNotesStore } from '../src/world/notesStore.ts'

const places = makeFixtureWorld(1, 5).places as Place[]
const note = (over: Record<string, unknown> = {}) =>
  Note.parse({ id: 'n-2026-11-16-aaaaaa', name: 'Ann', message: 'Do you ever get tired of fog?', placeId: 'home', at: '2026-11-16T09:30:00Z', topics: [], status: 'new', ...over })

describe('reading GET /notes.json', () => {
  it('reads the notes when the answer fits, and nothing when it does not', () => {
    expect(readNotesResponse({ notes: [note()] })?.map((n) => n.id)).toEqual(['n-2026-11-16-aaaaaa'])
    for (const bad of [null, 'no', 42, {}, { notes: 'x' }, { notes: [{ id: 'n-1' }] }, { notes: Array.from({ length: 101 }, (_, i) => note({ id: `n-${i}` })) }]) {
      expect(readNotesResponse(bad), JSON.stringify(bad)?.slice(0, 40)).toBeNull()
    }
  })
})

describe('keeping the notes current (spec 10.1)', () => {
  function harness(responses: unknown[]) {
    const calls: string[] = []
    let i = 0
    const timers: { run: () => void; ms: number; id: number }[] = []
    const shown: unknown[] = []
    const deps = {
      mindUrl: 'https://merge-mind.example.org' as string | null,
      intervalMs: 60_000,
      fetch: (async (url: string) => {
        calls.push(url)
        const r = responses[Math.min(i++, responses.length - 1)]
        if (r === 'down') throw new Error('offline')
        return { json: async () => r }
      }) as unknown as typeof fetch,
      setTimer: (run: () => void, ms: number) => {
        const t = { run, ms, id: timers.length + 1 }
        timers.push(t)
        return t.id
      },
      clearTimer: (id: unknown) => {
        const k = timers.findIndex((t) => t.id === id)
        if (k >= 0) timers.splice(k, 1)
      },
      onNotes: (notes: Note[]) => shown.push(notes.map((n) => n.id)),
    }
    return { deps, calls, timers, shown }
  }
  const flush = () => new Promise((r) => setTimeout(r, 0))

  it('reads the notes at once, so they are there when the world is, and again every minute', async () => {
    const h = harness([{ notes: [note()] }, { notes: [note(), note({ id: 'n-2026-11-16-bbbbbb' })] }])
    startNotesSync(h.deps)
    await flush()
    expect(h.calls).toEqual(['https://merge-mind.example.org/notes.json'])
    expect(h.shown).toEqual([['n-2026-11-16-aaaaaa']])
    expect(h.timers).toHaveLength(1)
    expect(h.timers[0]!.ms).toBe(60_000)
    h.timers[0]!.run()
    await flush()
    expect(h.shown.at(-1)).toEqual(['n-2026-11-16-aaaaaa', 'n-2026-11-16-bbbbbb'])
  })

  it('keeps what is on show when the server is down or answers with something that does not fit, and tries again', async () => {
    const h = harness([{ notes: [note()] }, 'down', { nonsense: true }, { notes: [] }])
    startNotesSync(h.deps)
    await flush()
    for (let k = 0; k < 2; k++) {
      h.timers.at(-1)!.run()
      await flush()
    }
    expect(h.shown).toEqual([['n-2026-11-16-aaaaaa']])
    expect(h.timers).toHaveLength(1)
    h.timers.at(-1)!.run()
    await flush()
    expect(h.shown.at(-1)).toEqual([])
  })

  it('asks nothing without a server address, and stops when told to', async () => {
    const none = harness([{ notes: [note()] }])
    none.deps.mindUrl = null
    startNotesSync(none.deps)
    await flush()
    expect(none.calls).toEqual([])
    const h = harness([{ notes: [note()] }])
    const stop = startNotesSync(h.deps)
    await flush()
    stop()
    expect(h.timers).toHaveLength(0)
  })
})

describe('the notes the viewer holds', () => {
  it('holds the notes, tells whoever is watching when they change, and lets a note be opened and closed by its id', () => {
    const store = createNotesStore()
    const seen: number[] = []
    const off = store.subscribe(() => seen.push(store.get().length))
    store.set([note(), note({ id: 'n-2026-11-16-bbbbbb' })])
    expect(seen).toEqual([2])
    store.open('n-2026-11-16-bbbbbb')
    expect(store.opened()?.id).toBe('n-2026-11-16-bbbbbb')
    store.close()
    expect(store.opened()).toBeNull()
    off()
    store.set([])
    expect(seen).toEqual([2, 2, 2])
  })

  it('an open note follows its note: a reply that arrives shows in the panel, and a note that goes away closes it', () => {
    const store = createNotesStore()
    store.set([note()])
    store.open('n-2026-11-16-aaaaaa')
    store.set([note({ status: 'replied', foundAt: '2026-11-16T10:00:00Z', reply: 'I do.' })])
    expect(store.opened()).toMatchObject({ status: 'replied', reply: 'I do.' })
    store.set([])
    expect(store.opened()).toBeNull()
  })

  it('opening a note that is not there opens nothing', () => {
    const store = createNotesStore()
    store.set([note()])
    store.open('n-nope')
    expect(store.opened()).toBeNull()
  })
})

describe('the paper notes in the world (spec 10.1: where it was written)', () => {
  const flat = () => 0
  it('lie where the visitor stood, a little above the ground, and by the door for a note with none', () => {
    const marks = noteMarks([note({ position: [12.5, -3.25] }), note({ id: 'n-2026-11-16-bbbbbb' })], places, (x, z) => x * 0 + z * 0 + 2)
    const at = (id: string) => marks.find((m) => m.id === id)!
    expect(at('n-2026-11-16-aaaaaa').position[0]).toBe(12.5)
    expect(at('n-2026-11-16-aaaaaa').position[2]).toBe(-3.25)
    expect(at('n-2026-11-16-aaaaaa').position[1]).toBeCloseTo(2.04, 2)
    expect(at('n-2026-11-16-bbbbbb').position.every(Number.isFinite)).toBe(true)
  })

  it('turn the same way every time for the same note, and different notes turn differently', () => {
    const a = noteMarks([note()], places, flat)[0]!
    expect(noteMarks([note()], places, flat)[0]!.rotY).toBe(a.rotY)
    const spread = new Set(Array.from({ length: 10 }, (_, i) => noteMarks([note({ id: `n-2026-11-16-${String(i).padStart(6, '0')}` })], places, flat)[0]!.rotY.toFixed(2)))
    expect(spread.size).toBeGreaterThanOrEqual(8)
  })

  it('look different for what became of them, so a visitor can tell a note that has an answer', () => {
    const marks = noteMarks(
      [
        note({ id: 'n-1' }),
        note({ id: 'n-2', status: 'found', foundAt: '2026-11-16T10:00:00Z' }),
        note({ id: 'n-3', status: 'replied', foundAt: '2026-11-16T10:00:00Z', reply: 'Yes.' }),
        note({ id: 'n-4', status: 'kept', foundAt: '2026-11-16T10:00:00Z' }),
        note({ id: 'n-5', status: 'declined', foundAt: '2026-11-16T10:00:00Z', declineReason: 'No.' }),
      ],
      places,
      flat,
    )
    expect(new Set(marks.map((m) => m.color)).size).toBeGreaterThanOrEqual(4)
    expect(marks.find((m) => m.id === 'n-3')!.color).toBe(PAPER_COLORS.replied)
    expect(PAPER_COLORS.new).not.toBe(PAPER_COLORS.replied)
  })

  it('say who left them and what became of them when pointed at', () => {
    const [a, b] = noteMarks([note({ name: 'Ann' }), note({ id: 'n-2', name: '', status: 'replied', foundAt: '2026-11-16T10:00:00Z', reply: 'Yes.' })], places, flat)
    expect(a!.title).toBe('A note from Ann')
    expect(a!.text).toBe('Not found yet.')
    expect(b!.title).toBe('A note from a visitor')
    expect(b!.text).toBe('Merge replied.')
  })

  it('show only the newest 60, and none for no notes', () => {
    const many = Array.from({ length: 70 }, (_, i) => note({ id: `n-2026-11-16-${String(i).padStart(6, '0')}`, at: new Date(Date.UTC(2026, 10, 16, 0, 0, i)).toISOString() }))
    const marks = noteMarks(many, places, flat)
    expect(marks).toHaveLength(NOTE_MARK_LIMIT)
    expect(NOTE_MARK_LIMIT).toBe(60)
    expect(marks.some((m) => m.id === 'n-2026-11-16-000069')).toBe(true)
    expect(marks.some((m) => m.id === 'n-2026-11-16-000000')).toBe(false)
    expect(noteMarks([], places, flat)).toEqual([])
  })
})

describe('the notes of the fixture world', () => {
  it('are real notes of every status, left in and around the fixture places, for trying the viewer without a server', () => {
    const notes = fixtureNotes(places)
    expect(notes.length).toBeGreaterThanOrEqual(5)
    for (const n of notes) expect(Note.safeParse(n).success).toBe(true)
    expect(new Set(notes.map((n) => n.status))).toEqual(new Set(['new', 'found', 'replied', 'kept', 'declined']))
    expect(new Set(notes.map((n) => n.id)).size).toBe(notes.length)
    expect(notes.some((n) => n.position === null)).toBe(true)
    expect(notes.some((n) => n.position !== null)).toBe(true)
  })
})

describe('leaving a note from the viewer', () => {
  const endpoint = 'https://merge-mind.example.org/notes'
  const input = { name: 'Ann', message: 'Hello Merge', token: 'tok', position: [12.345, -3.256] as [number, number], placeId: 'workshop' }
  function fetchWith(response: { status: number; body?: unknown; json?: 'throws' } | 'network') {
    const sent: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = []
    const f = (async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
      sent.push({ url, init })
      if (response === 'network') throw new Error('offline')
      return { status: response.status, json: async () => { if (response.json === 'throws') throw new Error('x'); return response.body ?? {} } }
    }) as unknown as typeof fetch
    return { f, sent }
  }

  it('posts the note as JSON with where the visitor stood (to the centimetre), the place, and the Turnstile token, and thanks them', async () => {
    const { f, sent } = fetchWith({ status: 202, body: { ok: true, id: 'n-1' } })
    const r = await sendNote({ fetch: f, endpoint }, input)
    expect(r).toEqual({ ok: true, text: 'Thank you. Your note is in the mailbox. Merge will find it when it comes by.' })
    expect(sent[0]!.url).toBe(endpoint)
    expect(sent[0]!.init.method).toBe('POST')
    expect(sent[0]!.init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(sent[0]!.init.body)).toEqual({ name: 'Ann', message: 'Hello Merge', placeId: 'workshop', token: 'tok', position: [12.35, -3.26] })
  })

  it('leaves the position out when the visitor has none (not yet placed in the world)', async () => {
    const { f, sent } = fetchWith({ status: 202, body: { ok: true } })
    await sendNote({ fetch: f, endpoint }, { ...input, position: null })
    expect(JSON.parse(sent[0]!.init.body)).not.toHaveProperty('position')
  })

  it('shows the server\'s own words when a note is turned away', async () => {
    for (const [status, error] of [[429, "Merge's mailbox is full until tomorrow."], [429, 'You can leave 3 notes a day, and you have used them. Come back tomorrow.'], [503, 'The mailbox is closed.'], [422, 'That note was not accepted.'], [403, 'That did not look like a person. Try again.']] as const) {
      const { f } = fetchWith({ status, body: { ok: false, error } })
      expect(await sendNote({ fetch: f, endpoint }, input)).toEqual({ ok: false, text: error })
    }
  })

  it('says something plain when the server cannot be reached or answers with something that is not JSON', async () => {
    expect(await sendNote({ fetch: fetchWith('network').f, endpoint }, input)).toEqual({ ok: false, text: 'Could not reach Merge. Try again in a moment.' })
    expect(await sendNote({ fetch: fetchWith({ status: 502, json: 'throws' }).f, endpoint }, input)).toEqual({ ok: false, text: 'Something went wrong. Try again in a moment.' })
  })

  it('checks the form before anything is sent: a message, and the human check', () => {
    expect(checkNoteInput({ message: '   ', token: 'tok' })).toBe('Write something first.')
    expect(checkNoteInput({ message: 'Hi', token: '' })).toBe('Please complete the check first.')
    expect(checkNoteInput({ message: 'Hi', token: 'tok' })).toBeNull()
  })
})
