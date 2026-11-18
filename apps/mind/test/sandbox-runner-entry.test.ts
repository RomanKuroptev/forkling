import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createConnection, createServer, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * The runner as the unit starts it: `node /opt/forkling/sandbox/current/runner.ts ...`, where `current` is a symlink to
 * `releases/<tag>` (deploy.sh), beside a package.json with "type": "module". Node resolves the symlink for the main module, so
 * the runner must still know it is the program. v0.17.0 did not: it ended at once with exit 0 and no answer (the step 3
 * runbook, 18 November). No browser here: a request that does not parse is answered without one.
 */

const RUNNER = fileURLToPath(new URL('../src/builds/sandbox-runner.ts', import.meta.url))
const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** A deployed copy as deploy.sh lays it out; returns the path through `current`. */
function deployed(): { root: string; runner: string } {
  const root = mkdtempSync(join(tmpdir(), 'runner-entry-'))
  dirs.push(root)
  const release = join(root, 'releases', 'v0.0.0')
  mkdirSync(release, { recursive: true })
  copyFileSync(RUNNER, join(release, 'runner.ts'))
  writeFileSync(join(release, 'package.json'), '{ "private": true, "type": "module" }\n')
  // A junction on Windows needs no privilege; elsewhere the type is ignored and it is a plain symlink, as `ln -sfn` makes.
  symlinkSync(release, join(root, 'current'), 'junction')
  return { root, runner: join(root, 'current', 'runner.ts') }
}

const run = (runner: string, args: string[], input: string) =>
  spawnSync(process.execPath, [runner, ...args], { input, encoding: 'utf8', timeout: 20_000 })

/**
 * As the socket unit starts it (`Accept=yes`, `StandardInput=socket`, `StandardOutput=socket`): one accepted connection is both
 * its input and its output. Returns what came back on the connection.
 */
async function overSocket(runner: string, args: string[], request: string, root: string): Promise<string> {
  const path = join(root, 's.sock')
  const server = createServer({ pauseOnConnect: true })
  const accepted = new Promise<Socket>((resolve) => server.once('connection', resolve))
  await new Promise<void>((resolve) => server.listen(path, resolve))
  const client = createConnection(path)
  const conn = await accepted
  server.close()
  const child = spawn(process.execPath, [runner, ...args], { stdio: [conn, conn, 'pipe'] })
  conn.destroy()
  const chunks: Buffer[] = []
  client.on('data', (c: Buffer) => chunks.push(c))
  client.write(request)
  await new Promise<void>((resolve, reject) => {
    client.on('end', () => resolve())
    client.on('error', reject)
    child.on('exit', () => setTimeout(resolve, 200))
  })
  client.destroy()
  return Buffer.concat(chunks).toString('utf8')
}

describe('the runner started through the current symlink', () => {
  it('answers a request (one that does not parse, so no browser starts)', async () => {
    const { root, runner } = deployed()
    const args = ['--browsers', join(root, 'browsers'), '--scratch', join(root, 'scratch')]
    let out: string
    if (process.platform === 'win32') {
      // No Unix socket can be handed to a child here; stdin is a pipe, so the runner answers on stdout.
      const r = run(runner, args, 'not json\n')
      expect(r.status).toBe(0)
      out = r.stdout
    } else out = await overSocket(runner, args, 'not json\n', root)
    // The runner says "ready" before it reads, so the socket's client can tell a run that started from a dropped connection.
    const lines = out.trim().split('\n')
    expect(lines[0]).toBe('ready')
    const answer = JSON.parse(lines.at(-1)!) as { failed?: string }
    expect(answer.failed).toBeTruthy()
  })

  it('says on stderr what is wrong when its arguments are missing', () => {
    const { runner } = deployed()
    const r = run(runner, [], '')
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/usage: runner\.ts/)
  })
})
