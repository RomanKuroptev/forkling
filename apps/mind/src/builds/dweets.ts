import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Trail, type WorkSource } from '@forkling/schema'
import type { Fetcher } from '../web/fetch.ts'
import { dweetIdOf, dwitterGet } from '../web/sources/dwitter.ts'

/**
 * Dweets as starting points for Merge's own works (Roman, 20 November): a dweet it read on a trip is offered to a tinker call
 * with its code, credited by its link, and never copied. A work that holds a dweet's code whole, or any run of 80 characters of
 * it, is turned down, and a work that names a dweet it started from must name one it was offered.
 */
export const COPY_RUN = 80
const PER_TINKER = 3
const TRAILS_SCANNED = 40

export interface DweetSeed {
  url: string
  title: string
  /** The code as posted, and as it runs when it was packed (the same when it was not). */
  code: string
  plain: string
}

/** The dweet pages on its trails, newest first, at most 3: what it read, so what a tinker may start from. */
export function dweetPagesRead(dir: string): { url: string; title: string }[] {
  const out: { url: string; title: string }[] = []
  const folder = join(dir, 'trails')
  if (!existsSync(folder)) return out
  for (const file of readdirSync(folder).filter((f) => f.endsWith('.json')).sort().reverse().slice(0, TRAILS_SCANNED)) {
    let trail: Trail
    try {
      const parsed = Trail.safeParse(JSON.parse(readFileSync(join(folder, file), 'utf8')))
      if (!parsed.success) continue
      trail = parsed.data
    } catch {
      continue
    }
    for (const page of [...trail.pages].reverse()) {
      if (page.failed || dweetIdOf(page.url) === null || out.some((o) => o.url === page.url)) continue
      out.push({ url: page.url, title: page.title })
      if (out.length >= PER_TINKER) return out
    }
  }
  return out
}

/** The code of the dweets it read, fetched again by code for the tinker call (the tinker verb may read Dwitter). One that cannot be read is left out. */
export async function dweetSeeds(f: Fetcher, dir: string): Promise<DweetSeed[]> {
  const seeds: DweetSeed[] = []
  for (const page of dweetPagesRead(dir)) {
    try {
      const d = await dwitterGet(f, dweetIdOf(page.url)!)
      seeds.push({ url: page.url, title: `Dweet ${d.id} by ${d.author}`, code: d.code, plain: d.plain })
    } catch {
      // Left out: the work is made without it.
    }
  }
  return seeds
}

/** Runs of `COPY_RUN` characters of `code` that are in `html`; the whole code when it is shorter. */
function copied(html: string, code: string): boolean {
  const c = code.trim()
  if (!c) return false
  if (c.length <= COPY_RUN) return html.includes(c)
  for (let i = 0; i + COPY_RUN <= c.length; i++) if (html.includes(c.slice(i, i + COPY_RUN))) return true
  return false
}

/**
 * Why a work does not hold up against the dweets it was offered: one that holds a dweet's code (packed or plain) whole or any
 * 80 characters of it, and a source with role `from` that is not one of them. Empty when it holds.
 */
export function verifyDweetUse(html: string, sources: readonly WorkSource[], seeds: readonly DweetSeed[]): string[] {
  const reasons: string[] = []
  for (const s of seeds) {
    if (copied(html, s.code) || (s.plain !== s.code && copied(html, s.plain))) reasons.push(`the page copies the code of ${s.title} (${s.url}); a dweet is a starting point: write your own code and name its page in sources with role "from"`)
  }
  for (const s of sources) if (s.role === 'from' && !seeds.some((d) => d.url === s.url)) reasons.push(`the dweet it started from, ${s.url}, is not one it was offered (it must come from the list)`)
  return reasons
}
