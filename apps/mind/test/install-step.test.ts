import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Place, WorkMeta } from '@forkling/schema'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const world = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')
const NOW = '2026-11-13T09:00:00Z'

const idle: LlmClient = {
  ...noBatch,
  async complete<T>(_req: LlmRequest<T>) {
    return { parsed: null as T, stopReason: 'refusal', usage: { input: 1, cacheRead: 0, cacheWrite: 0, output: 1 } }
  },
}
const deps = { now: new Date(NOW), llm: idle, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona }

let dir: string
const file = (rel: string) => join(dir, rel)
const putWork = (id: string, day: number, over: Record<string, unknown> = {}) => {
  mkdirSync(file(`works/${id}`), { recursive: true })
  const meta = WorkMeta.parse({ id, title: id, kind: 'game', about: 'a thing', interest: null, made: `2026-11-${String(day).padStart(2, '0')}T10:00:00Z`, status: 'shelf', size: 'full', ...over })
  writeFileSync(file(`works/${id}/meta.json`), JSON.stringify(meta))
  writeFileSync(file(`works/${id}/index.html`), '<p>hi</p>')
}
const metaOf = (id: string) => WorkMeta.parse(JSON.parse(readFileSync(file(`works/${id}/meta.json`), 'utf8')))
const workshopOf = () => Place.parse(JSON.parse(readFileSync(file('places/workshop.json'), 'utf8')))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'install-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(merge, 'objects'))) copyFileSync(join(merge, 'objects', f), file(`objects/${f}`))
  mkdirSync(file('places'))
  copyFileSync(join(world, 'places/home.json'), file('places/home.json'))
  copyFileSync(join(world, 'places/workshop.json'), file('places/workshop.json'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('works go on the Workshop screens by themselves (no model call)', () => {
  it('puts the newest four works on the four screens, records where, and leaves the older ones to the terminal', async () => {
    for (const [i, id] of ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'].entries()) putWork(id, i + 1)
    const result = await runTick(dir, deps)
    const refs = workshopOf().exhibits.filter((e) => e.kind === 'work').map((e) => e.ref)
    expect(refs.sort()).toEqual(['works/w3', 'works/w4', 'works/w5', 'works/w6'])
    expect(metaOf('w6').installedIn).toMatch(/^workshop\/bench-room\/\d\/0$/)
    expect(metaOf('w1').installedIn).toBeNull()
    expect(result.written).toEqual(expect.arrayContaining(['places/workshop.json', 'works/w6/meta.json']))
    expect(workshopOf().exhibits.some((e) => e.kind === 'gallery')).toBe(true)
  })

  it('writes nothing the next tick when nothing changed', async () => {
    putWork('w1', 1)
    await runTick(dir, deps)
    const again = await runTick(dir, { ...deps, now: new Date('2026-11-13T09:10:00Z') })
    expect(again.written).not.toContain('places/workshop.json')
    expect(again.written).not.toContain('works/w1/meta.json')
  })

  it('takes a work off its screen once it is put away', async () => {
    putWork('w1', 1)
    await runTick(dir, deps)
    putWork('w1', 1, { status: 'retired', retireReason: 'done with it', installedIn: metaOf('w1').installedIn })
    await runTick(dir, { ...deps, now: new Date('2026-11-13T09:10:00Z') })
    expect(workshopOf().exhibits.filter((e) => e.kind === 'work')).toEqual([])
    expect(metaOf('w1').installedIn).toBeNull()
  })

  it('does nothing in a world without places', async () => {
    rmSync(file('places'), { recursive: true })
    putWork('w1', 1)
    const result = await runTick(dir, deps)
    expect(metaOf('w1').installedIn).toBeNull()
    expect(result.written.filter((w) => w.startsWith('places/'))).toEqual([])
  })
})
