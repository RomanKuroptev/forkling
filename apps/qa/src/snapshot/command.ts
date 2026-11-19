import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { repoRoot } from '../paths.ts'
import { readSourceList } from '../sources/list.ts'
import { snapshotDir } from '../sources/snapshot.ts'
import { recordWebSnapshot } from './record.ts'

export const WEB_SNAPSHOT_USAGE = `  web-snapshot [--dir <dir>]   record the allowed web into qa/web-snapshot (real GETs, allowlist only, robots.txt obeyed,
                               the normal request gaps; no model calls). A real run reads it with fast-forward --web-snapshot`

export async function webSnapshotCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({ args, options: { dir: { type: 'string' } } })
  const dir = values.dir ? resolve(process.env.INIT_CWD ?? process.cwd(), values.dir) : snapshotDir()
  mkdirSync(dir, { recursive: true })
  let engine = 'unknown'
  try {
    engine = execFileSync('git', ['-C', repoRoot(), 'rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    // Not a checkout: the manifest says unknown.
  }
  const manifest = await recordWebSnapshot({ dir, list: readSourceList(), engine, log: (l) => console.log(l) })
  console.log(`web snapshot in ${dir}: ${manifest.entries.length} entries`)
  return 0
}
