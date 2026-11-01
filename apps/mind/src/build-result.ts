import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BuildResult } from '@forkling/schema'
import { writeJson } from './world.ts'

const resultPath = (id: string) => `mind/builds/${id}.result.json`

/** What the builder reported for a build, or null if it has not, or the file does not fit (the mind goes on waiting). */
export function readBuildResult(dir: string, id: string): BuildResult | null {
  const full = join(dir, resultPath(id))
  if (!existsSync(full)) return null
  try {
    const parsed = BuildResult.safeParse(JSON.parse(readFileSync(full, 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** The builder's report. It is the only file the builder writes for the mind; the mind does its own bookkeeping from it. */
export function writeBuildResult(dir: string, result: BuildResult): string {
  writeJson(dir, resultPath(result.id), BuildResult.parse(result))
  return resultPath(result.id)
}
