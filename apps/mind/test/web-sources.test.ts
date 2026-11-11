import { describe, expect, it } from 'vitest'
import { isAllowed, isReadable } from '../src/web/allowlist.ts'
import { WebError, type Fetcher } from '../src/web/fetch.ts'
import { capLinks, normalizeLicence, wikipediaSearchLink, MAX_IMAGES, MAX_LINKS, MAX_RECORD_LINKS } from '../src/web/item.ts'
import { skipReason } from '../src/web/skip.ts'
import { apod, articWork, commonsFile, esolangPage, githubRepo, hackerNewsStory, imgflipFormat, manualPage, readUrl, wikipediaArticle, wikipediaRandom, wikipediaSearch } from '../src/web/sources/index.ts'

/** A Fetcher that answers from a table of URL to JSON, text or bytes, and says 404 to anything else. */
function fake(answers: Record<string, unknown>): Fetcher & { asked: string[] } {
  const asked: string[] = []
  const find = (url: string) => {
    asked.push(url)
    if (!(url in answers)) throw new WebError('http', `404 ${url}`, 404)
    return answers[url]
  }
  return {
    asked,
    log: [],
    pausedHosts: () => ({}),
    text: async (url) => {
      const a = find(url)
      return typeof a === 'string' ? a : JSON.stringify(a)
    },
    json: async (url) => {
      const a = find(url)
      return typeof a === 'string' ? JSON.parse(a) : a
    },
    bytes: async (url) => ({ bytes: new Uint8Array(), contentType: 'image/jpeg', url }),
  }
}

const words = (n: number, w = 'word') => Array.from({ length: n }, () => w).join(' ')
const wiki = 'https://en.wikipedia.org'
const wikiApi = (title: string) => `${wiki}/w/api.php?action=query&format=json&formatversion=2&prop=extracts|links|pageimages&explaintext=1&pllimit=40&plnamespace=0&piprop=original&redirects=1&titles=${encodeURIComponent(title)}`

describe('items and links', () => {
  it('keeps at most 40 links, only allowed ones, each once', () => {
    const links = [
      { title: 'a', url: `${wiki}/wiki/A` },
      { title: 'a again', url: `${wiki}/wiki/A` },
      { title: 'bad', url: 'https://example.com/x' },
      { title: 'http', url: 'http://p5js.org/x' },
      ...Array.from({ length: 60 }, (_, n) => ({ title: `p${n}`, url: `${wiki}/wiki/P${n}` })),
    ]
    const kept = capLinks(links)
    expect(kept).toHaveLength(MAX_LINKS)
    expect(kept.every((l) => isAllowed(l.url))).toBe(true)
    expect(kept.filter((l) => l.url === `${wiki}/wiki/A`)).toHaveLength(1)
    expect(capLinks(links, MAX_RECORD_LINKS)).toHaveLength(8)
    expect([MAX_IMAGES, MAX_LINKS, MAX_RECORD_LINKS]).toEqual([10, 40, 8])
  })

  it('makes a Wikipedia search link that is on the allowlist', () => {
    const link = wikipediaSearchLink('Les Demoiselles d Avignon')
    expect(link.url).toBe(`${wiki}/w/index.php?search=Les%20Demoiselles%20d%20Avignon`)
    expect(isAllowed(link.url)).toBe(true)
  })

  it('reads the licences it allows from the words a site uses, and nothing else', () => {
    expect(normalizeLicence('Public domain')).toBe('public domain')
    expect(normalizeLicence('PD-old-100')).toBe('public domain')
    expect(normalizeLicence('CC0')).toBe('CC0')
    expect(normalizeLicence('CC BY-SA 4.0')).toBe('CC BY-SA')
    expect(normalizeLicence('CC BY 2.0')).toBe('CC BY')
    expect(normalizeLicence('CC BY-NC 4.0')).toBeNull()
    expect(normalizeLicence('CC BY-ND 2.0')).toBeNull()
    expect(normalizeLicence('All rights reserved')).toBeNull()
    expect(normalizeLicence(undefined)).toBeNull()
  })
})

describe('isReadable', () => {
  it('adds the page URLs of items an allowed API gives, and nothing else', () => {
    expect(isReadable('https://news.ycombinator.com/item?id=1')).toBe(true)
    expect(isReadable('https://imgflip.com/meme/1')).toBe(true)
    expect(isReadable('https://github.com/a/b')).toBe(true)
    expect(isReadable('https://p5js.org/x')).toBe(true)
    expect(isReadable('http://github.com/a/b')).toBe(false)
    expect(isReadable('https://github.com.evil.com/a/b')).toBe(false)
    expect(isReadable('https://example.com/')).toBe(false)
    expect(isAllowed('https://github.com/a/b')).toBe(false)
  })
})

