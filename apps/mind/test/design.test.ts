import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { BudgetLedger, MindState, WorldObject, type BuildRequest } from '@forkling/schema'
import { heightAt, starterIsland } from '@forkling/sim'
import { objectFromDesign, placeDesigned, runDesign, type DesignOutput } from '../src/design.ts'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { noBatch } from './noBatch.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const world = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')

const request: BuildRequest = { id: 'clay-shelf', kind: 'object', name: 'A clay shelf', purpose: 'Somewhere to keep my cups.', requestedAt: '2026-11-03T10:00:00Z' }
const NOW = new Date('2026-11-03T12:00:00Z')

const output = (extra: Partial<DesignOutput> = {}): DesignOutput => ({
  name: 'A clay shelf',
  kind: 'shelf',
  parts: [
    { shape: 'box', size: [1.2, 0.08, 0.4], at: [0, 0.6, 0], color: '#b5651d' },
    { shape: 'box', size: [0.08, 0.6, 0.4], at: [-0.55, 0.3, 0], color: '#a0522d' },
    { shape: 'box', size: [0.08, 0.6, 0.4], at: [0.55, 0.3, 0], color: '#a0522d' },
  ],
  weightKg: 12,
  carryable: false,
  soft: false,
  canHide: false,
  high: false,
  storage: true,
  material: 'clay',
  unlocks: [],
  reason: 'My cups keep ending up on the floor.',
  prTitle: 'A shelf for my cups',
  prBody: 'I drew a shelf. It is three boards of clay.',
  ...extra,
})

let dir: string
const file = (rel: string) => join(dir, rel)
const objects = (): WorldObject[] => readdirSync(file('objects')).map((f) => WorldObject.parse(JSON.parse(readFileSync(file(`objects/${f}`), 'utf8'))))

describe('placeDesigned', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'design-'))
    mkdirSync(file('objects'))
    for (const f of readdirSync(join(world, 'objects'))) copyFileSync(join(world, 'objects', f), file(`objects/${f}`))
  })

  it('puts it on dry land near home, clear of everything else', () => {
    const all = objects()
    const home = all.find((o) => o.id === 'house')!.position
    const [x, , z] = placeDesigned(all, [home[0], home[2]], 'clay-shelf')!
    expect(heightAt(x, z, starterIsland)).toBeGreaterThan(starterIsland.waterLevel + 0.5)
    expect(Math.hypot(x - home[0], z - home[2])).toBeLessThan(14)
    for (const o of all) expect(Math.hypot(x - o.position[0], z - o.position[2]), o.id).toBeGreaterThanOrEqual(2.5)
  })

  it('is the same every time for the same name, and differs by name', () => {
    const all = objects()
    const home: [number, number] = [0, 0]
    expect(placeDesigned(all, home, 'a')).toEqual(placeDesigned(all, home, 'a'))
    expect(placeDesigned(all, home, 'a')).not.toEqual(placeDesigned(all, home, 'zzz'))
  })
})

