import { describe, expect, it } from 'vitest'
import type { Fetcher } from '../src/web/fetch.ts'
import { hostRule } from '../src/web/allowlist.ts'
import { planFor } from '../src/web/starts.ts'
import { imgflipNewFormat, imgflipNewLinks, nameIsBlocked, parseTopNew, TOP_NEW_URL } from '../src/web/sources/imgflip-new.ts'

const box = (id: string, name: string, thumb = `//i.imgflip.com/4/t${id}.jpg`) => `<div class="mt-box">
			<h3 class="mt-title">
				<a title="${name} Meme" href="/meme/${id}/${name.replace(/\W+/g, '-')}">${name}</a>
			</h3>
			<div class="mt-img-wrap" style="padding-top:0px;padding-bottom:0px">
				<a title="${name} Meme" href="/meme/${id}/x">
					<img class="shadow" style="width:150px;height:150px" alt="${name} Meme Template" src="${thumb}"/>
				</a>
			</div>
			<a title="${name} Meme Generator" class="mt-caption l but" href="/memegenerator/${id}/x">Add Caption</a>
		</div>`
const page = (...boxes: string[]) => `<html><body><div id="mt-boxes-wrap">${boxes.join('')}</div><a href="/memetemplates?sort=top-all-time">all</a></body></html>`

const html = page(
  box('666269451', 'Why would I deceive you?'),
  box('666646391', 'Fanum'),
  box('100000001', 'Sexy Lady Dancing'),
  box('100000002', 'It&#039;s La Peace'),
  box('100000003', 'Paws at you'),
  box('100000004', 'No picture', 'https://evil.example/x.jpg'),
  box('100000005', 'Essex Tower'),
  box('100000006', 'Tom Pearl has a snack'),
)

const fetcherFor = (body: string) => {
  const asked: string[] = []
  const f = {
    text: async (url: string) => {
      asked.push(url)
      return body
    },
  } as unknown as Fetcher
  return { f, asked }
}

describe('nameIsBlocked (Roman: no template whose name is sexual or a slur; whole words only)', () => {
  it('blocks sexual words and slurs as whole words, in any case', () => {
    for (const n of ['Sexy Lady Dancing', 'NSFW girl', 'porn star', 'Horny jail', 'nude beach', 'that RETARD', 'Slut shaming', 'boobs']) expect(nameIsBlocked(n), n).toBe(true)
  })
  it('does not block a word that only contains one (Essex, Scunthorpe, therapist, cocktail, Dickens)', () => {
    for (const n of ['Essex Tower', 'Scunthorpe United', 'the therapist', 'cocktail hour', 'Charles Dickens reading', 'Why would I deceive you?', 'Fanum']) expect(nameIsBlocked(n), n).toBe(false)
  })
})

describe('parseTopNew (the Top New templates page as a list)', () => {
  it('reads each template box in page order: id, name with entities decoded, and its thumbnail on i.imgflip.com', () => {
    const list = parseTopNew(html)
    expect(list.map((t) => t.id)).toEqual(['666269451', '666646391', '100000002', '100000003', '100000005', '100000006'])
    expect(list[0]).toEqual({ id: '666269451', name: 'Why would I deceive you?', picture: 'https://i.imgflip.com/4/t666269451.jpg' })
    expect(list[2]!.name).toBe("It's La Peace")
  })
  it('leaves out a template whose name is blocked and one whose picture is not on i.imgflip.com', () => {
    const names = parseTopNew(html).map((t) => t.name)
    expect(names).not.toContain('Sexy Lady Dancing')
    expect(names).not.toContain('No picture')
  })
  it('gives an empty list for a page with no boxes', () => {
    expect(parseTopNew('<html><body>Down for maintenance</body></html>')).toEqual([])
  })
})

describe('imgflipNewLinks and imgflipNewFormat', () => {
  it('reads one page, the Top New templates page, and gives the newest templates as format links', async () => {
    const { f, asked } = fetcherFor(html)
    const links = await imgflipNewLinks(f, 3)
    expect(asked).toEqual([TOP_NEW_URL])
    expect(TOP_NEW_URL).toBe('https://imgflip.com/memetemplates?sort=top-new')
    expect(links).toEqual([
      { title: 'Why would I deceive you?', url: 'https://imgflip.com/meme/666269451' },
      { title: 'Fanum', url: 'https://imgflip.com/meme/666646391' },
      { title: "It's La Peace", url: 'https://imgflip.com/meme/100000002' },
    ])
  })

  it('is an error when the page gives no templates at all', async () => {
    await expect(imgflipNewLinks(fetcherFor('<html></html>').f, 6)).rejects.toThrow(/no templates/)
  })

  it('makes one template a voices record with its picture as a look only (no licence), and its neighbours on the page as links', async () => {
    const item = await imgflipNewFormat(fetcherFor(html).f, '100000002')
    expect(item).toMatchObject({ source: 'imgflip.com', kind: 'record', tier: 'voices', url: 'https://imgflip.com/meme/100000002', title: "It's La Peace" })
    expect(item.text).toContain("Meme format: It's La Peace")
    expect(item.text).toMatch(/new template/i)
    expect(item.images).toEqual([{ url: 'https://i.imgflip.com/4/t100000002.jpg', licence: null, credit: null }])
    expect(item.links.map((l) => l.url)).toEqual(['https://imgflip.com/meme/666646391', 'https://imgflip.com/meme/100000003', 'https://imgflip.com/meme/666269451', 'https://imgflip.com/meme/100000005'])
  })

  it('gives the first and the last template on the page four neighbours too', async () => {
    expect((await imgflipNewFormat(fetcherFor(html).f, '666269451')).links).toHaveLength(4)
    expect((await imgflipNewFormat(fetcherFor(html).f, '100000006')).links).toHaveLength(4)
  })

  it('is on the list after its trial: a voices record host for wander and meme, and a feed plan of its own', async () => {
    expect(hostRule('imgflip.com')).toMatchObject({ kind: 'record', tier: 'voices', verbs: ['wander', 'meme'] })
    const plan = planFor('imgflip.com')!
    expect(plan).toMatchObject({ host: 'imgflip.com', feed: true, paths: ['/memetemplates'] })
    expect(planFor('api.imgflip.com')!.host).toBe('api.imgflip.com')
    expect((await plan.start(fetcherFor(html).f, 0, 0)).url).toBe('https://imgflip.com/meme/666269451')
  })

  it('refuses a template that is not on the page, or that was blocked', async () => {
    await expect(imgflipNewFormat(fetcherFor(html).f, '42')).rejects.toThrow(/no new Imgflip template 42/)
    await expect(imgflipNewFormat(fetcherFor(html).f, '100000001')).rejects.toThrow(/no new Imgflip template/)
  })
})
