import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
const file = (kind: string, title: string, status: string, answer = '') => ['---', `kind: ${kind}`, `title: ${title}`, `status: ${status}`, '---', `Body of ${title}.`, '', ...(answer ? [`Roman: ${answer}`, ''] : [])].join('\n')

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'srs-world-'))
  out = mkdtempSync(join(tmpdir(), 'srs-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

describe('/requests/ with a request of each status (spec v4 8)', () => {
  it('shows the title, kind, status in words and the answer of each, newest first', () => {
    put('self/requests/2026-11-01.md', file('tool', 'A reader', 'open'))
    put('self/requests/2026-11-08.md', file('setting', 'Looser limit', 'yes', 'Done, try it.'))
    put('self/requests/2026-11-15.md', file('other', 'A thought', 'no', 'Not for now.'))
    put('self/requests/2026-11-22.md', file('tool', 'A viewer', 'later'))
    put('self/requests/2026-11-29.md', file('tool', 'A weather feed', 'built', 'It is live.'))
    renderSite(world, out)
    const html = readFileSync(join(out, 'requests/index.html'), 'utf8')
    for (const s of ['A reader', 'Looser limit', 'A thought', 'A viewer', 'A weather feed']) expect(html).toContain(s)
    for (const s of ['No answer yet.', 'Roman said yes.', 'Roman said no.', 'Roman said later.', 'Roman built it.']) expect(html).toContain(s)
    for (const s of ['data-status="open"', 'data-status="yes"', 'data-status="no"', 'data-status="later"', 'data-status="built"', 'data-kind="tool"', 'data-kind="setting"']) expect(html).toContain(s)
    expect(html).toContain('Done, try it.')
    expect(html.indexOf('A weather feed')).toBeLessThan(html.indexOf('A reader'))
  })
  it('escapes a title', () => {
    put('self/requests/2026-11-01.md', file('tool', '<b>x</b>', 'open'))
    renderSite(world, out)
    expect(readFileSync(join(out, 'requests/index.html'), 'utf8')).toContain('&lt;b&gt;x&lt;/b&gt;')
  })
})
