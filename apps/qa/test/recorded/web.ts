// A recorded web for the live source checks: trimmed copies of what each allowed host answers, by URL pattern.
// Tests never reach the network; a URL with no route answers 404, like a page that is gone.
import type { FetchImpl } from '@forkling/mind/src/web/fetch.ts'

export type Answer = { status?: number; body: string; type?: string }
export type Routes = [RegExp, Answer][]

const words = (n: number, w = 'lantern') => Array.from({ length: n }, (_, i) => `${w}${i % 7}`).join(' ')
const wikiPage = (title: string, body: string) =>
  `<html><head><title>${title} - Wikipedia</title></head><body><h1 id="firstHeading">${title}</h1><div id="mw-content-text">${body}</div><div class="printfooter"></div></body></html>`
const links = (titles: string[], host = '') => titles.map((t) => `<a href="${host}/wiki/${t}">${t.replace(/_/g, ' ')}</a>`).join(' ')

export const memes = (ids: string[]) =>
  JSON.stringify({ success: true, data: { memes: ids.map((id) => ({ id, name: `Format ${id}`, url: `https://i.imgflip.com/${id}.jpg`, box_count: 2, captions: 1000 })) } })

export const ROBOTS_OK = 'User-agent: *\nDisallow: /w/\nDisallow: /api/rest_v1/\n'

export function healthyRoutes(): Routes {
  return [
    [/^https:\/\/[^/]+\/robots\.txt$/, { body: ROBOTS_OK, type: 'text/plain' }],
    [/^https:\/\/api\.github\.com\/robots\.txt$/, { status: 404, body: '' }],
    [
      /^https:\/\/en\.wikipedia\.org\/wiki\/Main_Page$/,
      { body: wikiPage('Main Page', `<div id="mp-tfa"><p>${links(['Lighthouse', 'Wikipedia'])}</p></div><div id="mp-itn">${links(['Moth'])}</div><div id="mp-dyk">${links(['Owl'])}</div><div id="mp-otd">${links(['Comet'])}</div>`) },
    ],
    [/^https:\/\/en\.wikipedia\.org\/wiki\/Lighthouse$/, { body: wikiPage('Lighthouse', `<p>${words(200)} ${links(['Fresnel_lens', 'Harbour'])}</p>`) }],
    [/^https:\/\/esolangs\.org\/wiki\/Main_Page$/, { body: wikiPage('Main Page', `<p>${links(['Brainfuck', 'Befunge', 'Malbolge', 'Piet', 'INTERCAL', 'Whitespace', 'Chef', 'Shakespeare'])}</p>`) }],
    [/^https:\/\/api\.github\.com\/search\/repositories/, { body: JSON.stringify({ items: ['a/one', 'b/two', 'c/three', 'd/four'].map((full_name) => ({ full_name })) }), type: 'application/json' }],
    [/^https:\/\/www\.dwitter\.net\/apiv2beta\/dweets\/\?order_by=-hotness/, { body: JSON.stringify({ results: [1, 2, 3, 4].map((id) => ({ id, code: 'x.fillRect(0,0,9,9)', author: { username: `maker${id}` }, awesome_count: 5 })) }), type: 'application/json' }],
    [/^https:\/\/api\.imgflip\.com\/get_memes$/, { body: memes(Array.from({ length: 100 }, (_, i) => String(1000 + i))), type: 'application/json' }],
    [/^https:\/\/commons\.wikimedia\.org\/wiki\/Main_Page$/, { body: '<html><body><a href="/wiki/File:Moon.jpg">Moon</a></body></html>' }],
    [
      /^https:\/\/commons\.wikimedia\.org\/wiki\/File:Moon\.jpg$/,
      { body: '<html><body><h1 id="firstHeading">File:Moon.jpg</h1><div class="fullImageLink"><a href="https://upload.wikimedia.org/wikipedia/commons/a/ab/Moon.jpg">x</a></div><div class="description">The moon over a field.</div><span class="licensetpl_short">CC BY-SA 4.0</span></body></html>' },
    ],
    [/^https:\/\/api\.artic\.edu\/api\/v1\/artworks\/search\?query/, { body: JSON.stringify({ data: [{ id: 27992 }] }), type: 'application/json' }],
    [/^https:\/\/api\.artic\.edu\/api\/v1\/artworks\/search\?q=/, { body: JSON.stringify({ data: [] }), type: 'application/json' }],
    [/^https:\/\/api\.artic\.edu\/api\/v1\/artworks\/27992/, { body: JSON.stringify({ data: { id: 27992, title: 'A Sunday on La Grande Jatte', artist_display: 'Georges Seurat', image_id: 'abc', is_public_domain: true } }), type: 'application/json' }],
    [
      /^https:\/\/lemmy\.world\/api\/v3\/post\/list\?community_name=(memes|showerthoughts)&/,
      { body: JSON.stringify({ posts: [1, 2, 3, 4].map((id) => ({ post: { id, name: `Post ${id}`, nsfw: false, removed: false, deleted: false, featured_community: id === 1, featured_local: false }, counts: { score: 10, comments: 1 } })) }), type: 'application/json' },
    ],
    [/^https:\/\/(p5js\.org|tonejs\.github\.io|threejs\.org|developer\.mozilla\.org)\//, { body: `<html><head><title>Reference</title></head><body><p>${words(80, 'draw')}</p><a href="/reference/circle/">circle</a></body></html>` }],
  ]
}

/** Routes with some answers swapped: the first matching route wins, so overrides go first. */
export const withRoutes = (overrides: Routes, base = healthyRoutes()): Routes => [...overrides, ...base]

export function recordedFetch(routes: Routes, seen: string[] = []): FetchImpl {
  return async (url) => {
    seen.push(url)
    const hit = routes.find(([re]) => re.test(url))?.[1]
    if (!hit) return new Response('', { status: 404 })
    return new Response(hit.body, { status: hit.status ?? 200, headers: { 'content-type': hit.type ?? 'text/html' } })
  }
}
