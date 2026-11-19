import type { Browser, Page } from 'playwright'

/** One entry of `window.__qa.scene()` (apps/viewer/src/qa/sceneList.ts). */
export interface SceneObject {
  id: string
  kind: 'place' | 'room' | 'work' | 'exhibit' | 'sign' | 'label' | 'plot' | 'merge' | 'visitor'
  place?: string
  ref?: string | null
  exhibitKind?: string
  /** The kind of slot an exhibit stands in (`screen`, `frame`, `shelf`, ...). */
  slot?: string
  /** For a work or project on a screen: what the screen shows as drawn now. */
  shows?: 'picture' | 'title' | 'nothing'
  name?: string
  text?: string
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
