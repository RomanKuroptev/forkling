import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WorkChecker } from '@forkling/mind/src/builds/browser-check.ts'
import { fakeModel } from '@forkling/mind/src/fast-forward-fakes.ts'
import { localMidnight, runFastForward } from '@forkling/mind/src/fast-forward.ts'
import { loadSpecies } from '@forkling/mind/src/species.ts'
import type { FetchImpl } from '@forkling/mind/src/web/fetch.ts'
import { describe, expect, it } from 'vitest'
import { memeTrail } from '../../src/behaviour/memes.ts'
import { readRun } from '../../src/behaviour/read-run.ts'
import { repoRoot } from '../../src/paths.ts'

/**
 * The meme machinery end to end (audit spec 9.5): the real loop, build worker and checks on a fake clock, with a fake model that
 * plans a trip to an Imgflip format and then a meme, and a fake web that has that format in it. A meme must come out the other
 * end, through every step the harness counts. When this passes and real runs make no memes, the cause is in the prompt or the
 * price, not the machinery.
 */

const FORMAT_ID = '181913649'
const FORMAT = `https://imgflip.com/meme/${FORMAT_ID}`
const HOUR = 3_600_000
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const MEMES = {
  success: true,
  data: {
    memes: [
      { id: FORMAT_ID, name: 'Drake Hotline Bling', url: 'https://i.imgflip.com/30b1gx.jpg', width: 1200, height: 1200, box_count: 2, captions: 1000 },
      { id: '87743020', name: 'Two Buttons', url: 'https://i.imgflip.com/1g8my4.jpg', width: 600, height: 908, box_count: 3, captions: 900 },
    ],
  },
}

/** Robots.txt allows everything, Imgflip's list has two formats, and every other page is missing. */
const fakeWeb: FetchImpl = async (url) => {
  const u = new URL(url)
  if (u.pathname === '/robots.txt') return new Response('User-agent: *\nAllow: /\n', { status: 200, headers: { 'content-type': 'text/plain' } })
  if (u.hostname === 'api.imgflip.com' && u.pathname === '/get_memes') return new Response(JSON.stringify(MEMES), { status: 200, headers: { 'content-type': 'application/json' } })
  return new Response('not here', { status: 404, headers: { 'content-type': 'text/plain' } })
}

const step = (verb: string, target: string | null, minutes: number, reason: string, over: Record<string, unknown> = {}) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null, ...over })
const MEME_HTML = '<!doctype html><html><head><meta charset="utf-8"><title>No, then yes</title></head><body><canvas id="c" width="400" height="400"></canvas><script>const g=document.getElementById("c").getContext("2d");g.fillStyle="#f4d03f";g.fillRect(0,0,400,200);g.fillStyle="#5dade2";g.fillRect(0,200,400,200);g.fillStyle="#000";g.font="20px sans-serif";g.fillText("reading one more page",20,100);g.fillText("making the thing",20,300)</script></body></html>'

function world(): string {
  const root = repoRoot()
  const dir = join(mkdtempSync(join(tmpdir(), 'qa-meme-')), 'world')
  mkdirSync(join(dir, 'places'), { recursive: true })
  copyFileSync(join(root, 'templates/merge/forkling.json'), join(dir, 'forkling.json'))
  for (const f of readdirSync(join(root, 'templates/forkling-world/places'))) copyFileSync(join(root, 'templates/forkling-world/places', f), join(dir, 'places', f))
  return dir
}

const checker: WorkChecker = { check: async () => ({ ok: true, reasons: [], thumb: PNG }), available: async () => true, close: async () => undefined }

describe('a meme, end to end on the fakes', () => {
  it('goes through all eight steps', async () => {
    const dir = world()
    const outDir = mkdtempSync(join(tmpdir(), 'qa-meme-out-'))
    const llm = fakeModel({
      answers: {
        morning: () => ({
          thought: 'A format first, then a meme of my own.',
          longGoal: null,
          dropLongGoal: false,
          plan: [step('wander', FORMAT, 30, 'I want to see how this two-panel format works.'), step('tinker', 'a meme about my day', 45, 'I want to make a meme of my own day.', { size: 'sketch' }), step('rest', null, 30, 'Rest after.')],
          planReason: 'Read a format, then make a meme.',
          stayUpLate: null,
        }),
        read: () => ({ reaction: 'Two panels: no to one thing, yes to another. It fits my day.', topics: ['meme formats'], interest: 7, souvenir: null, next: null, look: null }),
        sketch: () => ({ meta: { title: 'No, Then Yes', kind: 'meme', about: 'Me, saying no to one more page and yes to making the thing.', interest: null, sources: [{ role: 'looked', url: FORMAT }, { role: 'read', url: FORMAT }] }, html: MEME_HTML }),
      },
    })
    const cat = loadSpecies('cat')
    const result = await runFastForward({
      dir,
      days: 1,
      capUsd: 1,
      startMs: localMidnight('Europe/Stockholm', '2026-11-03'),
      durationMs: 14 * HOUR,
      llm,
      fetchImpl: fakeWeb,
      realSleep: async () => undefined,
      workCheck: checker,
      pack: cat.pack,
      behaviors: cat.behaviors,
      speciesPersona: cat.persona,
      engine: 'test',
      outDir,
      capturePrompts: true,
    })
    expect(result.crashes).toBe(0)
    // The plan's meme step and the meme work both count as chosen.

    const trail = memeTrail(readRun({ world: dir, outDir, label: 'e2e' }))
    const counts = Object.fromEntries(trail.steps.map((s) => [s.name, s.count]))
    // Every step the machinery owns has a meme in it; step 3 is measured from the real planner prompts, whatever they say.
    expect(counts).toMatchObject({ offered: expect.any(Number), read: expect.any(Number), chosen: 2, allowed: 2, made: 1, 'passed the work check': 1, shown: 1 })
    for (const s of trail.steps) if (s.step !== 3) expect(s.count, s.name).toBeGreaterThan(0)
    expect(trail.steps[2]!.count).not.toBeNull()
    expect(trail.stoppedAt).toBeNull()
    expect(trail.shown.map((m) => m.title)).toEqual(['No, Then Yes'])
  }, 300_000)
})
