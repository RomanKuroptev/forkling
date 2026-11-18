import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Credits, type Credit } from '@forkling/schema'

export const CREDITS_PATH = 'brain/credits.json'

/**
 * The credits Roman has added (spec v4 5.3), or none: a missing or unreadable file is an empty list, never a stop. Only Roman writes it, and
 * the engine only reads it, so the server's rebase never meets a conflict in it.
 */
export function readCredits(dir: string): Credit[] {
  const path = join(dir, CREDITS_PATH)
  if (!existsSync(path)) return []
  try {
    const parsed = Credits.safeParse(JSON.parse(readFileSync(path, 'utf8')))
    return parsed.success ? parsed.data.credits : []
  } catch {
    return []
  }
}
