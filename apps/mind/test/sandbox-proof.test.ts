import { describe, expect, it } from 'vitest'
import type { PageFiles, SandboxRun, SocketSandbox } from '../src/builds/sandbox-run.ts'
import { emptyPageResult, type ProbeRequest, type ProbeResult } from '../src/builds/sandbox-runner.ts'
import { formatProof, PROOF_PAGES, runProof, type ProofDeps } from '../src/sandbox-proof.ts'

/**
 * `sandbox-proof` (step 3, tests 4 to 9) decides from what the unit answers. Here the unit is a stand-in, to show that a sound
 * sandbox passes and that each kind of leak fails its own line. The real run is on the server.
 */

const PNG = Buffer.from('png')
const run = (over: Partial<SandboxRun>): SandboxRun => ({ ...emptyPageResult(), screenshotPng: null, sandboxed: true, ...over })

interface Leaks {
  readable?: string[]
  writable?: string[]
  connects?: boolean
  browser?: string
  uid?: number
  envNames?: string[]
  image?: string
  loop?: SandboxRun
  memory?: SandboxRun
}

function unit(leaks: Leaks = {}): SocketSandbox {
  const answer = (page: PageFiles): SandboxRun => {
    const html = page.files.get(page.frame)!.toString()
    if (html === PROOF_PAGES.loop) return leaks.loop ?? run({ loaded: true, timedOut: true })
    if (html === PROOF_PAGES.memory) return leaks.memory ?? run({ loaded: true, crashed: true })
    if (html === PROOF_PAGES.image) return run({ loaded: true, rendered: true, screenshotPng: PNG, consoleErrors: [leaks.image ?? 'img:blocked'] })
    return run({ loaded: true, rendered: true, screenshotPng: PNG })
  }
  return {
    sandboxed: true,
    run: async (page) => answer(page),
    probe: async (req: Omit<ProbeRequest, 'mode'>): Promise<ProbeResult> => ({
      read: req.read.map((path) => ({ path, readable: (leaks.readable ?? []).includes(path) })),
      write: req.write.map((path) => ({ path, writable: path.startsWith('/scratch/') || (leaks.writable ?? []).includes(path) })),
      connect: req.connect.map((target) => ({ target, connected: leaks.connects ?? false })),
      browser: req.browser ? (leaks.browser ?? 'ok') : 'not asked',
      uid: leaks.uid ?? 998,
      envNames: leaks.envNames ?? ['HOME', 'PATH', 'TMPDIR', 'USER'],
    }),
    available: async () => true,
    close: async () => undefined,
  }
}

const deps = (sandbox: SocketSandbox, over: Partial<ProofDeps> = {}): ProofDeps => ({
  sandbox,
  envFile: '/etc/forkling/mind.env',
  world: '/var/lib/forkling/world',
  engine: '/opt/forkling/engine',
  scratch: '/scratch',
  mindPid: 4242,
  buildUid: 998,
  exists: () => true,
  listScratch: () => [],
  mindActive: () => true,
  now: () => 1_000,
  sleep: async () => undefined,
  ...over,
})

const failed = (lines: { test: string; pass: boolean }[]) => lines.filter((l) => !l.pass).map((l) => l.test)

describe('sandbox-proof', () => {
  it('passes a sound sandbox, test by test', async () => {
    const lines = await runProof(deps(unit()))
    expect(failed(lines)).toEqual([])
    expect(lines.map((l) => l.test)).toEqual(['0', '0', '4', '5', '6', '7', '8', '9'])
    expect(formatProof(lines)).toMatch(/^PASS 0 /)
  })

  it("names the server's real files in test 5", async () => {
    const lines = await runProof(deps(unit()))
    const five = lines.find((l) => l.test === '5')!.detail
    for (const path of ['/etc/forkling/mind.env', '/var/lib/forkling/world', '.git/config', '/proc/4242/environ', '/opt/forkling/engine']) expect(five).toContain(path)
  })

  it.each<[string, Leaks | Partial<ProofDeps>, string]>([
    ['the keys file is readable', { readable: ['/etc/forkling/mind.env'] }, '5'],
    ["the mind's environ is readable", { readable: ['/proc/4242/environ'] }, '5'],
    ['a connection can be opened', { connects: true }, '4'],
    ['the image reached example.com', { image: 'img:reached' }, '4'],
    ['it can write in the world', { writable: ['/var/lib/forkling/world/sandbox-proof-1000.tmp'] }, '6'],
    ['the loop is not stopped', { loop: run({ loaded: true, rendered: true, screenshotPng: PNG }) }, '7'],
    ['the memory hog is not stopped', { memory: run({ loaded: true, rendered: true, screenshotPng: PNG }) }, '8'],
    ['the browser does not start', { browser: 'Chromium sandboxing failed' }, '0'],
    ['it runs as another user', { uid: 0 }, '0'],
    ['a key is in its environment', { envNames: ['HOME', 'GITHUB_TOKEN'] }, '0'],
  ])('fails when %s', async (_, leaks, test) => {
    expect(failed(await runProof(deps(unit(leaks as Leaks))))).toEqual([test])
  })

  it('fails test 5 when a target is not there from here, so a missing file cannot pass as unreadable', async () => {
    expect(failed(await runProof(deps(unit(), { exists: (p) => !p.endsWith('.git/config') })))).toEqual(['5'])
    expect(failed(await runProof(deps(unit(), { mindPid: null })))).toEqual(['5'])
  })

  it('fails test 8 when the mind stopped, and test 9 when the scratch folder is not empty', async () => {
    expect(failed(await runProof(deps(unit(), { mindActive: () => false })))).toEqual(['8'])
    expect(failed(await runProof(deps(unit(), { listScratch: () => ['tmp'] })))).toEqual(['9'])
    expect(failed(await runProof(deps(unit(), { listScratch: () => null })))).toEqual(['9'])
  })
})
