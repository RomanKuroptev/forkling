import { Souvenir, WorkMeta, type Place, type PlaceRequest } from '@forkling/schema'
import type { LoadedWorld } from './loadWorld.ts'
import { LOCAL_REF } from './localWorld.ts'
import { galleryPanel, noteOnly, plaquePanel, plotPanel, safeUrl, signPanel, siteBase, souvenirPanel, workPanel, type PanelContent } from './panelContent.ts'

/** Reads one file of a world at its commit. Null when it is not there, would not load, or the world has no network to read from. */
export interface WorldFiles {
  json(path: string): Promise<unknown | null>
  text(path: string): Promise<string | null>
}

/** A path a place file may name: plain folders and a file name, nothing that climbs out or adds a query. The refs are data. */
const SAFE_PATH = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/

export function worldFiles(world: Pick<LoadedWorld, 'ref' | 'sha'>, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): WorldFiles {
  const local = world.ref.owner === LOCAL_REF.owner && world.ref.repo === LOCAL_REF.repo
  const get = async (path: string): Promise<Response | null> => {
    if (local || !SAFE_PATH.test(path)) return null
    try {
      const res = await fetchImpl(`https://raw.githubusercontent.com/${world.ref.owner}/${world.ref.repo}/${world.sha}/${path}`)
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
export async function loadPanel(target: PanelTarget, ctx: { world: Pick<LoadedWorld, 'ref' | 'workIds'>; files: WorldFiles }): Promise<PanelContent> {
  const base = siteBase(ctx.world.ref)
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
