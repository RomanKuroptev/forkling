import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { buildHealthResponse } from '../src/health-response.ts'
import {
  createLocalSandbox,
  createSandbox,
  createSocketSandbox,
  readPageAnswer,
  sandboxSelfTest,
  sandboxStatus,
  selfTestProbe,
  SERVER_PATHS,
} from '../src/builds/sandbox-run.ts'
import { emptyPageResult, type ProbeResult } from '../src/builds/sandbox-runner.ts'

/** Step 3, the server side that can be tested anywhere: the client of the sandbox unit, the self-test and `/health`. */

let n = 0
const socketPath = () => (process.platform === 'win32' ? `\\\\.\\pipe\\forkling-sandbox-test-${process.pid}-${++n}` : join(mkdtempSync(join(tmpdir(), 'sock-')), 's.sock'))
const PAGE = { files: new Map([['works/check/index.html', Buffer.from('<p>x</p>')]]), frame: 'works/check/index.html' }
const LIBS = mkdtempSync(join(tmpdir(), 'libs-'))

let servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))))
  servers = []
})

/** A stand-in for the unit: reads one line, hands it to `answer`, which writes back (or not). */
async function fakeUnit(answer: (request: Record<string, unknown>, socket: Socket) => void): Promise<string> {
  const path = socketPath()
  const server = createServer((socket) => {
    let text = ''
    socket.on('data', (chunk) => {
      text += chunk.toString()
      if (text.includes('\n')) answer(JSON.parse(text.split('\n')[0]!) as Record<string, unknown>, socket)
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(path, resolve))
  return path
}

const probeResult = (over: Partial<ProbeResult> = {}): ProbeResult => ({
  read: [{ path: '/etc/forkling/mind.env', readable: false }],
  write: [],
  connect: [{ target: '1.1.1.1:443', connected: false }],
  browser: 'ok',
  uid: 998,
  envNames: ['HOME', 'PATH', 'TMPDIR'],
  ...over,
})

describe('the client of the sandbox unit', () => {
  it('sends the page as one line and reads back a sandboxed run with its screenshot', async () => {
    let seen: Record<string, unknown> = {}
    const path = await fakeUnit((req, socket) => {
      seen = req
      socket.end(`${JSON.stringify({ ...emptyPageResult({ loaded: true, rendered: true }), screenshotPng: Buffer.from('png').toString('base64') })}\n`)
    })
    const r = await createSocketSandbox({ socketPath: path, libsDir: LIBS }).run(PAGE, { durationMs: 1_000 })
    expect(seen).toMatchObject({ mode: 'page', frame: 'works/check/index.html', durationMs: 1_000 })
    expect(r.sandboxed).toBe(true)
    expect(r.rendered).toBe(true)
    expect(r.screenshotPng?.toString()).toBe('png')
  })

  it('cleans the page text and keeps 20 console lines', async () => {
    const path = await fakeUnit((_, socket) =>
      socket.end(`${JSON.stringify({ ...emptyPageResult({ loaded: true }), errors: ['<b>boom</b>'], consoleErrors: Array.from({ length: 30 }, (_, i) => `line ${i}`) })}\n`),
    )
    const r = await createSocketSandbox({ socketPath: path, libsDir: LIBS }).run(PAGE)
    expect(r.errors).toEqual(['bboom/b'])
    expect(r.consoleErrors).toHaveLength(20)
  })

  it('says nothing was decided when the runner could not run the page, or the unit cannot be reached', async () => {
    const path = await fakeUnit((_, socket) => socket.end(`${JSON.stringify({ failed: 'Chromium sandboxing failed' })}\n`))
    const failed = await createSocketSandbox({ socketPath: path, libsDir: LIBS }).run(PAGE)
    expect(failed.unavailable).toBe(true)
    expect(failed.errors.join(' ')).toMatch(/Chromium sandboxing failed/)
    const nowhere = await createSocketSandbox({ socketPath: socketPath(), libsDir: LIBS }).run(PAGE)
    expect(nowhere.unavailable).toBe(true)
    expect(nowhere.errors.join(' ')).toMatch(/cannot be reached/)
  })

  it('calls a run that ends with no answer early a crash (the memory limit), and one at the time limit timed out', async () => {
    const path = await fakeUnit((_, socket) => socket.end())
    const early = await createSocketSandbox({ socketPath: path, libsDir: LIBS }).run(PAGE)
    expect(early.crashed).toBe(true)
    expect(early.unavailable).toBeUndefined()
    expect(readPageAnswer({ answer: null, ms: 30_500, error: 'the run ended with no answer' }).timedOut).toBe(true)
  })

  it('gives up on a unit that never answers', async () => {
    const path = await fakeUnit(() => undefined)
    const r = await createSocketSandbox({ socketPath: path, libsDir: LIBS, limitMs: 300 }).run(PAGE)
    expect(r.crashed || r.timedOut).toBe(true)
  })

  it('passes a probe through, and gives null for an answer of the wrong shape', async () => {
    const good = await fakeUnit((req, socket) => socket.end(`${JSON.stringify(req.mode === 'probe' ? probeResult() : {})}\n`))
    expect(await createSocketSandbox({ socketPath: good }).probe({ read: [], write: [], connect: [], browser: true })).toEqual(probeResult())
    const bad = await fakeUnit((_, socket) => socket.end('{"read": "all of it"}\n'))
    expect(await createSocketSandbox({ socketPath: bad }).probe({ read: [], write: [], connect: [], browser: true })).toBeNull()
  })

  it('runs one at a time', async () => {
    let open = 0
    let most = 0
    const path = await fakeUnit((_, socket) => {
      open++
      most = Math.max(most, open)
      setTimeout(() => {
        open--
        socket.end(`${JSON.stringify(emptyPageResult({ loaded: true, rendered: true }))}\n`)
      }, 30)
    })
    const sandbox = createSocketSandbox({ socketPath: path, libsDir: LIBS })
    await Promise.all([sandbox.run(PAGE), sandbox.run(PAGE), sandbox.run(PAGE)])
    expect(most).toBe(1)
  })

  it('is chosen only when the socket is there', async () => {
    expect(createSandbox({ socketPath: socketPath() }).sandboxed).toBe(false)
    const path = await fakeUnit(() => undefined)
    expect(createSandbox({ socketPath: path }).sandboxed).toBe(true)
  })
})

describe('the self-test at start, and /health (step 3)', () => {
  it('tries the real paths on the server: the keys file, the world .git/config, the mind environ and the engine .env', () => {
    const p = selfTestProbe({ world: SERVER_PATHS.world, pid: 4242, port: 8787 })
    expect(p.read).toEqual(['/etc/forkling/mind.env', '/var/lib/forkling/world/.git/config', '/proc/4242/environ', '/opt/forkling/engine/.env'])
    expect(p.connect).toContain('127.0.0.1:8787')
    expect(p.browser).toBe(true)
  })

  it('is ok only when nothing could be read, written or reached, no key is in the environment and the browser started', () => {
    expect(sandboxStatus(probeResult())).toEqual({ status: 'ok', reasons: [] })
    expect(sandboxStatus(null).status).toBe('missing')
    expect(sandboxStatus(probeResult({ read: [{ path: '/etc/forkling/mind.env', readable: true }] })).reasons.join(' ')).toMatch(/could read \/etc\/forkling\/mind\.env/)
    expect(sandboxStatus(probeResult({ connect: [{ target: '1.1.1.1:443', connected: true }] })).status).toBe('missing')
    expect(sandboxStatus(probeResult({ write: [{ path: '/etc/x', writable: true }] })).status).toBe('missing')
    expect(sandboxStatus(probeResult({ browser: 'No usable sandbox!' })).reasons.join(' ')).toMatch(/No usable sandbox/)
    expect(sandboxStatus(probeResult({ envNames: ['HOME', 'ANTHROPIC_API_KEY'] })).reasons.join(' ')).toMatch(/ANTHROPIC_API_KEY/)
  })

  it('is missing off the server, where pages run in this process', async () => {
    expect((await sandboxSelfTest(createLocalSandbox(), { world: '/w' })).status).toBe('missing')
  })

  it('goes through the unit on the server', async () => {
    const path = await fakeUnit((_, socket) => socket.end(`${JSON.stringify(probeResult())}\n`))
    expect(await sandboxSelfTest(createSocketSandbox({ socketPath: path }), { world: '/w' })).toEqual({ status: 'ok', reasons: [] })
  })

  it('/health says sandbox: missing unless told ok', () => {
    const world = fileURLToPath(new URL('../../../templates/forkling-world/', import.meta.url))
    expect(buildHealthResponse(world, Date.parse('2026-11-12T09:00:00Z')).sandbox).toBe('missing')
    expect(buildHealthResponse(world, Date.parse('2026-11-12T09:00:00Z'), 'ok').sandbox).toBe('ok')
  })
})

// systemd hands the unit its connection as stdin and stdout (Accept=yes). This does the same with a real Unix socket, so the
// runner's own program is tested as it runs on the server, short of the browser (a probe needs none).
describe.skipIf(process.platform === 'win32')('the runner program on a socket, as systemd starts it', () => {
  const runner = fileURLToPath(new URL('../src/builds/sandbox-runner.ts', import.meta.url))

  it('reads one request from its socket, answers on the same socket, and writes only in its scratch folder', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'scratch-'))
    const secret = join(mkdtempSync(join(tmpdir(), 'secret-')), 'mind.env')
    writeFileSync(secret, 'ANTHROPIC_API_KEY=not-a-real-key')
    const path = socketPath()
    const server = createServer((socket) => {
      const child = spawn(process.execPath, [runner, '--browsers', scratch, '--scratch', scratch], { stdio: [socket, socket, 'inherit'] })
      child.on('exit', () => socket.destroy())
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(path, resolve))
    const probe = await createSocketSandbox({ socketPath: path }).probe({ read: [secret, join(scratch, 'none')], write: [join(scratch, 'w.tmp')], connect: [], browser: false })
    expect(probe?.read).toEqual([
      { path: secret, readable: true },
      { path: join(scratch, 'none'), readable: false },
    ])
    expect(probe?.write).toEqual([{ path: join(scratch, 'w.tmp'), writable: true }])
    expect(probe?.browser).toBe('not asked')
    expect(JSON.stringify(probe)).not.toContain('not-a-real-key')
    rmSync(scratch, { recursive: true, force: true })
  })
})
