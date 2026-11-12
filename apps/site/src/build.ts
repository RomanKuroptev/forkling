import { copyLibs } from './libs.ts'
import { renderSite, type RenderOptions } from './render.ts'

/** The whole site: the pages rendered from the world's files, and the vendored libraries beside them. */
export function buildSite(worldDir: string, outDir: string, opts: RenderOptions = {}): { pages: string[] } {
  const { pages } = renderSite(worldDir, outDir, opts)
  return { pages: [...pages, ...copyLibs(outDir)] }
}
