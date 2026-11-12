import { describe, expect, it } from 'vitest'
import { commitAndPush, type GitRunner } from '../src/tick/git.ts'

/** A git that answers from a script and remembers what it was asked. */
function fakeGit(answer: (args: readonly string[], n: number) => number) {
  const log: string[][] = []
  const counts = new Map<string, number>()
  const run: GitRunner = async (args) => {
    log.push([...args])
    const key = args.join(' ')
    const n = (counts.get(key) ?? 0) + 1
    counts.set(key, n)
    return { code: answer(args, n), stdout: '' }
  }
  return { log, run, commands: () => log.map((a) => a.join(' ')) }
}

const dirty = (args: readonly string[]) => (args[0] === 'diff' ? 1 : 0)

describe('commitAndPush (spec 2.2: pull with rebase before every push)', () => {
  it('does nothing with a clean tree', async () => {
    const git = fakeGit(() => 0)
    expect(await commitAndPush(git.run, 'chore(mind): sync')).toBe('clean')
    expect(git.commands()).toEqual(['add -A', 'diff --cached --quiet'])
  })

  it('adds, commits, pulls with rebase and then pushes, in that order', async () => {
    const git = fakeGit(dirty)
    expect(await commitAndPush(git.run, 'chore(mind): sync')).toBe('pushed')
    expect(git.commands()).toEqual(['add -A', 'diff --cached --quiet', 'commit -q -m chore(mind): sync', 'pull --rebase', 'push'])
  })

  it('pulls again before each retry of a failed push, and commits only once', async () => {
    const git = fakeGit((args, n) => (args[0] === 'diff' ? 1 : args[0] === 'push' && n < 3 ? 1 : 0))
    expect(await commitAndPush(git.run, 'm')).toBe('pushed')
    const c = git.commands()
    expect(c.filter((x) => x.startsWith('commit'))).toHaveLength(1)
    expect(c.filter((x) => x === 'pull --rebase')).toHaveLength(3)
    expect(c.filter((x) => x === 'push')).toHaveLength(3)
    // Every push is right after a pull.
    c.forEach((x, i) => {
      if (x === 'push') expect(c[i - 1]).toBe('pull --rebase')
    })
  })

  it('gives up after 3 failed pushes, leaving the commit for the next time', async () => {
    const git = fakeGit((args) => (args[0] === 'diff' ? 1 : args[0] === 'push' ? 1 : 0))
    expect(await commitAndPush(git.run, 'm')).toBe('push-failed')
    expect(git.commands().filter((x) => x === 'push')).toHaveLength(3)
  })

  it('backs out of a rebase that fails and counts it as a failed try', async () => {
    const git = fakeGit((args) => (args[0] === 'diff' ? 1 : args[0] === 'pull' ? 1 : 0))
    expect(await commitAndPush(git.run, 'm')).toBe('push-failed')
    const c = git.commands()
    expect(c.filter((x) => x === 'rebase --abort')).toHaveLength(3)
    expect(c).not.toContain('push')
  })

  it('pushes an earlier commit that did not go out even when the tree is clean now', async () => {
    const git = fakeGit(() => 0)
    expect(await commitAndPush(git.run, 'm', { retryPush: true })).toBe('pushed')
    expect(git.commands()).toEqual(['add -A', 'diff --cached --quiet', 'pull --rebase', 'push'])
  })
})
