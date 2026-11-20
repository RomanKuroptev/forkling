import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { Score } from './score.ts'
import { snapshotOfRun } from './sources.ts'

/**
 * Puts behaviour runs side by side (QB.8) and says, for each alarm, where it most likely comes from (audit spec 9.4):
 * - the fake web: it shows only on runs that read the web snapshot;
 * - the real web: it shows only on runs that read the real web (R2, the live world);
 * - Merge's choices (or the engine's prompts): it shows on both kinds.
 * One run's alarm is one seed in it raising it. Reads `scores.json` that `pnpm qa score` and `pnpm qa behaviour` write.
 */

export type Web = 'snapshot' | 'real'
export interface ComparedRun {
  name: string
  web: Web
  dir: string
}

interface ScoredRun {
  label: string
  scores: Score[]
}

export const readScores = (dir: string): ScoredRun[] => {
  const path = join(dir, 'scores.json')
  if (!existsSync(path)) throw new Error(`${dir} has no scores.json: run pnpm qa score or pnpm qa behaviour first`)
  return JSON.parse(readFileSync(path, 'utf8')) as ScoredRun[]
}

/**
 * The web a run folder read, from each seed's `seed-<n>/out/web.json` (the runner writes it): the web snapshot when every seed
 * names one, the real web when none does (and for a folder with no seeds, such as a live score). A run whose seeds read
 * different webs cannot be put on one side, so it is an error.
 */
export function webOfRun(dir: string): Web {
  const seeds = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && /^seed-\d+$/.test(d.name)) : []
  const webs = new Set(seeds.map((d): Web => (snapshotOfRun(join(dir, d.name, 'out')) ? 'snapshot' : 'real')))
  if (webs.size > 1) throw new Error(`${dir}: its seeds read mixed webs (some the snapshot, some the real web)`)
  return webs.has('snapshot') ? 'snapshot' : 'real'
}

export function cause(alarmIn: { web: Web; alarm: boolean }[]): string {
  const snap = alarmIn.filter((r) => r.web === 'snapshot')
  const real = alarmIn.filter((r) => r.web === 'real')
  const onSnap = snap.some((r) => r.alarm)
  const onReal = real.some((r) => r.alarm)
  if (!onSnap && !onReal) return ''
  if (onSnap && onReal) return "Merge's choices (or the engine's prompts)"
  if (onSnap) return real.length ? 'the fake web (only on the snapshot)' : 'unknown (no real-web run to compare)'
  return snap.length ? 'the real web (not on the snapshot)' : 'unknown (no snapshot run to compare)'
}

export function compare(runs: ComparedRun[]): string {
  const data = runs.map((r) => ({ ...r, seeds: readScores(r.dir) }))
  const ids: { id: string; title: string }[] = []
  for (const d of data) for (const s of d.seeds) for (const x of s.scores) if (!ids.some((i) => i.id === x.id)) ids.push({ id: x.id, title: x.title })
  const lines = ['# Behaviour, side by side', '', `Runs: ${data.map((d) => `**${d.name}** (${d.web === 'snapshot' ? 'web snapshot' : 'real web'}, ${d.seeds.length} seed${d.seeds.length === 1 ? '' : 's'})`).join(', ')}.`, '', `| Score | ${data.map((d) => d.name).join(' | ')} | Likely cause |`, `|---|${data.map(() => '---').join('|')}|---|`]
  for (const { id, title } of ids) {
    const cells = data.map((d) => {
      const mine = d.seeds.flatMap((s) => s.scores.filter((x) => x.id === id))
      const alarms = mine.filter((x) => x.alarm).length
      const value = mine.map((x) => x.value).join(' / ').replace(/\|/g, '/')
      return { web: d.web, alarm: alarms > 0, text: mine.length === 0 ? 'not measured' : `${alarms ? `**alarm${d.seeds.length > 1 ? ` ${alarms} of ${mine.length}` : ''}**: ` : ''}${value.length > 160 ? `${value.slice(0, 157)}...` : value}` }
    })
    lines.push(`| ${title} | ${cells.map((c) => c.text).join(' | ')} | ${cause(cells)} |`)
  }
  return `${lines.join('\n')}\n`
}

export function writeComparison(out: string, runs: ComparedRun[]): string {
  const text = compare(runs)
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'compare.md'), text)
  return text
}

export const COMPARE_USAGE = `  compare <name>=<dir> <name>=<dir> ...   behaviour runs side by side, with the likely cause of each alarm (fake web, real
          web, or Merge's choices); <dir> is a qa-out/behaviour/<label> folder, and which web it read comes from its
          seed-*/out/web.json. --snapshot <name>=<dir> or --real <name>=<dir> overrides that. Writes qa-out/behaviour/compare.md`

export function compareCommand(args: string[], o: { cwd: string; out: string }): number {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { snapshot: { type: 'string', multiple: true }, real: { type: 'string', multiple: true } } })
  const parse = (web: Web | null) => (spec: string): ComparedRun => {
    const at = spec.indexOf('=')
    if (at < 1) throw new Error(`${web ? `--${web} takes ` : 'a run is '}<name>=<dir>, not ${spec}`)
    const dir = resolve(o.cwd, spec.slice(at + 1))
    return { name: spec.slice(0, at), web: web ?? webOfRun(dir), dir }
  }
  const runs = [...positionals.map(parse(null)), ...(values.snapshot ?? []).map(parse('snapshot')), ...(values.real ?? []).map(parse('real'))]
  if (runs.length < 2) {
    console.log(COMPARE_USAGE)
    return 2
  }
  console.log(writeComparison(o.out, runs))
  return 0
}
