import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PlaceRequest, formatRequest } from '@forkling/schema'
import { placeNovelty } from '@forkling/sim'
import { placeNudgeInputs } from '../src/ticklog.ts'
import type { Tick } from '../src/tick/context.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nudge-inputs-'))
  mkdirSync(join(dir, 'requests'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const place = (id: string, name: string, chunk: [number, number], purpose = 'Where I keep the lidar finds') => ({ id, name, purpose, founded: '2026-11-18', chunk, state: { lastCareAt: null, closed: null } })
const tick = (places: unknown[]) => ({ dir, today: '2026-11-20', places, sleepOpts: { timezone: 'Europe/Stockholm' } }) as unknown as Tick
const putRequest = (over: Record<string, unknown>) => {
  const r = PlaceRequest.parse({ id: 'lantern-hall', kind: 'place', name: 'Lantern Hall', purpose: 'Where I keep the lidar finds', tags: ['lidar'], chunk: [1, 0], related: [], souvenirs: [], written: '2026-11-17T10:00:00Z', status: 'open', statusAt: null, note: null, body: 'A lamp over each find.', ...over })
  writeFileSync(join(dir, 'requests', `${r.id}.md`), formatRequest(r))
}

describe('the place nudge inputs (spec 12.3)', () => {
  it('carries the chunk of every place and every request', () => {
    putRequest({})
    const input = placeNudgeInputs(tick([place('lantern-hall', 'Lantern Hall', [1, 0])]), [])
    expect(input.places[0]!.chunk).toEqual([1, 0])
    expect(input.requests[0]!.chunk).toEqual([1, 0])
  })

  it('does not count the place built from a request as a repeat of it', () => {
    putRequest({ status: 'built', statusAt: '2026-11-18T10:00:00Z' })
    const places = [place('home', 'Home', [0, 0], 'Where my days start and end'), place('lantern-hall', 'Lantern Hall', [1, 0])]
    const input = placeNudgeInputs(tick(places), [])
    const since = Date.parse('2026-11-13T00:00:00Z')
    expect(placeNovelty({ ...input, nowMs: Date.parse('2026-11-20T12:00:00Z'), sinceMs: since }).repeatedPlace).toBe(0)
    // Without the chunks it would be named: the request and the place share a name.
    const blind = { ...input, requests: input.requests.map(({ chunk: _c, ...r }) => r), places: input.places.map(({ chunk: _c, ...p }) => p) }
    expect(placeNovelty({ ...blind, nowMs: Date.parse('2026-11-20T12:00:00Z'), sinceMs: since }).repeatedPlace).toBeGreaterThan(0)
  })

  it('uses the steps it is given instead of reading the timeline again', () => {
    const steps = [{ at: '2026-11-20T08:00:00Z', verb: 'tend', targetId: 'home' }, { at: '2026-11-20T09:00:00Z', verb: 'wander' }]
    const input = placeNudgeInputs(tick([]), steps)
    expect(input.steps).toEqual([{ at: '2026-11-20T08:00:00Z', verb: 'tend', targetId: 'home' }, { at: '2026-11-20T09:00:00Z', verb: 'wander' }])
  })
})
