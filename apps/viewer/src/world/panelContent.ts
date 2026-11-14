import { workFrame, type Place, type PlaceRequest, type Souvenir, type WorkMeta } from '@forkling/schema'
import { LOCAL_REF } from './localWorld.ts'
import type { WorldRef } from './route.ts'

/**
 * What the panel shows when a visitor clicks an exhibit or a sign (spec 4.6), as plain data. The words come from the world's files
 * and, for a souvenir, from the web, so they are data: shown as text, never run, and an address is only ever linked if it is https.
 */
export type PanelContent =
  | { kind: 'souvenir'; heading: string; text: string; evidence?: string; why: string; source: { title: string; url: string | null }; image?: { url: string | null; credit: string; licence: string }; licence: string | null }
  | { kind: 'work'; heading: string; about: string; /** The sandboxed iframe, or null in a world with no site to show it from. */ frameHtml: string | null }
  | { kind: 'plaque'; heading: string; text: string }
  | { kind: 'trail'; heading: string; url: string | null }
  | { kind: 'gallery'; heading: string; works: { id: string; title: string; about: string; kind: string; url: string | null }[] }
  | { kind: 'sign'; heading: string; purpose: string; founded: string; tags: string[]; related: string[]; history: { at: string; verb: string; summary: string }[]; pageUrl: string | null }
  | { kind: 'plot'; heading: string; purpose: string; tags: string[]; body: string; souvenirs: number; written: string; status: string }
  | { kind: 'note'; heading: string; text: string }

/** An address a visitor may be sent to or shown a picture from: https only. Anything else (a script, a data URL, a bare path) is nothing. */
export function safeUrl(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && url.startsWith('https://') ? u.href : null
  } catch {
    return null
  }
}

/** Where a world's site is, which is where its works are shown from. A world made up in the browser has none. */
export function siteBase(ref: WorldRef): string | null {
  if (ref.owner === LOCAL_REF.owner && ref.repo === LOCAL_REF.repo) return null
  return `https://${ref.owner.toLowerCase()}.github.io/${ref.repo}/`
}

const workUrl = (base: string | null, id: string): string | null => (base ? `${base}works/${id}/index.html` : null)

export function souvenirPanel(sv: Souvenir): PanelContent {
  const heading = sv.kind === 'quote' ? 'A quote' : sv.kind === 'fact' ? 'A fact' : 'A picture'
  const base = { kind: 'souvenir' as const, heading, why: sv.why, source: { title: sv.source.title, url: safeUrl(sv.source.url) }, licence: sv.licence }
  if (sv.kind === 'image') return { ...base, text: '', image: { url: safeUrl(sv.content), credit: sv.credit, licence: sv.licence } }
  if (sv.kind === 'fact') return { ...base, text: sv.content, evidence: sv.evidence }
  return { ...base, text: sv.content }
}

export function workPanel(meta: WorkMeta, base: string | null): PanelContent {
  const url = workUrl(base, meta.id)
  return { kind: 'work', heading: meta.title, about: meta.about, frameHtml: url ? workFrame(url, meta.title) : null }
}

export function plaquePanel(heading: string, markdown: string): PanelContent {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const body = lines[0]?.startsWith('# ') ? lines.slice(1) : lines
  return { kind: 'plaque', heading, text: body.join('\n').trim() }
}

/** Every work on the shelf, newest first: what the Workshop's terminal opens. A scrapped or put-away work is not on the shelf. */
export function galleryPanel(metas: readonly WorkMeta[], base: string | null): PanelContent {
  const shelf = metas.filter((m) => m.status === 'shelf').sort((a, b) => b.made.localeCompare(a.made))
  return { kind: 'gallery', heading: 'Every work', works: shelf.map((m) => ({ id: m.id, title: m.title, about: m.about, kind: m.kind, url: workUrl(base, m.id) })) }
}

/** A place's sign: when it was founded, every change with Merge's one-line summary (newest first), and its page. */
export function signPanel(place: Place, base: string | null): PanelContent {
  return {
    kind: 'sign',
    heading: place.exterior.sign || place.name,
    purpose: place.purpose,
    founded: place.founded,
    tags: place.tags,
    related: place.related,
    history: [...place.history].sort((a, b) => b.at.localeCompare(a.at)).map((h) => ({ at: h.at, verb: h.verb, summary: h.summary })),
    pageUrl: base ? `${base}places/${place.id}/` : null,
  }
}

/**
 * A staked plot (spec 10.3): what Merge asked Roman for, in its own words, and whether Roman has said he is building it. Roman's note is
 * not shown: it reaches Merge, not the plot.
 */
export function plotPanel(request: PlaceRequest): PanelContent {
  return {
    kind: 'plot',
    heading: request.name,
    purpose: request.purpose,
    tags: request.tags,
    body: request.body,
    souvenirs: request.souvenirs.length,
    written: request.written.slice(0, 10),
    status: request.status === 'building' ? 'Roman says he is building it.' : 'Waiting for Roman to answer.',
  }
}

export const noteOnly = (heading: string, text: string): PanelContent => ({ kind: 'note', heading, text })
