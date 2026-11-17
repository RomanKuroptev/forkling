import { describe, expect, it } from 'vitest'
import { createBrowserChecker, reasonsOf } from '../src/builds/browser-check.ts'
import { withPolicy } from '../src/builds/sandbox.ts'
import { pageRequest, shellPage, type Sandbox, type SandboxRun } from '../src/builds/sandbox-run.ts'
import { emptyPageResult, MAX_CONSOLE_LINES, parseRequest, RUN_ORIGIN } from '../src/builds/sandbox-runner.ts'

/** Step 3: one path for every page Merge wrote, the request the runner gets, and what a run means for a work. No browser here. */

const page = (body: string) => withPolicy(`<!doctype html><html><head><meta charset="utf-8"><title>w</title></head><body>${body}</body></html>`)
const run = (over: Partial<SandboxRun> = {}): SandboxRun => ({ ...emptyPageResult(), screenshotPng: null, sandboxed: false, ...over })
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])

/** A sandbox that must never be asked to run anything. */
const untouched = (): Sandbox & { runs: number } => {
  const s = {
    sandboxed: true,
    runs: 0,
    async run() {
      s.runs++
      throw new Error('the page must not run')
    },
    available: async () => true,
    close: async () => undefined,
  }
  return s
}

describe('test 3: a page that reaches out is refused by the static check before it runs', () => {
  it.each([
    ['calls fetch', `<script>fetch('https://example.org/a')</script>`, /fetch/],
    ['opens a WebSocket', `<script>new WebSocket('wss://example.org/s')</script>`, /WebSocket/],
    ['loads a script from another host', `<script src="https://cdn.example.org/x.js"></script>`, /cdn\.example\.org/],
  ])('%s', async (_, body, reason) => {
    const sandbox = untouched()
    const checker = createBrowserChecker({ sandbox })
    const r = await checker.check(page(body), { size: 'full' })
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toMatch(reason)
    expect(sandbox.runs).toBe(0)
  })
})

describe('the work check on the one path', () => {
  const answering = (result: SandboxRun) => {
    const seen: { frame: string; files: string[] }[] = []
    const sandbox: Sandbox = {
      sandboxed: true,
      async run(p) {
        seen.push({ frame: p.frame, files: [...p.files.keys()] })
        return result
      },
      available: async () => true,
      close: async () => undefined,
    }
    return { sandbox, seen }
  }

  it('hands the sandbox the work as works/check/index.html, and passes a clean run with its screenshot as the thumbnail', async () => {
    const { sandbox, seen } = answering(run({ loaded: true, rendered: true, screenshotPng: PNG }))
    const r = await createBrowserChecker({ sandbox }).check(page('<canvas></canvas>'), { size: 'sketch' })
    expect(r).toEqual({ ok: true, reasons: [], thumb: PNG })
    expect(seen).toEqual([{ frame: 'works/check/index.html', files: ['works/check/index.html'] }])
  })

  it('says it decided nothing when there is no browser', async () => {
    const { sandbox } = answering({ ...run(), unavailable: true })
    const r = await createBrowserChecker({ sandbox }).check(page('<canvas></canvas>'), { size: 'sketch' })
    expect(r.unavailable).toBe(true)
    expect(r.ok).toBe(false)
  })
})

describe('reasonsOf: what a run means for a work', () => {
  it('is empty for a run that loaded, drew and was photographed', () => {
    expect(reasonsOf(run({ loaded: true, rendered: true, screenshotPng: PNG }))).toEqual([])
  })

  it('names each thing that went wrong, in plain words', () => {
    const all = reasonsOf(
      run({ loaded: true, errors: ['boom'], libraryFailures: ['p5.min.js'], outside: ['example.com'], navigated: true, rendered: false }),
    ).join(' | ')
    expect(all).toMatch(/uncaught error: boom/)
    expect(all).toMatch(/library p5\.min\.js did not load/)
    expect(all).toMatch(/tried to reach example\.com/)
    expect(all).toMatch(/navigation/)
    expect(all).toMatch(/never rendered/)
  })

  it('tells a crash, a page that never loaded, a missing photo and a blank one apart', () => {
    expect(reasonsOf(run({ crashed: true })).join(' ')).toMatch(/crashed/)
    expect(reasonsOf(run()).join(' ')).toMatch(/did not load in its frame/)
    expect(reasonsOf(run({ loaded: true, rendered: true })).join(' ')).toMatch(/photographed/)
    expect(reasonsOf(run({ loaded: true, rendered: true, screenshotPng: PNG, blank: true })).join(' ')).toMatch(/single colour/)
  })

  it('gives at most 8 reasons', () => {
    expect(reasonsOf(run({ errors: Array.from({ length: 20 }, (_, i) => `e${i}`) }))).toHaveLength(8)
  })
})

describe('the request the runner gets', () => {
  const libs = new Map([['lib/p5.min.js', Buffer.from('/* p5 */')]])
  const req = pageRequest({ files: new Map([['works/check/index.html', Buffer.from('<p>hi</p>')]]), frame: 'works/check/index.html' }, libs, 1_000)

  it('carries the page, the libraries and the shell, all as base64, and nothing else', () => {
    expect(Object.keys(req.files).sort()).toEqual(['lib/p5.min.js', 'shell.html', 'works/check/index.html'])
    expect(Buffer.from(req.files['works/check/index.html']!, 'base64').toString()).toBe('<p>hi</p>')
    expect(Buffer.from(req.files['shell.html']!, 'base64').toString()).toBe(shellPage('works/check/index.html'))
    expect(req).toMatchObject({ mode: 'page', shell: 'shell.html', frame: 'works/check/index.html', durationMs: 1_000 })
  })

  it('frames the page the way the site frames a work (spec 7.4)', () => {
    expect(shellPage('works/check/index.html')).toMatch(/<iframe[^>]*sandbox="allow-scripts"[^>]*src="works\/check\/index\.html"|<iframe[^>]*src="works\/check\/index\.html"[^>]*sandbox="allow-scripts"/)
  })

  it('is read back by the runner as it was sent', () => {
    expect(parseRequest(JSON.stringify(req))).toEqual(req)
  })

  it('serves from an origin that can never resolve', () => {
    expect(new URL(RUN_ORIGIN).hostname.endsWith('.invalid')).toBe(true)
  })

  it('keeps 20 console lines at most (spec-v4 3.3)', () => {
    expect(MAX_CONSOLE_LINES).toBe(20)
  })
})

describe('parseRequest: the runner reads nothing it does not expect', () => {
  const good = { mode: 'probe', read: ['/etc/forkling/mind.env'], write: [], connect: ['1.1.1.1:443'], browser: true }

  it('takes a probe', () => {
    expect(parseRequest(JSON.stringify(good))).toEqual(good)
  })

  it.each([
    ['an unknown mode', { mode: 'shell', command: 'id' }],
    ['a probe with a number for a path', { ...good, read: [1] }],
    ['a page with a long watch', { mode: 'page', files: {}, shell: 's', frame: 'f', durationMs: 60_000, viewport: { width: 1, height: 1 }, globals: [] }],
    ['a page whose global is code', { mode: 'page', files: {}, shell: 's', frame: 'f', durationMs: 1, viewport: { width: 1, height: 1 }, globals: [['a.js', 'x; alert(1)']] }],
    ['not JSON', 'nope'],
  ])('refuses %s', (_, value) => {
    expect(() => parseRequest(typeof value === 'string' ? value : JSON.stringify(value))).toThrow()
  })
})
