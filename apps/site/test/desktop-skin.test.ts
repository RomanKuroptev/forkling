import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildSite } from '../src/build.ts'
import { ICONS, iconFor, iconSvg } from '../src/icons.ts'
import { STYLE } from '../src/style.ts'

const templateWorld = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))

let dir: string
let out: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'skin-'))
  out = join(dir, 'site')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const htmlFiles = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? htmlFiles(join(d, e.name)) : e.name.endsWith('.html') ? [join(d, e.name)] : []))

describe('the pixel icons (look L4b)', () => {
  it('are 8 by 8 pixels in the look\'s colours, and every page name has one', () => {
    for (const [name, rows] of Object.entries(ICONS)) {
      expect(rows, name).toHaveLength(8)
      for (const r of rows) expect(r, name).toMatch(/^[#opchsgw.]{8}$/)
    }
    for (const label of ['Home', 'Journal', 'Notebook', 'Obsessions', 'Notes', 'Workshop', 'Why?', 'Places', 'Projects', 'Requests', 'Trails', 'About', 'Page', 'Archive']) expect(ICONS[iconFor(label)], label).toBeDefined()
    expect(iconFor('Something new')).toBe('page')
    expect(iconSvg('home')).toContain('shape-rendering="crispEdges"')
  })

  it('are written into the site, shown by the stylesheet without smoothing, and are not emoji', () => {
    const written = buildSite(templateWorld, out, {}).pages
    for (const name of Object.keys(ICONS)) {
      expect(written).toContain(`icons/${name}.svg`)
      expect(STYLE).toContain(`url('icons/${name}.svg')`)
    }
    expect(STYLE).toContain('image-rendering: pixelated')
    for (const f of htmlFiles(out)) expect(readFileSync(f, 'utf8'), f).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })
})

describe('the favicon and the share picture', () => {
  it('has Merge\'s monitor face for a favicon, linked from every page', () => {
    buildSite(templateWorld, out, {})
    expect(readFileSync(join(out, 'favicon.svg'), 'utf8')).toContain('#39ff88')
    for (const f of htmlFiles(out)) expect(readFileSync(f, 'utf8'), f).toMatch(/<link rel="icon" type="image\/svg\+xml" href="(\.\.\/)*favicon\.svg">/)
  })

  it('gives every page a title, a description and a large card with the 1200 by 630 desktop picture, when the site\'s address is known', () => {
    buildSite(templateWorld, out, { baseUrl: 'https://merge.example/' })
    const png = readFileSync(join(out, 'share.png'))
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
    for (const f of htmlFiles(out)) {
      const html = readFileSync(f, 'utf8')
      expect(html, f).toContain('<meta property="og:title"')
      expect(html, f).toContain('<meta property="og:description"')
      const image = /<meta property="og:image" content="https:\/\/merge\.example\/([^"]+)">/.exec(html)?.[1]
      expect(image, f).toBeTruthy()
      expect(existsSync(join(out, image ?? 'missing')), `${f}: ${image}`).toBe(true)
      expect(html, f).toMatch(/<meta property="og:url" content="https:\/\/merge\.example\//)
      expect(html, f).toMatch(/<meta name="twitter:image" content="https:\/\/merge\.example\//)
      expect(html, f).toContain('<meta name="twitter:card" content="summary_large_image">')
    }
  })

  it('leaves the share tags out when there is no address to make them from', () => {
    buildSite(templateWorld, out, {})
    expect(readFileSync(join(out, 'index.html'), 'utf8')).not.toContain('og:image')
  })
})

describe('the home page line', () => {
  it('says awake or asleep and when Merge was last seen, with no pet-era mood words', () => {
    buildSite(templateWorld, out, {})
    const html = readFileSync(join(out, 'index.html'), 'utf8')
    expect(html).toMatch(/<p class="quiet" id="live-status">Awake\. Last seen /)
    expect(html).not.toMatch(/feeling/)
  })
})

describe('the wallpaper, the clock and the motion', () => {
  const sleeping = () => {
    const world = join(dir, 'world')
    cpSync(templateWorld, world, { recursive: true })
    const file = join(world, 'forkling.json')
    const f = JSON.parse(readFileSync(file, 'utf8'))
    f.asleep = true
    writeFileSync(file, JSON.stringify(f))
    return world
  }

  it('is the sunset by day and the starry night sky while Merge sleeps', () => {
    buildSite(templateWorld, out, {})
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toContain('<body>')
    const night = join(dir, 'night')
    buildSite(sleeping(), night, {})
    expect(readFileSync(join(night, 'index.html'), 'utf8')).toContain('<body class="night">')
    expect(STYLE).toContain('body.night')
    expect(STYLE).toMatch(/radial-gradient\(1\.5px 1\.5px/)
  })

  it('has a clock in Merge\'s time zone in the taskbar, which a small script moves on', () => {
    buildSite(templateWorld, out, {})
    const html = readFileSync(join(out, 'index.html'), 'utf8')
    expect(html).toMatch(/<time class="clock" data-tz="[A-Za-z_/]+">\d\d:\d\d<\/time>/)
    expect(html).toContain('setInterval')
  })

  it('drifts the grid slowly, and not at all for visitors who ask for less motion', () => {
    expect(STYLE).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*body:not\(\.night\) \{ animation: drift 8s linear infinite; \}/)
    expect(existsSync(join(templateWorld, 'forkling.json'))).toBe(true)
  })
})
