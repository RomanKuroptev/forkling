import type { Browser, Page } from 'playwright'

/** One entry of `window.__qa.scene()` (apps/viewer/src/qa/sceneList.ts). */
export interface SceneObject {
  id: string
  /** `column`: a solid piece in front of a building's front (porch columns, an arch), listed for the hidden-sign check. `part`: a drawn piece of furniture; `door`: a place's doorway, which must stay clear. */
  kind: 'place' | 'room' | 'part' | 'door' | 'work' | 'exhibit' | 'sign' | 'label' | 'plot' | 'merge' | 'visitor' | 'column'
  place?: string
  ref?: string | null
  exhibitKind?: string
  /** The kind of slot an exhibit stands in (`screen`, `frame`, `shelf`, ...). */
  slot?: string
  /** Where an exhibit stands, as a work's `installedIn` names it: `<place>/<room>/<part index>/<slot index>`. A gallery wall tile has none. */
  at?: string
  /** For a work or project on a screen, or a work on a gallery wall tile: what it shows as drawn. */
  shows?: 'picture' | 'title' | 'nothing'
  /** What an exhibit's card shows and the words on it; every exhibit but a work screen has one. */
  card?: { shows: 'picture' | 'text' | 'title' | 'nothing'; text: string }
  /** For an exhibit with a card, in the frame of the part it stands on: a visitor's eyes in front of it, points of the card's face, the part's pieces. */
  view?: { eyes: [number, number, number][]; face: [number, number, number][]; boards: { min: [number, number, number]; max: [number, number, number] }[] }
  /** A part not drawn because it stands in a doorway, and the exhibits it holds (not drawn either). */
  inDoorway?: { holds: string[] }
  /** A part drawn with a foot or stand that stands in mid-air: on no floor, no other part and no wall. */
  inAir?: true
  name?: string
  /** For a place: its footprint on the ground, in world meters. Its walls stand on the edge: the outer 0.8 m is wall. */
  footprint?: { x0: number; z0: number; x1: number; z1: number }
  /** For a place: its palette's wall colour. */
  wall?: string
  text?: string
  /** For a sign: the boxes of the solid pieces under its board that could hold it up (its posts), as drawn. */
  support?: { min: [number, number, number]; max: [number, number, number] }[]
  /** For a place drawn as wire: each glowing line's two ends, as drawn (its inside too when that is drawn). */
  wire?: [[number, number, number], [number, number, number]][]
  letter?: number
  box: { min: [number, number, number]; max: [number, number, number] } | null
  visible: boolean
  material: 'solid' | 'wireframe' | 'glass' | 'none'
}

export interface OpenOptions {
  /** The fixture's clock (`qa.json` `now`). */
  now: string
  seed?: number
  /** A phone: 390x844 with the touch controls. Otherwise 1280x800. */
  phone?: boolean
  /** How long to wait for `__qa.ready`. */
  timeoutMs?: number
}

/** Opens the served world with `?world=local&qa=1` and waits until the world, Merge and the textures are loaded. */
export async function openWorld(browser: Browser, url: string, opts: OpenOptions): Promise<Page> {
  const page = await browser.newPage({ viewport: opts.phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const query = new URLSearchParams({ world: 'local', qa: '1', now: opts.now, seed: String(opts.seed ?? 1), bubble: '0' })
  if (opts.phone) query.set('touch', '1')
  await page.goto(`${url}?${query}`)
  try {
    await page.waitForFunction(() => (globalThis as unknown as { __qa?: { ready: boolean } }).__qa?.ready === true, null, { timeout: opts.timeoutMs ?? 60_000 })
  } catch (e) {
    const shown = await page.evaluate(() => (globalThis as unknown as { document: { body: { innerText: string } } }).document.body.innerText.slice(0, 300)).catch(() => '')
    await page.close()
    throw new Error(`the world never got ready${errors.length ? ` (page errors: ${errors.join('; ')})` : ''}${shown ? `; the page says: ${shown}` : ''}`, { cause: e })
  }
  return page
}

export const sceneOf = (page: Page): Promise<SceneObject[]> => page.evaluate(() => (globalThis as unknown as { __qa: { scene(): SceneObject[] } }).__qa.scene())
