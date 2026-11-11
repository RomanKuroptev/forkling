import type { Goals } from '@forkling/schema'

/** `notebook/plans/<date>.md`: the plan for a day, with the reason for each step and the beliefs it follows from. */
export function renderPlan(date: string, goals: Goals): string {
  const today = goals.today
  return [
    `# Plan for ${date}`,
    '',
    ...(goals.long ? [`**Long goal:** ${goals.long.text}`, `*${goals.long.reason}*`, ''] : []),
    ...(today ? [today.reason, '', ...today.steps.map((s, n) => `${n + 1}. **${s.verb}**${s.targetId ? ` (${s.targetId})` : ''}${s.topic ? ` about ${s.topic}` : ''}, ${s.minutes} min: ${s.reason}${s.because?.length ? ` *(because ${s.because.join(', ')})*` : ''}`)] : []),
    '',
  ].join('\n')
}
