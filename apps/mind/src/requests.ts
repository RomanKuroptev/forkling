import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRequest, type PlaceRequest } from '@forkling/schema'

/** The place requests in a world repo (`requests/<id>.md`), in id order, whatever their status. A file that does not fit, or whose id is not its name, is left out. */
export function readRequests(dir: string): PlaceRequest[] {
  const folder = join(dir, 'requests')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .flatMap((f) => {
      try {
        const request = parseRequest(readFileSync(join(folder, f), 'utf8'))
        return request && `${request.id}.md` === f ? [request] : []
      } catch {
        return []
      }
    })
}
