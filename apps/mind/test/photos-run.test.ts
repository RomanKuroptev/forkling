import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Artifact, BudgetLedger, MindState, type PhotoShot } from '@forkling/schema'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { runPhotos } from '../src/photos.ts'
import { loadSpecies } from '../src/species.ts'
import { noBatch } from './noBatch.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const world = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')

const NOW = new Date('2026-11-03T12:30:00Z')
const DAY = '2026-11-03'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9])

const shot = (id: string, extra: Partial<PhotoShot> = {}): PhotoShot => ({
  id,
  at: '2026-11-03T12:00:00Z',
  eye: [1, 0.3, 2],
  look: [3, 0.5, 4],
  why: 'photograph',
  reason: 'I want to keep how this looks.',
  goalRef: 'today:2',
  ...extra,
})

interface Fake extends LlmClient {
  calls: LlmRequest[]
}
function fake(answer: unknown = { title: 'The Bowl', caption: 'A white bowl on grass.', opinion: 'It is my favourite thing.' }): Fake {
  const calls: LlmRequest[] = []
  return {
    ...noBatch,
    calls,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      return { parsed: answer as T | null, stopReason: 'end_turn', usage: { input: 900, cacheRead: 0, cacheWrite: 2000, output: 80 } }
    },
  }
}

let dir: string
let frames: string
const file = (rel: string) => join(dir, rel)
const readJson = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))
const queue = (...shots: PhotoShot[]) => {
  mkdirSync(file('mind'), { recursive: true })
  writeFileSync(file('mind/state.json'), JSON.stringify({ ...MindState.parse({}), photos: { date: DAY, count: shots.length, queue: shots } }))
}
const frame = (id: string, bytes: Buffer = JPEG) => writeFileSync(join(frames, `${id}.jpg`), bytes)
const run = (llm: LlmClient | null, over: { dryRun?: boolean } = {}) =>
  runPhotos(dir, { now: NOW, llm, pack: cat.pack, speciesPersona: cat.persona, framesDir: frames, ...over })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'photos-run-'))
  frames = mkdtempSync(join(tmpdir(), 'frames-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(world, 'objects'))) copyFileSync(join(world, 'objects', f), file(`objects/${f}`))
  for (const f of readdirSync(join(merge, 'objects'))) copyFileSync(join(merge, 'objects', f), file(`objects/${f}`))
})

