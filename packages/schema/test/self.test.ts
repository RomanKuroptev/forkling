import { describe, expect, it } from 'vitest'
import { MAX_WANTS, MindState, Note, NotesHidden, Visitors, NotesResponse, ReflectionAnswer, SelfRequest, SleepRewriteAnswer, StreamKind, Want, Wants, WeeklyReview, WorkMeta, formatSelfRequest, parseSelfRequest } from '../src/index.ts'

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

describe('where a note was written (spec 10.1)', () => {
  const base = { id: 'n-2026-11-16-aaaaaa', name: '', message: 'Hi', placeId: 'home', at: '2026-11-16T12:00:00+01:00', topics: [], status: 'new' }
  it('has no position by default, so a note written on the notes page has none', () => {
    expect(Note.parse(base).position).toBeNull()
  })
  it('may hold where the visitor stood: x and z in meters, finite and within 5000', () => {
    expect(Note.parse({ ...base, position: [12.5, -3.25] }).position).toEqual([12.5, -3.25])
    for (const position of [[Number.NaN, 0], [0, Number.POSITIVE_INFINITY], [5001, 0], [0, -5001], [1], [1, 2, 3], 'here']) {
      expect(Note.safeParse({ ...base, position }).success, JSON.stringify(position)).toBe(false)
    }
  })
})

describe('NotesResponse (what GET /notes.json says)', () => {
  it('is up to 100 notes', () => {
    const note = { id: 'n-1', name: '', message: 'Hi', placeId: 'home', at: '2026-11-16T12:00:00+01:00', topics: [], status: 'new' }
    expect(NotesResponse.safeParse({ notes: [note] }).success).toBe(true)
    expect(NotesResponse.safeParse({ notes: Array.from({ length: 101 }, (_, i) => ({ ...note, id: `n-${i}` })) }).success).toBe(false)
    expect(NotesResponse.safeParse({}).success).toBe(false)
  })
})

describe('NotesHidden (spec 10.1)', () => {
  it('is a list of note ids, empty by default', () => {
    expect(NotesHidden.parse({})).toEqual({ hidden: [], names: [] })
    expect(NotesHidden.parse({ hidden: ['n-1'] })).toEqual({ hidden: ['n-1'], names: [] })
    expect(NotesHidden.safeParse({ hidden: [''] }).success).toBe(false)
  })
})

