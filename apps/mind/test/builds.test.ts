import { describe, expect, it } from 'vitest'
import { BUILD_EXPIRES_HOURS, MindState } from '@forkling/schema'
import { buildIdFor, checkBuildRequest, codeSlotsLeft, settleOpenBuild, settleOpenCode, weekOf } from '../src/builds.ts'

const today = '2026-11-03'
const nowMs = Date.parse('2026-11-03T12:00:00Z')
const open = (hoursAgo: number) => ({ id: 'clay-shelf', kind: 'object' as const, requestedAt: new Date(nowMs - hoursAgo * 3_600_000).toISOString() })
const openCode = (hoursAgo: number) => ({ id: 'gate-toy', kind: 'code' as const, requestedAt: new Date(nowMs - hoursAgo * 3_600_000).toISOString() })

describe('checkBuildRequest', () => {
  const ok = { state: MindState.parse({}), today, asleep: false, canAfford: true }

  it('lets it ask for one build when nothing stands in the way', () => {
    expect(checkBuildRequest(ok)).toEqual({ ok: true })
  })

  it('allows one a day, and again tomorrow', () => {
    const used = MindState.parse({ builds: { date: today, count: 1 } })
    expect(checkBuildRequest({ ...ok, state: used })).toMatchObject({ ok: false, reason: expect.stringMatching(/one a day/) })
    expect(checkBuildRequest({ ...ok, state: used, today: '2026-11-04' })).toEqual({ ok: true })
  })

  it('waits for the one that is still open', () => {
    const state = MindState.parse({ openBuild: open(2) })
    expect(checkBuildRequest({ ...ok, state })).toMatchObject({ ok: false, reason: expect.stringMatching(/still waiting/) })
  })

  it('does not ask in its sleep, or when the month\'s money is spent', () => {
    expect(checkBuildRequest({ ...ok, asleep: true })).toMatchObject({ ok: false })
    expect(checkBuildRequest({ ...ok, canAfford: false })).toMatchObject({ ok: false, reason: expect.stringMatching(/budget/) })
  })
})

describe('settleOpenBuild', () => {
  it('has nothing to do without an open build', () => {
    expect(settleOpenBuild(MindState.parse({}), new Set(), nowMs)).toEqual({ outcome: null, openBuild: null })
  })

  it('keeps waiting while the object has not turned up', () => {
    const state = MindState.parse({ openBuild: open(5) })
    expect(settleOpenBuild(state, new Set(['bed']), nowMs)).toEqual({ outcome: 'waiting', openBuild: state.openBuild })
  })

  it('closes when the object is in the world', () => {
    const state = MindState.parse({ openBuild: open(5) })
    expect(settleOpenBuild(state, new Set(['bed', 'clay-shelf']), nowMs)).toEqual({ outcome: 'arrived', openBuild: null })
  })

  it('gives up after a few days', () => {
    const state = MindState.parse({ openBuild: open(BUILD_EXPIRES_HOURS + 1) })
    expect(settleOpenBuild(state, new Set(), nowMs)).toEqual({ outcome: 'expired', openBuild: null })
  })

  it('counts arrival ahead of expiry', () => {
    const state = MindState.parse({ openBuild: open(BUILD_EXPIRES_HOURS + 1) })
    expect(settleOpenBuild(state, new Set(['clay-shelf']), nowMs).outcome).toBe('arrived')
  })
})

describe('buildIdFor', () => {
  it('makes a file name from the name, different from everything taken', () => {
    expect(buildIdFor('A Clay Shelf!', new Set())).toBe('a-clay-shelf')
    expect(buildIdFor('A Clay Shelf!', new Set(['a-clay-shelf']))).toBe('a-clay-shelf-2')
  })

  it('falls back on something when the name has no letters', () => {
    expect(buildIdFor('???', new Set())).toBe('object')
  })
})

describe('weekOf', () => {
  it('is the ISO week of a local date', () => {
    expect(weekOf('2026-11-03')).toBe('2026-W45')
    expect(weekOf('2026-11-01')).toBe('2026-W44')
    expect(weekOf('2026-11-02')).toBe('2026-W45')
  })

  it('puts the end of December in the week of the year it belongs to', () => {
    expect(weekOf('2026-12-31')).toBe('2026-W53')
    expect(weekOf('2027-01-01')).toBe('2026-W53')
    expect(weekOf('2027-01-04')).toBe('2027-W01')
  })
})

