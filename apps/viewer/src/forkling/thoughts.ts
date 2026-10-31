import type { Goals, Intention } from '@forkling/schema'

export type BubbleLine = { kind: 'goal' | 'step' | 'reason' | 'sleep'; text: string }

/**
 * What the thought bubble says: the long goal, the step it is on and why, in the forkling's own words. Null when it has
 * no goals yet, because a bubble with nothing but a pack reason would look like chatter. Asleep, it only dreams.
 */
export function bubbleLines(goals: Goals, intention: Pick<Intention, 'reason'>, asleep: boolean, nowMs: number): BubbleLine[] | null {
  if (asleep) return [{ kind: 'sleep', text: 'zzz' }]
  if (!goals.long && !goals.now) return null

  const lines: BubbleLine[] = []
  if (goals.long) lines.push({ kind: 'goal', text: goals.long.text })

  // A step whose time is up is stale; the body has moved on even if the mind hasn't written the next one yet.
  const step = goals.now && nowMs < Date.parse(goals.now.until) ? goals.today?.steps[goals.now.index] : undefined
  if (step) {
    const where = step.targetId ? ` at ${step.targetId}` : step.position ? ` somewhere near ${step.position[0]}, ${step.position[1]}` : ''
    lines.push({ kind: 'step', text: `${step.verb}${where}: ${step.reason}` })
  }

  lines.push({ kind: 'reason', text: intention.reason })
  return lines
}
