import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The viewer and the mind must replay the same walk from the same `forkling.json`, so both anchor on the forkling's own
 * `lastTickAt` (`playbackStateTime`). The commit time moves for every commit, including ones that leave the body alone.
 */
describe('the viewer playback anchor', () => {
  const source = readFileSync(new URL('../src/forkling/Forkling.tsx', import.meta.url), 'utf8')

  it('uses the forkling lastTickAt, not the time of the commit', () => {
    expect(source).toMatch(/stateTime: playbackStateTime\(world\.forkling\)/)
    expect(source).not.toMatch(/committedAt/)
  })
})
