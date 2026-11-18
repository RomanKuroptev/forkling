import { esc } from './md.ts'
import type { SiteProject } from './projects.ts'
import type { SiteWork } from './workshop.ts'

/**
 * The gallery `/gallery/` in the look of the gallery mockup (docs/spec/v4/look/site/gallery.png): every picture Merge has made, as tiles with a
 * day, a kind and a name, and tabs that filter them with no script (radio buttons and CSS). Pictures come from files the world repo has:
 * a shown work's thumbnail and a project session's screenshot. Memes, writing and read pages have no picture yet and are not here.
 */
export type TileKind = 'sketch' | 'work' | 'build'

export interface Tile {
  kind: TileKind
  title: string
  /** Path from the site root. */
  image: string
  /** Path from the site root. */
  href: string
  at: string
}

export const TAB_LABELS: Record<TileKind, string> = { sketch: 'sketches', work: 'works', build: 'builds' }

export function tiles(projects: readonly SiteProject[], works: readonly SiteWork[]): Tile[] {
  const out: Tile[] = []
  for (const { meta, hasThumb } of works) {
    if (!hasThumb || meta.status === 'scrap') continue
    out.push({ kind: meta.size === 'sketch' ? 'sketch' : 'work', title: meta.title, image: `works/${meta.id}/thumb.png`, href: `workshop/${meta.id}.html`, at: meta.made })
  }
  for (const { project, shots } of projects) {
    project.sessions.forEach((s, n) => {
      const shot = shots[n]
      if (shot) out.push({ kind: 'build', title: project.name, image: `projects/${project.id}/${shot}`, href: `projects/${project.id}/`, at: s.at })
    })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

const bg = (path: string) => `style="background-image:url('${esc(encodeURI(path).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29'))}')"`

export function galleryBody(list: readonly Tile[], tz: string, root = '../'): string {
  if (list.length === 0) return '<h1>Gallery</h1>\n<p class="quiet">Nothing yet. When Merge makes something with a picture, it shows here.</p>'
  const day = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short' }).format(new Date(iso))
  const count = (k: TileKind) => list.filter((t) => t.kind === k).length
  const kinds = (Object.keys(TAB_LABELS) as TileKind[]).filter((k) => count(k) > 0)
  const tabs = [{ id: 'all', label: `all ${list.length}` }, ...kinds.map((k) => ({ id: k, label: `${TAB_LABELS[k]} ${count(k)}` }))]
  return [
    `<h1>Gallery</h1>`,
    `<p class="quiet">${list.length} ${list.length === 1 ? 'picture' : 'pictures'} Merge made.</p>`,
    '<div class="gallery">',
    ...tabs.map((t, n) => `<input type="radio" name="gf" id="gf-${t.id}" class="gf"${n === 0 ? ' checked' : ''}><label class="gtab" for="gf-${t.id}">${esc(t.label)}</label>`),
    `<ul class="gtiles">${list.map((t) => `<li class="gt" data-k="${t.kind}"><a href="${esc(root + t.href)}"><span class="pic" role="img" aria-label="${esc(t.title)}" ${bg(root + t.image)}></span><span class="tmeta"><time datetime="${esc(t.at)}">${esc(day(t.at))}</time> · ${esc(t.kind)}</span><span class="gname">${esc(t.title)}</span></a></li>`).join('')}</ul>`,
    '</div>',
  ].join('\n')
}
