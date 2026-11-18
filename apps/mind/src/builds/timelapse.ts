import { execFile } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser } from 'playwright'
import type { Project } from '@forkling/schema'
import { launchChromium } from './browser.ts'

/**
 * The vertical timelapse of a project (sharing S4): `projects/<id>/share/timelapse.mp4`, 1080 x 1920, 15 to 30 seconds, the
 * screenshots in order with each caption as a short line and the site's address on the last second. Rebuilt after each session.
 * No model call and no points. Frames are pages the engine writes itself (the screenshot as a picture, the caption as text) and
 * renders in the mind's own browser; Merge's code is never run here. `ffmpeg` gets fixed arguments, with no shell and no caption on
 * its command line. Where it is missing the video is skipped and the site shows no link.
 */

export const VIDEO = { width: 1080, height: 1920, minSec: 15, maxSec: 30, fps: 2, addressSec: 1 } as const
export const TIMELAPSE_FILE = 'share/timelapse.mp4'

export type ExecFile = (file: string, args: readonly string[]) => Promise<{ code: number }>

export const execFileRunner: ExecFile = (file, args) =>
  new Promise((resolve) => {
    execFile(file, [...args], { timeout: 120_000, windowsHide: true }, (error) => resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0 }))
  })

/** Whether `ffmpeg` can be run here. */
export async function ffmpegAvailable(run: ExecFile = execFileRunner): Promise<boolean> {
  return (await run('ffmpeg', ['-hide_banner', '-version'])).code === 0
}

/** At most this many screenshots fit in 30 seconds at one frame each; a longer project shows an even spread of them, the newest last. */
export const MAX_SHOTS_SHOWN = (VIDEO.maxSec - VIDEO.addressSec) * VIDEO.fps

/** Which of `n` screenshots are shown: all of them, or an even spread that keeps the first and the last. Pure. */
export function pickShots(n: number): number[] {
  if (n <= MAX_SHOTS_SHOWN) return Array.from({ length: n }, (_, i) => i)
  return Array.from({ length: MAX_SHOTS_SHOWN }, (_, i) => Math.round((i * (n - 1)) / (MAX_SHOTS_SHOWN - 1)))
}

/**
 * How many output frames (at `VIDEO.fps`) each screenshot takes, so the whole is 15 to 30 seconds with the address frame last. Pure.
 * One screenshot or thirty, each gets the same share.
 */
export function frameCounts(shots: number): { perShot: number[]; address: number } {
  if (shots === 0) return { perShot: [], address: 0 }
  const total = Math.min(VIDEO.maxSec, Math.max(VIDEO.minSec, shots * 2)) - VIDEO.addressSec
  const frames = total * VIDEO.fps
  const perShot = Array.from({ length: shots }, (_, i) => Math.floor(((i + 1) * frames) / shots) - Math.floor((i * frames) / shots))
  return { perShot: perShot.map((n) => Math.max(1, n)), address: VIDEO.addressSec * VIDEO.fps }
}

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** One frame as a page: the project's name, the screenshot, the caption. Everything Merge wrote is escaped text. Pure. */
export function framePage(o: { name: string; shot: Buffer | null; caption: string; line: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${VIDEO.width}px;height:${VIDEO.height}px;background:#111;color:#f4f1ea;font-family:sans-serif;overflow:hidden}
.top{padding:110px 70px 40px;font-size:64px;font-weight:700}
.shot{display:block;width:940px;margin:0 70px;border-radius:14px;background:#000}
.cap{padding:56px 70px 0;font-size:52px;line-height:1.3}
.line{position:absolute;left:70px;right:70px;bottom:110px;font-size:40px;color:#bbb}
</style></head><body><div class="top">${esc(o.name)}</div>${o.shot ? `<img class="shot" src="data:image/png;base64,${o.shot.toString('base64')}">` : ''}<div class="cap">${esc(o.caption)}</div><div class="line">${esc(o.line)}</div></body></html>`
}

/** Renders pages to 1080 x 1920 PNGs in a fresh context that reaches nothing outside the page. */
async function renderFrames(browser: Browser, pages: readonly string[]): Promise<Buffer[]> {
  const context = await browser.newContext({ viewport: { width: VIDEO.width, height: VIDEO.height }, javaScriptEnabled: false, serviceWorkers: 'block' })
  try {
    await context.route('**/*', (route) => route.abort())
    const page = await context.newPage()
    const out: Buffer[] = []
    for (const html of pages) {
      await page.setContent(html, { waitUntil: 'load' })
      out.push(await page.screenshot({ type: 'png' }))
    }
    return out
  } finally {
    await context.close().catch(() => undefined)
  }
}

export interface TimelapseOptions {
  /** The project's page on the site, shown on the last second. */
  address: string
  run?: ExecFile
  launch?: () => Promise<Browser | null>
}

/**
 * Writes `share/timelapse.mp4` for the project in `projectDir` from its saved screenshots, or says why not. Never throws. Only the
 * newest video is kept (the file is replaced).
 */
export async function makeTimelapse(projectDir: string, project: Project, o: TimelapseOptions): Promise<{ ok: true } | { ok: false; reason: string }> {
  const run = o.run ?? execFileRunner
  const withShots = project.sessions.filter((s) => s.shot && existsSync(join(projectDir, s.shot)))
  const sessions = pickShots(withShots.length).map((i) => withShots[i]!)
  if (sessions.length === 0) return { ok: false, reason: 'no screenshots yet' }
  if (!(await ffmpegAvailable(run))) return { ok: false, reason: 'ffmpeg is not installed here' }
  const browser = await (o.launch ?? launchChromium)().catch(() => null)
  if (!browser) return { ok: false, reason: 'no browser to draw the frames' }
  const work = mkdtempSync(join(tmpdir(), 'timelapse-'))
  try {
    const pages = [
      ...sessions.map((s, i) => framePage({ name: project.name, shot: readFileSync(join(projectDir, s.shot!)), caption: s.caption, line: `Session ${i + 1} of ${sessions.length}` })),
      framePage({ name: project.name, shot: null, caption: project.aim, line: o.address }),
    ]
    const frames = await renderFrames(browser, pages)
    const counts = frameCounts(sessions.length)
    let n = 0
    const put = (png: Buffer, times: number) => {
      for (let k = 0; k < times; k++) writeFileSync(join(work, `frame${String(++n).padStart(4, '0')}.png`), png)
    }
    sessions.forEach((_, i) => put(frames[i]!, counts.perShot[i]!))
    put(frames[frames.length - 1]!, counts.address)
    const out = join(work, 'timelapse.mp4')
    // Fixed arguments, the frame files the engine just wrote, and no shell.
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(VIDEO.fps), '-i', join(work, 'frame%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', out]
    if ((await run('ffmpeg', args)).code !== 0 || !existsSync(out)) return { ok: false, reason: 'ffmpeg could not make the video' }
    mkdirSync(join(projectDir, 'share'), { recursive: true })
    copyFileSync(out, join(projectDir, TIMELAPSE_FILE))
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: `the video could not be made: ${error instanceof Error ? error.message.slice(0, 120) : String(error)}` }
  } finally {
    await browser.close().catch(() => undefined)
    rmSync(work, { recursive: true, force: true })
  }
}
