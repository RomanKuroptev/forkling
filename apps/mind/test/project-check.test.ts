import { describe, expect, it } from 'vitest'
import { withPolicy } from '../src/builds/sandbox.ts'
import { projectStaticCheck, staticCheck } from '../src/builds/work-check.ts'

/**
 * Spec-v4 3.1 and 3.3: a project's static check before `done`. A project is several files, so its pages may load its own files and
 * the libraries from three folders up (`projects/<id>/src/` on the site). Everything else of v3.3 7.3 holds. Works keep their own
 * check, unchanged: a work still may not load a local file.
 */

const page = (body: string) => withPolicy(`<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body>${body}</body></html>`)
const files = (entries: Record<string, string>) => new Map(Object.entries(entries))
const reasons = (entries: Record<string, string>) => projectStaticCheck(files(entries)).reasons.join(' | ')

describe('projectStaticCheck: a good project', () => {
  it('passes a page that loads its own script, style and a library, and a script that imports its own module and three.js', () => {
    const r = projectStaticCheck(
      files({
        'index.html': page(`<script src="../../../lib/p5.min.js"></script><script src="main.js"></script><script type="module" src="js/scene.js"></script>`),
        'main.js': 'function setup() { createCanvas(200, 200) }',
        'js/scene.js': "import * as THREE from '../../../../lib/three/three.module.js'\nimport { tide } from './tide.js'\nconsole.log(THREE, tide)",
        'js/tide.js': 'export const tide = 3',
        'about.md': '# notes',
      }),
    )
    expect(r.reasons).toEqual([])
    expect(r.ok).toBe(true)
  })
})

describe('projectStaticCheck: what it refuses', () => {
  it('needs src/index.html', () => {
    expect(reasons({ 'main.js': 'let a = 1' })).toMatch(/index\.html/)
  })

  it('needs the policy in every page', () => {
    expect(reasons({ 'index.html': '<html><head></head><body></body></html>' })).toMatch(/policy/)
  })

  it.each([
    ['fetch in a script file', { 'index.html': page('<script src="a.js"></script>'), 'a.js': "fetch('https://example.com')" }, /fetch/],
    ['a WebSocket in a script file', { 'index.html': page('<script src="a.js"></script>'), 'a.js': "new WebSocket('wss://x')" }, /WebSocket/],
    ['a script from another host', { 'index.html': page('<script src="https://cdn.example.org/x.js"></script>') }, /cdn\.example\.org/],
    ['a script file that is not in the project', { 'index.html': page('<script src="missing.js"></script>') }, /missing\.js/],
    ['a path that climbs out of the project', { 'index.html': page('<script src="../../other/src/x.js"></script>') }, /other/],
    ['an import from another host', { 'index.html': page('<script type="module" src="a.js"></script>'), 'a.js': "import x from 'https://esm.sh/x'" }, /esm\.sh/],
    ['a dynamic import', { 'index.html': page('<script src="a.js"></script>'), 'a.js': "import('./b.js')" }, /imports a module while it runs/],
    ['localStorage in a page', { 'index.html': page('<script>localStorage.x = 1</script>') }, /localStorage/],
    ['a form', { 'index.html': page('<form></form>') }, /form/],
    ['CSS that loads from another host', { 'index.html': page('<link rel="stylesheet" href="a.css">'), 'a.css': 'body { background: url(https://x.org/a.png) }' }, /x\.org/],
  ])('refuses %s', (_, entries, reason) => {
    expect(reasons(entries as Record<string, string>)).toMatch(reason)
  })

  it('lets a page link its own stylesheet, which a work may not', () => {
    expect(reasons({ 'index.html': page('<link rel="stylesheet" href="a.css">'), 'a.css': 'body { color: red }' })).toBe('')
  })
})

describe('works keep their own check (spec 7.3), unchanged', () => {
  it('still refuses a work that loads a local script', () => {
    expect(staticCheck(page('<script src="main.js"></script>'), { size: 'full' }).ok).toBe(false)
  })

  it('still refuses a work that links a stylesheet', () => {
    expect(staticCheck(page('<link rel="stylesheet" href="a.css">'), { size: 'full' }).ok).toBe(false)
  })

  it('still takes the libraries only from two folders up', () => {
    expect(staticCheck(page('<script src="../../lib/p5.min.js"></script><canvas></canvas>'), { size: 'full' }).ok).toBe(true)
    expect(staticCheck(page('<script src="../../../lib/p5.min.js"></script>'), { size: 'full' }).ok).toBe(false)
  })
})
