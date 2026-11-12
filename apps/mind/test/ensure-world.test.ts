import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureWorld } from '../src/world-dir.ts'

let parent: string
beforeEach(() => {
  parent = mkdtempSync(join(tmpdir(), 'ensure-'))
})
afterEach(() => rmSync(parent, { recursive: true, force: true }))

describe('ensureWorld (on start: reload from disk, or from the repo if the disk is lost; spec 11.2)', () => {
  it('uses the disk when the world is there, and clones nothing', async () => {
    const dir = join(parent, 'merge')
    mkdirSync(dir)
    writeFileSync(join(dir, 'forkling.json'), '{}')
    const clones: string[][] = []
    expect(await ensureWorld(dir, 'https://example.test/merge.git', async (args) => (clones.push([...args]), 0))).toBe('disk')
    expect(clones).toEqual([])
  })

  it('clones the repo into the directory when the disk is lost', async () => {
    const dir = join(parent, 'merge')
    const clones: string[][] = []
    expect(await ensureWorld(dir, 'https://example.test/merge.git', async (args) => (clones.push([...args]), 0))).toBe('cloned')
    expect(clones).toEqual([['clone', 'https://example.test/merge.git', dir]])
  })

  it('says so plainly when there is neither a world nor a repo to clone', async () => {
    await expect(ensureWorld(join(parent, 'merge'), undefined, async () => 0)).rejects.toThrow(/no world/i)
  })

  it('says so when the clone fails', async () => {
    await expect(ensureWorld(join(parent, 'merge'), 'https://example.test/merge.git', async () => 128)).rejects.toThrow(/clone/i)
  })
})