describe('Wikipedia', () => {
  const page = { title: 'Lighthouse', extract: `<b>A lighthouse</b> is a tower.\n\n${words(400)}`, links: [{ title: 'Fresnel lens' }, { title: 'Fog signal' }], original: { source: 'https://upload.wikimedia.org/lh.jpg' } }

  it('reads an article as text with its links and its picture', async () => {
    const f = fake({ [wikiApi('Lighthouse')]: { query: { pages: [page] } } })
    const item = await wikipediaArticle(f, 'Lighthouse')
    expect(item).toMatchObject({ source: 'en.wikipedia.org', kind: 'page', tier: 'reference', url: `${wiki}/wiki/Lighthouse`, title: 'Lighthouse' })
    expect(item.text.startsWith('A lighthouse is a tower.')).toBe(true)
    expect(item.links).toEqual([
      { title: 'Fresnel lens', url: `${wiki}/wiki/Fresnel_lens` },
      { title: 'Fog signal', url: `${wiki}/wiki/Fog_signal` },
    ])
    expect(item.images).toEqual([{ url: 'https://upload.wikimedia.org/lh.jpg', licence: null, credit: null }])
  })

  it('cuts a long article to 3,000 tokens', async () => {
    const f = fake({ [wikiApi('Long')]: { query: { pages: [{ title: 'Long', extract: words(20_000) }] } } })
    const item = await wikipediaArticle(f, 'Long')
    expect(item.text.length).toBeLessThan(12_100)
    expect(item.text.endsWith(' …')).toBe(true)
  })

  it('finds the first search result for a topic, and nothing for a topic with none', async () => {
    const f = fake({
      [`${wiki}/w/rest.php/v1/search/title?q=lighthouses&limit=1`]: { pages: [{ title: 'Lighthouse' }] },
      [wikiApi('Lighthouse')]: { query: { pages: [page] } },
      [`${wiki}/w/rest.php/v1/search/title?q=zzzz&limit=1`]: { pages: [] },
    })
    expect((await wikipediaSearch(f, 'lighthouses'))!.title).toBe('Lighthouse')
    expect(await wikipediaSearch(f, 'zzzz')).toBeNull()
  })

  it('takes a random article, and follows a search link when a trip clicks one', async () => {
    const f = fake({
      [`${wiki}/w/api.php?action=query&format=json&list=random&rnnamespace=0&rnlimit=1`]: { query: { random: [{ title: 'Lighthouse' }] } },
      [wikiApi('Lighthouse')]: { query: { pages: [page] } },
      [`${wiki}/w/rest.php/v1/search/title?q=Fresnel%20lens&limit=1`]: { pages: [{ title: 'Lighthouse' }] },
    })
    expect((await wikipediaRandom(f)).title).toBe('Lighthouse')
    expect((await readUrl(f, `${wiki}/w/index.php?search=Fresnel%20lens`)).title).toBe('Lighthouse')
    expect((await readUrl(f, `${wiki}/wiki/Lighthouse`)).url).toBe(`${wiki}/wiki/Lighthouse`)
  })
})

describe('esolangs.org', () => {
  it('reads a language page from the MediaWiki API, with only the links to existing pages', async () => {
    const api = 'https://esolangs.org/w/api.php'
    const f = fake({
      [`${api}?action=parse&format=json&formatversion=2&prop=text|links&page=Brainfuck`]: {
        parse: { text: `<p>${words(350)}</p>`, links: [{ title: 'Befunge', ns: 0, exists: true }, { title: 'Missing', ns: 0, exists: false }, { title: 'Talk:Brainfuck', ns: 1, exists: true }] },
      },
    })
    const item = await esolangPage(f, 'Brainfuck')
    expect(item).toMatchObject({ source: 'esolangs.org', kind: 'page', tier: 'reference', url: 'https://esolangs.org/wiki/Brainfuck' })
    expect(item.links).toEqual([{ title: 'Befunge', url: 'https://esolangs.org/wiki/Befunge' }])
  })
})

