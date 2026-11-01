import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

// Directories that only exist inside a forkling's world repo, not in this one.
const worldDirs = new Set(['brain', 'memory', 'mind', 'objects', 'art', 'notebook', 'journal', 'events', 'site'])

/** Repo paths named in inline code, e.g. `packages/sim/src/prng.ts` or `docs/plans/`. */
export function pathsIn(markdown: string, knownTop: Set<string>): string[] {
  const found = new Set<string>()
  for (const [, code] of markdown.matchAll(/`([^`\s]+)`/g)) {
    if (!code.includes('/') || /[<>*?:=@{}]|^\/|YYYY|github\.com/.test(code)) continue
    const [first, ...rest] = code.split('/')
    if (worldDirs.has(first)) continue
    const last = rest[rest.length - 1] ?? ''
    const looksLikePath = knownTop.has(first) || code.endsWith('/') || /\.[a-z]{2,5}$/.test(last)
    if (looksLikePath) found.add(code)
  }
  return [...found]
}

const docs = [
  ...execFileSync('git', ['ls-files', '*CLAUDE.md'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean),
  'docs/architecture.md',
].filter((file) => !file.startsWith('templates/')) // the template CLAUDE.md describes a world repo

describe('docs name real paths', () => {
  it('finds the docs to check', () => {
    expect(docs).toContain('CLAUDE.md')
    expect(docs).toContain('docs/architecture.md')
  })

  it('extracts repo paths and skips the rest', () => {
    const top = new Set(['packages', 'docs'])
    const md = 'See `packages/sim/src/prng.ts`, `docs/plans/`, `objects/<id>.json`, `brain/budget.json`, `Europe/Stockholm`, `/<owner>/<repo>`, `github.com/a/b`, `anthropics/claude-code-action`.'
    expect(pathsIn(md, top)).toEqual(['packages/sim/src/prng.ts', 'docs/plans/'])
  })

  it.each(docs)('%s', (file) => {
    const top = new Set([...readdirSync(root), ...readdirSync(join(root, dirname(file)))])
    const missing = pathsIn(readFileSync(join(root, file), 'utf8'), top).filter(
      (path) => !existsSync(join(root, path)) && !existsSync(join(root, dirname(file), path)),
    )
    expect(missing).toEqual([])
  })
})
