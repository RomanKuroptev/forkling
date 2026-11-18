import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Project } from '@forkling/schema'
import { renderSite } from '../src/render.ts'
import { SHARE_SCRIPT, shareRow } from '../src/share-row.ts'

/** Sharing S3: one share control and a saved picture on work and project pages and on cards; it needs no 3D world. */

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const BASE = 'https://merge.example/'
const NOW = new Date('2026-11-18T10:00:00Z')
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64')

let world: string
let out: string
const put = (rel: string, content: string | Buffer) => {
  mkdirSync(dirname(join(world, rel)), { recursive: true })
  writeFileSync(join(world, rel), content)
}

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'sr-world-'))
  out = mkdtempSync(join(tmpdir(), 'sr-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

describe('shareRow', () => {
  it('has a share button, a download link to the picture, and the script, all escaped', () => {
    const html = shareRow({ root: '../', title: 'A "title" <b>', save: 'og/work-a.png' })
    expect(html).toContain('class="js-share" data-title="A &quot;title&quot; &lt;b&gt;"')
    expect(html).toContain('<a class="save-pic" href="../og/work-a.png" download>')
    expect(html).toContain('<script src="../share.js" defer></script>')
  })
})

describe('share.js', () => {
  const run = (nav: Record<string, unknown>) => {
    const handlers: (() => void)[] = []
    const b = { textContent: 'share', getAttribute: (k: string) => (k === 'data-title' ? 'T' : null), addEventListener: (_t: string, f: () => void) => void handlers.push(f) }
    vm.runInNewContext(SHARE_SCRIPT, { document: { querySelectorAll: () => [b], title: 'D' }, location: { href: 'https://x.test/p/' }, navigator: nav, Array })
    return { b, click: () => handlers[0]?.() }
  }
  it('opens the share sheet with the page address, or copies it where there is no sheet', async () => {
    const shared: unknown[] = []
    run({ share: (d: unknown) => (shared.push(d), Promise.resolve()) }).click()
    expect(shared).toEqual([{ title: 'T', url: 'https://x.test/p/' }])
    const copied: string[] = []
    const c = run({ clipboard: { writeText: (t: string) => (copied.push(t), Promise.resolve()) } })
    c.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(copied).toEqual(['https://x.test/p/'])
    expect(c.b.textContent).toBe('link copied')
  })
})

describe('on the site', () => {
  it('a project page has the control and the saved picture exists; the front page has no 3D script', () => {
    put('projects/toaster/project.json', JSON.stringify(Project.parse({ id: 'toaster', name: 'toaster.api', aim: 'toast', started: '2026-11-16T08:00:00Z', status: 'building', reason: null, inspiredBy: null, installedIn: null, sessions: [{ at: '2026-11-18T09:00:00Z', caption: 'session one', usd: 0.2, turns: 5, shot: 'shots/1.png', broken: false, engine: false }] })))
    put('projects/toaster/shots/1.png', PNG)
    renderSite(world, out, { now: NOW, baseUrl: BASE })
    const page = readFileSync(join(out, 'projects/toaster/index.html'), 'utf8')
    expect(page).toContain('class="js-share"')
    expect(page).toContain('href="../../og/project-toaster.png" download')
    expect(existsSync(join(out, 'og/project-toaster.png'))).toBe(true)
    expect(existsSync(join(out, 'share.js'))).toBe(true)
    const front = readFileSync(join(out, 'index.html'), 'utf8')
    expect(front).toContain('data-save="og/project-toaster.png"')
    expect(front).toContain('id="co-save"')
    expect(front).not.toMatch(/<canvas|three/i)
  })
})