describe('Hacker News', () => {
  const hn = 'https://hacker-news.firebaseio.com/v0'

  it('reads a story with its top 5 comments, as a voices page that names who said what', async () => {
    const f = fake({
      [`${hn}/item/1.json`]: { id: 1, title: 'Show HN: a tiny CPU', url: 'https://example.com/cpu', descendants: 9, by: 'x', kids: [10, 11, 12, 13, 14, 15, 16] },
      ...Object.fromEntries([10, 11, 12, 13, 14, 15, 16].map((id) => [`${hn}/item/${id}.json`, { id, by: `user${id}`, text: `comment <i>number</i> ${id}` }])),
    })
    const item = await hackerNewsStory(f, 1)
    expect(item).toMatchObject({ source: 'news.ycombinator.com', kind: 'page', tier: 'voices', url: 'https://news.ycombinator.com/item?id=1' })
    expect(item.text).toContain('user10 said:\ncomment number 10')
    expect(item.text).toContain('user14 said:')
    expect(item.text).not.toContain('user15')
    expect(item.links).toEqual([])
  })

  it('offers the story link only when its site is on the list', async () => {
    const f = fake({ [`${hn}/item/2.json`]: { id: 2, title: 'A wiki piece', url: 'https://en.wikipedia.org/wiki/Moon', descendants: 0, kids: [] } })
    expect((await hackerNewsStory(f, 2)).links).toEqual([{ title: 'A wiki piece', url: 'https://en.wikipedia.org/wiki/Moon' }])
  })

  it('maps a Hacker News item URL back to its API', async () => {
    const f = fake({
      [`${hn}/item/3.json`]: { id: 3, title: 'T', descendants: 0, kids: [] },
    })
    expect((await readUrl(f, 'https://news.ycombinator.com/item?id=3')).title).toBe('T')
  })
})

