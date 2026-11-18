import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Project } from '@forkling/schema'
import { renderSite } from '../src/render.ts'
import { sharePictureSvg } from '../src/share-picture.ts'

/** Sharing S2: every page has link-preview tags, and the front page's picture is made from today's first card. */

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const BASE = 'https://merge.example/'
const NOW = new Date('2026-11-18T10:00:00Z')
// A real 1 by 1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64')

let world: string
let out: string
const put = (rel: string, content: string | Buffer) => {
  mkdirSync(dirname(join(world, rel)), { recursive: true })
  writeFileSync(join(world, rel), content)
}
const pngSize = (f: string) => {
  const b = readFileSync(f)
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'sp-world-'))
  out = mkdtempSync(join(tmpdir(), 'sp-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

describe('sharePictureSvg', () => {
  it('escapes every word, embeds the picture as data and leaves it out when it is not a PNG', () => {
    const svg = sharePictureSvg({ heading: 'Today <b>Merge</b>', caption: 'a "quoted" <script>', address: 'merge.example', image: PNG })
    expect(svg).toContain('Today &lt;b&gt;Merge&lt;/b&gt;')
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('href="data:image/png;base64,')
    expect(sharePictureSvg({ heading: 'x', caption: 'y', address: 'z', image: Buffer.from('not a png at all') })).not.toContain('data:image')
  })
})

describe('link previews', () => {
  it('a day with no card at all still gives the front page an image of 1200 by 630', () => {
    renderSite(world, out, { now: NOW, baseUrl: BASE })
    const html = readFileSync(join(out, 'index.html'), 'utf8')
    expect(html).toContain(`<meta property="og:image" content="${BASE}og/today.png">`)
    expect(pngSize(join(out, 'og/today.png'))).toEqual([1200, 630])
  })

  it('the front page picture is made from the first card, and a work and a project page use their own picture', () => {
    put('projects/toaster/project.json', JSON.stringify(Project.parse({ id: 'toaster', name: 'toaster.api', aim: 'toast', started: '2026-11-16T08:00:00Z', status: 'building', reason: null, inspiredBy: null, installedIn: null, sessions: [{ at: '2026-11-18T09:00:00Z', caption: 'session one', usd: 0.2, turns: 5, shot: 'shots/1.png', broken: false, engine: false }] })))
    put('projects/toaster/shots/1.png', PNG)
    renderSite(world, out, { now: NOW, baseUrl: BASE })
    const project = readFileSync(join(out, 'projects/toaster/index.html'), 'utf8')
    expect(project).toContain(`<meta property="og:image" content="${BASE}og/project-toaster.png">`)
    expect(project).toContain(`<meta property="og:url" content="${BASE}projects/toaster/">`)
    expect(existsSync(join(out, 'og/project-toaster.png'))).toBe(true)
    expect(readFileSync(join(out, 'og/today.png')).length).toBeGreaterThan(1000)
  })

  it('has no share tags without an address', () => {
    renderSite(world, out, { now: NOW })
    expect(readFileSync(join(out, 'index.html'), 'utf8')).not.toContain('og:image')
  })
})
