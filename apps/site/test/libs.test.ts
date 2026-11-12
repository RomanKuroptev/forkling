import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildSite } from '../src/build.ts'
import { copyLibs, libVersions, VENDORED_FILES } from '../src/libs.ts'

const siteRoot = fileURLToPath(new URL('..', import.meta.url))
const templateWorld = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))

let out: string
beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), 'libs-'))
})
afterEach(() => rmSync(out, { recursive: true, force: true }))

describe('the vendored libraries (spec 7.1: p5.js, Tone.js and three.js, served from Merge\'s own site)', () => {
  it('copies p5, Tone and three into lib/, with three\'s core file beside it so its import resolves', () => {
    const written = copyLibs(out)
    expect(written.sort()).toEqual(['lib/Tone.js', 'lib/p5.min.js', 'lib/three/three.core.js', 'lib/three/three.module.js', 'lib/versions.json'])
    for (const rel of VENDORED_FILES.map((f) => f.to)) expect(statSync(join(out, rel)).size, rel).toBeGreaterThan(10_000)
    expect(readFileSync(join(out, 'lib/three/three.module.js'), 'utf8')).toContain("from './three.core.js'")
  })

  it('writes the pinned versions next to them, so a page and a reader can tell what they got', () => {
    copyLibs(out)
    expect(JSON.parse(readFileSync(join(out, 'lib/versions.json'), 'utf8'))).toEqual(libVersions())
  })

  it('pins each library to an exact version in package.json, so the engine release decides what is served', () => {
    const pkg = JSON.parse(readFileSync(join(siteRoot, 'package.json'), 'utf8')) as { devDependencies: Record<string, string> }
    for (const name of ['p5', 'tone', 'three']) expect(pkg.devDependencies[name], name).toMatch(/^\d+\.\d+\.\d+$/)
    expect(libVersions()).toEqual({ p5: pkg.devDependencies.p5, tone: pkg.devDependencies.tone, three: pkg.devDependencies.three })
  })
})

describe('buildSite', () => {
  it('is the site with the libraries beside it', () => {
    const { pages } = buildSite(templateWorld, out)
    expect(pages.length).toBeGreaterThan(0)
    expect(existsSync(join(out, 'index.html'))).toBe(true)
    expect(existsSync(join(out, 'lib/p5.min.js'))).toBe(true)
  })
})