describe('Visitors (spec v4 7)', () => {
  const entry = { name: 'Roman', firstSeen: '2026-11-10T10:00:00.000Z', lastSeen: '2026-11-11T10:00:00.000Z', notes: 2 }
  it('an empty file parses; an entry gets an empty about and no made', () => {
    expect(Visitors.parse({})).toEqual({ visitors: {} })
    expect(Visitors.parse({ visitors: { roman: entry } }).visitors.roman).toMatchObject({ about: '', made: [] })
  })
  it('about is up to 200 characters', () => {
    expect(Visitors.safeParse({ visitors: { roman: { ...entry, about: 'x'.repeat(201) } } }).success).toBe(false)
    expect(Visitors.safeParse({ visitors: { roman: { ...entry, about: 'x'.repeat(200) } } }).success).toBe(true)
  })
  it('NotesHidden also holds folded names', () => {
    expect(NotesHidden.parse({ names: ['roman'] })).toEqual({ hidden: [], names: ['roman'] })
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

describe('the request to Roman as a file (spec 9.5)', () => {
  it('is the request, then a line from Roman if he answered', () => {
    expect(formatSelfRequest({ body: 'Could I read one more site?' })).toBe('Could I read one more site?\n')
    expect(formatSelfRequest({ body: 'Could I read one more site?', answer: 'Not yet.' })).toBe('Could I read one more site?\n\nRoman: Not yet.\n')
  })
  it('is read back: the date is the file name, the answer is what follows Roman:', () => {
    const text = 'Could I read one more site?\nIt keeps blocking me.\n\nRoman: Not yet. Ask again after the run.\n'
    expect(parseSelfRequest('2026-11-15', text)).toEqual({ date: '2026-11-15', body: 'Could I read one more site?\nIt keeps blocking me.', answer: 'Not yet. Ask again after the run.' })
    expect(parseSelfRequest('2026-11-15', 'Just a request.\n')).toEqual({ date: '2026-11-15', body: 'Just a request.', answer: null })
  })
  it('takes an answer on several lines, and Roman: only at the start of a line', () => {
    const text = 'I asked about Roman: the person.\n\nRoman: Line one.\nLine two.\n'
    expect(parseSelfRequest('2026-11-15', text)).toMatchObject({ body: 'I asked about Roman: the person.', answer: 'Line one.\nLine two.' })
  })
  it('turns down a file that is not a request: no body, too many words, or a name that is not a date', () => {
    expect(parseSelfRequest('2026-11-15', '\n\nRoman: only an answer\n')).toBeNull()
    expect(parseSelfRequest('2026-11-15', `${Array(121).fill('word').join(' ')}\n`)).toBeNull()
    expect(parseSelfRequest('notes', 'A request.\n')).toBeNull()
  })
})

describe('WeeklyReview (spec 9.5)', () => {
  const review = {
    about: null,
    aboutChanges: [],
    longGoal: { action: 'continue', text: null, reason: 'Still what I want.' },
    renames: [],
    request: null,
  }
  it('carries one optional request to Roman, or null', () => {
    expect(WeeklyReview.safeParse({ ...review, request: 'Could I read one more site?' }).success).toBe(true)
    const { request: _request, ...missing } = review
    expect(WeeklyReview.safeParse(missing).success).toBe(false)
  })
  it('parses a quiet review: nothing to change', () => {
    expect(WeeklyReview.safeParse(review).success).toBe(true)
  })
  it('carries the whole new about.md with a reason for each change', () => {
    expect(WeeklyReview.safeParse({ ...review, about: 'I like fog.\n- patient', aboutChanges: [{ what: 'added patient', why: 'I waited out three foggy days.' }] }).success).toBe(true)
  })
  it('says what happens to the long goal: continue, finish, drop or change', () => {
    for (const action of ['continue', 'finish', 'drop', 'change']) expect(WeeklyReview.safeParse({ ...review, longGoal: { action, text: action === 'change' ? 'A new aim.' : null, reason: 'x' } }).success).toBe(true)
    expect(WeeklyReview.safeParse({ ...review, longGoal: { action: 'abandon', text: null, reason: 'x' } }).success).toBe(false)
  })
  it('renames a place or a work, with a reason', () => {
    expect(WeeklyReview.safeParse({ ...review, renames: [{ kind: 'place', id: 'place-02', name: 'The Fog House', reason: 'It is what I call it.' }] }).success).toBe(true)
    expect(WeeklyReview.safeParse({ ...review, renames: [{ kind: 'person', id: 'x', name: 'y', reason: 'z' }] }).success).toBe(false)
  })
  it('a structured answer always says everything: a missing part is not an answer', () => {
    const { renames: _renames, ...missing } = review
    expect(WeeklyReview.safeParse(missing).success).toBe(false)
  })
})

describe('a work\'s earlier titles (spec 9.5: a rename leaves a history line)', () => {
  const work = { id: 'tide-pool-clock', title: 'Tide pool clock', kind: 'art', about: 'A clock.', interest: null, made: '2026-11-14T10:00:00Z', status: 'shelf', size: 'full' }
  it('starts with none, so every work from before still parses', () => {
    expect(WorkMeta.parse(work).titleHistory).toEqual([])
  })
  it('keeps the title it had, when it changed and why', () => {
    const entry = { at: '2026-11-15T19:30:00Z', from: 'Tide pool clock', reason: 'It is a tide, not a pool.' }
    expect(WorkMeta.parse({ ...work, title: 'Tide clock', titleHistory: [entry] }).titleHistory).toEqual([entry])
    expect(WorkMeta.safeParse({ ...work, titleHistory: [{ ...entry, from: 'x'.repeat(41) }] }).success).toBe(false)
    expect(WorkMeta.safeParse({ ...work, titleHistory: Array(11).fill(entry) }).success).toBe(false)
  })
})

describe('stream kinds (spec 9.3, 10.1)', () => {
  it('has reflection and note', () => {
    expect(StreamKind.safeParse('reflection').success).toBe(true)
    expect(StreamKind.safeParse('note').success).toBe(true)
  })
})
