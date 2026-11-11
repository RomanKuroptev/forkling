import { createPrng } from '@forkling/sim'
import type { Tier } from './allowlist.ts'
import { WebError } from './fetch.ts'
import type { Item, ItemImage } from './item.ts'
import { chosenLink, type ReadAnswer } from './read.ts'
import type { RobotsResult } from './robots.ts'
import { readable } from './skip.ts'

/** The pass marks of spec 6.5. A record source has its own: a museum object has no 300 words and no links. */
export const PASS_MARKS = {
  page: { reliable: 0.95, readable: 0.8, links: 8, gives: 0.25, interest: 5 },
  record: { reliable: 0.95, readable: 0.8, links: 4, gives: 0.25, interest: 5 },
} as const

/** One item of a trial: what was fetched, what the read call made of it, and what the code did with its souvenir. */
export interface TrialRead {
  item: Item | null
  fetchOk: boolean
  error?: string
  /** Why code skipped it before any model call (spec 6.6). */
  skipped?: string
  answer: ReadAnswer | null
  /** `kept`, `none` or `dropped: <reason>`. */
  souvenir: string
  kept?: { kind: 'quote' | 'fact'; content: string; why: string }
  keptImage?: ItemImage
}

export interface Check {
  name: string
  value: string
  mark: string
  /** True or false for a number against its mark; null for what only Roman can judge. */
  pass: boolean | null
}

export interface TrialReport {
  host: string
  kind: 'page' | 'record' | 'image'
  tier: Tier
  seeds: number
  checks: Check[]
  verdict: 'pass' | 'fail'
}

export interface TrialInput {
  host: string
  kind: 'page' | 'record' | 'image'
  tier: Tier
  seeds: number
  reads: readonly TrialRead[]
  robots: RobotsResult
}

const pct = (n: number, of: number) => (of === 0 ? 0 : n / of)
const show = (n: number, of: number) => `${Math.round(pct(n, of) * 100)}% (${n} of ${of})`
const mean = (xs: readonly number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length)

/** Scores a trial against the marks of spec 6.5. The verdict ignores what only Roman can judge (terms, robots, tier). */
export function evaluateTrial(input: TrialInput): TrialReport {
  const marks = PASS_MARKS[input.kind === 'record' ? 'record' : 'page']
  const reads = input.reads
  const fetched = reads.filter((r) => r.item)
  const answered = reads.filter((r) => r.answer)
  const empty = reads.length === 0

  const reliable = reads.filter((r) => r.fetchOk).length
  const readableN = fetched.filter((r) => readable(r.item!)).length
  const links = mean(fetched.map((r) => r.item!.links.length))
  const gave = answered.filter((r) => r.souvenir.startsWith('kept')).length
  const interest = mean(answered.map((r) => r.answer!.interest))
  const images = reads.flatMap((r) => (r.keptImage ? [r.keptImage] : []))
  const licensed = images.filter((i) => i.licence !== null).length

  const robotsPass = input.robots.status === 'allowed' || input.robots.status === 'missing' ? true : null
  const checks: Check[] = [
    { name: 'Allowed to read', value: `${input.robots.detail}. Terms: Roman reads them`, mark: 'robots.txt allows the paths, terms allow reading or a public API, no login or paywall', pass: robotsPass },
    { name: 'Reliable', value: show(reliable, reads.length), mark: `${marks.reliable * 100}% or more`, pass: !empty && pct(reliable, reads.length) >= marks.reliable },
    {
      name: 'Readable',
      value: show(readableN, fetched.length),
      mark: input.kind === 'record' ? `${marks.readable * 100}% have an image or 40 words` : `${marks.readable * 100}% have ${input.tier === 'voices' ? 120 : 300} words or more`,
      pass: fetched.length > 0 && pct(readableN, fetched.length) >= marks.readable,
    },
    { name: 'Leads somewhere', value: `${links.toFixed(1)} links on average`, mark: `${marks.links} or more`, pass: fetched.length > 0 && links >= marks.links },
    { name: 'Gives something', value: show(gave, answered.length), mark: `${marks.gives * 100}% or more keep a souvenir`, pass: answered.length > 0 && pct(gave, answered.length) >= marks.gives },
    { name: 'Not boring', value: `${interest.toFixed(1)} out of 10 on average`, mark: `${marks.interest} or more`, pass: answered.length > 0 && interest >= marks.interest },
    {
      name: 'Licences',
      value: images.length === 0 ? 'no image souvenirs kept' : show(licensed, images.length),
      mark: '100% of images kept have a licence the code can read and allows',
      pass: licensed === images.length,
    },
    { name: 'Tier', value: input.tier, mark: 'Roman assigns reference or voices (6.7)', pass: null },
  ]
  return { host: input.host, kind: input.kind, tier: input.tier, seeds: input.seeds, checks, verdict: checks.every((c) => c.pass !== false) && !empty ? 'pass' : 'fail' }
}

