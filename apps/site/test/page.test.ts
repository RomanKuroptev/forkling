import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
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
  world = mkdtempSync(join(tmpdir(), 'page-world-'))
  out = mkdtempSync(join(tmpdir(), 'page-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

describe('/page/ (spec 9.7)', () => {
  it('has no page and no nav link while Merge has written nothing', () => {
    renderSite(world, out)
    expect(existsSync(join(out, 'page/index.html'))).toBe(false)
    expect(page('index.html')).not.toContain('page/')
  })

  it('shows the current page in its own words, says only Merge writes it, and links to it from every page', () => {
    put('self/page.md', 'Rest when the fog comes in.\n\nThe lamp is my running joke.\n')
    renderSite(world, out)
    const html = page('page/index.html')
    expect(html).toContain('Rest when the fog comes in.')
    expect(html).toContain('The lamp is my running joke.')
    expect(html).toMatch(/only Merge writes/i)
    expect(html).toMatch(/once a day/i)
    expect(html.match(/<p>/g)!.length).toBeGreaterThanOrEqual(2)
    for (const rel of ['index.html', 'journal/index.html']) expect(page(rel)).toContain('page/')
  })

  it('lists the earlier versions newest first, each with when it was written, and not the current one again', () => {
    put('self/page.md', 'Newest note.\n')
    put('self/page-history/2026-11-13T09-00-00Z.md', 'First note.\n')
    put('self/page-history/2026-11-14T09-30-00Z.md', 'Second note.\n')
    put('self/page-history/2026-11-15T10-00-00Z.md', 'Newest note.\n')
    renderSite(world, out)
    const html = page('page/index.html')
    // The file names are UTC; the page shows Merge's own time (Stockholm, an hour ahead in November).
    expect(html).toContain('2026-11-14 10:30 (Europe/Stockholm)')
    expect(html.indexOf('2026-11-14 10:30')).toBeLessThan(html.indexOf('2026-11-13 10:00'))
    expect(html).not.toContain('2026-11-15 11:00')
    expect(html.match(/Newest note\./g)).toHaveLength(1)
    expect(html).toContain('First note.')
    expect(html).toContain('Second note.')
  })

  it('says the page is empty when it was cleared but has a history', () => {
    put('self/page.md', '')
    put('self/page-history/2026-11-13T09-00-00Z.md', 'First note.\n')
    renderSite(world, out)
    expect(page('page/index.html')).toMatch(/empty/i)
    expect(page('page/index.html')).toContain('First note.')
  })

  it('escapes everything: text becomes text, never markup or a link', () => {
    put('self/page.md', '<script>alert(1)</script> [x](javascript:alert(1)) & https://example.com\n')
    put('self/page-history/2026-11-13T09-00-00Z.md', '<img src=x onerror=alert(1)>\n')
    renderSite(world, out)
    const html = page('page/index.html')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toMatch(/href="javascript:/)
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toMatch(/<a [^>]*href="https:\/\/example\.com/)
  })

  it('ignores a history file with a name that is not a moment, and keeps the order by name', () => {
    put('self/page.md', 'Now.\n')
    put('self/page-history/notes.md', 'Stray file.\n')
    put('self/page-history/2026-11-13T09-00-00Z.md', 'Real one.\n')
    renderSite(world, out)
    const html = page('page/index.html')
    expect(html).toContain('Real one.')
    expect(html).not.toContain('Stray file.')
  })

  it('keeps every earlier version collapsed until someone opens it', () => {
    put('self/page.md', 'Now.\n')
    put('self/page-history/2026-11-13T09-00-00Z.md', 'First note.\n')
    put('self/page-history/2026-11-14T09-30-00Z.md', 'Second note.\n')
    renderSite(world, out)
    const html = page('page/index.html')
    expect(html.match(/<details/g)).toHaveLength(2)
    expect(html).not.toMatch(/<details[^>]*\bopen\b/)
  })

  it('has no "Earlier versions" heading when the only copy is the current page', () => {
    put('self/page.md', 'Only note.\n')
    put('self/page-history/2026-11-13T09-00-00Z.md', 'Only note.\n')
    renderSite(world, out)
    const html = page('page/index.html')
    expect(html).not.toContain('Earlier versions')
    expect(html.match(/Only note\./g)).toHaveLength(1)
  })

  it('keeps a newest copy that differs from the current page (it was restored or edited by hand)', () => {
    put('self/page.md', 'Restored note.\n')
    put('self/page-history/2026-11-15T10-00-00Z.md', 'Newer note.\n')
    renderSite(world, out)
    expect(page('page/index.html')).toContain('Newer note.')
  })
})