describe('records', () => {
  it('reads an Imgflip format with the formats next to it and a Wikipedia search as links', async () => {
    const memes = Array.from({ length: 10 }, (_, n) => ({ id: String(100 + n), name: `Format ${n}`, url: `https://i.imgflip.com/${n}.jpg`, box_count: 2, captions: 1000 - n }))
    const f = fake({ 'https://api.imgflip.com/get_memes': { data: { memes } } })
    const item = await imgflipFormat(f, '105')
    expect(item).toMatchObject({ source: 'api.imgflip.com', kind: 'record', tier: 'voices', url: 'https://imgflip.com/meme/105', title: 'Format 5' })
    expect(item.text).toContain('Rank among the 100 most-captioned formats of the last 30 days: 6')
    expect(item.images).toEqual([{ url: 'https://i.imgflip.com/5.jpg', licence: null, credit: null }])
    expect(item.links.length).toBeGreaterThanOrEqual(4)
    expect(item.links.length).toBeLessThanOrEqual(MAX_RECORD_LINKS)
    expect(item.links.some((l) => l.url === 'https://imgflip.com/meme/104')).toBe(true)
    expect(item.links.some((l) => l.url.startsWith(`${wiki}/w/index.php?search=`))).toBe(true)
    expect((await readUrl(f, 'https://imgflip.com/meme/105')).title).toBe('Format 5')
  })

  const artFields = 'id,title,artist_display,artist_title,date_display,medium_display,place_of_origin,description,short_description,image_id,is_public_domain,subject_titles'
  const art = { id: 27992, title: 'A Sunday on La Grande Jatte', artist_display: 'Georges Seurat\nFrench, 1859-1891', artist_title: 'Georges Seurat', date_display: '1884-86', medium_display: 'Oil on canvas', place_of_origin: 'France', description: '<p>Dots of colour.</p>', image_id: 'abc', is_public_domain: true, subject_titles: ['landscape'] }
  const search = (q: string) => `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(q)}&limit=4&fields=id,title`

  it('reads an artwork with a public-domain picture and credit, and offers other works, the place and a Wikipedia search', async () => {
    const f = fake({
      [`https://api.artic.edu/api/v1/artworks/27992?fields=${artFields}`]: { data: art },
      [search('Georges Seurat')]: { data: [{ id: 27992, title: 'Jatte' }, { id: 1, title: 'Study' }, { id: 2, title: 'Sketch' }] },
      [search('France')]: { data: [{ id: 3, title: 'Cathedral' }] },
      [search('landscape')]: { data: [{ id: 4, title: 'Hills' }] },
    })
    const item = await articWork(f, 27992)
    expect(item).toMatchObject({ source: 'api.artic.edu', kind: 'record', tier: 'reference', url: 'https://www.artic.edu/artworks/27992' })
    expect(item.text).toContain('Artist: Georges Seurat')
    expect(item.text).toContain('Dots of colour.')
    expect(item.images).toEqual([{ url: 'https://www.artic.edu/iiif/2/abc/full/843,/0/default.jpg', licence: 'public domain', credit: 'Georges Seurat, Art Institute of Chicago' }])
    const urls = item.links.map((l) => l.url)
    expect(urls).toContain('https://www.artic.edu/artworks/1')
    expect(urls).toContain('https://www.artic.edu/artworks/3')
    expect(urls).toContain('https://www.artic.edu/artworks/4')
    expect(urls).not.toContain('https://www.artic.edu/artworks/27992')
    expect(urls.some((u) => u.startsWith(`${wiki}/w/index.php?search=`))).toBe(true)
    expect(item.links.length).toBeLessThanOrEqual(MAX_RECORD_LINKS)
  })

  it('still reads an artwork when its link searches fail, and gives a copyrighted picture no licence', async () => {
    const f = fake({ [`https://api.artic.edu/api/v1/artworks/5?fields=${artFields}`]: { data: { ...art, id: 5, is_public_domain: false } } })
    const item = await articWork(f, 5)
    expect(item.images[0]!.licence).toBeNull()
    expect(item.links.some((l) => l.url.startsWith(`${wiki}/w/index.php?search=`))).toBe(true)
    expect((await readUrl(f, 'https://www.artic.edu/artworks/5')).title).toBe(art.title)
  })

  it('reads the astronomy picture of a date: public domain without a copyright line, no licence with one', async () => {
    const day = (date: string, copyright?: string) => ({ date, title: 'The Moon', media_type: 'image', explanation: words(60), url: 'https://apod.nasa.gov/apod/image/moon.jpg', ...(copyright ? { copyright } : {}) })
    const url = (date: string) => `https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&date=${date}&thumbs=true`
    const f = fake({ [url('2026-11-01')]: day('2026-11-01'), [url('2026-11-02')]: day('2026-11-02', 'A. Photographer') })
    const free = await apod(f, '2026-11-01')
    expect(free).toMatchObject({ kind: 'record', url: 'https://apod.nasa.gov/apod/ap261101.html', title: 'The Moon' })
    expect(free.images[0]).toEqual({ url: 'https://apod.nasa.gov/apod/image/moon.jpg', licence: 'public domain', credit: 'NASA' })
    expect(free.links.length).toBeGreaterThanOrEqual(4)
    expect(free.links.some((l) => l.url === 'https://apod.nasa.gov/apod/ap261031.html')).toBe(true)
    const owned = await apod(f, '2026-11-02')
    expect(owned.images[0]!.licence).toBeNull()
    expect(owned.text).toContain('Image credit: A. Photographer')
    expect((await readUrl(f, 'https://apod.nasa.gov/apod/ap261101.html')).title).toBe('The Moon')
  })

  it('reads a repository with its description, topics and README, and offers its topics and others like it', async () => {
    const f = fake({
      'https://api.github.com/repos/a/sketch': { full_name: 'a/sketch', html_url: 'https://github.com/a/sketch', description: 'Tiny sketches', topics: ['creative-coding', 'p5js'], stargazers_count: 50 },
      'https://api.github.com/repos/a/sketch/readme': `# Sketch\n${words(80)}`,
      'https://api.github.com/search/repositories?q=topic:creative-coding+stars:%3E20&sort=updated&per_page=5': { items: [{ full_name: 'a/sketch', html_url: 'https://github.com/a/sketch' }, { full_name: 'b/loops', html_url: 'https://github.com/b/loops' }] },
    })
    const item = await githubRepo(f, 'a/sketch')
    expect(item).toMatchObject({ source: 'api.github.com', kind: 'record', tier: 'reference', url: 'https://github.com/a/sketch', title: 'a/sketch' })
    expect(item.text).toContain('Topics: creative-coding, p5js')
    expect(item.text).toContain('# Sketch')
    expect(item.links.some((l) => l.url === 'https://github.com/b/loops')).toBe(true)
    expect(item.links.some((l) => l.url === 'https://github.com/a/sketch')).toBe(false)
    expect(item.links.some((l) => l.url.startsWith(`${wiki}/w/index.php?search=`))).toBe(true)
    expect((await readUrl(f, 'https://github.com/a/sketch')).title).toBe('a/sketch')
  })

  it('reads a Commons file page with its licence read from the licence name, and the credit', async () => {
    const api = (t: string) => `https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=url|extmetadata&titles=${encodeURIComponent(t)}`
    const info = (licence: string) => ({ query: { pages: [{ title: 'File:Fog.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/fog.jpg', extmetadata: { LicenseShortName: { value: licence }, Artist: { value: '<a href="x">Jane Doe</a>' }, ImageDescription: { value: '<p>Fog over a harbour.</p>' } } }] }] } })
    const f = fake({ [api('File:Fog.jpg')]: info('CC BY-SA 4.0'), [api('File:Bad.jpg')]: info('CC BY-NC 4.0') })
    const item = await commonsFile(f, 'File:Fog.jpg')
    expect(item).toMatchObject({ source: 'commons.wikimedia.org', kind: 'record', url: 'https://commons.wikimedia.org/wiki/File:Fog.jpg' })
    expect(item.images).toEqual([{ url: 'https://upload.wikimedia.org/fog.jpg', licence: 'CC BY-SA', credit: 'Jane Doe' }])
    expect(item.text).toContain('Fog over a harbour.')
    expect((await commonsFile(f, 'File:Bad.jpg')).images[0]!.licence).toBeNull()
    expect((await readUrl(f, 'https://commons.wikimedia.org/wiki/File:Fog.jpg')).title).toBe('File:Fog.jpg')
  })
})