describe('coded projects', () => {
  const ok = { state: MindState.parse({}), today, asleep: false, canAfford: true }

  it('allows two a week and starts again the next week', () => {
    const used = MindState.parse({ codeWeek: { week: '2026-W45', count: 2 } })
    expect(codeSlotsLeft(used, '2026-11-03')).toBe(0)
    expect(codeSlotsLeft(used, '2026-11-09')).toBe(2)
    expect(codeSlotsLeft(MindState.parse({ codeWeek: { week: '2026-W45', count: 1 } }), '2026-11-03')).toBe(1)
    expect(codeSlotsLeft(MindState.parse({}), '2026-11-03')).toBe(2)
  })

  it('has no slot while another coded project waits for a person, but an object build does not take it', () => {
    expect(codeSlotsLeft(MindState.parse({ openCode: openCode(2) }), '2026-11-03')).toBe(0)
    expect(codeSlotsLeft(MindState.parse({ openBuild: open(2) }), '2026-11-03')).toBe(2)
  })

  it('is checked by the week and not by the day', () => {
    const dayUsed = MindState.parse({ builds: { date: today, count: 1 }, codeWeek: { week: '2026-W45', count: 1 } })
    expect(checkBuildRequest({ ...ok, state: dayUsed, kind: 'code' })).toEqual({ ok: true })
    const weekUsed = MindState.parse({ codeWeek: { week: '2026-W45', count: 2 } })
    expect(checkBuildRequest({ ...ok, state: weekUsed, kind: 'code' })).toMatchObject({ ok: false, reason: expect.stringMatching(/two a week/) })
  })

  it('still waits for its own open project, and never asks asleep or past the budget', () => {
    expect(checkBuildRequest({ ...ok, state: MindState.parse({ openCode: openCode(2) }), kind: 'code' }).ok).toBe(false)
    expect(checkBuildRequest({ ...ok, asleep: true, kind: 'code' }).ok).toBe(false)
    expect(checkBuildRequest({ ...ok, canAfford: false, kind: 'code' }).ok).toBe(false)
  })

  it('settles a code build when its artifact is there', () => {
    const state = MindState.parse({ openCode: openCode(1) })
    expect(settleOpenCode(state, new Set(['gate-toy']), nowMs, false).outcome).toBe('arrived')
  })
})

describe('an object build and a coded project at the same time', () => {
  const ok = { state: MindState.parse({}), today, asleep: false, canAfford: true }

  it('are separate: each blocks only its own kind', () => {
    const objectOpen = MindState.parse({ openBuild: open(2) })
    expect(checkBuildRequest({ ...ok, state: objectOpen, kind: 'object' }).ok).toBe(false)
    expect(checkBuildRequest({ ...ok, state: objectOpen, kind: 'code' })).toEqual({ ok: true })
    const codeOpen = MindState.parse({ openCode: openCode(2) })
    expect(checkBuildRequest({ ...ok, state: codeOpen, kind: 'code' }).ok).toBe(false)
    expect(checkBuildRequest({ ...ok, state: codeOpen, kind: 'object' })).toEqual({ ok: true })
  })
})

describe('settleOpenCode', () => {
  it('has nothing to do without an open project', () => {
    expect(settleOpenCode(MindState.parse({}), new Set(), nowMs, false)).toEqual({ outcome: null, openCode: null })
  })

  it('gives up after a few days when the builder never answered', () => {
    const state = MindState.parse({ openCode: openCode(BUILD_EXPIRES_HOURS + 1) })
    expect(settleOpenCode(state, new Set(), nowMs, false)).toEqual({ outcome: 'expired', openCode: null })
  })

  it('never gives up on a pull request that is waiting for a person to read it', () => {
    const state = MindState.parse({ openCode: openCode(BUILD_EXPIRES_HOURS * 10) })
    expect(settleOpenCode(state, new Set(), nowMs, true)).toEqual({ outcome: 'waiting', openCode: state.openCode })
  })

  it('notices the project when the pull request is merged, however long that took', () => {
    const state = MindState.parse({ openCode: openCode(BUILD_EXPIRES_HOURS * 10) })
    expect(settleOpenCode(state, new Set(['gate-toy']), nowMs, true)).toEqual({ outcome: 'arrived', openCode: null })
  })
})
