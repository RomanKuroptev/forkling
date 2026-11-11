import type { Fetcher } from './fetch.ts'
import { WebError } from './fetch.ts'

/** The name robots.txt rules are matched against: the product token of the User-Agent. */
const AGENT = 'forkling'

interface Rule {
  allow: boolean
  pattern: string
}

/** A rule's pattern as a test: `*` matches anything, a trailing `$` ends the path, the rest is a prefix. */
function matches(pattern: string, path: string): boolean {
  if (pattern === '') return false
  const end = pattern.endsWith('$')
  const body = end ? pattern.slice(0, -1) : pattern
  const re = new RegExp(`^${body.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}${end ? '$' : ''}`)
  return re.test(path)
}

/** The rules of the group that names this project, or else the general `*` group. */
function rulesFor(robots: string): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = []
  let last: 'agent' | 'rule' | null = null
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line)
    if (!m) continue
    const key = m[1]!.toLowerCase()
    const value = m[2]!.trim()
    if (key === 'user-agent') {
      if (last === 'agent') groups.at(-1)!.agents.push(value.toLowerCase())
      else groups.push({ agents: [value.toLowerCase()], rules: [] })
      last = 'agent'
    } else if ((key === 'allow' || key === 'disallow') && groups.length > 0) {
      groups.at(-1)!.rules.push({ allow: key === 'allow', pattern: value })
      last = 'rule'
    }
  }
  const named = groups.filter((g) => g.agents.some((a) => a !== '*' && AGENT.includes(a)))
  const chosen = named.length > 0 ? named : groups.filter((g) => g.agents.includes('*'))
  return chosen.flatMap((g) => g.rules)
}

/** Whether robots.txt lets this project fetch the path: the longest matching rule wins, and Allow wins a tie. */
export function robotsAllows(robots: string, path: string): boolean {
  let best: Rule | null = null
  for (const rule of rulesFor(robots)) {
    if (!matches(rule.pattern, path)) continue
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule
  }
  return best ? best.allow : true
}

export interface RobotsResult {
  /** `missing`: the host has no robots.txt, so it sets no rules. `unreachable`: it could not be read, so nobody knows. */
  status: 'allowed' | 'disallowed' | 'missing' | 'unreachable'
  detail: string
}

/**
 * Whether a trial may go on and read the host. A host whose robots.txt disallows the engine's paths, or whose robots.txt
 * could not be read, is not read at all. Only Roman overrides that (for an API a site documents for bots).
 */
export function mayReadHost(robots: RobotsResult, override = false): boolean {
  return override || robots.status === 'allowed' || robots.status === 'missing'
}

/** Reads a host's robots.txt (through the same fetcher as everything else) and checks the paths the engine uses. */
export async function checkRobots(f: Pick<Fetcher, 'text'>, host: string, paths: readonly string[]): Promise<RobotsResult> {
  let txt: string
  try {
    txt = await f.text(`https://${host}/robots.txt`)
  } catch (error) {
    if (error instanceof WebError && error.code === 'http' && error.status === 404) return { status: 'missing', detail: `${host} has no robots.txt` }
    return { status: 'unreachable', detail: `robots.txt could not be read: ${(error as Error).message}` }
  }
  const blocked = paths.filter((p) => !robotsAllows(txt, p))
  return blocked.length > 0
    ? { status: 'disallowed', detail: `robots.txt disallows ${blocked.join(', ')}` }
    : { status: 'allowed', detail: `robots.txt allows ${paths.join(', ')}` }
}