describe('runPhotos', () => {
  it('shows the model the frame, and keeps the frame and what it said about it', async () => {
    queue(shot('bowl', { subjectId: 'bowl' }))
    frame('bowl')
    const llm = fake()
    const result = await run(llm)

    expect(llm.calls).toHaveLength(1)
    const call = llm.calls[0]!
    expect(call).toMatchObject({ kind: 'vision', model: 'claude-haiku-5-5' })
    expect(call.images).toEqual([{ mediaType: 'image/jpeg', base64: JPEG.toString('base64') }])
    expect(call.system).toContain(cat.persona.trim().slice(0, 40))
    expect(call.user).toContain('I want to keep how this looks.')

    expect(readFileSync(file('art/photos/bowl.jpg')).equals(JPEG)).toBe(true)
    const a = Artifact.parse(readJson('art/bowl.json'))
    expect(a).toMatchObject({
      id: 'bowl',
      kind: 'photo',
      title: 'The Bowl',
      goalRef: 'today:2',
      content: { image: 'photos/bowl.jpg', caption: 'A white bowl on grass.', opinion: 'It is my favourite thing.', subjectId: 'bowl', noticed: false },
    })
    expect(result.written).toEqual(expect.arrayContaining(['art/bowl.json', 'art/photos/bowl.jpg']))
    expect(result.made).toBe(1)
  })

  it('writes what it saw into the day\'s stream, where the bedtime reflection can cite it', async () => {
    queue(shot('bowl', { subjectId: 'bowl' }))
    frame('bowl')
    await run(fake())
    const lines = readFileSync(file(`memory/stream/${DAY}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ kind: 'seen', verb: 'photograph', objectId: 'bowl', id: `${DAY}#1` })
    expect(lines[0].text).toContain('A white bowl on grass.')
  })

  it('marks a photo as noticed when nothing asked for it', async () => {
    queue(shot('gift', { why: 'noticed', subjectId: 'bowl' }))
    frame('gift')
    await run(fake())
    const a = Artifact.parse(readJson('art/gift.json'))
    expect(a.kind === 'photo' && a.content.noticed).toBe(true)
  })

  it('records the call in the ledger and empties the queue, keeping the count', async () => {
    queue(shot('bowl'), shot('view'))
    frame('bowl')
    frame('view')
    const result = await run(fake())
    expect(result.made).toBe(2)
    const ledger = BudgetLedger.parse(readJson('brain/budget.json'))
    expect(ledger.calls.map((c) => c.kind)).toEqual(['vision', 'vision'])
    expect(ledger.spentUsd).toBeGreaterThan(0)
    expect(result.calls).toHaveLength(2)
    const state = MindState.parse(readJson('mind/state.json'))
    expect(state.photos).toEqual({ date: DAY, count: 2, queue: [] })
  })

  it('drops a shot whose frame never got rendered, without a call', async () => {
    queue(shot('lost'), shot('bowl'))
    frame('bowl')
    const llm = fake()
    const result = await run(llm)
    expect(llm.calls).toHaveLength(1)
    expect(existsSync(file('art/lost.json'))).toBe(false)
    expect(result.notes.join(' ')).toMatch(/lost.*no frame/)
    expect(MindState.parse(readJson('mind/state.json')).photos!.queue).toEqual([])
  })

  it('does not send anything that is not a jpeg, or too big', async () => {
    queue(shot('fake'), shot('huge'))
    frame('fake', Buffer.from('<html>not a picture</html>'))
    frame('huge', Buffer.concat([JPEG.subarray(0, 4), Buffer.alloc(600_000)]))
    const llm = fake()
    const result = await run(llm)
    expect(llm.calls).toHaveLength(0)
    expect(result.made).toBe(0)
    expect(result.notes.join(' ')).toMatch(/fake/)
    expect(result.notes.join(' ')).toMatch(/huge/)
  })

  it('makes nothing when the model gives nothing usable', async () => {
    queue(shot('bowl'))
    frame('bowl')
    const result = await run(fake(null))
    expect(result.made).toBe(0)
    expect(existsSync(file('art/bowl.json'))).toBe(false)
    expect(existsSync(file('art/photos/bowl.jpg'))).toBe(false)
  })

  it('has nothing to say without credentials, and says so', async () => {
    queue(shot('bowl'))
    frame('bowl')
    const result = await run(null)
    expect(result.made).toBe(0)
    expect(result.notes.join(' ')).toMatch(/no credentials/)
    expect(MindState.parse(readJson('mind/state.json')).photos!.queue).toEqual([])
  })

  it('stops when the month\'s budget is spent', async () => {
    queue(shot('bowl'))
    frame('bowl')
    mkdirSync(file('brain'), { recursive: true })
    writeFileSync(file('brain/budget.json'), JSON.stringify({ month: '2026-11', capUsd: 10, spentUsd: 10, calls: [], history: [] }))
    const llm = fake()
    const result = await run(llm)
    expect(llm.calls).toHaveLength(0)
    expect(result.notes.join(' ')).toMatch(/budget/)
  })

  it('changes nothing in a dry run', async () => {
    queue(shot('bowl'))
    frame('bowl')
    const llm = fake()
    const result = await run(llm, { dryRun: true })
    expect(llm.calls).toHaveLength(0)
    expect(result.written).toEqual([])
    expect(existsSync(file('art'))).toBe(false)
    expect(MindState.parse(readJson('mind/state.json')).photos!.queue).toHaveLength(1)
  })

  it('does nothing when no shots are waiting', async () => {
    const llm = fake()
    const result = await run(llm)
    expect(llm.calls).toHaveLength(0)
    expect(result.written).toEqual([])
  })
})
