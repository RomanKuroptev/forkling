import { execFile } from 'node:child_process'

/** Runs one git command in the world repo. Injected, so tests never touch a real repository. */
export type GitRunner = (args: readonly string[]) => Promise<{ code: number; stdout: string }>

/** The real thing: `git` in the world directory. A failing command is a non-zero code, never a throw. */
export function gitRunner(dir: string): GitRunner {
  return (args) =>
    new Promise((resolve) => {
      execFile('git', [...args], { cwd: dir, maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0
        resolve({ code, stdout: String(stdout) })
      })
    })
}

export type PushOutcome = 'clean' | 'pushed' | 'push-failed'

/** A push is tried this many times, each after a pull with rebase, before the loop carries on without it (spec 2.2). */
export const MAX_PUSH_TRIES = 3

/**
 * Commits what changed in the world and pushes it. The server and the auto-merged build pull requests both write to
 * `main`, so every push comes right after a pull with rebase; they never touch the same files, so it cannot conflict. A
 * rebase that fails is backed out. After 3 failed tries the commit stays local and the loop goes on from disk; the next
 * call with `retryPush` sends it.
 */
export async function commitAndPush(git: GitRunner, message: string, opts: { retryPush?: boolean } = {}): Promise<PushOutcome> {
  await git(['add', '-A'])
  const clean = (await git(['diff', '--cached', '--quiet'])).code === 0
  if (clean && !opts.retryPush) return 'clean'
  if (!clean && (await git(['commit', '-q', '-m', message])).code !== 0) return 'push-failed'
  for (let attempt = 0; attempt < MAX_PUSH_TRIES; attempt++) {
    if ((await git(['pull', '--rebase'])).code !== 0) {
      await git(['rebase', '--abort'])
      continue
    }
    if ((await git(['push'])).code === 0) return 'pushed'
  }
  return 'push-failed'
}
