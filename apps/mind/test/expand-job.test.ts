import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ExpandJob, Interests, Place, Souvenir } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { validatePlacePatch } from '@forkling/sim'
import { createExpandHandler } from '../src/builds/expand-job.ts'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { drawConstraint } from '../src/prompts/constraints.ts'
import { noBatch } from './noBatch.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const world = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const NOW = Date.parse('2026-11-20T10:31:00Z')
const job = ExpandJob.parse({ id: 'expand-20261120-1031', kind: 'expand', requestedAt: '2026-11-20T10:31:00Z', placeId: 'house-of-lights', reason: 'The signals keep coming and the room is full.' })

const roomAnswer = (over: Record<string, unknown> = {}) => ({
  summary: 'A reading room for the signals.',
  change: 'room',
  room: { id: 'reading-room', name: 'Reading room', width: 4, depth: 4, height: 3, x: 7, z: 0, floor: 0, parts: [{ part: 'shelf-tall', x: 0, y: 0, z: 1, rot: 0 }] },
  enlarge: null,
  path: null,
  wishes: [{ name: 'Spiral staircase', description: 'A staircase that turns.', forPlace: 'house-of-lights' }],
  constraintRefusal: null,
  ...over,
})
const outside = roomAnswer({ room: { id: 'reading-room', name: 'Reading room', width: 4, depth: 4, height: 3, x: 30, z: 0, floor: 0, parts: [] } })

/** A model that answers from a list and remembers what it was asked. null is a refusal. */
function fakeLlm(answers: (unknown | null)[], stop?: 'max_tokens') {
  const calls: LlmRequest[] = []
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      const a = answers[calls.length - 1]
      return { parsed: (a ?? null) as T | null, stopReason: a ? 'end_turn' : (stop ?? 'refusal'), usage: { input: 20_000, cacheRead: 0, cacheWrite: 0, output: 6_000 } }
    },
  }
  return { llm, calls }
}

