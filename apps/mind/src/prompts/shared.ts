import type { Belief, Interests } from '@forkling/schema'
import { interestFamilies } from '@forkling/sim'

export type ThinkKind = 'morning' | 'decide'

export const json = (value: unknown) => JSON.stringify(value)

/** Text inside a `<data>` block cannot close it early. */
export const defang = (text: string) => text.replaceAll('</data', '<\\/data')

/** What it is into right now: its strongest topics and any obsession, as lines for a prompt. */
export function describeInterests(interests: Interests): string[] {
  const top = Object.entries(interests.topics)
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 10)
    .map(([topic, t]) => `${topic} (${Math.round(t.weight)})`)
  return [
    ...(top.length > 0 ? [`strongest interests: ${top.join(', ')}`] : ['You are not especially into anything yet.']),
    ...(interests.current ? [`You are obsessed with "${interests.current.topic}" (since ${interests.current.startedAt.slice(0, 10)}). It keeps pulling at you.`] : []),
  ]
}

/** The planner's view: the strongest 10 families (topics that count together, spec v4 2.1), each with up to 4 other members. */
export function describeInterestFamilies(interests: Interests): string[] {
  const top = interestFamilies(interests)
    .slice(0, 10)
    .map((f) => {
      const others = f.members.filter((m) => m !== f.name).slice(0, 4)
      return `${f.name} (${Math.round(f.weight)}${others.length > 0 ? `; also ${others.join(', ')}` : ''})`
    })
  return [
    ...(top.length > 0 ? [`strongest interests: ${top.join(', ')}`] : ['You are not especially into anything yet.']),
    ...(interests.current ? [`You are obsessed with "${interests.current.topic}" (since ${interests.current.startedAt.slice(0, 10)}). It keeps pulling at you.`] : []),
  ]
}

export const describeBelief = (b: Belief) => `${b.id} (${b.confidence}): ${b.statement}${b.status === 'revised' ? ' [you changed your mind about this once]' : ''}`
