import { siteBase } from '../world/panelContent.ts'
import type { WorldRef } from '../world/route.ts'

/** The title chip at the top of the world: "WORLD.exe - Merge's island · 3 places". */
export function worldTitle(name: string, places: number): string {
  const base = `WORLD.exe - ${name}'s island`
  return places > 0 ? `${base} · ${places} ${places === 1 ? 'place' : 'places'}` : base
}

/**
 * Where the "desktop" button goes: the forkling's site. Inside the site's own `/world/` (one address) that is the folder above; on the engine's own
 * address it is the world's site on GitHub Pages; a world made up in the browser has none.
 */
export function desktopHref(i: { fixed: boolean; href: string; ref: WorldRef }): string | null {
  if (i.fixed) {
    const url = new URL('../', i.href.split(/[?#]/)[0]!)
    return url.href
  }
  return siteBase(i.ref)
}

/** The one line at the bottom of the screen on a laptop: the rest is behind the "?" button. */
export const shortHint = (): string => 'WASD to walk · drag to look · ? for the rest'
