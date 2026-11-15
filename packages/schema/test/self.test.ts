import { describe, expect, it } from 'vitest'
import { MAX_WANTS, MindState, Note, NotesHidden, ReflectionAnswer, SelfRequest, SleepRewriteAnswer, StreamKind, Want, Wants } from '../src/index.ts'

const want = {
  id: 'w1',
  kind: 'question',
  text: 'Why did the keeper write fog nine days in a row?',
  why: 'It keeps coming back after every trip.',
  since: '2026-11-15T10:00:00+01:00',
  attempts: 0,
  lastTouched: '2026-11-15T10:00:00+01:00',
}

describe('Want and Wants (spec 9.4)', () => {
  it('parses a want of each kind', () => {
    for (const kind of ['question', 'obsession', 'project']) expect(Want.safeParse({ ...want, kind }).success).toBe(true)
    expect(Want.safeParse({ ...want, kind: 'hobby' }).success).toBe(false)
  })

  it('cuts text at 140 characters and needs a reason', () => {
    expect(Want.safeParse({ ...want, text: 'x'.repeat(140) }).success).toBe(true)
    expect(Want.safeParse({ ...want, text: 'x'.repeat(141) }).success).toBe(false)
    expect(Want.safeParse({ ...want, why: '' }).success).toBe(false)
  })

  it('counts attempts as a whole number from 0', () => {
    expect(Want.safeParse({ ...want, attempts: -1 }).success).toBe(false)
    expect(Want.safeParse({ ...want, attempts: 1.5 }).success).toBe(false)
  })

  it('holds up to 12 wants, with no repeated id', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...want, id: `w${i}` }))
    expect(MAX_WANTS).toBe(12)
    expect(Wants.safeParse({ wants: many(12) }).success).toBe(true)
    expect(Wants.safeParse({ wants: many(13) }).success).toBe(false)
    expect(Wants.safeParse({ wants: [want, want] }).success).toBe(false)
  })

  it('starts empty', () => {
    expect(Wants.parse({})).toEqual({ wants: [] })
  })
})

const note = {
  id: 'n-2026-11-16-ab12cd',
  name: 'A visitor',
  message: 'Do you ever get tired of fog?',
  placeId: 'home',
  at: '2026-11-16T12:00:00+01:00',
  topics: ['fog'],
  status: 'new',
}

describe('Note (spec 10.1)', () => {
  it('parses a new note, with no ip or token field', () => {
    expect(Note.parse(note)).toMatchObject({ status: 'new', reply: null, declineReason: null, foundAt: null })
    expect(Note.safeParse({ ...note, ip: '1.2.3.4' }).success).toBe(false)
    expect(Note.safeParse({ ...note, token: 'abc' }).success).toBe(false)
  })

  it('has the limits: a name of 40, a message of 500, up to 3 topics', () => {
    expect(Note.safeParse({ ...note, name: 'x'.repeat(41) }).success).toBe(false)
    expect(Note.safeParse({ ...note, name: '' }).success).toBe(true)
    expect(Note.safeParse({ ...note, message: 'x'.repeat(500) }).success).toBe(true)
    expect(Note.safeParse({ ...note, message: 'x'.repeat(501) }).success).toBe(false)
    expect(Note.safeParse({ ...note, message: '' }).success).toBe(false)
    expect(Note.safeParse({ ...note, topics: ['a', 'b', 'c', 'd'] }).success).toBe(false)
  })

  it('takes only the five statuses', () => {
    const found = { foundAt: '2026-11-16T13:00:00+01:00' }
    for (const status of ['found', 'kept']) expect(Note.safeParse({ ...note, ...found, status }).success).toBe(true)
    expect(Note.safeParse({ ...note, ...found, status: 'replied', reply: 'I do not.' }).success).toBe(true)
    expect(Note.safeParse({ ...note, ...found, status: 'declined', declineReason: 'Not mine to answer.' }).success).toBe(true)
    expect(Note.safeParse({ ...note, status: 'ignored' }).success).toBe(false)
  })

  it('a replied note holds its reply, a declined note holds its reason (80 characters)', () => {
    const found = { foundAt: '2026-11-16T13:00:00+01:00' }
    expect(Note.safeParse({ ...note, ...found, status: 'replied' }).success).toBe(false)
    expect(Note.safeParse({ ...note, ...found, status: 'declined' }).success).toBe(false)
    expect(Note.safeParse({ ...note, ...found, status: 'declined', declineReason: 'x'.repeat(81) }).success).toBe(false)
    expect(Note.safeParse({ ...note, ...found, status: 'declined', declineReason: 'x'.repeat(80) }).success).toBe(true)
  })

  it('a note that is not found has no reply, no reason and no found time', () => {
    expect(Note.safeParse({ ...note, reply: 'hello' }).success).toBe(false)
    expect(Note.safeParse({ ...note, declineReason: 'no' }).success).toBe(false)
    expect(Note.safeParse({ ...note, foundAt: '2026-11-16T13:00:00+01:00' }).success).toBe(false)
  })

  it('a reply is up to 600 characters', () => {
    const base = { ...note, foundAt: '2026-11-16T13:00:00+01:00', status: 'replied' }
    expect(Note.safeParse({ ...base, reply: 'x'.repeat(600) }).success).toBe(true)
    expect(Note.safeParse({ ...base, reply: 'x'.repeat(601) }).success).toBe(false)
  })
})

