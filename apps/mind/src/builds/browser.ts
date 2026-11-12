import type { Browser } from 'playwright'

/**
 * A headless browser for the work check. The bundled Chromium first (what the server has, installed once by `setup.sh`), then
 * Chrome or Edge if the machine has one. It starts with the browser's own sandbox on: the pages it opens are written by a
 * model, so the browser is not run without it. Playwright is loaded when this is called, so code that only knows about the
 * check does not need a browser installed. Null means none could be started.
 */
export async function launchChromium(): Promise<Browser | null> {
  const { chromium } = await import('playwright')
  for (const options of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) {
    try {
      return await chromium.launch(options)
    } catch {
      // try the next one
    }
  }
  return null
}
