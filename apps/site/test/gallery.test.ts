import { describe, expect, it } from 'vitest'
import { WorkMeta, Project } from '@forkling/schema'
import { galleryBody, tiles } from '../src/gallery.ts'
import type { SiteProject } from '../src/projects.ts'
import type { SiteWork } from '../src/workshop.ts'

/** Step 7C: the gallery, from the thumbnails and screenshots the world repo has. */

const work = (id: string, over: Record<string, unknown>, hasThumb = true): SiteWork => ({
  meta: WorkMeta.parse({ id, title: `Work ${id}`, kind: 'art', about: 'a thing', interest: null, made: '2026-11-15T10:00:00Z', status: 'shelf', libraries: [], sources: [], size: 'full', ...over }),
  hasThumb,
})
const project = (): SiteProject => ({
  project: Project.parse({ id: 'toaster', name: 'toaster <api>', aim: 'toast', started: '2026-11-16T08:00:00Z', status: 'building', reason: null, inspiredBy: null, installedIn: null, sessions: [1, 2].map((n) => ({ at: `2026-11-1${5 + n}T09:00:00Z`, caption: `s${n}`, usd: 0.2, turns: 5, shot: `shots/${n}.png`, broken: false, engine: false })) }),
  shots: ['shots/1.png', null],
  runnable: false,
  video: false,
})

describe('tiles', () => {
  const list = tiles([project()], [work('a', { size: 'sketch', made: '2026-11-14T10:00:00Z' }), work('b', {}), work('c', {}, false), work('d', { status: 'scrap', scrapReason: 'bad' })])

  it('has a tile for every work with a thumbnail and every project session with a screenshot, newest first, and none for a scrap or a missing picture', () => {
    expect(list.map((t) => `${t.kind}:${t.image}`)).toEqual(['build:projects/toaster/shots/1.png', 'work:works/b/thumb.png', 'sketch:works/a/thumb.png'])
  })
})

describe('galleryBody', () => {
  const list = tiles([project()], [work('a', { size: 'sketch', made: '2026-11-14T10:00:00Z' }), work('b', {})])
  const html = galleryBody(list, 'Europe/Stockholm')

  it('has tabs with their counts, only for kinds that exist, and "all" checked', () => {
    expect(html).toContain('all 3')
    expect(html).toContain('sketches 1')
    expect(html).toContain('works 1')
    expect(html).toContain('builds 1')
    expect(html).toMatch(/id="gf-all" class="gf" checked/)
  })

  it('shows each tile with a link, a picture as a background (no img), the day, the kind and the escaped name', () => {
    expect(html).toContain('href="../workshop/b.html"')
    expect(html).toContain("background-image:url('../works/b/thumb.png')")
    expect(html).toContain('15 Nov</time> · work')
    expect(html).toContain('toaster &lt;api&gt;')
    expect(html).not.toContain('<img')
    expect(html).toMatch(/<li class="gt" data-k="sketch">/)
  })

  it('says so when there is no picture yet', () => {
    expect(galleryBody([], 'Europe/Stockholm')).toContain('Nothing yet.')
  })
})
