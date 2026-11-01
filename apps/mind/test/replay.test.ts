import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Forkling, Goals, WorldObject } from '@forkling/schema'
import { formatReplay, replay, type ReplayState } from '../src/replay.ts'
import { loadSpecies } from '../src/species.ts'

const cat = loadSpecies('cat')
const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const read = (rel: string) => JSON.parse(readFileSync(`${templates}/${rel}`, 'utf8'))
const objects = ['sunny-rock', 'tall-rock'].map((id) => WorldObject.parse(read(`objects/${id}.json`)))

const T0 = Date.parse('2026-11-03T09:00:00Z')
const iso = (min: number) => new Date(T0 + min * 60_000).toISOString()

function state(atMin: number, over: Partial<Forkling> = {}, goals: unknown = {}): ReplayState {
  return {
    atMs: T0 + atMin * 60_000,
    forkling: Forkling.parse({ ...read('forkling.json'), lastTickAt: iso(atMin), intention: { type: 'sit', startedAt: iso(atMin), seed: 3, reason: 'Resting.' }, ...over }),
    goals: Goals.parse(goals),
    objects,
  }
}

const planned = {
  today: { date: '2026-11-03', steps: [{ verb: 'explore', reason: 'Look around.', minutes: 60, position: [-10, 5] }], reason: 'A day.' },
  now: { index: 0, startedAt: iso(0), until: iso(60) },
}

const opts = { pack: cat.pack, behaviors: cat.behaviors, fromMs: T0, toMs: T0 + 50 * 60_000, everyMinutes: 10 }

describe('replay', () => {
  const run = replay([state(0, {}, planned)], opts)

  it('rebuilds the body at each moment, as a viewer would see it', () => {
    expect(run.rows).toHaveLength(6)
    expect(run.rows.map((r) => r.atMs)).toEqual([0, 10, 20, 30, 40, 50].map((m) => T0 + m * 60_000))
    for (const row of run.rows) {
      expect(row.verb).toBeTruthy()
      expect(row.needs).toHaveProperty('hunger')
      expect(row.asleep).toBe(false)
    }
  })

  it('is deterministic', () => {
    expect(replay([state(0, {}, planned)], opts)).toEqual(run)
  })

  it('sets the plan step beside what the body did, and counts how often they agree', () => {
    expect(run.rows.every((r) => r.step?.verb === 'explore')).toBe(true)
    expect(run.planRows).toBe(6)
    expect(run.onPlanRows).toBeGreaterThan(0)
    expect(run.onPlanShare).toBeCloseTo(run.onPlanRows / run.planRows, 5)
  })

  it('has no plan share when there was no plan', () => {
    const free = replay([state(0)], opts)
    expect(free.rows.every((r) => r.step === null)).toBe(true)
    expect(free.planRows).toBe(0)
    expect(free.onPlanShare).toBeNull()
  })

  it('ends the plan step when its time is up', () => {
    const late = replay([state(0, {}, planned)], { ...opts, fromMs: T0 + 55 * 60_000, toMs: T0 + 75 * 60_000 })
    expect(late.rows.map((r) => r.step !== null)).toEqual([true, false, false])
  })

  it('uses the latest repo state at or before each moment, and says which one', () => {
    const second = state(25, {}, { ...planned, now: { index: 0, startedAt: iso(25), until: iso(85) } })
    const two = replay([state(0, {}, planned), second], opts)
    expect(two.rows.map((r) => r.stateAtMs)).toEqual([0, 0, 0, 25, 25, 25].map((m) => T0 + m * 60_000))
  })

  it('has nothing to say before the first state', () => {
    const none = replay([state(30)], opts)
    expect(none.rows.map((r) => r.atMs)).toEqual([30, 40, 50].map((m) => T0 + m * 60_000))
  })

  it('counts the rows each need was critical, awake', () => {
    const hungry = replay([state(0, { needs: { hunger: 1, energy: 80, curiosity: 60 } }, planned)], { ...opts, toMs: T0 + 5 * 60_000 })
    expect(hungry.criticalRows.hunger).toBeGreaterThanOrEqual(1)
  })
})

describe('formatReplay', () => {
  it('prints a line per moment and the share of the plan the body did', () => {
    const text = formatReplay(replay([state(0, {}, planned)], opts))
    expect(text.split('\n').filter((l) => /^\d\d:\d\d /.test(l))).toHaveLength(6)
    expect(text).toMatch(/on the plan step in \d+ of 6 moments/)
  })
})
