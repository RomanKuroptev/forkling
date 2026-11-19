import { type Browser, chromium } from 'playwright'

// Chromium for the checks: the same Playwright and browser build apps/mind installs. Headless uses SwiftShader in CI;
// `headed` with the GPU is only for `pnpm qa fps` on Roman's PC. A browser that does not start throws, and the
// runner turns that into qa.check-did-not-run.
export async function launchChromium(opts: { headed?: boolean } = {}): Promise<Browser> {
  return chromium.launch({
    headless: !opts.headed,
    args: opts.headed ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
}
