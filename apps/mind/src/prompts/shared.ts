import type { Belief, Interests } from '@forkling/schema'

export type ThinkKind = 'morning' | 'weekly' | 'decide'

export const json = (value: unknown) => JSON.stringify(value)

/** What it is into right now: its strongest topics and any obsession, as lines for a prompt. */
export function describeInterests(interests: Interests): string[] {
  const top = Object.entries(interests.topics)
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 8)
    .map(([topic, t]) => `${topic} (${t.weight})`)
  return [
    ...(top.length > 0 ? [`strongest interests: ${top.join(', ')}`] : ['You are not especially into anything yet.']),
    ...(interests.current ? [`You are obsessed with "${interests.current.topic}" (since ${interests.current.startedAt.slice(0, 10)}). It keeps pulling at you.`] : []),
  ]
}

export const describeBelief = (b: Belief) => `${b.id} (${b.confidence}): ${b.statement}${b.status === 'revised' ? ' [you changed your mind about this once]' : ''}`
