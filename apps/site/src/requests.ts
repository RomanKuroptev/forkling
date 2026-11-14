import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isOpenRequest, parseRequest, Wish, type Place, type PlaceRequest } from '@forkling/schema'
import { esc } from './md.ts'

/** The place requests in `requests/`, oldest first. A file that does not fit, or whose id is not its file name, is left out. */
export function loadRequests(world: string): PlaceRequest[] {
  const folder = join(world, 'requests')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => f.endsWith('.md'))
    .flatMap((f) => {
      try {
        const parsed = parseRequest(readFileSync(join(folder, f), 'utf8'))
        return parsed && parsed.id === f.slice(0, -3) ? [parsed] : []
      } catch {
        return []
      }
    })
    .sort((a, b) => a.written.localeCompare(b.written) || a.id.localeCompare(b.id))
}

/** The wishes in `wishes/`, oldest first, on the same terms. */
export function loadWishes(world: string): Wish[] {
  const folder = join(world, 'wishes')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      try {
        const parsed = Wish.safeParse(JSON.parse(readFileSync(join(folder, f), 'utf8')))
        return parsed.success && parsed.data.id === f.slice(0, -5) ? [parsed.data] : []
      } catch {
        return []
      }
    })
    .sort((a, b) => a.written.localeCompare(b.written) || a.id.localeCompare(b.id))
}

/** What a request's status means, in plain words. A gift is always filed built, and says whose idea it was. */
export function requestStatusWords(r: Pick<PlaceRequest, 'kind' | 'status'>): string {
  if (r.kind === 'gift') return 'A gift from Roman.'
  switch (r.status) {
    case 'open':
      return 'Waiting for Roman to answer.'
    case 'building':
      return 'Roman says he is building it.'
    case 'built':
      return 'Built by Roman with Claude Code.'
    case 'declined':
      return 'Roman declined.'
    case 'self-built':
      return 'Built by Merge from the kit, because no one answered in time.'
    case 'withdrawn':
      return 'Merge took it back.'
  }
}

const WISH_WORDS: Record<Wish['status'], string> = {
  open: 'Waiting for an answer.',
  building: 'Roman says he is building it.',
  built: 'Built.',
  declined: 'Declined.',
  unanswered: 'No answer in 30 days; Merge may wish again.',
  withdrawn: 'Merge took it back.',
}

/** Who had a place's idea and who built it, from the line the engine wrote when it was founded. Never guessed. */
export function provenanceOf(place: Pick<Place, 'history'>): string {
  const found = place.history.find((h) => h.verb === 'found')
  return found ? found.summary : 'Who had the idea and who built it is not written down.'
}

const sameChunk = (a: readonly [number, number], b: readonly [number, number]) => a[0] === b[0] && a[1] === b[1]
const day = (iso: string) => iso.slice(0, 10)
const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join('')

export interface RequestsInput {
  requests: readonly PlaceRequest[]
  wishes: readonly Wish[]
  places: readonly Place[]
  add: (rel: string, input: { title: string; active: string; body: string }) => void
}

/** `/requests/` (spec 10.3): what Merge has asked Roman for and what became of it. Nothing is written when there is nothing to list. */
export function renderRequests(i: RequestsInput): void {
  if (i.requests.length === 0 && i.wishes.length === 0) return
  const placeFor = (r: PlaceRequest) => (r.status === 'built' || r.status === 'self-built' ? i.places.find((p) => sameChunk(p.chunk, r.chunk)) : undefined)

  const item = (r: PlaceRequest) => {
    const place = placeFor(r)
    return [
      `<li class="request" data-request="${esc(r.id)}" data-status="${esc(r.status)}">`,
      `<strong>${esc(r.name)}</strong> <span class="quiet">${esc(r.tags.join(', '))}</span>`,
      `<p><em>${esc(requestStatusWords(r))}</em>${place ? ` <a href="../places/${esc(place.id)}/">See the place.</a>` : ''}</p>`,
      `<p>${esc(r.purpose)}</p>`,
      paragraphs(r.body),
      r.kind === 'gift'
        ? `<p class="quiet">Filed ${esc(day(r.written))}.</p>`
        : `<p class="quiet">Asked on ${esc(day(r.written))}${r.statusAt ? `; answered ${esc(day(r.statusAt))}` : ''}. Behind it: ${r.souvenirs.length} ${r.souvenirs.length === 1 ? 'souvenir' : 'souvenirs'}.</p>`,
      '</li>',
    ].join('')
  }

  const waiting = i.requests.filter(isOpenRequest).sort((a, b) => Number(b.status === 'building') - Number(a.status === 'building'))
  const answered = i.requests.filter((r) => !isOpenRequest(r)).reverse()
  const wishItem = (w: Wish) => {
    const place = w.forPlace ? i.places.find((p) => p.id === w.forPlace) : undefined
    return `<li class="request" data-wish="${esc(w.id)}" data-status="${esc(w.status)}"><strong>${esc(w.name)}</strong> <span class="quiet">${w.count === 1 ? 'Wished for once' : `Wished for ${w.count} times`}${place ? ` for <a href="../places/${esc(place.id)}/">${esc(place.name)}</a>` : ''}.</span><p><em>${esc(WISH_WORDS[w.status])}</em></p><p>${esc(w.description)}</p></li>`
  }

  i.add('requests/index.html', {
    title: 'Requests',
    active: 'requests/',
    body: [
      '<h1>Requests</h1>',
      '<p class="quiet">What Merge has asked Roman to build, in its own words, and what became of each. Nothing it asks for is promised. A request nobody answers in 7 days is built plainly by Merge from the kit.</p>',
      ...(waiting.length > 0 ? ['<h2>Waiting</h2>', `<ul class="requests">${waiting.map(item).join('')}</ul>`] : []),
      ...(answered.length > 0 ? ['<h2>Answered</h2>', `<ul class="requests">${answered.map(item).join('')}</ul>`] : []),
      ...(i.wishes.length > 0 ? ['<h2>Wishes</h2>', '<p class="quiet">Things Merge wishes an existing place had: a part the kit lacks, or something made by hand.</p>', `<ul class="requests">${[...i.wishes].reverse().map(wishItem).join('')}</ul>`] : []),
    ].join('\n'),
  })
}
