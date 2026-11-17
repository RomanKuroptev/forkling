import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MindState, type Tool } from '@forkling/schema'
import { DEFAULT_SEED } from '../src/seed.ts'
import { buildSystem } from '../src/prompts/system.ts'
import { toolStep } from '../src/tick/tools.ts'
import type { Tick } from '../src/tick/context.ts'
import { readWorld } from '../src/world.ts'

const template = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tools-'))
  cpSync(template, dir, { recursive: true })
  copyFileSync(join(merge, 'forkling.json'), join(dir, 'forkling.json'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const tool = (over: Partial<Tool> = {}): Tool => ({ id: 'read-sites', name: 'Read sites', what: 'Read a few web sites.', since: '2026-11-10', class: 'read', gift: false, ...over })
const put = (tools: unknown[]) => {
  mkdirSync(join(dir, 'mind'), { recursive: true })
  writeFileSync(join(dir, 'mind/tools.json'), JSON.stringify({ tools }))
}
const tick = (tools: Tool[], mind: Record<string, unknown> = {}) => ({ w: { tools: { tools } }, nowIso: '2026-11-23T10:00:00.000Z', mind: MindState.parse(mind), remember: [] as Tick['remember'], parts: [] as string[] }) as unknown as Tick

describe('mind/tools.json is read with the world (spec v4 8)', () => {
  it('a world with no file has no tools', () => {
    rmSync(join(dir, 'mind/tools.json'))
    expect(readWorld(dir, () => '2026-11').tools).toEqual({ tools: [] })
  })
  it('the template holds what Merge already has, as plain abilities, all of class read or none of class act', () => {
    const w = readWorld(dir, () => '2026-11')
    expect(w.tools.tools.length).toBeGreaterThan(3)
    expect(w.tools.tools.every((t) => t.class !== 'act')).toBe(true)
    expect(w.tools.tools.map((t) => t.what).join(' ')).toMatch(/web/i)
  })
  it('an entry of class act stops the engine, in plain words naming the entry', () => {
    put([tool(), tool({ id: 'post-things', name: 'Post things', class: 'act' })])
    expect(() => readWorld(dir, () => '2026-11')).toThrow(/post-things/)
    expect(() => readWorld(dir, () => '2026-11')).toThrow(/will not start/i)
  })
  it('a file that does not fit names the file', () => {
    put([{ id: 'x' }])
    expect(() => readWorld(dir, () => '2026-11')).toThrow(/mind\/tools\.json/)
  })
})

describe('the planner is shown what it can do (spec v4 8)', () => {
  it('"things you can do" comes after the verbs and before how planning works, one line each', () => {
    const text = buildSystem({ seed: DEFAULT_SEED, tools: [tool(), tool({ id: 'b', name: 'Look at images', what: 'Look at pictures on pages.' })] })
    const verbs = text.indexOf('## Your ten verbs')
    const things = text.indexOf('## Things you can do')
    const planning = text.indexOf('## How planning works')
    expect(verbs).toBeGreaterThan(-1)
    expect(things).toBeGreaterThan(verbs)
    expect(planning).toBeGreaterThan(things)
    expect(text).toContain('- Read sites: Read a few web sites.')
    expect(text).toContain('- Look at images: Look at pictures on pages.')
  })
  it('is pinned word for word with tools (the golden file is what the reviewer reads)', async () => {
    await expect(buildSystem({ seed: DEFAULT_SEED, tools: [tool(), tool({ id: 'b', name: 'Look at pictures', what: 'Look at pictures on the pages you read.' })] })).toMatchFileSnapshot('golden/system-tools.txt')
  })
  it('without tools the prompt is the same as before', () => {
    expect(buildSystem({ seed: DEFAULT_SEED, tools: [] })).toBe(buildSystem({ seed: DEFAULT_SEED }))
    expect(buildSystem({ seed: DEFAULT_SEED })).not.toContain('Things you can do')
  })
})

describe('a new tool is announced once (spec v4 8)', () => {
  it('a file added later with the abilities Merge already has (old entries) is recorded and announces nothing', () => {
    const t = tick([tool()])
    toolStep(t)
    expect(t.remember).toEqual([])
    expect(t.mind.toolsSeen).toEqual(['read-sites'])
  })
  it('a world with no file: no tools, nothing announced, nothing written to the mind', () => {
    const t = tick([])
    const before = JSON.stringify(t.mind)
    toolStep(t)
    expect(t.remember).toEqual([])
    expect(JSON.stringify(t.mind)).toBe(before)
  })
  it('a tool dated within the last 7 days is announced even when the file has just been added; an older one next to it is not', () => {
    const t = tick([tool(), tool({ id: 'lemmy', name: 'Lemmy', what: 'Read a Lemmy community.', since: '2026-11-22', gift: true })])
    toolStep(t)
    expect(t.remember).toHaveLength(1)
    expect(t.remember[0]!.text).toContain('Read a Lemmy community.')
    expect(t.mind.toolsSeen).toEqual(['read-sites', 'lemmy'])
  })
  it('a tool added later is one stream event of importance 8 with the text Roman wrote, once', () => {
    const first = tick([tool()])
    toolStep(first)
    const later = tick([tool(), tool({ id: 'lemmy', name: 'Lemmy', what: 'Read a Lemmy community.', since: '2026-11-23', gift: true })], { toolsSeen: first.mind.toolsSeen })
    toolStep(later)
    expect(later.remember).toHaveLength(1)
    expect(later.remember[0]).toMatchObject({ kind: 'event', importance: 8 })
    expect(later.remember[0]!.text).toContain('Read a Lemmy community.')
    const again = tick([tool(), tool({ id: 'lemmy', what: 'Read a Lemmy community.' })], { toolsSeen: later.mind.toolsSeen })
    toolStep(again)
    expect(again.remember).toEqual([])
  })
  it('writes nothing to the mind when nothing is new', () => {
    const t = tick([tool()], { toolsSeen: ['read-sites'] })
    const before = JSON.stringify(t.mind)
    toolStep(t)
    expect(JSON.stringify(t.mind)).toBe(before)
  })
})
