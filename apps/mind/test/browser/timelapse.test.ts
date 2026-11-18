import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Project } from '@forkling/schema'
import { makeTimelapse, TIMELAPSE_FILE } from '../../src/builds/timelapse.ts'
import { launchBrowser } from './helpers.ts'

/** Sharing S4 with a real browser drawing the frames, and a stand-in for ffmpeg that checks what it is given. */

const probe = await launchBrowser()
await probe?.close()
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

describe.skipIf(!probe)('makeTimelapse', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'timelapse-'))
    mkdirSync(join(dir, 'shots'))
    for (const n of [1, 2]) writeFileSync(join(dir, `shots/${n}.png`), PNG)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('draws 1080 x 1920 frames, gives ffmpeg fixed arguments with no caption in them, and keeps the newest video', async () => {
    const caption = 'a pool; rm -rf / && echo "$(whoami)"'
    const project = Project.parse({ id: 'tide-clock', name: 'Tide clock', aim: 'a pool', started: '2026-11-10T09:00:00.000Z', status: 'building', sessions: [1, 2].map((n) => ({ at: `2026-11-1${n}T10:00:00.000Z`, caption, usd: 0.1, turns: 3, shot: `shots/${n}.png`, broken: false })) })
    const seen: string[][] = []
    let frames = 0
    const run = async (file: string, args: readonly string[]) => {
      seen.push([file, ...args])
      if (args.includes('-version')) return { code: 0 }
      const input = args[args.indexOf('-i') + 1]!
      const folder = join(input, '..')
      frames = readdirSync(folder).filter((f) => /^frame\d{4}\.png$/.test(f)).length
      const first = readFileSync(join(folder, 'frame0001.png'))
      expect(first.readUInt32BE(16)).toBe(1080)
      expect(first.readUInt32BE(20)).toBe(1920)
      writeFileSync(args.at(-1)!, 'mp4')
      return { code: 0 }
    }
    expect(await makeTimelapse(dir, project, { address: 'https://example.github.io/merge/projects/tide-clock/', run, launch: launchBrowser })).toEqual({ ok: true })
    expect(readFileSync(join(dir, TIMELAPSE_FILE), 'utf8')).toBe('mp4')
    expect(frames).toBe(30)
    const encode = seen.find((a) => a.includes('-i'))!
    expect(encode[0]).toBe('ffmpeg')
    expect(encode.join(' ')).not.toContain('rm -rf')
    expect(encode).toContain('libx264')
    expect(existsSync(join(dir, 'share'))).toBe(true)
  })
})
