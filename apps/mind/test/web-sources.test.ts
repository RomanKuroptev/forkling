import { describe, expect, it } from 'vitest'
import { isAllowed, isReadable } from '../src/web/allowlist.ts'
import { WebError, type Fetcher } from '../src/web/fetch.ts'
import { capLinks, normalizeLicence, wikipediaTopicLink, MAX_IMAGES, MAX_LINKS, MAX_RECORD_LINKS } from '../src/web/item.ts'
import { skipReason } from '../src/web/skip.ts'
import { articWork, commonsFeatured, commonsFile, esolangMainLinks, esolangPage, githubRepo, imgflipFormat, imgflipTopLinks, readUrl, wikipediaArticle, wikipediaFeatured, wikipediaSearch } from '../src/web/sources/index.ts'

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

describe('Imgflip, the pulse of meme formats (spec 6.1)', () => {
  const memes = Array.from({ length: 10 }, (_, n) => ({ id: String(100 + n), name: `Format ${n}`, url: `https://i.imgflip.com/${n}.jpg`, box_count: 2, captions: 1000 - n }))
  const f = () => fake({ 'https://api.imgflip.com/get_memes': { data: { memes } } })

  it('is read by a wander and a meme, its pictures are fetched from i.imgflip.com, and a format page is readable', () => {
    expect(isAllowed('https://api.imgflip.com/get_memes')).toBe(true)
    expect(isAllowed('https://api.imgflip.com/get_memes', 'meme')).toBe(true)
    expect(isAllowed('https://i.imgflip.com/5.jpg')).toBe(true)
    expect(isAllowed('https://imgflip.com/meme/105')).toBe(false)
    expect(isReadable('https://imgflip.com/meme/105')).toBe(true)
    expect(isReadable('https://imgflip.com.evil.com/meme/105')).toBe(false)
  })

  it('offers the top formats in rank order as links to their format pages, and nothing is kept from the feed itself', async () => {
    const links = await imgflipTopLinks(f(), 4)
    expect(links).toEqual([0, 1, 2, 3].map((n) => ({ title: `Format ${n}`, url: `https://imgflip.com/meme/${100 + n}` })))
  })

  it('reads a format: its rank and caption count as text, its template picture, and the formats next to it and a Wikipedia page as links', async () => {
    const item = await imgflipFormat(f(), '105')
    expect(item).toMatchObject({ source: 'api.imgflip.com', kind: 'record', tier: 'voices', url: 'https://imgflip.com/meme/105', title: 'Format 5' })
    expect(item.text).toContain('Rank among the 100 most-captioned formats of the last 30 days: 6')
    expect(item.text).toContain('Captions in the last 30 days: 995')
    expect(item.images).toEqual([{ url: 'https://i.imgflip.com/5.jpg', licence: null, credit: null }])
    expect(item.links.length).toBeGreaterThanOrEqual(4)
    expect(item.links.length).toBeLessThanOrEqual(MAX_RECORD_LINKS)
    expect(item.links.some((l) => l.url === 'https://imgflip.com/meme/104')).toBe(true)
    expect(item.links.some((l) => l.url === 'https://en.wikipedia.org/wiki/Format_5')).toBe(true)
  })

  it('is opened from a format page link, and a format that is not in the ranking is a 404', async () => {
    expect((await readUrl(f(), 'https://imgflip.com/meme/105')).title).toBe('Format 5')
    await expect(readUrl(f(), 'https://imgflip.com/meme/999')).rejects.toMatchObject({ code: 'http', status: 404 })
    await expect(readUrl(f(), 'https://imgflip.com/')).rejects.toMatchObject({ code: 'not-allowed' })
  })

  it('does not trust the shape of the answer: a reply without a list of formats is an error, and odd entries are dropped', async () => {
    await expect(imgflipTopLinks(fake({ 'https://api.imgflip.com/get_memes': { success: false } }), 4)).rejects.toBeInstanceOf(WebError)
    const odd = fake({ 'https://api.imgflip.com/get_memes': { data: { memes: [{ id: 7, name: 5 }, { id: '8', name: 'Fine', url: 'https://i.imgflip.com/8.jpg', box_count: 2 }, null] } } })
    expect(await imgflipTopLinks(odd, 4)).toEqual([{ title: 'Fine', url: 'https://imgflip.com/meme/8' }])
  })
})

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

  it('makes a link to the Wikipedia page for a topic, on the allowlist and not through search', () => {
    const link = wikipediaTopicLink('les Demoiselles d Avignon')
    expect(link.url).toBe(`${wiki}/wiki/Les_Demoiselles_d_Avignon`)
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
  it('adds the page URL of a GitHub repository, which an allowed API gives, and nothing else', () => {
    expect(isReadable('https://github.com/a/b')).toBe(true)
    expect(isReadable('http://github.com/a/b')).toBe(false)
    expect(isReadable('https://github.com.evil.com/a/b')).toBe(false)
    expect(isReadable('https://example.com/')).toBe(false)
    expect(isAllowed('https://github.com/a/b')).toBe(false)
    expect(isReadable('https://news.ycombinator.com/item?id=1')).toBe(false)
  })
})

