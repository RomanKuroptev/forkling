import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Place, Souvenir, workFrame, type PlaceVerb } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { allPaths, isBuilding, neglectFor, placeCentre, toLandPlace } from '@forkling/sim'
import { esc, markdown } from './md.ts'
import type { FeedItem } from './feed.ts'
import type { SiteWork } from './workshop.ts'

/** The places in `places/`, in id order. A file that does not fit the schema is left out, never guessed at. */
export function loadPlaces(world: string): Place[] {
  const folder = join(world, 'places')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      try {
        const parsed = Place.safeParse(JSON.parse(readFileSync(join(folder, f), 'utf8')))
        return parsed.success && parsed.data.id === f.slice(0, -5) ? [parsed.data] : []
      } catch {
        return []
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** What each thing done to a place is called in the feed and in `changes.json`. An install is code tidying the screens, so it is not news. */
const PAST: Partial<Record<PlaceVerb, string>> = { found: 'founded', expand: 'expanded', tend: 'tended', revisit: 'revisited', rename: 'renamed' }
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Feed entries for what was done to places: one for each history line that is news. */
export function placeFeedItems(places: readonly Place[]): FeedItem[] {
  return places.flatMap((p) =>
    p.history.flatMap((h) => {
      const past = PAST[h.verb]
      return past ? [{ title: `${capital(past)} ${p.name}`, path: `places/${p.id}/`, at: h.at, description: h.summary }] : []
    }),
  )
}

const WINDOW_MS = 15 * 60_000

/**
 * For `changes.json`: what was done to a place by the commit that wrote its file. A commit's time is just after the tick's, so it
 * is the newest history line from the 15 minutes before it. Nothing is said when that line is not news (an install) or there is none.
 */
export function placeChangeLookup(places: readonly Place[]): (id: string, commitIso: string) => { name: string; text: string } | undefined {
  const byId = new Map(places.map((p) => [p.id, p]))
  return (id, commitIso) => {
    const place = byId.get(id)
    const commit = Date.parse(commitIso)
    if (!place || Number.isNaN(commit)) return undefined
    const entry = [...place.history].reverse().find((h) => Date.parse(h.at) <= commit && commit - Date.parse(h.at) <= WINDOW_MS)
    const past = entry ? PAST[entry.verb] : undefined
    return past ? { name: place.name, text: `${past} ${place.name}` } : undefined
  }
}

const NEGLECT_WORDS = ['kept up', 'a little dusty', 'dusty and cobwebbed', 'overgrown']
const NEGLECT_FILL = ['#8fbf7f', '#d6c46a', '#d38b4f', '#9b5a4a']
const HEX = /^#[0-9a-fA-F]{6}$/

const accentOf = (place: Place): string | null => {
  const hex = kit.palettes.find((p) => p.id === place.exterior.palette)?.colors.accent
  return hex && HEX.test(hex) ? hex : null
}

const lastChange = (place: Place) => place.history.at(-1)

export interface PlacesInput {
  places: readonly Place[]
  works: readonly SiteWork[]
  nowMs: number
  tz: string
  /** The souvenir as the rest of the site shows it (words, why, source link). */
  souvenirHtml: (s: Souvenir) => string
  readText: (rel: string) => string | null
  readSouvenir: (id: string) => Souvenir | null
  add: (rel: string, input: { title: string; active: string; body: string }) => void
}

function stamp(iso: string, tz: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** A moment as `2026-11-20 19:00` in the forkling's zone. */
function stampTime(iso: string, tz: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`
}

/** The top-down map: a square for each chunk with a place or a path on it, each place a square in its colour for its neglect level. */
function mapSvg(places: readonly Place[], nowMs: number): string {
  const land = places.map(toLandPlace)
  const paths = allPaths(land)
  const chunks = new Map<string, [number, number]>()
  for (const p of places) chunks.set(p.chunk.join(','), p.chunk)
  for (const path of paths) for (const c of path.chunks) chunks.set(`${c[0]},${c[1]}`, [c[0], c[1]])
  const xs = [...chunks.values()].map((c) => c[0])
  const zs = [...chunks.values()].map((c) => c[1])
  const minX = Math.min(...xs) - 1
  const minZ = Math.min(...zs) - 1
  const cols = Math.max(...xs) + 1 - minX + 1
  const rows = Math.max(...zs) + 1 - minZ + 1
  const CELL = 48
  const toX = (m: number) => ((m - minX * 32) * CELL) / 32
  const toZ = (m: number) => ((m - minZ * 32) * CELL) / 32
  const squares = [...chunks.values()].map(([cx, cz]) => `<rect class="chunk" x="${(cx - minX) * CELL}" y="${(cz - minZ) * CELL}" width="${CELL}" height="${CELL}" fill="none" stroke="currentColor" stroke-opacity="0.2"/>`)
  const tracks = paths.map((path) => `<polyline data-kind="${path.kind ?? 'founding'}" points="${path.chunks.map((c) => `${(c[0] - minX + 0.5) * CELL},${(c[1] - minZ + 0.5) * CELL}`).join(' ')}" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="3"/>`)
  const houses = places.map((p, i) => {
    const [x, z] = placeCentre(land[i]!)
    const w = (p.exterior.footprint[0] * CELL) / 32
    const d = (p.exterior.footprint[1] * CELL) / 32
    const level = neglectFor({ id: p.id, lastCareAt: p.state.lastCareAt, founded: p.founded }, nowMs)
    const building = isBuilding(p.state, nowMs)
    return `<a href="${esc(p.id)}/"><rect data-place="${esc(p.id)}" data-neglect="${level}"${building ? ' data-building="true"' : ''} x="${(toX(x) - w / 2).toFixed(1)}" y="${(toZ(z) - d / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${d.toFixed(1)}" fill="${NEGLECT_FILL[level]}" stroke="currentColor"><title>${esc(p.name)}: ${NEGLECT_WORDS[level]}${building ? ', under construction' : ''}</title></rect></a>`
  })
  return `<svg role="img" aria-label="Top-down map of the places" viewBox="0 0 ${cols * CELL} ${rows * CELL}" width="${Math.min(cols * CELL, 640)}" style="max-width:100%;height:auto">${[...squares, ...tracks, ...houses].join('')}</svg>`
}

function exhibitHtml(place: Place, ex: Place['exhibits'][number], i: PlacesInput, works: Map<string, SiteWork>): string {
  const label = `<p><em>${esc(ex.label)}</em></p>`
  if (ex.kind === 'gallery') {
    const shelf = i.works.filter((w) => w.meta.status === 'shelf')
    return `${label}<ul>${shelf.map((w) => `<li><a href="../../workshop/${esc(w.meta.id)}.html">${esc(w.meta.title)}</a></li>`).join('') || '<li class="quiet">Nothing on the shelf yet.</li>'}</ul>`
  }
  if (!ex.ref) return label
  if (ex.kind === 'souvenir') {
    const s = i.readSouvenir(ex.ref.slice('souvenirs/'.length))
    return `${label}${s ? `<div class="kept">${i.souvenirHtml(s)}</div>` : ''}`
  }
  if (ex.kind === 'work') {
    const w = works.get(ex.ref.slice('works/'.length))
    return `${label}${w && w.meta.status !== 'scrap' ? `<div class="work-frame">${workFrame(`../../works/${w.meta.id}/index.html`, w.meta.title)}</div><p><a href="../../workshop/${esc(w.meta.id)}.html">${esc(w.meta.title)}</a></p>` : ''}`
  }
  if (ex.kind === 'trail') return `${label}<p><a href="../../trails/${esc(ex.ref.slice('trails/'.length))}.html">Where it went</a></p>`
  if (ex.kind === 'plaque') {
    const text = i.readText(ex.ref)
    return `${label}${text ? `<div class="plaque">${markdown(esc(text))}</div>` : ''}`
  }
  void place
  return label
}

/** `/places/` and `/places/<id>/` (spec 8). Nothing is written for a world with no places. */
export function renderPlaces(i: PlacesInput): void {
  if (i.places.length === 0) return
  const works = new Map(i.works.map((w) => [w.meta.id, w]))
  const level = (p: Place) => neglectFor({ id: p.id, lastCareAt: p.state.lastCareAt, founded: p.founded }, i.nowMs)

  i.add('places/index.html', {
    title: 'Places',
    active: 'places/',
    body: [
      '<h1>Places</h1>',
      `<p class="quiet">${i.places.length} ${i.places.length === 1 ? 'place' : 'places'}. Green is kept up; yellow, orange and red have been left alone for longer. Neglect is as of when this page was built.</p>`,
      mapSvg(i.places, i.nowMs),
      '<ul class="places">',
      ...i.places.map((p) => {
        const last = lastChange(p)
        return `<li><strong><a href="${esc(p.id)}/">${esc(p.name)}</a></strong> <span class="quiet">${esc(p.tags.join(', '))}; ${NEGLECT_WORDS[level(p)]}${isBuilding(p.state, i.nowMs) ? '; under construction' : ''}</span><p>${esc(p.purpose)}</p>${last ? `<p class="quiet">Last change, ${esc(stamp(last.at, i.tz))}: ${esc(last.summary)}</p>` : ''}</li>`
      }),
      '</ul>',
    ].join('\n'),
  })

  for (const p of i.places) {
    const accent = accentOf(p)
    const related = p.related.flatMap((id) => {
      const other = i.places.find((x) => x.id === id)
      return other ? [`<a href="../${esc(other.id)}/">${esc(other.name)}</a>`] : []
    })
    const history = [...p.history].reverse().slice(0, 50)
    i.add(`places/${p.id}/index.html`, {
      title: p.name,
      active: 'places/',
      body: [
        `<div class="place"${accent ? ` style="--accent: ${accent}"` : ''}>`,
        '<p class="quiet"><a href="../">All places</a></p>',
        `<h1>${esc(p.name)}</h1>`,
        `<p>${esc(p.purpose)}</p>`,
        `<p class="quiet">${esc(p.tags.join(', '))}. Founded ${esc(p.founded)}. ${capital(NEGLECT_WORDS[level(p)]!)}.${p.state.lamps ? ' The lamps are on.' : ' The lamps are off.'}</p>`,
        ...(isBuilding(p.state, i.nowMs) ? [`<p class="quiet">Under construction until ${esc(stampTime(p.state.construction!.finishesAt, i.tz))}.</p>`] : []),
        ...(related.length > 0 ? [`<p>Related: ${related.join(', ')}.</p>`] : []),
        '<h2>What is in it</h2>',
        p.exhibits.length > 0 ? p.exhibits.map((ex) => `<section class="exhibit">${exhibitHtml(p, ex, i, works)}</section>`).join('\n') : '<p class="quiet">Nothing on show yet.</p>',
        '<h2>History</h2>',
        history.length > 0 ? `<ul>${history.map((h) => `<li><strong>${esc(stamp(h.at, i.tz))}</strong> <span class="quiet">${esc(h.verb)}</span>: ${esc(h.summary)}</li>`).join('')}</ul>` : '<p class="quiet">No history yet.</p>',
        '</div>',
      ].join('\n'),
    })
  }
}
