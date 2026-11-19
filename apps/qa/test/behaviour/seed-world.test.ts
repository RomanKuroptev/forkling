import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { remotesOf } from '@forkling/mind/src/fast-forward.ts'
import { afterAll, describe, expect, it } from 'vitest'
import { day0, seedWorld } from '../../src/behaviour/runner.ts'
import { qaOut } from '../../src/paths.ts'

const dir = qaOut('test-seed-world')
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('a seed world', () => {
  it('inside this repo (qa-out) is a repository of its own with no remote, so the fast-forward accepts it', () => {
    const world = join(dir, 'world')
    seedWorld(day0(), world, 0)
    expect(remotesOf(world)).toEqual([])
  })
})
