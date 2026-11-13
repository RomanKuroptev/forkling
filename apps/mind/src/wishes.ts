import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Wish } from '@forkling/schema'

/** The wishes in a world repo (`wishes/<id>.json`), in id order. A file that does not fit the schema, or whose id is not its name, is left out. */
export function readWishes(dir: string): Wish[] {
  const folder = join(dir, 'wishes')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => {
      try {
        const parsed = Wish.safeParse(JSON.parse(readFileSync(join(folder, f), 'utf8')))
        return parsed.success && `${parsed.data.id}.json` === f ? [parsed.data] : []
      } catch {
        return []
      }
    })
}
