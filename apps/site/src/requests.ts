import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isOpenRequest, parseRequest, Wish, type Place, type PlaceRequest, type SelfRequest, type Tool } from '@forkling/schema'
import { latestFound } from '@forkling/sim'
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

/**
 * What a request's status means, in plain words. A gift is always filed built, and says whose idea it was. "Built by Roman" is only
 * said when a place stands on the chunk (`placeStands`): a status set by hand with nothing built is just "Marked built.".
 */
export function requestStatusWords(r: Pick<PlaceRequest, 'kind' | 'status'>, placeStands = true): string {
  if (r.kind === 'gift') return 'A gift from Roman.'
  switch (r.status) {
    case 'open':
      return 'Waiting for Roman to answer.'
    case 'building':
      return 'Roman says he is building it.'
    case 'built':
      return placeStands ? 'Built by Roman with Claude Code.' : 'Marked built.'
    case 'declined':
      return 'Roman declined.'
    case 'self-built':
      return 'Built by Merge from the kit.'
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

/** Who had a place's idea and who built it, from the newest founding line the engine wrote (the build that stands now). Never guessed. */
export function provenanceOf(place: Pick<Place, 'history'>): string {
  const found = latestFound(place.history)
  return found ? found.summary : 'Who had the idea and who built it is not written down.'
}

const sameChunk = (a: readonly [number, number], b: readonly [number, number]) => a[0] === b[0] && a[1] === b[1]
/** A moment as `2026-11-21`, in the forkling's own time zone like the rest of its site. */
const dayIn = (iso: string, tz: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  } catch {
    return iso.slice(0, 10)
  }
}
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
  /** The forkling's IANA time zone, for the dates. UTC when not given. */
  timezone?: string
  /** What Merge asked Roman about its own setup in its weekly reviews (spec 9.5). */
  selfRequests?: readonly SelfRequest[]
  /** What Roman has given Merge (spec v4 8). */
  tools?: readonly Tool[]
  add: (rel: string, input: { title: string; active: string; body: string }) => void
}

