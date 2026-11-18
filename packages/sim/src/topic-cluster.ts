/**
 * Pages that are about the same thing, even when no two of them share a name or a sentence. Merge spent five days on one subject
 * under about eight titles ("airborne lidar", "digital elevation model", "leaf area index"...), and the repeated-writing measure
 * (3-gram overlap, over 0.35) never saw it: the most alike two of those pages were 0.084. They share a subject, not wording. So a
 * page is described by the content words it keeps coming back to, and two pages that share enough of them are one cluster. The
 * repeated-writing measure still links near-copies. Pure.
 */
import { foldTopic, foldWord } from './interests.ts'
import { similarity, words } from './novelty.ts'
import { WRITING_SIMILARITY } from './text-nudge.ts'

export interface WrittenPage {
  at: string
  title: string
  text: string
  /** What the write step was aimed at, when it is known. */
  target?: string | null
  /** The reason the write step gave, when it is known (only the replay needs it). */
  reason?: string | null
}

export interface WriteProposal {
  target: string
  reason: string
}

/** Words that carry no subject: function words and the plumbing words of a plan step ("write down what I understood"). Not topics. */
const STOP_WORDS = new Set(
  `about above after again against all also always among and another any are around back because been before being between both but can could did does doing down during each even every few first from further get got had has have having here how into its itself just keep know like made make many might more most much must never next not now off once only other our out over own really said same see seen should since some still such than that the their them then there these they this those through too under until upon very want was were what when where which while who whom why will with within without would write wrote you your today note page read going`.split(/\s+/),
)

/** The words of a text that could name its subject: more than 3 letters, not a stop word, plurals folded, in order. */
export function contentWords(text: string): string[] {
  return words(text)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
    .map(foldWord)
}

/**
 * Tuned on the 25 pages Merge wrote from 11 to 16 November (`pnpm --filter @forkling/mind topic-replay`, and the sweep in the slice 2 PR):
 * with these three numbers its 20 lidar-family pages are one cluster, its 3 sand pages another, and the joke-paper and dust pages stand
 * alone. It is a narrow ground: at 5 shared words the sand pages join the lidar cluster. Check it again with the replay as the notebook grows.
 */
/** Most frequent words a page's profile takes from its text. */
const PROFILE_WORDS = 25
/** A word has to come up this often in a page to be one of the words it keeps coming back to. */
const PROFILE_MIN_COUNT = 1
/** Two pages with this many profile words in common are about the same thing. */
export const CLUSTER_SHARED_WORDS = 6
/** A proposal joins a cluster when it matches this many of its pages (or has the same name as one). */
const JOIN_MATCHES = 2
/** A proposal matches a page by this many shared words between its name and reason and the page's profile. */
const MATCH_WORDS = 2

/** The words a page is about: those in its title and target, and the ones it keeps coming back to. */
export function pageProfile(page: WrittenPage): Set<string> {
  const counts = new Map<string, number>()
  for (const w of contentWords(page.text)) counts.set(w, (counts.get(w) ?? 0) + 1)
  const frequent = [...counts]
    .filter(([, n]) => n >= PROFILE_MIN_COUNT)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, PROFILE_WORDS)
    .map(([w]) => w)
  return new Set([...contentWords(page.title), ...contentWords(page.target ?? ''), ...frequent])
}

const shared = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  let n = 0
  for (const w of a) if (b.has(w)) n++
  return n
}

/** A cluster id for each page, in the order given. Two pages are linked by shared profile words or by being near-copies; clusters are the linked groups. */
export function topicClusters(pages: readonly WrittenPage[]): number[] {
  const profiles = pages.map(pageProfile)
  const parent = pages.map((_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)))
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      if (shared(profiles[i]!, profiles[j]!) >= CLUSTER_SHARED_WORDS || similarity(pages[i]!.text, pages[j]!.text) > WRITING_SIMILARITY) parent[find(i)] = find(j)
    }
  }
  return pages.map((_, i) => find(i))
}

/**
 * The pages from the last `days` that a proposed write is about the same thing as: every page of each cluster the proposal joins.
 * It joins a cluster when its target has the same name as one page's target, or when it matches two of the cluster's pages (a
 * match is two words shared between its target and reason and the page's profile, or a word of its target that is in the page's
 * title or profile). One stray word never pulls in a whole cluster. Pages older than `days` are not counted, but they still
 * link the clusters of the pages that are.
 */
export function writesOnTopic(proposal: WriteProposal, pages: readonly WrittenPage[], opts: { nowMs: number; days: number }): WrittenPage[] {
  const clusters = topicClusters(pages)
  const profiles = pages.map(pageProfile)
  const targetWords = new Set(contentWords(proposal.target))
  const allWords = new Set([...targetWords, ...contentWords(proposal.reason)])
  const wanted = foldTopic(proposal.target)
  const matches = new Map<number, number>()
  const named = new Set<number>()
  pages.forEach((p, i) => {
    const sameName = !!p.target && !!wanted && foldTopic(p.target) === wanted
    const byWords = shared(allWords, profiles[i]!) >= MATCH_WORDS || shared(targetWords, profiles[i]!) >= 1
    if (sameName) named.add(clusters[i]!)
    if (sameName || byWords) matches.set(clusters[i]!, (matches.get(clusters[i]!) ?? 0) + 1)
  })
  const joined = new Set([...named, ...[...matches].filter(([, n]) => n >= JOIN_MATCHES).map(([c]) => c)])
  const since = opts.nowMs - opts.days * 86_400_000
  return pages.filter((p, i) => joined.has(clusters[i]!) && Date.parse(p.at) >= since)
}

/** Whether two targets are the same subject: the same name in another spelling, or two content words in common (one, when a name has only one). */
export function sameSubject(a: string, b: string): boolean {
  if (foldTopic(a) !== '' && foldTopic(a) === foldTopic(b)) return true
  const wa = new Set(contentWords(a))
  const wb = new Set(contentWords(b))
  const need = Math.min(2, wa.size, wb.size)
  return need > 0 && shared(wa, wb) >= need
}

/**
 * How many pages each subject has in the last `days` days, most written first, with the titles (oldest first). It is the same
 * clustering `writesOnTopic` counts with, so the numbers shown to Merge are the ones the `sameTopicWrites` rule compares to its limit. Pure.
 */
export function topicWriteCounts(pages: readonly WrittenPage[], opts: { nowMs: number; days: number }): { count: number; titles: string[] }[] {
  const clusters = topicClusters(pages)
  const since = opts.nowMs - opts.days * 86_400_000
  const byCluster = new Map<number, string[]>()
  pages.forEach((p, i) => {
    if (Date.parse(p.at) < since) return
    byCluster.set(clusters[i]!, [...(byCluster.get(clusters[i]!) ?? []), p.title])
  })
  return [...byCluster.values()].map((titles) => ({ count: titles.length, titles })).sort((a, b) => b.count - a.count)
}

/**
 * The run of latest tinkers (targets, oldest first) that are the same subject as the last one: what `sameWorkTinker` compares to its
 * limit. Null with no tinkers. Pure.
 */
export function sameWorkStreak(tinkers: readonly string[]): { count: number; title: string } | null {
  const last = tinkers.at(-1)
  if (last === undefined) return null
  let count = 1
  for (let i = tinkers.length - 2; i >= 0 && sameSubject(tinkers[i]!, last); i--) count++
  return { count, title: last }
}
