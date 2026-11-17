import type { WorkKind } from '@forkling/schema'
import type { Browser } from 'playwright'
import { createLocalSandbox, RUN_MS, type Sandbox, type SandboxRun } from './sandbox-run.ts'
import { clean } from './sandbox-runner.ts'
import { staticCheck, type CheckResult } from './work-check.ts'

/** The work is watched this long (spec 7.3, step 2). */
export const CHECK_MS = RUN_MS
const WORK_PATH = 'works/check/index.html'

export interface WorkCheckResult extends CheckResult {
  /** The screenshot of the work, saved as `thumb.png` when it passes. Null when there was none to take. */
  thumb: Buffer | null
  /** There is no browser to check with, so nothing was decided: a step should rest, not scrap the work. */
  unavailable?: true
}

export interface WorkChecker {
  /** `html` is the page as it will be stored, with the policy tag in it (see `withPolicy`). One check at a time. */
  check(html: string, opts: { size: 'full' | 'sketch'; kind?: WorkKind | undefined }): Promise<WorkCheckResult>
  available(): Promise<boolean>
  close(): Promise<void>
}

export interface BrowserCheckerOptions {
  /** Where the page runs. Default: in this process (`createLocalSandbox`) with `launch` and `libsDir`. */
  sandbox?: Sandbox
  launch?: () => Promise<Browser | null>
  /** How long to watch (default `CHECK_MS`). */
  durationMs?: number
  /** A directory holding a `lib/` to serve instead of the vendored libraries. For a test. */
  libsDir?: string
}

const libraryReason = (file: string) => `library ${clean(file, 40)} did not load`

/** What a run means for a work (spec 7.3, steps 2 to 4), in plain words for the repair call and the scrap bin. */
export function reasonsOf(run: SandboxRun): string[] {
  const reasons = new Set<string>()
  for (const error of run.errors) reasons.add(error.startsWith('the page could not be opened') ? error : `uncaught error: ${error}`)
  if (run.crashed) reasons.add('the page crashed the browser (it may have used too much memory)')
  else if (!run.loaded && run.errors.length === 0) reasons.add('the page did not load in its frame')
  for (const file of run.libraryFailures) reasons.add(libraryReason(file))
  // An attempt the policy stopped never reaches the runner, and is contained. One the runner had to stop got past the policy.
  for (const host of run.outside) reasons.add(`it tried to reach ${host}, and a work has no network`)
  if (run.navigated) reasons.add('it sent its own frame to another address (navigation), and a work stays where it is')
  if (run.loaded && !run.crashed && !run.rendered) reasons.add('the page never rendered a frame (it may be stuck in a loop)')
  if (run.rendered && !run.screenshotPng) reasons.add('the page could not be photographed')
  if (run.blank) reasons.add('the screenshot is a single colour, so the page drew nothing to see')
  return [...reasons].slice(0, 8)
}

/**
 * The browser step of the check (spec 7.3, steps 2 to 4), on the one path of spec-v4 section 4 (`sandbox-run.ts`). The work is
 * shown the way the site will show it (an iframe with `sandbox="allow-scripts"`, the policy in the page, the libraries from
 * `lib/`) and watched. It fails on an uncaught error, a library that did not load, a frame that never renders, a frame sent to
 * another address, a request that got past the policy, a crash, or a screenshot of a single colour. The static step runs first
 * and starts no browser. Checks run one at a time.
 */
export function createBrowserChecker(opts: BrowserCheckerOptions = {}): WorkChecker {
  const sandbox = opts.sandbox ?? createLocalSandbox({ ...(opts.launch ? { launch: opts.launch } : {}), ...(opts.libsDir ? { libsDir: opts.libsDir } : {}) })
  const durationMs = opts.durationMs ?? CHECK_MS

  return {
    async check(html, o) {
      const fixed = staticCheck(html, { size: o.size, kind: o.kind })
      if (!fixed.ok) return { ...fixed, thumb: null }
      const run = await sandbox.run({ files: new Map([[WORK_PATH, Buffer.from(html, 'utf8')]]), frame: WORK_PATH }, { durationMs })
      if (run.unavailable) return { ok: false, reasons: ['no browser is available to check the work'], thumb: null, unavailable: true }
      const reasons = reasonsOf(run)
      return { ok: reasons.length === 0, reasons, thumb: reasons.length === 0 ? run.screenshotPng : null }
    },
    available: () => sandbox.available(),
    close: () => sandbox.close(),
  }
}
