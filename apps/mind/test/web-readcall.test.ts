import { describe, expect, it } from 'vitest'
import { Interests } from '@forkling/schema'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { ALLOWLIST } from '../src/web/allowlist.ts'
import type { Fetcher } from '../src/web/fetch.ts'
import type { Item } from '../src/web/item.ts'
import { performRead, pictureOf } from '../src/web/readcall.ts'
import type { ReadAnswer } from '../src/web/read.ts'
import { HOST_PLANS, planFor } from '../src/web/starts.ts'

const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ')
const item = (over: Partial<Item> = {}): Item => ({ source: 'en.wikipedia.org', kind: 'page', tier: 'reference', url: 'https://en.wikipedia.org/wiki/X', title: 'X', text: `The lamp was lit at four. ${words(400)}`, links: [{ title: 'A', url: 'https://en.wikipedia.org/wiki/A' }], images: [], ...over })
const good: ReadAnswer = { reaction: 'Huh.', topics: ['lamps'], interest: 7, souvenir: { kind: 'quote', content: 'The lamp was lit at four.', evidence: '', why: 'It stayed.', picture: null }, next: 1, look: null }

function fakeLlm(answer: ReadAnswer | null | Error) {
  const seen: LlmRequest[] = []
  const llm: LlmClient = {
    complete: async (req) => {
      seen.push(req as LlmRequest)
      if (answer instanceof Error) throw answer
      return { parsed: answer as never, usage: { input: 3000, cacheRead: 0, cacheWrite: 0, output: 200 }, stopReason: 'end_turn' }
    },
    submitBatch: async () => 'b',
    fetchBatch: async () => ({ status: 'pending' }),
  }
  return { llm, seen }
}

const noFetch = { bytes: async () => { throw new Error('no network') } } as unknown as Fetcher
const deps = (llm: LlmClient | null, over: object = {}) => ({ llm, fetcher: noFetch, seed: 'You are Merge.', purpose: 'wander', interests: Interests.parse({}), ...over })

describe('performRead', () => {
  it('asks Haiku at low effort with the seed first and the page in a data block, and judges the souvenir in code', async () => {
    const { llm, seen } = fakeLlm(good)
    const out = await performRead(deps(llm), item())
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ kind: 'read', model: 'claude-haiku-5-5', effort: 'low', maxTokens: 1200 })
    expect(seen[0]!.system.startsWith('You are Merge.')).toBe(true)
    expect(seen[0]!.user).toContain('<page title="X"')
    expect(out.answer).toEqual(good)
    expect(out.souvenir.kept).toMatchObject({ kind: 'quote', content: 'The lamp was lit at four.' })
    expect(out.usd).toBeGreaterThan(0)
  })

  it('does not trust a souvenir the page does not hold', async () => {
    const { llm } = fakeLlm({ ...good, souvenir: { ...good.souvenir!, content: 'Never said.' } })
    expect((await performRead(deps(llm), item())).souvenir.dropped).toMatch(/not found word for word/)
  })

  it('skips an unreadable item, or one read lately, without any model call', async () => {
    const { llm, seen } = fakeLlm(good)
    const short = await performRead(deps(llm), item({ text: words(50) }))
    expect(short).toMatchObject({ answer: null, skipped: expect.stringContaining('under 300 words'), usd: 0 })
    const lately = await performRead(deps(llm, { readRecently: () => true }), item())
    expect(lately.skipped).toMatch(/30 days/)
    expect(seen).toHaveLength(0)
  })

  it('makes no call without a model or past the budget, and survives a failing or empty call', async () => {
    expect((await performRead(deps(null), item())).note).toBe('no model')
    const { llm, seen } = fakeLlm(good)
    expect((await performRead(deps(llm, { mayCall: () => false }), item())).note).toBe('over the budget')
    expect(seen).toHaveLength(0)
    expect((await performRead(deps(fakeLlm(new Error('overloaded')).llm), item())).note).toMatch(/call failed: overloaded/)
    expect((await performRead(deps(fakeLlm(null).llm), item())).note).toMatch(/no usable answer/)
  })

  it('shows a record its picture only when asked to (a look is the usual way), and reads on without one', async () => {
    const jpeg = { bytes: async () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg', url: 'u' }) } as unknown as Fetcher
    const record = item({ kind: 'record', text: words(60), images: [{ url: 'https://i.imgflip.com/a.jpg', licence: null, credit: null }] })
    const withPic = fakeLlm(good)
    await performRead(deps(withPic.llm, { fetcher: jpeg, showPicture: true }), record)
    expect(withPic.seen[0]!.images).toEqual([{ mediaType: 'image/jpeg', base64: 'AQID' }])
    expect(withPic.seen[0]!.user).toContain('Its picture is shown above')
    const without = fakeLlm(good)
    await performRead(deps(without.llm, { fetcher: jpeg }), record)
    expect(without.seen[0]!.images).toEqual([])
    expect(await pictureOf(noFetch, item())).toBeNull()
    const svg = { bytes: async () => ({ bytes: new Uint8Array([1]), contentType: 'image/svg+xml', url: 'u' }) } as unknown as Fetcher
    expect(await pictureOf(svg, record)).toBeNull()
  })
})

describe('the trial hosts', () => {
  it('have a plan for every page and record host on the allowlist, each with paths for robots.txt', () => {
    // Manual hosts are for tinker only, and were trialled in W2 (docs/spec/w2-trials/); the plans here are for wander trips.
    const readable = ALLOWLIST.filter((h) => h.kind !== 'image' && !h.verbs).map((h) => h.host)
    expect(HOST_PLANS.map((p) => p.host).sort()).toEqual([...readable].sort())
    for (const plan of HOST_PLANS) expect(plan.paths.length, plan.host).toBeGreaterThan(0)
  })

  it('find a plan by the host of the API or of the items', () => {
    expect(planFor('api.github.com')).toBe(planFor('github.com'))
    expect(planFor('api.artic.edu')!.itemHost).toBe('www.artic.edu')
    expect(planFor('example.com')).toBeUndefined()
  })
})