const words2 = (n: number) => Array.from({ length: n }, () => 'word').join(' ')

/** A Wikipedia article as the site serves it: heading, content, an infobox picture, a navbox, and the sections after the text. */
const articleHtml = (body = `<p>${words2(400)}</p>`) => `<html><head><title>Lighthouse - Wikipedia</title></head><body>
<nav>Main menu</nav>
<h1 id="firstHeading" class="firstHeading mw-first-heading"><span class="mw-page-title-main">Lighthouse</span></h1>
<div id="siteSub">From Wikipedia, the free encyclopedia</div>
<div id="mw-content-text" class="mw-body-content"><div class="mw-content-ltr mw-parser-output">
<table class="infobox"><tr><td><a href="/wiki/File:Lh.jpg"><img resource="https://en.wikipedia.org/wiki/File:Lh.jpg" src="//thumb.wikimedia.org/wikipedia/commons/thumb/6/61/Lh.jpg/250px-Lh.jpg?utm_source=en.wikipedia.org&amp;utm_campaign=parser"></a></td></tr><tr><td>Height 20 m</td></tr></table>
<p><b>A lighthouse</b> is a tower.<sup class="reference"><a href="#cite_note-1">[1]</a></sup> It uses a <a href="/wiki/Fresnel_lens" title="Fresnel lens">Fresnel lens</a> and a <a href="/wiki/Fog_signal">fog signal</a>; see <a href="/wiki/File:Lh.jpg">the picture</a>, <a href="/wiki/Category:Towers">Towers</a>, <a href="/wiki/Special:Random">random</a>, <a href="/wiki/Lighthouse#History">history</a>, <a href="/w/index.php?title=X&amp;action=edit">edit</a>, <a href="https://example.com/x">elsewhere</a> and <a href="/wiki/Halo:_Combat_Evolved">a game</a>.</p>
${body}
<div class="navbox"><div class="navbox-inner">Navbox stuff <a href="/wiki/Navlink">n</a></div></div>
<div class="mw-heading mw-heading2"><h2 id="See_also">See also</h2></div><ul><li><a href="/wiki/Beacon">Beacon</a></li></ul>
<div class="mw-heading mw-heading2"><h2 id="References">References</h2></div><ol class="references"><li>Cite junk</li></ol>
</div></div>
<div class="printfooter">Retrieved from "https://en.wikipedia.org/wiki/Lighthouse"</div><div id="catlinks">Categories: Towers</div>
<footer>Privacy policy</footer></body></html>`

