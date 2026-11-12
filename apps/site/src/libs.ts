import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The libraries a work may load (spec 7.1): p5.js, Tone.js and three.js, served from Merge's own site under `lib/`. They are
 * devDependencies of this package at exact versions, so the engine release decides which versions are served and the
 * lockfile holds them; nothing large is committed. A work refers to them by relative path (`../../lib/p5.min.js`).
 *
 * three.js is an ES module and imports `./three.core.js`, so the two stay side by side. A sandboxed page has an opaque origin,
 * so a module script needs the site to send `access-control-allow-origin`, which GitHub Pages does for every file.
 */
export type VendoredPackage = 'p5' | 'tone' | 'three'

export interface VendoredFile {
  package: VendoredPackage
  /** Path inside the package. */
  from: string
  /** Path in the built site. */
  to: string
}

export const VENDORED_FILES: readonly VendoredFile[] = [
  { package: 'p5', from: 'lib/p5.min.js', to: 'lib/p5.min.js' },
  { package: 'tone', from: 'build/Tone.js', to: 'lib/Tone.js' },
  { package: 'three', from: 'build/three.module.js', to: 'lib/three/three.module.js' },
  { package: 'three', from: 'build/three.core.js', to: 'lib/three/three.core.js' },
]

const packageDir = (name: VendoredPackage) => join(fileURLToPath(new URL('..', import.meta.url)), 'node_modules', name)

/** The installed version of each library. */
export function libVersions(): Record<VendoredPackage, string> {
  const version = (name: VendoredPackage) => (JSON.parse(readFileSync(join(packageDir(name), 'package.json'), 'utf8')) as { version: string }).version
  return { p5: version('p5'), tone: version('tone'), three: version('three') }
}

/** Copies the libraries and a `versions.json` into `<outDir>/lib/`. Returns the paths written, relative to `outDir`. */
export function copyLibs(outDir: string): string[] {
  const written: string[] = []
  for (const file of VENDORED_FILES) {
    const target = join(outDir, file.to)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(packageDir(file.package), file.from), target)
    written.push(file.to)
  }
  writeFileSync(join(outDir, 'lib/versions.json'), `${JSON.stringify(libVersions(), null, 2)}\n`)
  written.push('lib/versions.json')
  return written
}
