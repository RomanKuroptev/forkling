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
  world = mkdtempSync(join(tmpdir(), 'selfreq-world-'))
  out = mkdtempSync(join(tmpdir(), 'selfreq-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

describe('Merge\'s own requests on /requests/ (spec 9.5)', () => {
  it('writes the page, and a nav link, when its only content is a request from Merge', () => {
    expect(existsSync(join(out, 'requests/index.html'))).toBe(false)
    put('self/requests/2026-11-15.md', 'Could I read one more site?\nIt keeps blocking me.\n')
    renderSite(world, out)
    const html = page('requests/index.html')
    expect(html).toContain('Could I read one more site?')
    expect(html).toContain('It keeps blocking me.')
    expect(page('index.html')).toContain('requests/')
  })

  it('says it is Merge asking Roman about its own setup, and that nothing changes because of it', () => {
    put('self/requests/2026-11-15.md', 'A request.\n')
    renderSite(world, out)
    const html = page('requests/index.html')
    expect(html).toMatch(/Merge.*about its own setup/i)
    expect(html).toMatch(/nothing changes/i)
  })

  it('shows Roman\'s answer when he gave one, and "no answer yet" when he has not', () => {
    put('self/requests/2026-11-08.md', 'First ask.\n\nRoman: Not yet. Ask again after the run.\n')
    put('self/requests/2026-11-15.md', 'Second ask.\n')
    renderSite(world, out)
    const html = page('requests/index.html')
    expect(html).toContain('Roman answered')
    expect(html).toContain('Not yet. Ask again after the run.')
    expect(html).toMatch(/No answer yet/i)
  })

  it('lists them newest first', () => {
    put('self/requests/2026-11-08.md', 'Older ask.\n')
    put('self/requests/2026-11-15.md', 'Newer ask.\n')
    renderSite(world, out)
    const html = page('requests/index.html')
    expect(html.indexOf('Newer ask.')).toBeLessThan(html.indexOf('Older ask.'))
  })

  it('escapes both the request and the answer', () => {
    put('self/requests/2026-11-15.md', '<script>alert(1)</script> asked.\n\nRoman: <img src=x onerror=alert(1)>\n')
    renderSite(world, out)
    const html = page('requests/index.html')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;')
  })

  it('leaves out a file that is not a request: a name that is not a date, an empty one, one over 120 words', () => {
    put('self/requests/notes.md', 'Stray.\n')
    put('self/requests/2026-11-14.md', '\n')
    put('self/requests/2026-11-13.md', `${Array(121).fill('word').join(' ')}\n`)
    renderSite(world, out)
    expect(existsSync(join(out, 'requests/index.html'))).toBe(false)
  })

  it('sits beside the place requests: both show, Roman\'s place requests first', () => {
    put('self/requests/2026-11-15.md', 'Could I read one more site?\n')
    put(
      'requests/house-of-lights.md',
      '---\nid: house-of-lights\nkind: place\nname: "House of Lights"\npurpose: "Where I keep what I find about signals."\ntags: ["lighthouses"]\nchunk: [1, 0]\nwritten: "2026-11-10T18:10:00+01:00"\nstatus: open\n---\nI want a house with a lamp in every window.\n',
    )
    renderSite(world, out)
    const html = page('requests/index.html')
    expect(html).toContain('House of Lights')
    expect(html).toContain('Could I read one more site?')
    expect(html.indexOf('House of Lights')).toBeLessThan(html.indexOf('Could I read one more site?'))
  })
})
