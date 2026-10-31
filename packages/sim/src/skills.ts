import type { Skills, VerbGroup } from '@forkling/schema'

/** Practice that takes a skill from level 0 to 1. Level n needs n² times this, so each level takes longer than the last. */
const XP_PER_LEVEL_UNIT = 20
const MAX_LEVEL = 10

export function levelForXp(xp: number): number {
  return Math.min(MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, xp) / XP_PER_LEVEL_UNIT)))
}

export function skillLevel(skills: Skills, group: VerbGroup): number {
  return skills[group]?.level ?? 0
}

/** Skills after `xp` more practice in one group. Skills only ever go up. */
export function addXp(skills: Skills, group: VerbGroup, xp: number): Skills {
  if (!(xp > 0)) return skills
  const total = (skills[group]?.xp ?? 0) + xp
  return { ...skills, [group]: { xp: total, level: levelForXp(total) } }
}
