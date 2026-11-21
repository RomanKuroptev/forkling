import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { localDate, sleepWindow } from '@forkling/sim'
import { buildHealthResponse, WATCHDOG_WAKE_GRACE_MS } from '../src/health-response.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')
const MIN = 60_000

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'health-'))
  copyFileSync(join(templates, 'forkling.json'), join(dir, 'forkling.json'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const forkling = () => JSON.parse(readFileSync(join(templates, 'forkling.json'), 'utf8')) as { seed: number; timezone: string }
const windowOn = (day: string) => sleepWindow(day, forkling().seed, forkling().timezone)

describe('buildHealthResponse (what GET /health says, and what the watchdog reads)', () => {
  it('before any tick: up, with no last tick or thought and no warnings', () => {
    const r = buildHealthResponse(dir, Date.parse('2026-11-12T09:00:00Z'))
    expect(r).toMatchObject({ up: true, lastTickAt: null, lastThoughtAt: null, warnings: [] })
  })

  it('is asleep and should not be awake in the night', () => {
    const r = buildHealthResponse(dir, Date.parse('2026-11-12T23:30:00Z'))
    expect(r).toMatchObject({ asleep: true, shouldBeAwake: false })
  })

  it('should be awake only once the wake-up grace has passed, so the watchdog is not woken by a thought from last night', () => {
    const { wakeMs } = windowOn('2026-11-12')
    expect(localDate(forkling().timezone, wakeMs)).toBe('2026-11-12')
    expect(buildHealthResponse(dir, wakeMs + 5 * MIN)).toMatchObject({ asleep: false, shouldBeAwake: false })
    expect(buildHealthResponse(dir, wakeMs + WATCHDOG_WAKE_GRACE_MS)).toMatchObject({ asleep: false, shouldBeAwake: true })
    expect(WATCHDOG_WAKE_GRACE_MS).toBe(20 * MIN)
  })

  it('stops being awake at bedtime', () => {
    const { bedMs } = windowOn('2026-11-12')
    expect(buildHealthResponse(dir, bedMs - MIN).shouldBeAwake).toBe(true)
    expect(buildHealthResponse(dir, bedMs + MIN).shouldBeAwake).toBe(false)
  })

  it('reports the last thought from the mind state, and the last tick and warnings from health.json', async () => {
    const at = Date.parse('2026-11-12T09:00:00Z')
    await runTick(dir, { now: new Date(at), llm: null, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona })
    const statePath = join(dir, 'mind/state.json')
    const state = JSON.parse(readFileSync(statePath, 'utf8'))
    mkdirSync(join(dir, 'mind'), { recursive: true })
    writeFileSync(statePath, JSON.stringify({ ...state, thought: { lastAt: '2026-11-12T08:58:00.000Z' } }))
    const r = buildHealthResponse(dir, at + MIN)
    expect(r.lastThoughtAt).toBe('2026-11-12T08:58:00.000Z')
    expect(r.lastTickAt).toBe('2026-11-12T09:00:00.000Z')
    expect(Array.isArray(r.warnings)).toBe(true)
  })

  it('does not fall over on a state file it cannot read', () => {
    mkdirSync(join(dir, 'mind'), { recursive: true })
    writeFileSync(join(dir, 'mind/state.json'), '{ nope')
    expect(buildHealthResponse(dir, Date.parse('2026-11-12T09:00:00Z'))).toMatchObject({ up: true, lastThoughtAt: null })
  })
})

describe('the credit on /health (Roman, 21 Nov)', () => {
  it('is ok with no back-off in the mind state', () => {
    const r = buildHealthResponse(dir, Date.parse('2026-11-12T09:00:00Z'))
    expect(r.credit).toBe('ok')
    expect(r.creditEmptySince).toBeUndefined()
  })

  it('is empty, with since, next try and a warning first, while the mind state holds a back-off', () => {
    mkdirSync(join(dir, 'mind'), { recursive: true })
    writeFileSync(join(dir, 'mind/state.json'), JSON.stringify({ credit: { since: '2026-11-12T08:00:00.000Z', retryAt: '2026-11-12T08:40:00.000Z', waitMs: 40 * MIN } }))
    const r = buildHealthResponse(dir, Date.parse('2026-11-12T08:30:00Z'))
    expect(r).toMatchObject({ credit: 'empty', creditEmptySince: '2026-11-12T08:00:00.000Z', creditRetryAt: '2026-11-12T08:40:00.000Z' })
    expect(r.warnings[0]).toBe('credit empty since 2026-11-12T08:00:00.000Z, next try 2026-11-12T08:40:00.000Z')
  })
})
