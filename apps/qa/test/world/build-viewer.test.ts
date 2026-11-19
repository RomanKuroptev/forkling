import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildViewer } from '../../src/world/serve.ts'

// A fake vite build: slow enough that the callers overlap, and counted.
function fakeBuild(ms = 50) {
  const calls: string[] = []
  const build = async (out: string): Promise<void> => {
    calls.push(out)
    await new Promise((r) => setTimeout(r, ms))
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'index.html'), '<html></html>')
  }
  return { calls, build }
}

const freshOut = () => join(mkdtempSync(join(tmpdir(), 'qa-viewer-')), 'viewer')

describe('building the viewer for the world checks (#392)', () => {
  it('two concurrent calls give one build, and both wait for it', async () => {
    const out = freshOut()
    const { calls, build } = fakeBuild()
    const [a, b] = await Promise.all([buildViewer(out, { build }), buildViewer(out, { build })])
    expect(calls).toEqual([out])
    expect([a, b]).toEqual([out, out])
    expect(existsSync(join(out, 'index.html'))).toBe(true)
    expect(existsSync(`${out}.lock`)).toBe(false)
  })

  it('a later call in the same process reuses the build', async () => {
    const out = freshOut()
    const { calls, build } = fakeBuild(1)
    await buildViewer(out, { build })
    await buildViewer(out, { build })
    expect(calls).toHaveLength(1)
  })

  it('waits for another process holding the lock and uses what it built, without building again', async () => {
    const out = freshOut()
    mkdirSync(`${out}.lock`, { recursive: true })
    const { calls, build } = fakeBuild(1)
    const waiting = buildViewer(out, { build, pollMs: 10 })
    let done = false
    void waiting.then(() => (done = true))
    await new Promise((r) => setTimeout(r, 60))
    expect(done).toBe(false)
    // The other process finishes: its viewer, its stamp, then it lets go of the lock.
    await fakeBuild(1).build(out)
    writeFileSync(`${out}.built`, String(Date.now()))
    rmSync(`${out}.lock`, { recursive: true })
    expect(await waiting).toBe(out)
    expect(calls).toEqual([])
  })

  it('a lock left behind by a crashed build is taken over once it is stale', async () => {
    const out = freshOut()
    mkdirSync(`${out}.lock`, { recursive: true })
    const { calls, build } = fakeBuild(1)
    expect(await buildViewer(out, { build, pollMs: 10, staleMs: 0 })).toBe(out)
    expect(calls).toEqual([out])
  })

  it('a failed build is not remembered: the next call builds again', async () => {
    const out = freshOut()
    await expect(buildViewer(out, { build: async () => Promise.reject(new Error('vite failed')) })).rejects.toThrow('vite failed')
    expect(existsSync(`${out}.lock`)).toBe(false)
    const { calls, build } = fakeBuild(1)
    expect(await buildViewer(out, { build })).toBe(out)
    expect(calls).toEqual([out])
  })
})
