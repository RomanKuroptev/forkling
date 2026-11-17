/**
 * Interest families (spec v4 2.1): topics that count together. Computed, never stored. Two topics are linked when their names are
 * the same subject, or when both have a history entry from the same trip (the same non-null `trail` id). A family is a linked group.
 * Used only for the planner's interest list, the lower price of an expand when a place has "earned" it (a price only, never a gate), and the tags of a new place. Pure.
 */
import type { Interests } from '@forkling/schema'
import { sameSubject } from './topic-cluster.ts'

/** A family's weight is the sum of its members' weights, capped here. */
export const FAMILY_MAX_WEIGHT = 100

export interface InterestFamily {
  /** The heaviest member (first by name on a tie). */
  name: string
  weight: number
  /** All members, heaviest first (the name is the first). */
  members: string[]
}

export function interestFamilies(interests: Pick<Interests, 'topics'>): InterestFamily[] {
  const names = Object.keys(interests.topics).sort()
  const parent = names.map((_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)))
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b)
  }
  const trailOwner = new Map<string, number>()
  names.forEach((name, i) => {
    for (const h of interests.topics[name]!.history) {
      if (h.trail === null) continue
      const owner = trailOwner.get(h.trail)
      if (owner === undefined) trailOwner.set(h.trail, i)
      else union(owner, i)
    }
  })
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (sameSubject(names[i]!, names[j]!)) union(i, j)
  const groups = new Map<number, string[]>()
  names.forEach((name, i) => {
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), name])
  })
  const w = (n: string) => interests.topics[n]!.weight
  return [...groups.values()]
    .map((members) => {
      const sorted = [...members].sort((a, b) => w(b) - w(a) || a.localeCompare(b))
      return { name: sorted[0]!, weight: Math.min(FAMILY_MAX_WEIGHT, members.reduce((s, n) => s + w(n), 0)), members: sorted }
    })
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
}
