import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { withPolicy } from '../../src/builds/sandbox.ts'
import { createLocalSandbox, runInSandbox } from '../../src/builds/sandbox-run.ts'
import { launchBrowser } from './helpers.ts'

/**
 * `runInSandbox` off the server (step 3): a project's `src/` run in this process's Chromium, unsandboxed and saying so. The
 * same runner code runs inside the unit on the server; `sandbox-proof` proves that part there.
 */

const probe = await launchBrowser()
await probe?.close()
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const MS = 1_000
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const html = (body: string) => withPolicy(`<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body style="margin:0">${body}</body></html>`)
const DRAW = `<canvas id="c" width="480" height="360"></canvas><script src="draw.js"></script>`
const DRAW_JS = `const g = document.getElementById('c').getContext('2d'); g.fillStyle = '#123'; g.fillRect(0, 0, 480, 360); g.fillStyle = '#f80'; g.fillRect(40, 40, 120, 90)`

describe.skipIf(!probe)('runInSandbox, in this process', () => {
  const sandbox = createLocalSandbox({ launch: launchBrowser })
  afterAll(() => sandbox.close())
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'project-run-'))
    mkdirSync(join(dir, 'src'))
    return () => rmSync(dir, { recursive: true, force: true })
  })
  const write = (path: string, text: string) => writeFileSync(join(dir, 'src', path), text)

  it('runs src/index.html with its own script file, says it was not sandboxed, and gives back a screenshot', async () => {
    write('index.html', html(DRAW))
    write('draw.js', DRAW_JS)
    const r = await runInSandbox(dir, sandbox, { durationMs: MS })
    expect(r.sandboxed).toBe(false)
    expect(r.errors).toEqual([])
    expect(r.loaded && r.rendered).toBe(true)
    expect(r.blank).toBe(false)
    expect(r.timedOut).toBe(false)
    expect(r.screenshotPng!.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
  })

  it('gives back uncaught errors and console errors', async () => {
    write('index.html', html(`${DRAW}<script>console.error('a console line'); throw new Error('boom')</script>`))
    write('draw.js', DRAW_JS)
    const r = await runInSandbox(dir, sandbox, { durationMs: MS })
    expect(r.errors.join(' ')).toMatch(/boom/)
    expect(r.consoleErrors.join(' ')).toMatch(/a console line/)
  })

  it('calls a page of one colour blank', async () => {
    write('index.html', html('<div style="width:100vw;height:100vh;background:#123456"></div>'))
    const r = await runInSandbox(dir, sandbox, { durationMs: MS })
    expect(r.blank).toBe(true)
  })

  it('calls a page stuck in a loop timed out, and runs the next one', async () => {
    write('index.html', html('<script>while (true) {}</script>'))
    const r = await runInSandbox(dir, sandbox, { durationMs: MS })
    expect(r.timedOut).toBe(true)
    write('index.html', html(DRAW))
    write('draw.js', DRAW_JS)
    expect((await runInSandbox(dir, sandbox, { durationMs: MS })).timedOut).toBe(false)
  })

  it('stops a frame sent to another host, and names the host', async () => {
    write('index.html', html(`${DRAW}<script>setTimeout(() => { window['loc' + 'ation'].href = 'https://example.com/away' }, 100)</script>`))
    write('draw.js', DRAW_JS)
    const r = await runInSandbox(dir, sandbox, { durationMs: MS })
    expect(r.outside).toContain('example.com')
  })

  it('says so when there is no src/index.html', async () => {
    write('draw.js', DRAW_JS)
    const r = await runInSandbox(dir, sandbox, { durationMs: MS })
    expect(r.errors.join(' ')).toMatch(/no src\/index\.html/)
  })
})
