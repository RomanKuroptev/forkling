import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { beforeEach, describe, expect, it } from 'vitest'
import { counterNote, counterScript, validCounterCode } from '../src/counter.ts'
import { renderSite } from '../src/render.ts'
import { SHARE_SCRIPT } from '../src/share-row.ts'
import { CARDS_SCRIPT } from '../src/front.ts'
import { viewerBuildEnv } from '../src/viewer.ts'

/** Sharing S7: the visit counter is built switched off. With no code nothing is added; with a code it is GoatCounter, cookie-free. */

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const NOW = new Date('2026-11-18T10:00:00Z')
let world: string
let out: string

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'ct-world-'))
  out = mkdtempSync(join(tmpdir(), 'ct-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

const htmlFiles = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? htmlFiles(join(dir, n)) : n.endsWith('.html') ? [join(dir, n)] : []))

describe('validCounterCode', () => {
  it('takes a GoatCounter site name and nothing else', () => {
    expect(validCounterCode(' Merge-95 ')).toBe('merge-95')
    for (const bad of [undefined, '', 'a.b', 'a/b', 'a"onload=1', '-x', 'x-', 'a b', 'x'.repeat(40)]) expect(validCounterCode(bad)).toBeNull()
  })
})

describe('counter off (no code)', () => {
  it('adds no script, no host, no line under the hood, on any page', () => {
    renderSite(world, out, { now: NOW, baseUrl: 'https://merge.example/' })
    for (const f of htmlFiles(out)) {
      const html = readFileSync(f, 'utf8')
      expect(html, f).not.toMatch(/goatcounter|gc\.zgo\.at/i)
    }
    expect(counterScript(null)).toBe('')
    expect(counterNote(null)).toBe('')
    expect(readFileSync(join(out, 'under-the-hood/index.html'), 'utf8')).not.toContain('counts visits')
  })

  it('an invalid code is no code', () => {
    renderSite(world, out, { now: NOW, counterCode: 'x"><script>' })
    expect(readFileSync(join(out, 'index.html'), 'utf8')).not.toMatch(/goatcounter/i)
  })

  it('the viewer gets an empty code', () => {
    expect(viewerBuildEnv({ baseUrl: 'https://o.github.io/merge/' })?.VITE_GOATCOUNTER_CODE).toBe('')
  })
})

describe('counter on (with a code)', () => {
  it('puts the cookie-free GoatCounter script on every page and says so under the hood', () => {
    renderSite(world, out, { now: NOW, baseUrl: 'https://merge.example/', counterCode: 'merge95' })
    const files = htmlFiles(out)
    expect(files.length).toBeGreaterThan(5)
    for (const f of files) expect(readFileSync(f, 'utf8'), f).toContain('<script data-goatcounter="https://merge95.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>')
    const hood = readFileSync(join(out, 'under-the-hood/index.html'), 'utf8')
    expect(hood).toContain('count visits with GoatCounter')
    expect(hood).toMatch(/No cookies/)
    expect(existsSync(join(out, 'index.html'))).toBe(true)
  })

  it('the viewer is built with the code', () => {
    expect(viewerBuildEnv({ baseUrl: 'https://o.github.io/merge/', counterCode: 'merge95' })?.VITE_GOATCOUNTER_CODE).toBe('merge95')
  })
})

describe('counting taps', () => {
  const count: unknown[] = []
  const win = (on: boolean) => (on ? { goatcounter: { count: (e: unknown) => void count.push(e) } } : {})

  it('share and save-picture taps are counted as events when the counter is there, and are quiet when it is not', () => {
    for (const on of [true, false]) {
      count.length = 0
      const handlers: Record<string, () => void> = {}
      const share = { textContent: 'share', getAttribute: () => 'T', addEventListener: (_t: string, f: () => void) => void (handlers.share = f) }
      const save = { addEventListener: (_t: string, f: () => void) => void (handlers.save = f) }
      vm.runInNewContext(SHARE_SCRIPT, { window: win(on), document: { querySelectorAll: (q: string) => (q === '.js-share' ? [share] : [save]), title: 'D' }, location: { href: 'https://x.test/' }, navigator: { share: () => Promise.resolve() }, Array })
      handlers.share?.()
      handlers.save?.()
      expect(count).toEqual(on ? [{ path: 'share', title: 'share', event: true }, { path: 'save-picture', title: 'save-picture', event: true }] : [])
    }
  })

  it('the opened card counts its share tap the same way', () => {
    count.length = 0
    const handlers: Record<string, () => void> = {}
    const mk = (extra: Record<string, unknown> = {}) => ({ textContent: '', hidden: true, style: {}, attrs: {} as Record<string, string>, setAttribute() {}, getAttribute: () => 'x', addEventListener: (t: string, f: () => void) => void (handlers[t] = f), focus() {}, ...extra })
    const nodes: Record<string, unknown> = {}
    for (const id of ['card-open', 'co-title', 'co-pic', 'co-meta', 'co-cap', 'co-count', 'co-share', 'co-prev', 'co-next', 'co-close']) nodes[id] = mk()
    const shareBtn = nodes['co-share'] as { addEventListener: (t: string, f: () => void) => void }
    let shareHandler: () => void = () => {}
    shareBtn.addEventListener = (_t, f) => void (shareHandler = f)
    vm.runInNewContext(CARDS_SCRIPT, { window: win(true), document: { getElementById: (id: string) => nodes[id], querySelectorAll: () => [mk()], addEventListener() {} }, location: { href: 'https://x.test/' }, URL, Array, navigator: {} })
    shareHandler()
    expect(count).toEqual([{ path: 'share', title: 'share', event: true }])
  })
})
