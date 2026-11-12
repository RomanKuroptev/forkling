import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Runs `git` with these arguments and gives the exit code. Injected, so a test clones nothing. */
export type CloneRunner = (args: readonly string[]) => Promise<number>

export const cloneRunner: CloneRunner = (args) =>
  new Promise((resolve) => {
    execFile('git', [...args], (error) => resolve(error ? (typeof error.code === 'number' ? error.code : 1) : 0))
  })

/**
 * The world the server runs on (spec 11.2: nothing that matters lives only on the server). On start it uses the world on
 * disk; if the disk is lost it clones the repo again, and loses at most the 15 minutes since the last push.
 */
export async function ensureWorld(dir: string, repoUrl: string | undefined, git: CloneRunner): Promise<'disk' | 'cloned'> {
  if (existsSync(join(dir, 'forkling.json'))) return 'disk'
  if (!repoUrl) throw new Error(`no world in ${dir} and no repository to clone it from (set --repo or FORKLING_REPO_URL)`)
  const code = await git(['clone', repoUrl, dir])
  if (code !== 0) throw new Error(`git clone of the world failed (exit code ${code})`)
  return 'cloned'
}
