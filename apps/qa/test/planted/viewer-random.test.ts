import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { viewerRandomCheck, viewerRandomFindings } from '../../src/world/viewer-random.ts'

const viewerSrc = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-viewer-'))
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true })
    writeFileSync(join(dir, name), text)
  }
  return dir
}

describe('planted: Math.random in the viewer', () => {
  it('finds a call in a drawing file, with the file and line', () => {
    const dir = viewerSrc({ 'world/Sparkle.tsx': 'const a = 1\nconst wobble = Math.random() * 0.2\n', 'world/Fine.ts': 'export const x = 1\n' })
    const found = viewerRandomFindings(dir)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ id: 'world.viewer-math-random', severity: 'major', fixKind: 'code' })
    expect(found[0]!.where).toBe('apps/viewer/src/world/Sparkle.tsx:2')
  })

  it('lets the seeded replacement under ?qa=1 assign Math.random without calling it', () => {
    const dir = viewerSrc({ 'qa/seedRandom.ts': 'if (qaMode) Math.random = createPrng(qaMode.seed).next\n' })
    expect(viewerRandomFindings(dir)).toEqual([])
  })

  it('passes on the real viewer today', async () => {
    expect(await viewerRandomCheck.run({ now: new Date('2026-11-20T10:00:00Z') })).toEqual([])
  })
})
