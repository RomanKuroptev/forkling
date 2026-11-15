import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSelfRequest, type SelfRequest } from '@forkling/schema'

/** `self/requests/<date>.md` (spec 9.5): what Merge asked Roman in its weekly reviews, newest first, with his answer where he gave one. A file that is not a request is left out. */
export function readSelfRequests(dir: string): SelfRequest[] {
  const folder = join(dir, 'self/requests')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .flatMap((f) => {
      try {
        const parsed = parseSelfRequest(f.slice(0, -3), readFileSync(join(folder, f), 'utf8'))
        return parsed ? [parsed] : []
      } catch {
        return []
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}