describe('objectFromDesign', () => {
  const ctx = () => ({ pack: cat.pack, objects: [] as WorldObject[], home: [0, 0] as [number, number], nowIso: NOW.toISOString(), skill: 0 })

  it('makes a valid object from a sound design, under the id of the request', () => {
    const o = objectFromDesign(output(), request, ctx())!
    expect(WorldObject.safeParse(o).success).toBe(true)
    expect(o).toMatchObject({ id: 'clay-shelf', kind: 'shelf', name: 'A clay shelf', reason: 'My cups keep ending up on the floor.' })
    expect(o.properties).toMatchObject({ storage: true, material: 'clay', carryable: false })
    expect('parts' in o.model && o.model.parts).toHaveLength(3)
  })

  it('measures its size from its parts, not from what the model claims', () => {
    const o = objectFromDesign(output(), request, ctx())!
    expect(o.properties.size).toBeGreaterThan(1)
    expect(o.properties.size).toBeLessThanOrEqual(3)
  })

  it('forces parts into range: at most 24, sizes and places limited, colours valid', () => {
    const many = Array.from({ length: 40 }, () => ({ shape: 'sphere' as const, size: [50, 0, -3] as [number, number, number], at: [99, 99, -99] as [number, number, number], color: 'red' }))
    const o = objectFromDesign(output({ parts: many }), request, ctx())!
    const parts = 'parts' in o.model ? o.model.parts : []
    expect(parts).toHaveLength(24)
    for (const p of parts) {
      expect(Math.max(...p.size)).toBeLessThanOrEqual(3)
      expect(Math.min(...p.size)).toBeGreaterThan(0)
      expect(Math.abs(p.at[0])).toBeLessThanOrEqual(3)
      expect(p.at[1]).toBeGreaterThanOrEqual(0)
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
    expect(o.properties.size).toBeLessThanOrEqual(3)
  })

  it('refuses a design with nothing to draw', () => {
    expect(objectFromDesign(output({ parts: [] }), request, ctx())).toBeNull()
  })

  it('only lets a heavy thing stay put: carryable needs it to be light', () => {
    expect(objectFromDesign(output({ carryable: true, weightKg: 200 }), request, ctx())!.properties.carryable).toBe(false)
    expect(objectFromDesign(output({ carryable: true, weightKg: 2 }), request, ctx())!.properties.carryable).toBe(true)
  })

  it('keeps only the unlocks that are verbs the pack takes at a place', () => {
    const o = objectFromDesign(output({ unlocks: ['write', 'fly', 'go_to', 'read', 'sleep', 'cook', 'draw'] }), request, ctx())!
    expect(o.unlocks).toEqual(['write', 'read', 'cook', 'draw'])
  })

  it('does not trust the kind: a made-up kind becomes a plain word', () => {
    expect(objectFromDesign(output({ kind: 'Evil Kind!!' }), request, ctx())!.kind).toBe('evil-kind')
    expect(objectFromDesign(output({ kind: '???' }), request, ctx())!.kind).toBe('made')
  })

  it('cuts the words to fit', () => {
    const o = objectFromDesign(output({ name: 'n'.repeat(100), reason: 'r'.repeat(500) }), request, ctx())!
    expect(o.name.length).toBeLessThanOrEqual(60)
    expect(o.reason.length).toBeLessThanOrEqual(200)
  })

  it('has nowhere to put it when everything around is taken', () => {
    const crowd = Array.from({ length: 30 }, (_, i) =>
      WorldObject.parse({ id: `o${i}`, kind: 'x', name: 'x', position: [Math.cos(i) * 40, 0, Math.sin(i) * 40], model: { parts: [{ shape: 'box', size: [1, 1, 1], at: [0, 0, 0], color: '#888888' }] }, reason: 'x' }),
    )
    // Not an error: something far from home is better than nothing, and a truly full island returns null.
    const full = Array.from({ length: 3000 }, (_, i) =>
      WorldObject.parse({ id: `f${i}`, kind: 'x', name: 'x', position: [(i % 55) * 1.6 - 44, 0, Math.floor(i / 55) * 1.6 - 44], model: { parts: [{ shape: 'box', size: [1, 1, 1], at: [0, 0, 0], color: '#888888' }] }, reason: 'x' }),
    )
    expect(objectFromDesign(output(), request, { ...ctx(), objects: crowd })).not.toBeNull()
    expect(objectFromDesign(output(), request, { ...ctx(), objects: full })).toBeNull()
  })
})

interface Fake extends LlmClient {
  calls: LlmRequest[]
}
function fake(answer: unknown = output()): Fake {
  const calls: LlmRequest[] = []
  return {
    ...noBatch,
    calls,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      return { parsed: answer as T | null, stopReason: 'end_turn', usage: { input: 1200, cacheRead: 0, cacheWrite: 2500, output: 400 } }
    },
  }
}

