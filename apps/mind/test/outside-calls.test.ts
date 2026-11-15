import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BudgetLedger, type BudgetCall } from '@forkling/schema'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')
const NOW = new Date('2026-11-16T09:00:00Z')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outside-'))
  copyFileSync(join(templates, 'forkling.json'), join(dir, 'forkling.json'))
  mkdirSync(join(dir, 'objects'))
  for (const f of readdirSync(join(templates, 'objects'))) copyFileSync(join(templates, 'objects', f), join(dir, 'objects', f))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const screening = (usd: number): BudgetCall => ({ at: '2026-11-16T08:59:00.000Z', kind: 'screen', model: 'claude-haiku-5-5', input: 600, cacheRead: 0, cacheWrite: 0, output: 40, usd })
const ledger = () => BudgetLedger.parse(JSON.parse(readFileSync(join(dir, 'brain/budget.json'), 'utf8')))
const deps = (over: Record<string, unknown> = {}) => ({ now: NOW, llm: null, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona, ...over })

describe('calls made outside a tick (a note screened by the server) are booked by the next tick', () => {
  it('puts them in the ledger under their own kind, once, and counts them in the month\'s spend', async () => {
    let handed = false
    const outsideCalls = () => (handed ? [] : ((handed = true), [screening(0.0001), screening(0.0002)]))
    await runTick(dir, deps({ outsideCalls }))
    expect(ledger().byKind.screen).toMatchObject({ calls: 2 })
    expect(ledger().spentUsd).toBeCloseTo(0.0003)
    await runTick(dir, deps({ outsideCalls, now: new Date(NOW.getTime() + 600_000) }))
    expect(ledger().byKind.screen).toMatchObject({ calls: 2 })
  })

  it('leaves them where they are in a dry run, so nothing is lost', async () => {
    let asked = 0
    await runTick(dir, deps({ dryRun: true, outsideCalls: () => (asked++, [screening(0.1)]) }))
    expect(asked).toBe(0)
  })

  it('a tick with none changes nothing', async () => {
    await runTick(dir, deps({ outsideCalls: () => [] }))
    expect(existsSync(join(dir, 'brain/budget.json')) ? ledger().byKind.screen : undefined).toBeUndefined()
  })
})
