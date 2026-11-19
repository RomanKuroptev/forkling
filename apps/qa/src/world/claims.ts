import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CheckResult } from '../report/finding.ts'
import type { SceneObject } from './open.ts'

/**
 * Claims against the world (audit spec 7.4): what the built site says is in the world must be in `__qa.scene()`. The site's
 * places index names the places, and each place page lists what is on show there; anything said but not drawn is a major
 * finding. (Things in the world but not in the files are `world.scene-lists-files`.)
 */
export interface SiteClaims {
  places: string[]
  exhibits: { place: string; label: string }[]
}

const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

/** The claims of a built site folder. */
export function claimsFromSite(siteDir: string): SiteClaims {
  const index = join(siteDir, 'places', 'index.html')
  if (!existsSync(index)) return { places: [], exhibits: [] }
  const places = [...new Set([...readFileSync(index, 'utf8').matchAll(/href="([a-z0-9][a-z0-9-]*)\/"/g)].map((m) => m[1]!))].sort()
  const exhibits = places.flatMap((place) => {
    const page = join(siteDir, 'places', place, 'index.html')
    if (!existsSync(page)) return []
    return [...readFileSync(page, 'utf8').matchAll(/<section class="exhibit"><p><em>([\s\S]*?)<\/em><\/p>/g)].map((m) => ({ place, label: unescape(m[1]!).trim() }))
  })
  return { places, exhibits }
}

export function claimFindings(claims: SiteClaims, scene: readonly SceneObject[], fixture: string): CheckResult[] {
  const out: CheckResult[] = []
  const placesShown = new Set(scene.filter((o) => o.kind === 'place').map((o) => o.id))
  const add = (key: string, title: string, what: string, where: string) =>
    out.push({ id: 'world.claim-not-in-world', fingerprint: `world.claim-not-in-world|${fixture}|${key}`, severity: 'major', title, what, causes: 'The site sends visitors to something the 3D world does not show.', evidence: [], where, fixKind: 'code', fixture })
  for (const place of claims.places) if (!placesShown.has(place)) add(place, `The site lists ${place}, but the 3D world has no such place`, `places/index.html links to ${place}/, and the world draws no place ${place}.`, `places/${place}.json`)
  for (const { place, label } of claims.exhibits) {
    if (!placesShown.has(place)) continue
    const shown = scene.some((o) => (o.kind === 'work' || o.kind === 'exhibit') && o.place === place && (o.name ?? '').trim() === label)
    if (!shown) add(`${place}/${label.slice(0, 60)}`, `The site says "${label.slice(0, 60)}" is on show in ${place}, but the world does not show it`, `places/${place}/index.html lists "${label}", and no work or exhibit in ${place} in the 3D world has that label (its slot may not exist).`, `places/${place}.json`)
  }
  return out
}
