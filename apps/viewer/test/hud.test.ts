import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** The key hints name the forkling being watched, not the first one that was ever made. */
describe('the desktop key hints', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

  it('say whose mind F3 shows, from the world that is loaded', () => {
    expect(source).toMatch(/F3 for \{world\.forkling\.name\}/)
    expect(source).not.toMatch(/Merge/)
  })
})
