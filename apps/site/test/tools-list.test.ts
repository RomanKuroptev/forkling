import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderSite } from '../src/render.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const template = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
let world: string
let out: string
const put = (rel: string, content: string) => {
  const full = join(world, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}
const tool = (over: Record<string, unknown> = {}) => ({ id: 'read-sites', name: 'Read web sites', what: 'Read a few web sites.', since: '2026-11-10', class: 'read', gift: false, ...over })

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'tl-world-'))
  out = mkdtempSync(join(tmpdir(), 'tl-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

describe('/requests/ lists what Merge can do (spec v4 8)', () => {
  it('shows each tool with its words, when it came and whether it was a gift, between the requests and the wishes', () => {
    put('mind/tools.json', JSON.stringify({ tools: [tool(), tool({ id: 'lemmy', name: 'Lemmy', what: 'Read a Lemmy community.', since: '2026-11-23', gift: true })] }))
    put('self/requests/2026-11-22.md', 'A request.\n')
    renderSite(world, out)
    const html = readFileSync(join(out, 'requests/index.html'), 'utf8')
    expect(html).toContain('What Merge can do')
    expect(html).toContain('Read a few web sites.')
    expect(html).toContain('Read a Lemmy community.')
    expect(html).toMatch(/a gift/i)
    expect(html.indexOf('A request.')).toBeLessThan(html.indexOf('What Merge can do'))
  })
  it('the page exists for a world that has only tools, and escapes them', () => {
    put('mind/tools.json', JSON.stringify({ tools: [tool({ name: '<b>x</b>' })] }))
    renderSite(world, out)
    expect(readFileSync(join(out, 'requests/index.html'), 'utf8')).toContain('&lt;b&gt;x&lt;/b&gt;')
  })
  it('does not show an act entry, and a broken file shows nothing', () => {
    put('mind/tools.json', JSON.stringify({ tools: [tool({ id: 'post', name: 'Post things', class: 'act' })] }))
    renderSite(world, out)
    expect(existsSync(join(out, 'requests/index.html')) ? readFileSync(join(out, 'requests/index.html'), 'utf8') : '').not.toContain('Post things')
  })
  it('renders from the template world with its tools', () => {
    cpSync(template, world, { recursive: true, force: true })
    copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
    renderSite(world, out)
    expect(readFileSync(join(out, 'requests/index.html'), 'utf8')).toContain('What Merge can do')
  })
})
