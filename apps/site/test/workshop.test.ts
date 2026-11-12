import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { withPolicy, WorkMeta } from '@forkling/schema'
import { renderSite } from '../src/render.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const templateWorld = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const HTML = withPolicy('<!doctype html><html><head><meta charset="utf-8"><title>w</title></head><body><p>hello</p></body></html>')

let world: string
let out: string
const put = (rel: string, content: string | Buffer) => {
  const full = join(world, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}
const page = (rel: string) => readFileSync(join(out, rel), 'utf8')
const meta = (id: string, over: Record<string, unknown> = {}) =>
  WorkMeta.parse({ id, title: `Work ${id}`, kind: 'art', about: `About ${id}.`, interest: null, made: '2026-11-03T10:00:00Z', status: 'shelf', size: 'full', libraries: ['p5'], ...over })
const putWork = (id: string, over: Record<string, unknown> = {}, o: { html?: string; thumb?: boolean } = {}) => {
  const m = meta(id, over)
  put(`works/${id}/meta.json`, JSON.stringify(m))
  put(`works/${id}/index.html`, o.html ?? HTML)
  if (o.thumb !== false && m.status !== 'scrap') put(`works/${id}/thumb.png`, PNG)
}

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'workshop-world-'))
  out = mkdtempSync(join(tmpdir(), 'workshop-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

describe('/workshop/ is always there (spec 8)', () => {
  it('is built for a world with no works, says so, and every page links to it', () => {
    renderSite(world, out)
    expect(page('workshop/index.html')).toMatch(/Nothing on the bench/i)
    expect(page('workshop/index.html')).toMatch(/shelf/i)
    expect(page('index.html')).toContain('href="workshop/"')
    expect(page('workshop/index.html')).toContain('href="../workshop/"')
  })

  it('renders from the template world, as the done-when of W4 wants', () => {
    renderSite(templateWorld, out)
    expect(existsSync(join(out, 'workshop/index.html'))).toBe(true)
    expect(page('workshop/index.html')).toMatch(/Nothing on the bench/i)
  })
})

describe('the shelf', () => {
  it('shows each shelved work with its thumbnail, kind, size and about, newest first, linking to its page', () => {
    putWork('older', { made: '2026-11-01T10:00:00Z', title: 'Older work', kind: 'game' })
    putWork('newer', { made: '2026-11-03T10:00:00Z', title: 'Newer work', size: 'sketch' })
    renderSite(world, out)
    const html = page('workshop/index.html')
    expect(html.indexOf('Newer work')).toBeLessThan(html.indexOf('Older work'))
    expect(html).toContain('href="newer.html"')
    expect(html).toContain('src="../works/newer/thumb.png"')
    expect(html).toMatch(/game/)
    expect(html).toMatch(/sketch/)
    expect(html).toContain('About newer.')
  })

  it('escapes everything the forkling wrote', () => {
    putWork('sneaky', { title: '<script>alert(1)</script>', about: '"><img src=x onerror=alert(1)>', interest: '<b>x</b>' })
    renderSite(world, out)
    for (const rel of ['workshop/index.html', 'workshop/sneaky.html']) {
      expect(page(rel), rel).not.toMatch(/<script>alert|<img src=x|<b>x<\/b>/)
      expect(page(rel), rel).toContain('&lt;script&gt;')
    }
  })

  it('leaves out a work whose meta does not fit its schema, and one with a reserved name', () => {
    putWork('good')
    put('works/broken/meta.json', '{ nope')
    put('works/broken/index.html', HTML)
    put('works/index/meta.json', JSON.stringify({ id: 'index', title: 'Work index', kind: 'art', about: 'x', interest: null, made: '2026-11-03T10:00:00Z', status: 'shelf', size: 'full' }))
    put('works/index/index.html', HTML)
    renderSite(world, out)
    const html = page('workshop/index.html')
    expect(html).toContain('Work good')
    expect(html).not.toContain('broken')
    expect(existsSync(join(out, 'workshop/index.html'))).toBe(true)
    expect(html).not.toContain('Work index')
  })

  it('does not publish or show a work whose page lacks the policy tag', () => {
    putWork('naked', {}, { html: '<!doctype html><html><head></head><body><script>1</script></body></html>' })
    renderSite(world, out)
    expect(page('workshop/index.html')).not.toContain('Work naked')
    expect(existsSync(join(out, 'works/naked/index.html'))).toBe(false)
    expect(existsSync(join(out, 'workshop/naked.html'))).toBe(false)
  })
})

describe('a work page (spec 7.4, 8)', () => {
  it('shows the work in a sandboxed iframe that may run scripts and nothing else', () => {
    putWork('a-lamp', { title: 'A lamp' })
    renderSite(world, out)
    const html = page('workshop/a-lamp.html')
    expect(html).toMatch(/<iframe sandbox="allow-scripts"[^>]*src="\.\.\/works\/a-lamp\/index\.html"/)
    expect(html).not.toContain('allow-same-origin')
    expect(html).toContain('referrerpolicy="no-referrer"')
    expect(html.match(/<iframe/g)).toHaveLength(1)
  })

  it('says what it is: kind, size, when it was made in its own time zone, the interest it grew from and the libraries it uses', () => {
    putWork('a-lamp', { title: 'A lamp', kind: 'sound', size: 'sketch', interest: 'lighthouses', libraries: ['tone'], made: '2026-11-03T09:05:00Z' })
    renderSite(world, out)
    const html = page('workshop/a-lamp.html')
    expect(html).toMatch(/sound/)
    expect(html).toMatch(/sketch/)
    expect(html).toContain('2026-11-03 10:05')
    expect(html).toContain('lighthouses')
    expect(html).toContain('Tone')
  })

  it('links the work it remixes, and the works that remix it, and names a remix whose source has gone', () => {
    putWork('first', { title: 'First' })
    putWork('second', { title: 'Second', remixOf: 'first' })
    putWork('third', { title: 'Third', remixOf: 'gone' })
    renderSite(world, out)
    expect(page('workshop/second.html')).toMatch(/remix of[^<]*<a href="first\.html">First<\/a>/i)
    expect(page('workshop/first.html')).toMatch(/remixed by[\s\S]*<a href="second\.html">Second<\/a>/i)
    expect(page('workshop/third.html')).toMatch(/remix of[^<]*gone/i)
    expect(page('workshop/third.html')).not.toContain('href="gone.html"')
  })

  it('links a meme to the pages it looked at and read, and only as web addresses', () => {
    putWork('a-meme', {
      kind: 'meme',
      sources: [{ role: 'looked', url: 'https://en.wikipedia.org/wiki/Distracted_boyfriend' }, { role: 'read', url: 'https://en.wikipedia.org/wiki/Distracted_boyfriend' }],
    })
    renderSite(world, out)
    const html = page('workshop/a-meme.html')
    expect(html).toContain('href="https://en.wikipedia.org/wiki/Distracted_boyfriend"')
    expect(html).toMatch(/looked at/i)
    expect(html).toMatch(/read/i)
  })

  it('points back at the workshop with a link that works from the page', () => {
    putWork('a-lamp')
    renderSite(world, out)
    expect(page('workshop/a-lamp.html')).toContain('href="./"')
  })
})

describe('the sketch strip, day by day', () => {
  it('groups shelved sketches by the day they were made in the forkling own time zone, newest day first', () => {
    putWork('s1', { size: 'sketch', made: '2026-11-02T10:00:00Z', title: 'Sketch one' })
    putWork('s2', { size: 'sketch', made: '2026-11-03T09:00:00Z', title: 'Sketch two' })
    putWork('s3', { size: 'sketch', made: '2026-11-03T21:00:00Z', title: 'Sketch three' })
    putWork('big', { size: 'full', made: '2026-11-03T12:00:00Z', title: 'Big work' })
    renderSite(world, out)
    const html = page('workshop/index.html')
    const strip = html.slice(html.indexOf('Sketches'), html.indexOf('Scrap'))
    expect(strip.indexOf('2026-11-03')).toBeLessThan(strip.indexOf('2026-11-02'))
    expect(strip).toContain('Sketch two')
    expect(strip).toContain('Sketch three')
    expect(strip).not.toContain('Big work')
  })

  it('shows the last 14 days that have a sketch and no more', () => {
    for (let d = 1; d <= 16; d++) putWork(`d${d}`, { size: 'sketch', made: `2026-11-${String(d).padStart(2, '0')}T10:00:00Z`, title: `Day ${d} sketch` })
    renderSite(world, out)
    const html = page('workshop/index.html')
    const strip = html.slice(html.indexOf('Sketches'), html.indexOf('Scrap'))
    expect(strip).toContain('Day 16 sketch')
    expect(strip).toContain('Day 3 sketch')
    expect(strip).not.toContain('Day 2 sketch')
  })
})

describe('the scrap bin (spec 7.3)', () => {
  it('lists a work that failed its check with the reason, and gives it no page, no frame, no thumbnail and no files on the site', () => {
    putWork('blank', { status: 'scrap', scrapReason: 'the screenshot is a single colour', title: 'Blank thing' }, { thumb: false })
    renderSite(world, out)
    const html = page('workshop/index.html')
    expect(html).toMatch(/Scrap/)
    expect(html).toContain('Blank thing')
    expect(html).toContain('the screenshot is a single colour')
    expect(html).not.toMatch(/<iframe|blank\.html|works\/blank/)
    expect(existsSync(join(out, 'workshop/blank.html'))).toBe(false)
    expect(existsSync(join(out, 'works/blank'))).toBe(false)
  })

  it('does not list a scrap on the shelf', () => {
    putWork('blank', { status: 'scrap', scrapReason: 'blank', title: 'Blank thing' }, { thumb: false })
    renderSite(world, out)
    const html = page('workshop/index.html')
    const shelf = html.slice(html.indexOf('The shelf'), html.indexOf('Sketches'))
    expect(shelf).not.toContain('Blank thing')
  })
})

describe('retired works (spec 9.9)', () => {
  it('leave the shelf and sit on /workshop/retired/, with the reason, and can still be opened', () => {
    putWork('old-lamp', { status: 'retired', retireReason: 'I have outgrown it.', title: 'Old lamp' })
    renderSite(world, out)
    const shelf = page('workshop/index.html')
    expect(shelf.slice(shelf.indexOf('The shelf'), shelf.indexOf('Sketches'))).not.toContain('Old lamp')
    expect(shelf).toContain('href="retired/"')
    const retired = page('workshop/retired/index.html')
    expect(retired).toContain('Old lamp')
    expect(retired).toContain('I have outgrown it.')
    expect(retired).toContain('href="../old-lamp.html"')
    expect(retired).toContain('href="../../workshop/"')
    expect(page('workshop/old-lamp.html')).toMatch(/<iframe sandbox="allow-scripts"/)
    expect(page('workshop/old-lamp.html')).toContain('I have outgrown it.')
    expect(existsSync(join(out, 'works/old-lamp/index.html'))).toBe(true)
  })

  it('has no retired link or page while nothing is put away', () => {
    putWork('a-lamp')
    renderSite(world, out)
    expect(page('workshop/index.html')).not.toContain('retired/')
    expect(existsSync(join(out, 'workshop/retired/index.html'))).toBe(false)
  })
})

describe('what is published', () => {
  it('copies the page and the thumbnail of a shelved or retired work, and nothing else of it', () => {
    putWork('shelved')
    putWork('away', { status: 'retired', retireReason: 'enough' })
    renderSite(world, out)
    for (const id of ['shelved', 'away']) {
      expect(readFileSync(join(out, `works/${id}/index.html`), 'utf8')).toBe(HTML)
      expect(readFileSync(join(out, `works/${id}/thumb.png`)).equals(PNG)).toBe(true)
      expect(existsSync(join(out, `works/${id}/meta.json`))).toBe(false)
    }
  })

  it('lists the published files among the pages', () => {
    putWork('shelved')
    const { pages } = renderSite(world, out)
    expect(pages).toEqual(expect.arrayContaining(['workshop/index.html', 'workshop/shelved.html', 'works/shelved/index.html', 'works/shelved/thumb.png']))
  })
})

describe('on the bench now', () => {
  const goals = (verb: string, over: Record<string, unknown> = {}) =>
    put('mind/goals.json', JSON.stringify({ today: { date: '2026-11-03', reason: 'A day.', steps: [{ verb, targetId: 'a lamp that hums', reason: 'I want to make a small thing.', minutes: 60, ...over }] }, now: { index: 0, startedAt: '2026-11-03T09:00:00Z', until: '2026-11-03T10:00:00Z' } }))

  it('shows the tinker step in progress with its idea, why and size', () => {
    goals('tinker', { size: 'sketch' })
    renderSite(world, out)
    const html = page('workshop/index.html')
    expect(html).toContain('a lamp that hums')
    expect(html).toContain('I want to make a small thing.')
    expect(html).toMatch(/sketch/)
    expect(html).not.toMatch(/Nothing on the bench/i)
  })

  it('says nothing is on the bench when it is doing something else', () => {
    goals('wander')
    renderSite(world, out)
    expect(page('workshop/index.html')).toMatch(/Nothing on the bench/i)
  })
})
