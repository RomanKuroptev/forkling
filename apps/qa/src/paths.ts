import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The repo root: the folder with pnpm-workspace.yaml above this file (works on Windows and Linux).
export function repoRoot(from = dirname(fileURLToPath(import.meta.url))): string {
  let dir = resolve(from)
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const up = dirname(dir)
    if (up === dir) throw new Error(`no pnpm-workspace.yaml above ${from}`)
    dir = up
  }
  return dir
}

// Every run writes to qa-out/ at the repo root (gitignored).
export const qaOut = (...parts: string[]): string => join(repoRoot(), 'qa-out', ...parts)
