import { maxSimilarity } from './novelty.ts'

/** What the nudge needs of a work. */
export interface WorkLike {
  id: string
  title: string
  about: string
  kind: string
  made: string
  status: string
}

/** A work's title or about this much like one of the last 10 would trip the nudge (spec 12.3). */
export const WORK_SIMILARITY = 0.5
export const WORK_LOOKBACK = 10

export interface WorkNudge {
  id: string
  why: string
}

const kept = (works: readonly WorkLike[]) => works.filter((w) => w.status !== 'scrap').sort((a, b) => a.made.localeCompare(b.made))

/**
 * The repeated-work nudge (spec 12.3): a title or an about over 0.5 like one of the last 10 works, or the same kind as each of
 * the previous 2. Only works made since `sinceMs` are reported, but each is compared with the ones before it, and a scrap
 * neither fires nor counts as an earlier work. It is measured and logged, never enforced: nothing here rejects a work.
 */
export function workNudges(works: readonly WorkLike[], opts: { sinceMs: number }): WorkNudge[] {
  const list = kept(works)
  const out: WorkNudge[] = []
  list.forEach((work, i) => {
    if (Date.parse(work.made) < opts.sinceMs) return
    const earlier = list.slice(Math.max(0, i - WORK_LOOKBACK), i)
    if (earlier.length > 0 && maxSimilarity(work.title, earlier.map((w) => w.title)) > WORK_SIMILARITY) out.push({ id: work.id, why: 'its title is like an earlier one' })
    if (earlier.length > 0 && maxSimilarity(work.about, earlier.map((w) => w.about)) > WORK_SIMILARITY) out.push({ id: work.id, why: 'its about is like an earlier one' })
    if (i >= 2 && list[i - 1]!.kind === work.kind && list[i - 2]!.kind === work.kind) out.push({ id: work.id, why: 'it is the same kind as each of the previous two' })
  })
  return out
}

/** The work numbers of the week in `mind/health.json` (spec 12.6): works made, how many tripped a nudge, and works per kind. */
export function workNovelty(works: readonly WorkLike[], opts: { sinceMs: number }): { made: number; wouldFire: number; byKind: Record<string, number> } {
  const recent = kept(works).filter((w) => Date.parse(w.made) >= opts.sinceMs)
  const byKind: Record<string, number> = {}
  for (const w of recent) byKind[w.kind] = (byKind[w.kind] ?? 0) + 1
  return { made: recent.length, wouldFire: new Set(workNudges(works, opts).map((n) => n.id)).size, byKind }
}
