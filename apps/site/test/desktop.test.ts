import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildSite } from '../src/build.ts'
import { FONT_FILES } from '../src/fonts.ts'
import { STYLE } from '../src/style.ts'

const templateWorld = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))

let out: string
beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), 'desktop-'))
})
afterEach(() => rmSync(out, { recursive: true, force: true }))

const htmlFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? htmlFiles(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []))

describe('every page is a window on Merge 95 (look L4a)', () => {
  it('wraps each page in a window with a title bar and three buttons, and gives the links as icons and as a start menu', () => {
    buildSite(templateWorld, out, {})
    const pages = htmlFiles(out).filter((f) => !f.includes(`${join(out, 'workshop')}`) || f.endsWith('index.html'))
    expect(pages.length).toBeGreaterThan(5)
    for (const file of pages) {
      const html = readFileSync(file, 'utf8')
      if (!html.includes('class="shell"')) continue
      expect(html, file).toContain('class="window"')
      expect(html, file).toContain('class="title"')
      expect(html.match(/<i><\/i>/g)!.length, file).toBeGreaterThanOrEqual(3)
      expect(html, file).toContain('class="icons"')
      expect(html, file).toContain('class="start-btn"')
      expect(html, file).toContain('Merge 95')
      // The same links twice: icons for a laptop, the menu for every screen.
      const icons = (/<nav class="icons"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? '').match(/<a /g)?.length ?? 0
      const menu = (/<nav class="menu"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? '').match(/<a /g)?.length ?? 0
      expect(icons, file).toBe(menu)
      expect(icons, file).toBeGreaterThan(3)
    }
  })

  it('marks the page you are on in both the icons and the menu, and the start menu needs no script', () => {
    buildSite(templateWorld, out, {})
    const html = readFileSync(join(out, 'index.html'), 'utf8')
    expect(html.match(/aria-current="page"/g)!.length).toBe(2)
    expect(html).toContain('<input type="checkbox" id="start-toggle"')
    expect(html).not.toContain('<details')
  })

  it('serves the two fonts from the site itself, not from Google', () => {
    const written = buildSite(templateWorld, out, {}).pages
    for (const f of FONT_FILES) {
      expect(written).toContain(f.to)
      expect(statSync(join(out, f.to)).size, f.to).toBeGreaterThan(2000)
    }
    expect(STYLE).toContain("url('fonts/press-start-2p.woff2')")
    expect(STYLE).toContain("url('fonts/vt323.woff2')")
    expect(STYLE).not.toMatch(/https?:\/\//)
    expect(existsSync(join(out, 'style.css'))).toBe(true)
    for (const file of htmlFiles(out)) expect(readFileSync(file, 'utf8'), file).not.toMatch(/fonts\.googleapis|fonts\.gstatic/)
  })

  it('keeps text readable: VT323 sized so it measures 18 to 20 px (it renders small for its size), dark quiet text, buttons at least 44 px tall, ink on face', () => {
    expect(STYLE).toMatch(/body \{[^}]*font: 26px/)
    expect(STYLE).toMatch(/button, \.play, \.note-answer-btn \{[^}]*min-height: 44px/)
    expect(STYLE).toContain('--face: #ffd6f1')
    expect(STYLE).toContain('--ink: #1a0b3b')
    expect(STYLE).toContain('--quiet: #3d2c6b')
    expect(STYLE).not.toContain('<header')
  })

  it('has dark secondary text: at least 4.5 to 1 on the face colour', () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
    }
    const quiet = /--quiet: (#[0-9a-f]{6})/.exec(STYLE)![1]!
    const face = /--face: (#[0-9a-f]{6})/.exec(STYLE)![1]!
    const [hi, lo] = [lum(face), lum(quiet)].sort((a, b) => b - a)
    expect((hi! + 0.05) / (lo! + 0.05)).toBeGreaterThanOrEqual(4.5)
  })

  it('leaves the frame round works and projects alone', () => {
    expect(STYLE).toMatch(/\.work-frame iframe \{[^}]*border: 2px solid var\(--ink\)/)
  })
})
