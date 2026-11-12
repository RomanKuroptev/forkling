import { copyLibs } from './libs.ts'
import { renderSite } from './render.ts'

/** The whole site: the pages rendered from the world's files, and the vendored libraries beside them. */
export function buildSite(worldDir: string, outDir: string): { pages: string[] } {
  const { pages } = renderSite(worldDir, outDir)
  return { pages: [...pages, ...copyLibs(outDir)] }
}
