import { buildViewer } from '../../src/world/serve.ts'

/**
 * The browser tests share one viewer in qa-out/viewer. It is built here, once, before any test file runs, and
 * QA_VIEWER_BUILT tells every worker it is ready, so no test rebuilds it while another reads it (#392).
 * Without QA_BROWSER=1 the browser tests are skipped, and nothing is built.
 */
export default async function setup(): Promise<void> {
  if (process.env.QA_BROWSER !== '1') return
  process.env.QA_VIEWER_BUILT = await buildViewer()
}