/** `/requests/` (spec 10.3): what Merge has asked Roman for and what became of it. Nothing is written when there is nothing to list. */
export function renderRequests(i: RequestsInput): void {
  const own = i.selfRequests ?? []
  const day = (iso: string) => dayIn(iso, i.timezone ?? 'UTC')
  // Place requests are gone (spec v4 2.3): Merge founds its own places. Gifts, wishes and the weekly requests stay.
  const listed = i.requests.filter((r) => r.kind === 'gift')
  const tools = i.tools ?? []
  if (listed.length === 0 && i.wishes.length === 0 && own.length === 0 && tools.length === 0) return
  const placeFor = (r: PlaceRequest) => (r.status === 'built' || r.status === 'self-built' ? i.places.find((p) => sameChunk(p.chunk, r.chunk)) : undefined)

  const item = (r: PlaceRequest) => {
    const place = placeFor(r)
    return [
      `<li class="request" data-request="${esc(r.id)}" data-status="${esc(r.status)}">`,
      `<strong>${esc(r.name)}</strong> <span class="quiet">${r.tags.length === 1 ? 'Topic' : 'Topics'}: ${esc(r.tags.join(', '))}</span>`,
      `<p><em>${esc(requestStatusWords(r, place !== undefined))}</em>${place ? ` <a href="../places/${esc(place.id)}/">See the place.</a>` : ''}</p>`,
      ...(r.status === 'declined' && r.note ? [`<p class="reason"><strong>Roman’s reason:</strong> ${esc(r.note)}</p>`] : []),
      `<p>${esc(r.purpose)}</p>`,
      paragraphs(r.body),
      r.kind === 'gift'
        ? `<p class="quiet">Filed ${esc(day(r.written))}.</p>`
        : `<p class="quiet">Asked on ${esc(day(r.written))}${r.statusAt ? `; last changed ${esc(day(r.statusAt))}` : ''}.${r.souvenirs.length > 0 ? ` Based on ${r.souvenirs.length} ${r.souvenirs.length === 1 ? 'thing' : 'things'} it kept while reading.` : ''}</p>`,
      '</li>',
    ].join('')
  }

  const SELF_STATUS_WORDS: Record<SelfRequest['status'], string> = { open: 'No answer yet.', yes: 'Roman said yes.', no: 'Roman said no.', later: 'Roman said later.', built: 'Roman built it.' }
  const ownItem = (r: SelfRequest) =>
    `<li class="request" data-self-request="${esc(r.date)}" data-kind="${esc(r.kind)}" data-status="${esc(r.status)}"><strong>${esc(r.title || r.date)}</strong> <span class="quiet">${esc(r.kind)}, asked ${esc(r.date)}</span>${paragraphs(r.body)}<p><em>${esc(SELF_STATUS_WORDS[r.status])}</em>${r.answer ? ` Roman answered: ${esc(r.answer)}` : ''}</p></li>`

  const waiting = listed.filter(isOpenRequest).sort((a, b) => Number(b.status === 'building') - Number(a.status === 'building'))
  const answered = listed.filter((r) => !isOpenRequest(r)).reverse()
  const wishItem = (w: Wish) => {
    const place = w.forPlace ? i.places.find((p) => p.id === w.forPlace) : undefined
    return `<li class="request" data-wish="${esc(w.id)}" data-status="${esc(w.status)}"><strong>${esc(w.name)}</strong> <span class="quiet">${w.count === 1 ? 'Wished for once' : `Wished for ${w.count} times`}${place ? ` for <a href="../places/${esc(place.id)}/">${esc(place.name)}</a>` : ''}.</span><p><em>${esc(WISH_WORDS[w.status])}</em></p><p>${esc(w.description)}</p></li>`
  }

  i.add('requests/index.html', {
    title: 'Requests',
    active: 'requests/',
    body: [
      '<h1>Requests</h1>',
      '<p class="quiet">Merge founds its own places from the kit; they are listed under Places. Here are the gifts Roman made, what Merge wishes the kit had, and what it asked Roman about its own setup. Nothing it asks for is promised.</p>',
      ...(waiting.length > 0 ? ['<h2>Waiting</h2>', `<ul class="requests">${waiting.map(item).join('')}</ul>`] : []),
      ...(answered.length > 0 ? ['<h2>Settled</h2>', `<ul class="requests">${answered.map(item).join('')}</ul>`] : []),
      ...(own.length > 0
        ? [
            '<h2>Asked about its own setup</h2>',
            '<p class="quiet">Once a week Merge may ask Roman about its own setup: for something it wishes it could do, or for a number or a rule it finds wrong. Nothing changes because of a request alone, and nothing is promised. Roman sets a status (yes, no, later or built) and may answer, and Merge reads both the next week.</p>',
            `<ul class="requests">${own.map(ownItem).join('')}</ul>`,
          ]
        : []),
      ...(tools.length > 0
        ? [
            '<h2>What Merge can do</h2>',
            '<p class="quiet">The things Roman has given Merge, in plain words. Only Roman adds to this list.</p>',
            `<ul class="requests">${tools.map((t) => `<li class="request" data-tool="${esc(t.id)}"><strong>${esc(t.name)}</strong> <span class="quiet">${t.gift ? 'a gift' : 'asked for'}, since ${esc(t.since)}</span><p>${esc(t.what)}</p></li>`).join('')}</ul>`,
          ]
        : []),
      ...(i.wishes.length > 0 ? ['<h2>Wishes</h2>', '<p class="quiet">Things Merge wishes an existing place had: a part the kit lacks, or something made by hand.</p>', `<ul class="requests">${[...i.wishes].reverse().map(wishItem).join('')}</ul>`] : []),
    ].join('\n'),
  })
}
