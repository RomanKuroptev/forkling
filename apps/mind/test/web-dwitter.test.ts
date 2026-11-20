import { describe, expect, it } from 'vitest'
import { WebError, type Fetcher } from '../src/web/fetch.ts'
import { isAllowed } from '../src/web/allowlist.ts'
import { dweetIdOf, dwitterDweet, dwitterHotLinks, parseDweet, unpackDweet } from '../src/web/sources/dwitter.ts'
import { readUrl } from '../src/web/sources/index.ts'
import { planFor } from '../src/web/starts.ts'

function fake(answers: Record<string, unknown>): Fetcher & { asked: string[] } {
  const asked: string[] = []
  const find = (url: string) => {
    asked.push(url)
    if (!(url in answers)) throw new WebError('http', `404 ${url}`, 404)
    return answers[url]
  }
  return { asked, log: [], pausedHosts: () => ({}), text: async (url) => JSON.stringify(find(url)), json: async (url) => find(url), bytes: async (url) => ({ bytes: new Uint8Array(), contentType: 'image/png', url }) }
}

/** The common Dwitter packer: two ASCII characters in one astral character, undone at run time by escape, replace and unescape. */
function pack(code: string): string {
  const even = code.length % 2 ? `${code};` : code
  let s = ''
  for (let i = 0; i < even.length; i += 2) s += String.fromCharCode(0xda00 + even.charCodeAt(i), 0xdc00 + even.charCodeAt(i + 1))
  return `eval(unescape(escape\`${s}\`.replace(/u\\D*/g,'')))`
}

const API = 'https://www.dwitter.net/apiv2beta/dweets/'
const author = (username: string) => ({ id: 1, avatar: 'https://gravatar.com/x', username })
const dweet = (id: number, by: string, code: string, more: Record<string, unknown> = {}) => ({ id, code, author: author(by), awesome_count: 7, posted: '2026-11-19T11:12:20Z', deleted: false, remix_of: null, remixes: [], comments: [], ...more })

describe('Dwitter', () => {
  it('unpacks a packed dweet with string functions only, and leaves plain code alone', () => {
    const code = 'for(i=9;i--;)x.fillRect(960+S(t+i)*400,540,9,9)'
    expect(unpackDweet(pack(code))).toBe(code.length % 2 ? `${code};` : code)
    expect(unpackDweet(code)).toBeNull()
    expect(unpackDweet('eval(alert(1))')).toBeNull()
  })

  it('drops deleted dweets and ones without code or a maker', () => {
    expect(parseDweet(dweet(1, 'a', 'x.fillRect(0,0,9,9)'))).toMatchObject({ id: 1, author: 'a', likes: 7, posted: '2026-11-19' })
    expect(parseDweet(dweet(1, 'a', 'c', { deleted: true }))).toBeNull()
    expect(parseDweet(dweet(1, 'a', '   '))).toBeNull()
    expect(parseDweet({ ...dweet(1, 'a', 'c'), author: null })).toBeNull()
    expect(parseDweet(null)).toBeNull()
  })

  it('offers the hot dweets as links to their pages', async () => {
    const f = fake({ [`${API}?order_by=-hotness&limit=4`]: { results: [dweet(5, 'ann', 'c.width|=0'), { nope: 1 }, dweet(6, 'bo', 'x.fillRect(1,1,1,1)')] } })
    expect(await dwitterHotLinks(f, 4)).toEqual([
      { title: 'Dweet 5 by ann', url: 'https://www.dwitter.net/d/5' },
      { title: 'Dweet 6 by bo', url: 'https://www.dwitter.net/d/6' },
    ])
    await expect(dwitterHotLinks(fake({ [`${API}?order_by=-hotness&limit=4`]: { detail: 'x' } }), 4)).rejects.toThrow(/no list/)
  })

  it('reads a dweet as a record: maker, likes, its code unpacked, comments, and links to its remix, its maker and the hot list', async () => {
    const code = 'for(i=99;i--;)x.fillRect(960+C(i+t)*i*5,540+S(i*t)*i*3,6,6)'
    const f = fake({
      [`${API}36693/`]: dweet(36693, 'UEZ', pack(code), { remix_of: { id: 36687, author: author('UEZ'), code: 'old' }, remixes: [36700], comments: [{ text: 'Roller Coaster POV #3D', author: author('UEZ') }, { text: 'Wow!', author: author('taupelink') }] }),
      [`${API}?username=UEZ&limit=6`]: { results: [dweet(36693, 'UEZ', 'a'), dweet(36676, 'UEZ', 'b')] },
    })
    const item = await dwitterDweet(f, 36693, [parseDweet(dweet(40000, 'hot', 'h'))!])
    expect(item).toMatchObject({ source: 'www.dwitter.net', kind: 'record', tier: 'voices', url: 'https://www.dwitter.net/d/36693', title: 'Dweet 36693 by UEZ', images: [] })
    expect(item.text).toContain('7 likes, a remix of dweet 36687 by UEZ')
    expect(item.text).toContain('unpacked')
    expect(item.text).toContain(code)
    expect(item.text).toContain('taupelink: Wow!')
    expect(item.links.map((l) => l.url)).toEqual(['https://www.dwitter.net/d/36687', 'https://www.dwitter.net/d/36700', 'https://www.dwitter.net/d/36676', 'https://www.dwitter.net/d/40000'])
  })

  it('knows a dweet page by its address', () => {
    expect(dweetIdOf('https://www.dwitter.net/d/36693')).toBe(36693)
    expect(dweetIdOf('https://www.dwitter.net/u/UEZ')).toBeNull()
    expect(dweetIdOf('http://www.dwitter.net/d/1')).toBeNull()
  })
})

describe('Dwitter on the list (Roman, 20 November, after its trial)', () => {
  it('is read by a wander and a tinker, never a meme, and a dweet page is read through its own adapter', async () => {
    expect(isAllowed('https://www.dwitter.net/d/5')).toBe(true)
    expect(isAllowed('https://www.dwitter.net/d/5', 'tinker')).toBe(true)
    expect(isAllowed('https://www.dwitter.net/d/5', 'meme')).toBe(false)
    const f = fake({ [`${API}5/`]: dweet(5, 'ann', 'c.width|=0;for(i=9;i--;)x.fillRect(i*99,540+S(t+i)*99,50,50)'), [`${API}?username=ann&limit=6`]: { results: [] } })
    expect((await readUrl(f, 'https://www.dwitter.net/d/5')).title).toBe('Dweet 5 by ann')
    await expect(readUrl(f, 'https://www.dwitter.net/u/ann')).rejects.toThrow(/no adapter/)
  })

  it('has a trial plan that starts from the hot list', async () => {
    const hot = { results: [dweet(7, 'ann', 'x.fillRect(0,0,9,9)'), dweet(8, 'bo', 'x.fillRect(9,9,9,9)')] }
    const f = fake({ [`${API}?order_by=-hotness&limit=20`]: hot, [`${API}8/`]: dweet(8, 'bo', 'x.fillRect(9,9,9,9)'), [`${API}?username=bo&limit=6`]: { results: [] } })
    const item = await planFor('www.dwitter.net')!.start(f, 1, 1)
    expect(item.url).toBe('https://www.dwitter.net/d/8')
    expect(item.links.map((l) => l.url)).toEqual(['https://www.dwitter.net/d/7'])
  })
})