describe('Wikipedia, read through its article pages', () => {
  it('reads /wiki/<Title> as text: the heading, the content and not the furniture around it', async () => {
    const f = fake({ [`${wiki}/wiki/Lighthouse`]: articleHtml() })
    const item = await wikipediaArticle(f, 'Lighthouse')
    expect(item).toMatchObject({ source: 'en.wikipedia.org', kind: 'page', tier: 'reference', url: `${wiki}/wiki/Lighthouse`, title: 'Lighthouse' })
    expect(item.text).toContain('A lighthouse is a tower. It uses a Fresnel lens')
    expect(item.text).toContain('Height 20 m')
    for (const junk of ['Main menu', 'From Wikipedia', '[1]', 'Navbox stuff', 'See also', 'Cite junk', 'Retrieved from', 'Privacy policy', 'Categories']) expect(item.text, junk).not.toContain(junk)
    expect(f.asked).toEqual([`${wiki}/wiki/Lighthouse`])
  })

  it('offers the links to other articles, in order, leaving out namespaces, fragments, edit links and other sites', async () => {
    const item = await wikipediaArticle(fake({ [`${wiki}/wiki/Lighthouse`]: articleHtml() }), 'Lighthouse')
    expect(item.links).toEqual([
      { title: 'Fresnel lens', url: `${wiki}/wiki/Fresnel_lens` },
      { title: 'Fog signal', url: `${wiki}/wiki/Fog_signal` },
      { title: 'Halo: Combat Evolved', url: `${wiki}/wiki/Halo:_Combat_Evolved` },
    ])
  })

  it('gives the pictures at a host the allowlist knows, without tracking parameters', async () => {
    const item = await wikipediaArticle(fake({ [`${wiki}/wiki/Lighthouse`]: articleHtml() }), 'Lighthouse')
    expect(item.images).toEqual([{ url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Lh.jpg/250px-Lh.jpg', licence: null, credit: null }])
    expect(item.images.length).toBeLessThanOrEqual(MAX_IMAGES)
  })

  it('cuts a long article to 3,000 tokens', async () => {
    const item = await wikipediaArticle(fake({ [`${wiki}/wiki/Lighthouse`]: articleHtml(`<p>${words2(20_000)}</p>`) }), 'Lighthouse')
    expect(item.text.length).toBeLessThan(12_100)
    expect(item.text.endsWith(' …')).toBe(true)
  })

  it('finds a topic by going straight to its page, and gives nothing for a topic with no page', async () => {
    const f = fake({ [`${wiki}/wiki/Logic_gates`]: articleHtml() })
    expect((await wikipediaSearch(f, 'logic gates'))!.title).toBe('Lighthouse')
    expect(f.asked).toEqual([`${wiki}/wiki/Logic_gates`])
    expect(await wikipediaSearch(f, 'zzzz qqqq')).toBeNull()
  })

  it('never asks for the search page, Special:Random or the API, which robots.txt disallows', async () => {
    const f = fake({ [`${wiki}/wiki/Main_Page`]: '<div id="mw-content-text"><p><a href="/wiki/Moss">Moss</a></p></div>', [`${wiki}/wiki/Moss`]: articleHtml() })
    await wikipediaFeatured(f, 0)
    await wikipediaSearch(f, 'moss')
    expect(f.asked.every((u) => !/\/w\/|Special:/.test(u))).toBe(true)
    await expect(readUrl(f, `${wiki}/w/index.php?search=moss`)).rejects.toMatchObject({ code: 'not-allowed' })
    await expect(readUrl(f, `${wiki}/wiki/Special:Random`)).rejects.toBeInstanceOf(WebError)
  })

  it('reads links written as full addresses, which is how the front page serves them', async () => {
    const main = `<div id="mw-content-text"><a rel="mw:WikiLink" href="https://en.wikipedia.org/wiki/Free_content" title="Free content">Free content</a> <a href="https://en.wikipedia.org/wiki/Special:Statistics">stats</a> <a href="https://en.wikipedia.org/wiki/Moss#Uses">Moss</a> <a href="https://example.com/wiki/Fake">fake</a></div>`
    const f = fake({ [`${wiki}/wiki/Main_Page`]: main, [`${wiki}/wiki/Moss`]: articleHtml() })
    expect((await wikipediaFeatured(f, 1)).title).toBe('Lighthouse')
    expect(f.asked).toEqual([`${wiki}/wiki/Main_Page`, `${wiki}/wiki/Moss`])
  })

  it('starts a trip from the front page: the seed picks one of the articles it links to', async () => {
    const main = `<html><div id="mw-content-text"><p><a href="/wiki/Alpha">Alpha</a> <a href="/wiki/Beta">Beta</a> <a href="/wiki/Gamma">Gamma</a> <a href="/wiki/Wikipedia:About">About</a></p></div><div class="printfooter"></div></html>`
    const f = fake({ [`${wiki}/wiki/Main_Page`]: main, [`${wiki}/wiki/Beta`]: articleHtml() })
    const item = await wikipediaFeatured(f, 1)
    expect(item.title).toBe('Lighthouse')
    expect(f.asked).toEqual([`${wiki}/wiki/Main_Page`, `${wiki}/wiki/Beta`])
    expect((await readUrl(fake({ [`${wiki}/wiki/Lighthouse`]: articleHtml() }), `${wiki}/wiki/Lighthouse`)).url).toBe(`${wiki}/wiki/Lighthouse`)
  })
})

describe('esolangs.org, read through its wiki pages', () => {
  const html = `<html><head><title>brainfuck - Esolang</title></head><body><h1 id="firstHeading" class="firstHeading mw-first-heading"><span>Brainfuck</span></h1>
<div id="mw-content-text" class="mw-body-content"><p>${words2(350)} See <a href="/wiki/Befunge">Befunge</a>, <a href="/wiki/Talk:Brainfuck">talk</a> and <a href="/w/index.php?title=Missing&amp;action=edit&amp;redlink=1">Missing</a>.</p>
<div class="printfooter">Retrieved from</div></div></body></html>`

  it('reads a language page with only the links to real pages', async () => {
    const item = await esolangPage(fake({ 'https://esolangs.org/wiki/Brainfuck': html }), 'Brainfuck')
    expect(item).toMatchObject({ source: 'esolangs.org', kind: 'page', tier: 'reference', url: 'https://esolangs.org/wiki/Brainfuck', title: 'Brainfuck' })
    expect(item.links).toEqual([{ title: 'Befunge', url: 'https://esolangs.org/wiki/Befunge' }])
    expect(item.text).not.toContain('Retrieved from')
  })

  it('starts from the links on its front page', async () => {
    const f = fake({ 'https://esolangs.org/wiki/Main_Page': '<div id="mw-content-text"><a href="/wiki/Befunge">Befunge</a> <a href="/wiki/Brainfuck">Brainfuck</a></div>', 'https://esolangs.org/wiki/Brainfuck': html })
    expect(await esolangMainLinks(f)).toEqual([
      { title: 'Befunge', url: 'https://esolangs.org/wiki/Befunge' },
      { title: 'Brainfuck', url: 'https://esolangs.org/wiki/Brainfuck' },
    ])
    expect((await readUrl(f, 'https://esolangs.org/wiki/Brainfuck')).title).toBe('Brainfuck')
  })
})

describe('records', () => {
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
    expect(urls.some((u) => u.startsWith(`${wiki}/wiki/`))).toBe(true)
    expect(item.links.length).toBeLessThanOrEqual(MAX_RECORD_LINKS)
  })

  it('still reads an artwork when its link searches fail, and gives a copyrighted picture no licence', async () => {
    const f = fake({ [`https://api.artic.edu/api/v1/artworks/5?fields=${artFields}`]: { data: { ...art, id: 5, is_public_domain: false } } })
    const item = await articWork(f, 5)
    expect(item.images[0]!.licence).toBeNull()
    expect(item.links.some((l) => l.url.startsWith(`${wiki}/wiki/`))).toBe(true)
    expect((await readUrl(f, 'https://www.artic.edu/artworks/5')).title).toBe(art.title)
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
    expect(item.links.some((l) => l.url.startsWith(`${wiki}/wiki/`))).toBe(true)
    expect((await readUrl(f, 'https://github.com/a/sketch')).title).toBe('a/sketch')
  })

  const fileHtml = (licence: string, extra = '') => `<html><body><h1 id="firstHeading" class="firstHeading"><span>File:Fog.jpg</span></h1>
<div id="mw-content-text"><div class="fullImageLink" id="file"><a href="https://upload.wikimedia.org/wikipedia/commons/2/28/Fog.jpg?utm_source=commons.wikimedia.org&amp;utm_campaign=index&amp;utm_content=original"><img src="x"></a></div>
<table class="fileinfotpl-type-information"><tr><td id="fileinfotpl&#95;desc" class="fileinfo-paramfield">Description</td><td class="description"><div class="description en" dir="ltr" lang="en"><span class="language en"><b>English&#58; </b></span> Fog over a harbour.</div></td></tr>
<tr><td id="fileinfotpl&#95;aut" class="fileinfo-paramfield" lang="en">Author</td>
<td>
<a href="/wiki/User:Jane" title="User:Jane">Jane Doe</a></td></tr></table>${extra}
<span class="licensetpl&#95;link" style="display:none;">https://creativecommons.org</span><span class="licensetpl&#95;short" style="display:none;">${licence} </span></div></body></html>`

  it('reads a Commons file page: the picture, the licence read from its name, the author and the description', async () => {
    const f = fake({ 'https://commons.wikimedia.org/wiki/File:Fog.jpg': fileHtml('CC BY-SA 4.0') })
    const item = await commonsFile(f, 'File:Fog.jpg')
    expect(item).toMatchObject({ source: 'commons.wikimedia.org', kind: 'record', tier: 'reference', url: 'https://commons.wikimedia.org/wiki/File:Fog.jpg', title: 'File:Fog.jpg' })
    expect(item.images).toEqual([{ url: 'https://upload.wikimedia.org/wikipedia/commons/2/28/Fog.jpg', licence: 'CC BY-SA', credit: 'Jane Doe' }])
    expect(item.text).toContain('Fog over a harbour.')
    expect(item.text).toContain('Licence: CC BY-SA 4.0')
    expect(item.text).toContain('Credit: Jane Doe')
    expect(f.asked).toEqual(['https://commons.wikimedia.org/wiki/File:Fog.jpg'])
  })

  it('offers the Wikipedia articles that use the picture, so a trip can cross from the picture into reading', async () => {
    const usage = '<div id="mw-imagepage-section-globalusage"><ul><li><a class="extiw" href="https://en.wikipedia.org/wiki/Hamburg">Hamburg</a></li><li><a href="//de.wikipedia.org/wiki/Hafen">de</a></li><li><a href="https://en.wikipedia.org/wiki/Category:Ports">cat</a></li><li><a href="https://en.wikipedia.org/wiki/Harbour_fog">Harbour fog</a></li></ul></div>'
    const item = await commonsFile(fake({ 'https://commons.wikimedia.org/wiki/File:Fog.jpg': fileHtml('CC0', usage) }), 'File:Fog.jpg')
    expect(item.links.map((l) => l.url)).toEqual(['https://en.wikipedia.org/wiki/Hamburg', 'https://en.wikipedia.org/wiki/Harbour_fog', 'https://en.wikipedia.org/wiki/Fog'])
    expect(item.links.length).toBeLessThanOrEqual(MAX_RECORD_LINKS)
  })

  it('gives a licence the code cannot allow no licence at all, and refuses a page with no picture', async () => {
    const f = fake({ 'https://commons.wikimedia.org/wiki/File:Fog.jpg': fileHtml('CC BY-NC 4.0'), 'https://commons.wikimedia.org/wiki/File:Clip.webm': '<h1 id="firstHeading">File:Clip.webm</h1><div id="mw-content-text">video</div>' })
    expect((await commonsFile(f, 'File:Fog.jpg')).images[0]!.licence).toBeNull()
    await expect(commonsFile(f, 'File:Clip.webm')).rejects.toMatchObject({ code: 'http' })
    expect((await readUrl(f, 'https://commons.wikimedia.org/wiki/File:Fog.jpg')).title).toBe('File:Fog.jpg')
  })

  it('starts from the pictures on its front page, leaving out video and sound', async () => {
    const main = '<div id="mw-content-text"><a href="/wiki/File:Clip.webm">v</a> <a href="/wiki/File:Fog.jpg">f</a> <a href="/wiki/File:Song.ogg">s</a> <a href="/wiki/File:Dune.PNG">d</a></div>'
    const f = fake({ 'https://commons.wikimedia.org/wiki/Main_Page': main, 'https://commons.wikimedia.org/wiki/File:Dune.PNG': fileHtml('CC0') })
    expect((await commonsFeatured(f, 1)).images[0]!.licence).toBe('CC0')
    expect(f.asked.at(-1)).toBe('https://commons.wikimedia.org/wiki/File:Dune.PNG')
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
