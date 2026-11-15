import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderSite } from '../src/render.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))

let world: string
let out: string
const put = (rel: string, content: string) => {
  const full = join(world, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}
const page = (rel: string) => readFileSync(join(out, rel), 'utf8')

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'about-world-'))
  out = mkdtempSync(join(tmpdir(), 'about-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

const copy = (date: string, text: string, changes: [string, string][]) => `# about.md as of ${date}\n\n${text}\n\n## Why it changed\n\n${changes.map(([what, why]) => `- ${what}: ${why}`).join('\n')}\n`

describe('/about/ (spec 9.2: who Merge says it is, and how that changed)', () => {
  it('has no page and no nav link until Merge has written about itself', () => {
    renderSite(world, out)
    expect(existsSync(join(out, 'about/index.html'))).toBe(false)
    expect(page('index.html')).not.toContain('about/')
  })

  it('shows about.md in its own words, with its traits as a list, says only Merge writes it, and links to it from every page', () => {
    put('self/about.md', 'I am patient and fond of fog.\n\n- patient\n- fond of fog\n')
    renderSite(world, out)
    const html = page('about/index.html')
    expect(html).toContain('I am patient and fond of fog.')
    expect(html).toMatch(/<li>patient<\/li>/)
    expect(html).toMatch(/only Merge writes/i)
    expect(html).toMatch(/Sunday/)
    for (const rel of ['index.html', 'journal/index.html']) expect(page(rel)).toContain('about/')
  })

  it('lists each weekly copy newest first, with the reasons it changed', () => {
    put('self/about.md', 'Newest.\n')
    put('self/history/2026-11-08.md', copy('2026-11-08', 'First version.', [['wrote the first version', 'The week showed me what I keep doing.']]))
    put('self/history/2026-11-15.md', copy('2026-11-15', 'Second version.', [['added patient', 'I waited out three foggy days.']]))
    renderSite(world, out)
    const html = page('about/index.html')
    expect(html.indexOf('2026-11-15')).toBeLessThan(html.indexOf('2026-11-08'))
    expect(html).toContain('First version.')
    expect(html).toContain('Second version.')
    expect(html).toContain('added patient: I waited out three foggy days.')
  })

  it('shows the history even when about.md is gone, and says there is nothing current', () => {
    put('self/history/2026-11-08.md', copy('2026-11-08', 'First version.', [['wrote it', 'Because.']]))
    renderSite(world, out)
    expect(page('about/index.html')).toContain('First version.')
  })

  it('escapes everything: text becomes text, never markup or an unsafe link', () => {
    put('self/about.md', '<script>alert(1)</script> [x](javascript:alert(1))\n')
    put('self/history/2026-11-08.md', '<img src=x onerror=alert(1)>\n')
    renderSite(world, out)
    const html = page('about/index.html')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toMatch(/href="javascript:/)
  })

  it('ignores a history file whose name is not a date', () => {
    put('self/about.md', 'Now.\n')
    put('self/history/notes.md', 'Stray file.\n')
    put('self/history/2026-11-08.md', copy('2026-11-08', 'Real one.', [['x', 'y']]))
    renderSite(world, out)
    const html = page('about/index.html')
    expect(html).toContain('Real one.')
    expect(html).not.toContain('Stray file.')
  })
})
