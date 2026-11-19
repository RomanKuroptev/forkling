import { Project, Souvenir, WorkMeta, type Place, type PlaceRequest } from '@forkling/schema'
import type { LoadedWorld } from './loadWorld.ts'
import { LOCAL_REF } from './localWorld.ts'
import { galleryPanel, noteOnly, plaquePanel, projectPanel, plotPanel, safeUrl, signPanel, siteBase, souvenirPanel, workPanel, type PanelContent } from './panelContent.ts'

/** Reads one file of a world at its commit. Null when it is not there, would not load, or the world has no network to read from. */
export interface WorldFiles {
  json(path: string): Promise<unknown | null>
  text(path: string): Promise<string | null>
}

/** A path a place file may name: plain folders and a file name, nothing that climbs out or adds a query. The refs are data. */
const SAFE_PATH = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/

/**
 * Where the files of a world served next to the viewer are (`?world=local`: `<origin><base>world/`, as `localFetch` reads them).
 * Null for a world from GitHub and for one made up in the browser (`?fixture=`), which has no files.
 */
export function localFilesBase(world: Pick<LoadedWorld, 'ref' | 'sha'>, origin: string, baseUrl: string): string | null {
  const local = world.ref.owner === LOCAL_REF.owner && world.ref.repo === LOCAL_REF.repo
  return local && world.sha === 'local' ? `${origin}${baseUrl}world/` : null
}

/**
 * The address of one file of a world, for things the browser loads itself (a work's thumbnail on a screen): at its commit on
 * GitHub, or under `localBase` for a local world. Null for a made-up world, or a path that is not a plain path.
 */
export function worldFileUrl(world: Pick<LoadedWorld, 'ref' | 'sha'>, path: string, localBase: string | null): string | null {
  if (!SAFE_PATH.test(path)) return null
  const local = world.ref.owner === LOCAL_REF.owner && world.ref.repo === LOCAL_REF.repo
  if (local) return localBase ? `${localBase}${path}` : null
  return `https://raw.githubusercontent.com/${world.ref.owner}/${world.ref.repo}/${world.sha}/${path}`
}

/** `localBase` is where a local world's files are served (`localFilesBase`); without it a local world has no files to read. */
export function worldFiles(world: Pick<LoadedWorld, 'ref' | 'sha'>, fetchImpl: typeof fetch = (input, init) => fetch(input, init), localBase: string | null = null): WorldFiles {
  const local = world.ref.owner === LOCAL_REF.owner && world.ref.repo === LOCAL_REF.repo
  const get = async (path: string): Promise<Response | null> => {
    if ((local && !localBase) || !SAFE_PATH.test(path)) return null
    try {
      const res = await fetchImpl(local ? `${localBase}${path}` : `https://raw.githubusercontent.com/${world.ref.owner}/${world.ref.repo}/${world.sha}/${path}`)
      return res.ok ? res : null
    } catch {
      return null
    }
  }
  return {
    async json(path) {
      const res = await get(path)
      if (!res) return null
      try {
        return (await res.json()) as unknown
      } catch {
        return null
      }
    },
    async text(path) {
      const res = await get(path)
      return res ? await res.text() : null
    },
  }
}

export type PanelTarget = { kind: 'exhibit'; place: Place; exhibit: Place['exhibits'][number] } | { kind: 'sign'; place: Place } | { kind: 'plot'; request: PlaceRequest }

const MAX_GALLERY = 60

const missing = (local: boolean): PanelContent =>
  local ? noteOnly('A made-up world', 'This world only exists in your browser, so there is nothing behind this to open.') : noteOnly('Not available', 'This could not be opened right now. Try again in a little while.')

/** What to show for a click, reading the one file it needs (or, for the gallery, each work's meta). Never throws: anything that does not load is a note. */
export async function loadPanel(target: PanelTarget, ctx: { world: Pick<LoadedWorld, 'ref' | 'workIds'>; files: WorldFiles; localSite?: string | null }): Promise<PanelContent> {
  // A local world's works run from the files served next to the viewer, as they would from its site.
  const base = siteBase(ctx.world.ref) ?? ctx.localSite ?? null
  const local = base === null
  if (target.kind === 'sign') return signPanel(target.place, base)
  if (target.kind === 'plot') return plotPanel(target.request)
  const { exhibit } = target
  const ref = exhibit.ref
  switch (exhibit.kind) {
    case 'souvenir': {
      const parsed = ref ? Souvenir.safeParse(await ctx.files.json(`${ref}.json`)) : null
      return parsed?.success ? souvenirPanel(parsed.data) : missing(local)
    }
    case 'work': {
      const parsed = ref ? WorkMeta.safeParse(await ctx.files.json(`${ref}/meta.json`)) : null
      return parsed?.success ? workPanel(parsed.data, base) : missing(local)
    }
    case 'project': {
      const parsed = ref ? Project.safeParse(await ctx.files.json(`${ref}/project.json`)) : null
      return parsed?.success && parsed.data.status === 'done' ? projectPanel(parsed.data, base) : missing(local)
    }
    case 'plaque': {
      const text = ref ? await ctx.files.text(ref) : null
      if (text === null) return missing(local)
      const title = /^# (.+)$/m.exec(text)?.[1]?.trim() ?? exhibit.label
      return plaquePanel(title, text)
    }
    case 'trail':
      return { kind: 'trail', heading: 'A trail', url: base && ref ? safeUrl(`${base}trails/${ref.split('/')[1] ?? ''}/`) : null }
    case 'gallery': {
      const metas = await Promise.all(
        ctx.world.workIds.slice(0, MAX_GALLERY).map(async (id) => {
          const parsed = WorkMeta.safeParse(await ctx.files.json(`works/${id}/meta.json`))
          return parsed.success ? parsed.data : null
        }),
      )
      const ok = metas.filter((m): m is WorkMeta => m !== null)
      return ok.length === 0 && local ? missing(local) : galleryPanel(ok, base)
    }
  }
}