describe('library manuals', () => {
  it('reads a manual page as text, and offers only the links that are on the allowlist', async () => {
    const html = `<html><head><title>Array - JavaScript | MDN</title></head><body><nav>menu</nav><main><h1>Array</h1><p>${words(320)}</p>
      <a href="/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map">Map</a>
      <a href="https://developer.mozilla.org/en-US/docs/Web/API/Window">Window</a>
      <a href="https://example.com/ads">ad</a><a href="http://developer.mozilla.org/insecure">plain http</a><a href="#top">top</a><a href="javascript:alert(1)">js</a></main></body></html>`
    const url = 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array'
    const f = fake({ [url]: html })
    const item = await manualPage(f, url)
    expect(item).toMatchObject({ source: 'developer.mozilla.org', kind: 'page', tier: 'reference', url, title: 'Array - JavaScript | MDN' })
    expect(item.text).toContain('Array')
    expect(item.text).not.toContain('menu')
    expect(item.links.map((l) => l.url)).toEqual(['https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map', 'https://developer.mozilla.org/en-US/docs/Web/API/Window'])
    expect((await readUrl(f, url)).title).toBe('Array - JavaScript | MDN')
  })
})

describe('readUrl', () => {
  it('refuses a URL that is not on the allowlist without asking the network', async () => {
    const f = fake({})
    await expect(readUrl(f, 'https://example.com/page')).rejects.toMatchObject({ code: 'not-allowed' })
    expect(f.asked).toEqual([])
  })

  it('refuses a host with no adapter, rather than guessing', async () => {
    await expect(readUrl(fake({}), 'https://upload.wikimedia.org/a.jpg')).rejects.toBeInstanceOf(WebError)
  })
})

describe('what is skipped before any model call (spec 6.6)', () => {
  const page = (over: object = {}) => ({ source: 'en.wikipedia.org', kind: 'page' as const, tier: 'reference' as const, url: `${wiki}/wiki/X`, title: 'X', text: words(400), links: [], images: [], ...over })
  const record = (over: object = {}) => ({ ...page(), kind: 'record' as const, text: words(10), ...over })

  it('lets a readable page and a readable record through', () => {
    expect(skipReason(page())).toBeNull()
    expect(skipReason(record({ images: [{ url: 'https://x', licence: null, credit: null }] }))).toBeNull()
    expect(skipReason(record({ text: words(45) }))).toBeNull()
  })

  it('skips a page under 300 words, but a voices thread needs only 120', () => {
    expect(skipReason(page({ text: words(299) }))).toMatch(/under 300 words/)
    expect(skipReason(page({ tier: 'voices', text: words(150) }))).toBeNull()
    expect(skipReason(page({ tier: 'voices', text: words(100) }))).toMatch(/under 120 words/)
  })

  it('skips a record with no picture and under 40 words', () => {
    expect(skipReason(record())).toMatch(/no image and under 40 words/)
  })

  it('skips a disambiguation page, a list page and anything read in the last 30 days', () => {
    expect(skipReason(page({ title: 'Mercury (disambiguation)' }))).toMatch(/disambiguation/)
    expect(skipReason(page({ text: `Mercury may refer to:\n\n${words(400)}` }))).toMatch(/disambiguation/)
    expect(skipReason(page({ title: 'List of lighthouses in Sweden' }))).toMatch(/list/)
    expect(skipReason(page({ title: 'Lists of islands' }))).toMatch(/list/)
    expect(skipReason(page(), (url) => url === `${wiki}/wiki/X`)).toMatch(/last 30 days/)
    expect(skipReason(page(), () => false)).toBeNull()
  })

  it('does not call a title that merely contains "list" a list page', () => {
    expect(skipReason(page({ title: 'Listeria' }))).toBeNull()
    expect(skipReason(page({ title: 'The Playlist' }))).toBeNull()
  })
})
