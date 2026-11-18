import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Project } from '@forkling/schema'
import { ffmpegAvailable, frameCounts, framePage, makeTimelapse, MAX_SHOTS_SHOWN, pickShots, VIDEO } from '../src/builds/timelapse.ts'

/** Sharing S4: the vertical timelapse of a project. The parts that need no browser and no ffmpeg. */

const total = (shots: number) => {
  const c = frameCounts(shots)
  return (c.perShot.reduce((a, b) => a + b, 0) + c.address) / VIDEO.fps
}

describe('frameCounts: 15 to 30 seconds, the address on the last second', () => {
  it('is 15 seconds for a few screenshots and 30 for many, with every screenshot shown', () => {
    expect(total(1)).toBe(15)
    expect(total(3)).toBe(15)
    expect(total(12)).toBe(24)
    expect(total(MAX_SHOTS_SHOWN)).toBe(30)
    expect(frameCounts(MAX_SHOTS_SHOWN).perShot.every((n) => n >= 1)).toBe(true)
    const many = pickShots(60)
    expect(many).toHaveLength(MAX_SHOTS_SHOWN)
    expect([many[0], many.at(-1)]).toEqual([0, 59])
    expect(new Set(many).size).toBe(MAX_SHOTS_SHOWN)
    expect(pickShots(3)).toEqual([0, 1, 2])
    expect(frameCounts(4).address / VIDEO.fps).toBe(1)
    expect(frameCounts(0)).toEqual({ perShot: [], address: 0 })
  })
})

describe('framePage', () => {
  it('is 1080 x 1920 and carries the caption as text, escaped', () => {
    const html = framePage({ name: 'Tide <b>clock</b>', shot: null, caption: '<script>alert(1)</script> & more', line: 'Session 1 of 2' })
    expect(html).toContain('width:1080px;height:1920px')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; more')
    expect(html).toContain('Tide &lt;b&gt;clock&lt;/b&gt;')
    expect(html).not.toContain('<script>alert')
  })
})

describe('makeTimelapse, without a browser', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'timelapse-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const project = (shots: string[]) =>
    Project.parse({ id: 'tide-clock', name: 'Tide clock', aim: 'a pool', started: '2026-11-10T09:00:00.000Z', status: 'building', sessions: shots.map((shot, i) => ({ at: `2026-11-1${i}T10:00:00.000Z`, caption: `step ${i}`, usd: 0.1, turns: 3, shot, broken: false })) })
  const never = async () => {
    throw new Error('no browser is started')
  }

  it('skips quietly where ffmpeg is missing, and starts no browser', async () => {
    mkdirSync(join(dir, 'shots'))
    writeFileSync(join(dir, 'shots/1.png'), 'png')
    const calls: string[][] = []
    const r = await makeTimelapse(dir, project(['shots/1.png']), { address: 'https://x/', launch: never, run: async (file, args) => (calls.push([file, ...args]), { code: 127 }) })
    expect(r).toEqual({ ok: false, reason: 'ffmpeg is not installed here' })
    expect(calls).toEqual([['ffmpeg', '-hide_banner', '-version']])
    expect(existsSync(join(dir, 'share'))).toBe(false)
  })

  it('makes nothing before the first screenshot', async () => {
    expect(await makeTimelapse(dir, project([]), { address: 'https://x/', launch: never, run: async () => ({ code: 0 }) })).toEqual({ ok: false, reason: 'no screenshots yet' })
  })

  it('knows whether ffmpeg runs', async () => {
    expect(await ffmpegAvailable(async () => ({ code: 0 }))).toBe(true)
    expect(await ffmpegAvailable(async () => ({ code: 1 }))).toBe(false)
  })
})
