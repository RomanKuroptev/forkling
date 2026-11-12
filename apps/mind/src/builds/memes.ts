import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Trail, type WorkSource } from '@forkling/schema'

/** What a meme may be made from (spec 7.7, 7.8): a page whose picture Merge looked at, and a Wikipedia page it read. */
export interface MemeSeeds {
  looked: { url: string; title: string; what: string }[]
  read: { url: string; title: string }[]
}

const PER_LIST = 5
const TRAILS_SCANNED = 40

/**
 * The pages on its trails that a meme may name as sources, newest first. A page whose picture it looked at has a `look` on the
 * trail; a page it read about is a Wikipedia page that was fetched. The same page can be both. Taken from the trails, so a
 * meme cannot name a format it never met.
 */
export function memeSeeds(dir: string): MemeSeeds {
  const seeds: MemeSeeds = { looked: [], read: [] }
  const folder = join(dir, 'trails')
  if (!existsSync(folder)) return seeds
  const files = readdirSync(folder).filter((f) => f.endsWith('.json')).sort().reverse().slice(0, TRAILS_SCANNED)
  for (const file of files) {
    let trail: Trail
    try {
      const parsed = Trail.safeParse(JSON.parse(readFileSync(join(folder, file), 'utf8')))
      if (!parsed.success) continue
      trail = parsed.data
    } catch {
      continue
    }
    for (const page of [...trail.pages].reverse()) {
      if (page.failed) continue
      if (page.look && seeds.looked.length < PER_LIST && !seeds.looked.some((s) => s.url === page.url)) seeds.looked.push({ url: page.url, title: page.title, what: page.look })
      let host = ''
      try {
        host = new URL(page.url).hostname
      } catch {
        // Not a URL: not a source.
      }
      if (host === 'en.wikipedia.org' && seeds.read.length < PER_LIST && !seeds.read.some((s) => s.url === page.url)) seeds.read.push({ url: page.url, title: page.title })
    }
  }
  return seeds
}

/** Why the sources of a meme do not hold, one reason for each source that is not a page it looked at or read. Empty when they hold. */
export function verifyMemeSources(sources: readonly WorkSource[], seeds: MemeSeeds): string[] {
  const reasons: string[] = []
  for (const s of sources) {
    if (s.role === 'looked' && !seeds.looked.some((l) => l.url === s.url)) reasons.push(`the format it looked at, ${s.url}, is not a page whose picture it looked at (it must come from the list)`)
    if (s.role === 'read' && !seeds.read.some((r) => r.url === s.url)) reasons.push(`the page it read about the format, ${s.url}, is not a Wikipedia page it read (it must come from the list)`)
  }
  return reasons
}