/** `n` of `xs` picked by the seed, in a seeded order, so the same report always shows the same ones. */
function pick<T>(xs: readonly T[], n: number, seed: number): T[] {
  const rng = createPrng(seed)
  const copy = [...xs]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy.slice(0, n)
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

/** The report Roman reads: the checks, then 10 souvenirs and 10 reactions at random, so he judges the content and not just the numbers. */
export function formatTrial(report: TrialReport, reads: readonly TrialRead[], seed: number): string {
  const souvenirs = reads.filter((r) => r.kept && r.item)
  const reactions = reads.filter((r) => r.answer && r.item)
  return [
    `# Source trial: ${report.host}`,
    '',
    `Kind: ${report.kind}. Tier: ${report.tier}. ${reads.length} items from ${report.seeds} seeds. **Verdict on the numbers: ${report.verdict}.** What only Roman can judge is marked "you".`,
    '',
    '| Check | Result | Mark | Pass |',
    '|---|---|---|---|',
    ...report.checks.map((c) => `| ${c.name} | ${oneLine(c.value)} | ${c.mark} | ${c.pass === null ? 'you' : c.pass ? 'yes' : 'NO'} |`),
    '',
    `## 10 souvenirs, picked at random (${souvenirs.length} kept in all)`,
    '',
    ...pick(souvenirs, 10, seed).map((r) => `- souvenir: "${oneLine(r.kept!.content)}" (${r.kept!.kind}, from ${r.item!.title}, ${r.item!.url})`),
    '',
    `## 10 reactions, picked at random (${reactions.length} in all)`,
    '',
    ...pick(reactions, 10, seed + 1).map((r) => `- reaction: ${r.item!.title}: ${oneLine(r.answer!.reaction)} (interest ${r.answer!.interest})`),
    '',
    '## Failures and skips',
    '',
    ...(reads.filter((r) => r.error || r.skipped).map((r) => `- ${r.item?.url ?? 'a seed'}: ${r.error ?? r.skipped}`) || []),
    '',
  ].join('\n')
}

export interface RunTrialDeps {
  host: string
  /** Items to read in all, and seeds to start chains from. */
  items: number
  seeds: number
  /** Seed number to a starting item: random or featured, never a topic picked by code. */
  start(seed: number): Promise<Item>
  /** A link to an item, through the same adapters a trip uses. */
  open(url: string): Promise<Item>
  /** One read call and the code's judgement of its souvenir. Null `answer` means no usable answer. */
  read(item: Item): Promise<{ answer: ReadAnswer | null; souvenir?: string; kept?: TrialRead['kept']; keptImage?: ItemImage; skipped?: string }>
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

const failure = (error: unknown): TrialRead => ({ item: null, fetchOk: false, error: error instanceof WebError ? `${error.code}: ${error.message}` : (error as Error).message, answer: null, souvenir: 'none' })

/**
 * The trial's items: each seed starts a chain, and the chain follows a link on the same host (the one the read call chose
 * if it is new, else the first unread one) until it is long enough. A failed fetch ends its chain and counts against the
 * host. Stops at `items`, or after twice as many tries.
 */
export async function runTrial(deps: RunTrialDeps): Promise<TrialRead[]> {
  const out: TrialRead[] = []
  const seen = new Set<string>()
  const perChain = Math.ceil(deps.items / deps.seeds)
  const maxTries = deps.items * 2
  let tries = 0

  const take = async (get: () => Promise<Item>): Promise<{ item: Item; result: Awaited<ReturnType<RunTrialDeps['read']>> } | null> => {
    tries++
    let item: Item
    try {
      item = await get()
    } catch (error) {
      out.push(failure(error))
      return null
    }
    seen.add(item.url)
    const result = await deps.read(item)
    out.push({ item, fetchOk: true, answer: result.answer, souvenir: result.souvenir ?? 'none', ...(result.kept ? { kept: result.kept } : {}), ...(result.keptImage ? { keptImage: result.keptImage } : {}), ...(result.skipped ? { skipped: result.skipped } : {}) })
    return { item, result }
  }

  for (let seed = 0; out.length < deps.items && tries < maxTries; seed++) {
    let step = await take(() => deps.start(seed))
    for (let n = 1; step && n < perChain && out.length < deps.items && tries < maxTries; n++) {
      const sameHost = step.item.links.filter((l) => hostOf(l.url) === deps.host && !seen.has(l.url))
      const chosen = step.result.answer ? chosenLink(step.result.answer, step.item) : null
      const next = chosen && sameHost.some((l) => l.url === chosen.url) ? chosen : sameHost[0]
      if (!next) break
      step = await take(() => deps.open(next.url))
    }
  }
  return out
}
