import type { TemperamentPools, TemperamentRoll } from '@forkling/schema'
import { createPrng, type Prng } from './prng.ts'

function shuffle<T>(items: readonly T[], rng: Prng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * Roll a forkling's likes, dislikes and quirks from its seed, once. Deterministic, so a forkling can always be told
 * from its seed and a pack's pools, and what it likes is never also what it dislikes.
 */
export function rollTemperament(seed: number, pools: TemperamentPools): TemperamentRoll {
  const rng = createPrng((Math.imul(seed >>> 0, 2654435761) + 1013904223) >>> 0)

  const pairs = Object.keys(pools.traits)
    .sort()
    .flatMap((category) => pools.traits[category]!.map((value) => ({ category, value })))
  const shuffled = shuffle(pairs, rng)
  const likes = shuffled.slice(0, pools.likes)
  const dislikes = shuffled.slice(likes.length, likes.length + pools.dislikes)

  const [fewest, most] = pools.quirkCount
  const count = Math.min(pools.quirks.length, fewest + rng.int(Math.max(0, most - fewest) + 1))
  const quirks = shuffle(pools.quirks, rng)
    .slice(0, count)
    .map((q) => ({ id: q.id, text: q.text }))

  return { likes, dislikes, quirks }
}

/** What a forkling's quirks do to each verb's appeal, multiplied together. Quirks the pools no longer have are ignored. */
export function quirkWeights(roll: TemperamentRoll, pools: Pick<TemperamentPools, 'quirks'>): Record<string, number> {
  const weights: Record<string, number> = {}
  for (const { id } of roll.quirks) {
    const quirk = pools.quirks.find((q) => q.id === id)
    if (!quirk) continue
    for (const [verb, weight] of Object.entries(quirk.weights)) weights[verb] = (weights[verb] ?? 1) * weight
  }
  return weights
}