let dir: string
const file = (rel: string) => join(dir, rel)
const put = (rel: string, value: unknown) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(file(rel), typeof value === 'string' ? value : JSON.stringify(value))
}
const home = JSON.parse(readFileSync(join(world, 'places/home.json'), 'utf8'))
const lights = (over: Record<string, unknown> = {}) => ({
  ...home,
  id: 'house-of-lights',
  name: 'House of Lights',
  tags: ['signals'],
  chunk: [1, 0],
  offset: [0, 0],
  founded: '2026-11-12',
  exterior: { ...home.exterior, footprint: [20, 14], sign: 'HOUSE OF LIGHTS' },
  history: [{ at: '2026-11-12T10:00:00Z', verb: 'found', summary: 'Built it for the signals.' }],
  ...over,
})
const stock = (weight = 60, souvenirs = 3) => {
  rmSync(file('souvenirs'), { recursive: true, force: true })
  put('places/house-of-lights.json', lights())
  copyFileSync(join(world, 'places/workshop.json'), (mkdirSync(file('places'), { recursive: true }), file('places/workshop.json')))
  put('brain/interests.json', Interests.parse({ version: 2, topics: { signals: { weight, firstSeen: '2026-11-12T10:00:00Z', lastFed: '2026-11-19T10:00:00Z', sources: [] } } }))
  for (let n = 1; n <= souvenirs; n++) put(`souvenirs/2026-11-1${2 + n}-s${n}.json`, Souvenir.parse({ kind: 'quote', id: `s${n}`, why: 'it stuck', content: `signal words ${n}`, topics: ['signals'], source: { url: 'https://en.wikipedia.org/wiki/Signal', title: `S${n}`, fetchedAt: `2026-11-1${2 + n}T10:00:00Z` } }))
}
const seed = () => (JSON.parse(readFileSync(file('forkling.json'), 'utf8')) as { seed: number }).seed

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'expand-job-'))
  copyFileSync(join(templates, 'forkling.json'), file('forkling.json'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const handler = (llm: LlmClient | null) => createExpandHandler({ dir, llm, now: () => NOW })
const run = (h: ReturnType<typeof handler>, j: unknown = job) => h(j as ExpandJob, { dir, nowMs: NOW })

describe('the expand handler (spec 10.2)', () => {
  it('makes one Sonnet call at low effort, checks the change, and returns it with the place, the wishes and what it cost', async () => {
    stock()
    const { llm, calls } = fakeLlm([roomAnswer()])
    const out = await run(handler(llm))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ kind: 'expand', model: 'claude-sonnet-5-5', effort: 'low', maxTokens: 12_000 })
    expect(out.status).toBe('done')
    expect(out.extra).toMatchObject({ placeId: 'house-of-lights', patch: { verb: 'expand', change: { kind: 'room' }, summary: 'A reading room for the signals.' } })
    expect(out.extra!.wishes).toEqual([{ name: 'Spiral staircase', description: 'A staircase that turns.', forPlace: 'house-of-lights' }])
    expect(out.extra!.calls).toHaveLength(1)
    expect(out.extra!.calls![0]).toMatchObject({ kind: 'expand', model: 'claude-sonnet-5-5', input: 20_000, output: 6_000 })
    expect(out.extra!.calls![0]!.usd).toBeCloseTo((20_000 * 2 + 6_000 * 10) / 1e6, 6)
  })

  it('returns a patch the real validator takes, for the place as it is', async () => {
    stock()
    const out = await run(handler(fakeLlm([roomAnswer()]).llm))
    const place = Place.parse(JSON.parse(readFileSync(file('places/house-of-lights.json'), 'utf8')))
    expect(validatePlacePatch(place, out.extra!.patch!, { kit, nowIso: '2026-11-20T10:31:00Z', placeIds: new Set(['house-of-lights', 'workshop']) }).ok).toBe(true)
  })

  it('offers the souvenirs kept on the tag since the place last changed size, as data, and the constraint drawn for this job', async () => {
    stock()
    put('souvenirs/2026-11-05-old.json', Souvenir.parse({ kind: 'quote', id: 'old', why: 'x', content: 'too old to count', topics: ['signals'], source: { url: 'https://en.wikipedia.org/wiki/Signal', title: 'Old', fetchedAt: '2026-11-05T10:00:00Z' } }))
    const { llm, calls } = fakeLlm([roomAnswer()])
    await run(handler(llm))
    const prompt = calls[0]!.user
    expect(prompt).toMatch(/<data source="souvenirs">[\s\S]*signal words 1[\s\S]*<\/data>/)
    expect(prompt).not.toContain('too old to count')
    expect(prompt).toContain('The interest behind it: signals.')
    expect(prompt).toContain('The signals keep coming and the room is full.')
    const expected = drawConstraint(seed(), `expand:${job.id}`)
    expect(prompt).toContain(expected)
  })

  it('works on a place whose own tag is never fed, when it shows a souvenir on an interest that is, and says that interest (Roman, 14 November)', async () => {
    stock()
    put('places/house-of-lights.json', lights({ tags: ['harbour'] }))
    put('souvenirs/2026-11-13-s1.json', { ...JSON.parse(readFileSync(file('souvenirs/2026-11-13-s1.json'), 'utf8')), placedIn: 'house-of-lights' })
    const { llm, calls } = fakeLlm([roomAnswer()])
    const out = await run(handler(llm))
    expect(out.status).toBe('done')
    expect(calls[0]!.user).toContain('The interest behind it: signals.')
  })

  it('keeps the constraint it was given, and what Merge did with it, in the result', async () => {
    stock()
    const kept = await run(handler(fakeLlm([roomAnswer()]).llm))
    expect(kept.extra!.constraint).toEqual({ text: drawConstraint(seed(), `expand:${job.id}`), refused: false, reason: null })
    const refused = await run(handler(fakeLlm([roomAnswer({ constraintRefusal: 'It would make the room unreadable.' })]).llm))
    expect(refused.extra!.constraint).toMatchObject({ refused: true, reason: 'It would make the room unreadable.' })
  })

  it('lists the wishes that are open, so wishing one again adds to it, and leaves out closed ones and files that do not fit', async () => {
    stock()
    const wish = { id: 'spiral-staircase', name: 'Spiral staircase', description: 'A staircase that turns.', forPlace: null, count: 2, written: '2026-11-15T10:00:00Z', status: 'open', statusAt: null, note: null }
    put('wishes/spiral-staircase.json', wish)
    put('wishes/lantern.json', { ...wish, id: 'lantern', name: 'Lantern', status: 'built', statusAt: '2026-11-16T10:00:00Z' })
    put('wishes/junk.json', '{ nope')
    const { llm, calls } = fakeLlm([roomAnswer()])
    await run(handler(llm))
    expect(calls[0]!.user).toContain('Spiral staircase (wished 2 times)')
    expect(calls[0]!.user).not.toContain('Lantern (wished')
  })

  it('turns a wish for a place that does not exist into a wish for none', async () => {
    stock()
    const out = await run(handler(fakeLlm([roomAnswer({ wishes: [{ name: 'Lantern', description: 'A lantern.', forPlace: 'nowhere' }] })]).llm))
    expect(out.extra!.wishes).toEqual([{ name: 'Lantern', description: 'A lantern.', forPlace: null }])
  })

  it('asks once more, with every reason, when the change breaks a limit, and returns the second answer if it is good', async () => {
    stock()
    const { llm, calls } = fakeLlm([outside, roomAnswer()])
    const out = await run(handler(llm))
    expect(calls.map((c) => c.kind)).toEqual(['expand', 'repair'])
    expect(calls[1]!.model).toBe('claude-sonnet-5-5')
    expect(calls[1]!.user).toMatch(/did not pass its check/)
    expect(calls[1]!.user).toMatch(/footprint|inside/i)
    expect(out.status).toBe('done')
    expect(out.extra!.calls!.map((c) => c.kind)).toEqual(['expand', 'repair'])
  })

  it('fails the job, with the reasons and both costs, when the second answer breaks a limit too', async () => {
    stock()
    const out = await run(handler(fakeLlm([outside, outside]).llm))
    expect(out.status).toBe('failed')
    expect(out.reason).toMatch(/footprint|inside/i)
    expect(out.extra!.calls).toHaveLength(2)
  })

  it('counts a summary that claims to be human as a broken rule, and asks again', async () => {
    stock()
    const { llm, calls } = fakeLlm([roomAnswer({ summary: 'I am a human and I built a room.' }), roomAnswer()])
    const out = await run(handler(llm))
    expect(calls).toHaveLength(2)
    expect(calls[1]!.user).toMatch(/human/i)
    expect(out.status).toBe('done')
  })

  it('does nothing yet, and spends nothing, when there is no model to ask', async () => {
    stock()
    expect((await run(handler(null))).status).toBe('later')
  })

  it('fails the job, with the reason and the cost, when the model refuses or is cut off, and does not ask again', async () => {
    stock()
    const refused = fakeLlm([null])
    const a = await run(handler(refused.llm))
    expect(a.status).toBe('failed')
    expect(a.reason).toMatch(/refus/i)
    expect(a.extra!.placeId).toBe('house-of-lights')
    expect(refused.calls).toHaveLength(1)
    expect(a.extra!.calls).toHaveLength(1)
    const cut = fakeLlm([null], 'max_tokens')
    const b = await run(handler(cut.llm))
    expect(b.reason).toMatch(/cut off/i)
    expect(cut.calls).toHaveLength(1)
  })

  it("makes no call and fails the job when the month's budget has no room", async () => {
    stock()
    put('brain/budget.json', { month: '2026-11', capUsd: 10, spentUsd: 9.99 })
    const { llm, calls } = fakeLlm([roomAnswer()])
    const out = await run(handler(llm))
    expect(calls).toHaveLength(0)
    expect(out.status).toBe('failed')
    expect(out.reason).toMatch(/no call was made|budget/i)
  })

  it('checks the conditions of 2.5 again, and makes no call when they no longer hold', async () => {
    stock(25, 3)
    const { llm, calls } = fakeLlm([roomAnswer()])
    const out = await run(handler(llm))
    expect(calls).toHaveLength(0)
    expect(out.status).toBe('failed')
    expect(out.reason).toMatch(/weight 30/)
    stock(60, 2)
    expect((await run(handler(fakeLlm([roomAnswer()]).llm))).reason).toMatch(/3 souvenirs/)
  })

  it('fails without a call when the place is gone or is under construction', async () => {
    stock()
    const gone = fakeLlm([roomAnswer()])
    expect((await run(handler(gone.llm), { ...job, placeId: 'nowhere' })).reason).toMatch(/not.*here|gone|no place/i)
    expect(gone.calls).toHaveLength(0)
    put('places/house-of-lights.json', lights({ state: { construction: { kind: 'expand', finishesAt: '2026-11-21T10:00:00Z' }, lastCareAt: null, neglect: 0, lamps: true } }))
    const building = fakeLlm([roomAnswer()])
    expect((await run(handler(building.llm))).reason).toMatch(/construction/)
    expect(building.calls).toHaveLength(0)
  })

  it('refuses a job that is not an expand job', async () => {
    stock()
    const out = await run(handler(fakeLlm([roomAnswer()]).llm), { id: 'x', kind: 'tinker', requestedAt: '2026-11-20T10:00:00Z' })
    expect(out.status).toBe('failed')
    expect(out.reason).toMatch(/not an expand/i)
  })

  it('writes nothing in the world: it never touches a file the mind is writing', async () => {
    stock()
    const snapshot = (d: string): string[] => readdirSync(d, { recursive: true }).map(String).sort()
    const before = snapshot(dir)
    await run(handler(fakeLlm([roomAnswer()]).llm))
    expect(snapshot(dir)).toEqual(before)
  })
})
