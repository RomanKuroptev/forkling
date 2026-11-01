import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { Forkling, Goals, TemperamentRoll, WorldObject } from '@forkling/schema'
import { quirkWeights } from '@forkling/sim'
import { formatReplay, replay, type ReplayState } from './replay.ts'
import { loadSpecies } from './species.ts'

const USAGE = `usage: pnpm --filter @forkling/mind replay --world <clone of a world repo> [--from <ISO time>] [--to <ISO time>] [--every <minutes>] [--json]

Rebuilds the canonical body from the world repo's own history, as a viewer loading each commit of forkling.json would have
seen it, and prints it beside the plan step in progress: what the body did, what the files said, how often they agreed,
and how long each need was under 15. Default window: the last 6 hours, every 10 minutes. Needs a full clone (git log).`

const git = (dir: string, args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

/** A file as of a commit, or null when it was not there. */
function show(dir: string, sha: string, path: string): string | null {
  try {
    return git(dir, ['show', `${sha}:${path}`])
  } catch {
    return null
  }
}

function main(): void {
  const { values } = parseArgs({
    options: { world: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, every: { type: 'string' }, json: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h', default: false } },
  })
  if (values.help || !values.world) {
    console.log(USAGE)
    return
  }
  const dir = resolve(process.env.INIT_CWD ?? process.cwd(), values.world)
  const toMs = values.to ? Date.parse(values.to) : Date.now()
  const fromMs = values.from ? Date.parse(values.from) : toMs - 6 * 3_600_000
  const every = Number(values.every ?? 10)
  if (Number.isNaN(toMs) || Number.isNaN(fromMs) || fromMs >= toMs) throw new Error('--from and --to must be times, with --from first')
  if (!Number.isInteger(every) || every < 1 || every > 120) throw new Error('--every must be a whole number of minutes from 1 to 120')

  // Every commit of forkling.json up to the end, newest first: the ones in the window and the one before it.
  const log = git(dir, ['log', `--until=${new Date(toMs).toISOString()}`, '--format=%H\t%cI', '--max-count=400', '--', 'forkling.json'])
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [sha, at] = l.split('\t') as [string, string]
      return { sha, atMs: Date.parse(at) }
    })
  const inWindow = log.filter((c) => c.atMs >= fromMs)
  const before = log.find((c) => c.atMs < fromMs)
  const commits = [...(before ? [before] : []), ...inWindow]
  if (commits.length === 0) throw new Error('no commit of forkling.json before the end of that window')

  const objectCache = new Map<string, WorldObject[]>()
  const states: ReplayState[] = []
  let species: ReturnType<typeof loadSpecies> | null = null
  for (const c of commits) {
    const raw = show(dir, c.sha, 'forkling.json')
    const parsed = raw ? Forkling.safeParse(JSON.parse(raw)) : null
    if (!parsed?.success) {
      console.log(`note: skipped ${c.sha.slice(0, 7)}, its forkling.json does not fit this engine's schema`)
      continue
    }
    species ??= loadSpecies(parsed.data.species)
    const goalsRaw = show(dir, c.sha, 'mind/goals.json')
    const treeId = (() => {
      try {
        return git(dir, ['rev-parse', `${c.sha}:objects`]).trim()
      } catch {
        return ''
      }
    })()
    let objects = objectCache.get(treeId)
    if (!objects) {
      objects = treeId
        ? git(dir, ['ls-tree', '-r', '--name-only', c.sha, 'objects'])
            .split('\n')
            .filter((p) => p.endsWith('.json'))
            .flatMap((p) => {
              const text = show(dir, c.sha, p)
              const o = text ? WorldObject.safeParse(JSON.parse(text)) : null
              return o?.success ? [o.data] : []
            })
        : []
      objectCache.set(treeId, objects)
    }
    const tempRaw = show(dir, c.sha, 'brain/temperament.json')
    const temperament = tempRaw ? TemperamentRoll.safeParse(JSON.parse(tempRaw)) : null
    states.push({
      atMs: c.atMs,
      forkling: parsed.data,
      goals: Goals.parse(goalsRaw ? JSON.parse(goalsRaw) : {}),
      objects,
      ...(temperament?.success ? { quirkWeights: quirkWeights(temperament.data, species.pools) } : {}),
    })
  }
  if (!species) throw new Error('no commit could be read')

  const result = replay(states, { pack: species.pack, behaviors: species.behaviors, fromMs, toMs, everyMinutes: every })
  console.log(values.json ? JSON.stringify(result) : formatReplay(result))
}

try {
  main()
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}
