import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The two fonts of the Merge 95 look (docs/spec/v4/look.md), both under the Open Font License, served from the site's own `fonts/` folder
 * and not from Google. They are dependencies of this package (`@fontsource/*`), so the pages workflow's filtered install brings them in.
 */
export const FONT_FILES = [
  { package: '@fontsource/press-start-2p', from: 'files/press-start-2p-latin-400-normal.woff2', to: 'fonts/press-start-2p.woff2' },
  { package: '@fontsource/vt323', from: 'files/vt323-latin-400-normal.woff2', to: 'fonts/vt323.woff2' },
] as const

const packageDir = (name: string) => join(fileURLToPath(new URL('..', import.meta.url)), 'node_modules', name)

/** Copies the fonts into `<outDir>/fonts/`. Returns the paths written, relative to `outDir`. */
export function copyFonts(outDir: string): string[] {
  const written: string[] = []
  for (const file of FONT_FILES) {
    const target = join(outDir, file.to)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(packageDir(file.package), file.from), target)
    written.push(file.to)
  }
  return written
}