describe('runDesign', () => {
  const run = (llm: LlmClient | null, over: { dryRun?: boolean; id?: string } = {}) =>
    runDesign(dir, { now: NOW, llm, pack: cat.pack, speciesPersona: cat.persona, id: over.id ?? 'clay-shelf', ...(over.dryRun ? { dryRun: true } : {}) })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'design-run-'))
    copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
    mkdirSync(file('objects'))
    for (const f of readdirSync(join(world, 'objects'))) copyFileSync(join(world, 'objects', f), file(`objects/${f}`))
    mkdirSync(file('mind/builds'), { recursive: true })
    writeFileSync(file('mind/builds/clay-shelf.json'), JSON.stringify(request))
    writeFileSync(file('mind/state.json'), JSON.stringify({ ...MindState.parse({}), openBuild: { id: 'clay-shelf', kind: 'object', requestedAt: request.requestedAt } }))
  })

  it('asks Haiku once, with the request as data, and writes the object it designed', async () => {
    const llm = fake()
    const result = await run(llm)
    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]).toMatchObject({ kind: 'design', model: 'claude-haiku-5-5' })
    expect(llm.calls[0]!.user).toContain('Somewhere to keep my cups.')
    expect(result.ok).toBe(true)
    expect(result.written).toContain('objects/clay-shelf.json')
    expect(WorldObject.parse(JSON.parse(readFileSync(file('objects/clay-shelf.json'), 'utf8'))).name).toBe('A clay shelf')
    expect(result.pr).toEqual({ title: 'A shelf for my cups', body: expect.stringContaining('three boards of clay') })
  })

  it('records the call in the ledger', async () => {
    await run(fake())
    const ledger = BudgetLedger.parse(JSON.parse(readFileSync(file('brain/budget.json'), 'utf8')))
    expect(ledger.calls.map((c) => c.kind)).toEqual(['design'])
  })

  it('writes the words of the pull request without anything that could notify a stranger', async () => {
    const result = await run(fake(output({ prTitle: 'Hi @octocat!\nsecond line', prBody: 'cc @someone and @team/x' })))
    expect(result.pr!.title).not.toContain('@')
    expect(result.pr!.title).not.toContain('\n')
    expect(result.pr!.body).not.toContain('@')
  })

  it('tells the model which verbs a designed place may unlock, and how practised it is', async () => {
    const llm = fake()
    await run(llm)
    expect(llm.calls[0]!.user).toMatch(/write/)
    expect(llm.calls[0]!.user).toMatch(/skill/i)
  })

  it('closes the build when the design is not usable, so it can ask again', async () => {
    const result = await run(fake(output({ parts: [] })))
    expect(result.ok).toBe(false)
    expect(existsSync(file('objects/clay-shelf.json'))).toBe(false)
    expect(MindState.parse(JSON.parse(readFileSync(file('mind/state.json'), 'utf8'))).openBuild).toBeNull()
    expect(readFileSync(file('memory/stream/2026-11-03.jsonl'), 'utf8')).toMatch(/could not be drawn up/)
  })

  it('closes the build when the model gives nothing', async () => {
    const result = await run(fake(null))
    expect(result.ok).toBe(false)
    expect(MindState.parse(JSON.parse(readFileSync(file('mind/state.json'), 'utf8'))).openBuild).toBeNull()
  })

  it('fails on a request that is not there, without writing anything', async () => {
    const result = await run(fake(), { id: 'nope' })
    expect(result.ok).toBe(false)
    expect(result.notes.join(' ')).toMatch(/no request/)
  })

  it('does nothing without credentials, and leaves the build open to be retried', async () => {
    const result = await run(null)
    expect(result.ok).toBe(false)
    expect(result.notes.join(' ')).toMatch(/no credentials/)
    expect(MindState.parse(JSON.parse(readFileSync(file('mind/state.json'), 'utf8'))).openBuild).not.toBeNull()
  })

  it('stops when the budget is spent', async () => {
    mkdirSync(file('brain'), { recursive: true })
    writeFileSync(file('brain/budget.json'), JSON.stringify({ month: '2026-11', capUsd: 10, spentUsd: 10, calls: [], history: [] }))
    const llm = fake()
    const result = await run(llm)
    expect(llm.calls).toHaveLength(0)
    expect(result.ok).toBe(false)
    expect(result.notes.join(' ')).toMatch(/budget/)
  })

  it('writes nothing in a dry run', async () => {
    const llm = fake()
    const result = await run(llm, { dryRun: true })
    expect(llm.calls).toHaveLength(0)
    expect(result.written).toEqual([])
    expect(existsSync(file('objects/clay-shelf.json'))).toBe(false)
  })
})
