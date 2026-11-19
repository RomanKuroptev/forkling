import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { CheckResult } from '../report/finding.ts'
import { repoRoot } from '../paths.ts'
import type { Check } from '../run/check.ts'

const CALL = /\bMath\.random\s*\(/

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sourceFiles(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : []))

/**
 * Anything the viewer draws takes its randomness from the seed under `?qa=1` (spec 7.1), so the viewer's own code never calls
 * Math.random (the one place that replaces it, `qa/seedRandom.ts`, only assigns it). A call means two runs of the same address
 * can draw different pictures.
 */
export function viewerRandomFindings(srcDir: string): CheckResult[] {
  const out: CheckResult[] = []
  for (const file of sourceFiles(srcDir)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (!CALL.test(line)) return
      const where = `apps/viewer/src/${relative(srcDir, file).split('\\').join('/')}:${i + 1}`
      out.push({
        id: 'world.viewer-math-random',
        fingerprint: `world.viewer-math-random|${where}`,
        severity: 'major',
        title: 'The 3D world uses unseeded randomness',
        what: `${where} calls Math.random(): ${line.trim().slice(0, 160)}`,
        causes: 'The same world can look different each time it is opened, so the world checks cannot compare pictures and a flaw may come and go.',
        evidence: [],
        where,
        fixKind: 'code',
      })
    })
  }
  return out
}

export const viewerRandomCheck: Check = {
  id: 'world.viewer-math-random',
  area: 'world',
  title: 'The viewer takes its randomness from the seed',
  run: async () => viewerRandomFindings(join(repoRoot(), 'apps', 'viewer', 'src')),
}