describe('NotesHidden (spec 10.1)', () => {
  it('is a list of note ids, empty by default', () => {
    expect(NotesHidden.parse({})).toEqual({ hidden: [] })
    expect(NotesHidden.parse({ hidden: ['n-1'] })).toEqual({ hidden: ['n-1'] })
    expect(NotesHidden.safeParse({ hidden: [''] }).success).toBe(false)
  })
})

describe('SelfRequest (spec 9.5)', () => {
  const req = { date: '2026-11-22', body: 'I keep being blocked from one site. Could it go on the list?', answer: null }

  it('is up to 120 words in Merge\'s voice, with an optional answer from Roman', () => {
    expect(SelfRequest.safeParse(req).success).toBe(true)
    expect(SelfRequest.safeParse({ ...req, body: Array(120).fill('word').join(' ') }).success).toBe(true)
    expect(SelfRequest.safeParse({ ...req, body: Array(121).fill('word').join(' ') }).success).toBe(false)
    expect(SelfRequest.safeParse({ ...req, body: '' }).success).toBe(false)
    expect(SelfRequest.safeParse({ ...req, answer: 'Not now.' }).success).toBe(true)
  })

  it('is named by a date', () => {
    expect(SelfRequest.safeParse({ ...req, date: 'tomorrow' }).success).toBe(false)
  })
})

describe('Merge\'s own page in the answers (spec 9.7)', () => {
  const reflection = { questions: [], insights: [], beliefOps: [], wants: [], planNoLongerFits: null }
  const sleep = { diary: { title: 't', paragraphs: [] }, slots: [], beliefOps: [], wants: [] }

  it('a reflection and a sleep rewrite each carry the whole new page, or null to leave it', () => {
    expect(ReflectionAnswer.safeParse({ ...reflection, page: null }).success).toBe(true)
    expect(ReflectionAnswer.safeParse({ ...reflection, page: 'Rest when the fog comes in.' }).success).toBe(true)
    expect(SleepRewriteAnswer.safeParse({ ...sleep, page: null }).success).toBe(true)
    expect(SleepRewriteAnswer.safeParse({ ...sleep, page: 'Rest when the fog comes in.' }).success).toBe(true)
  })
  it('a structured answer always says it: a missing page is not an answer', () => {
    expect(ReflectionAnswer.safeParse(reflection).success).toBe(false)
    expect(SleepRewriteAnswer.safeParse(sleep).success).toBe(false)
  })
  it('the mind remembers the day the page last changed', () => {
    expect(MindState.parse({}).pageChangedOn).toBeUndefined()
    expect(MindState.parse({ pageChangedOn: '2026-11-15' }).pageChangedOn).toBe('2026-11-15')
    expect(MindState.safeParse({ pageChangedOn: 'yesterday' }).success).toBe(false)
  })
})

describe('stream kinds (spec 9.3, 10.1)', () => {
  it('has reflection and note', () => {
    expect(StreamKind.safeParse('reflection').success).toBe(true)
    expect(StreamKind.safeParse('note').success).toBe(true)
  })
})
