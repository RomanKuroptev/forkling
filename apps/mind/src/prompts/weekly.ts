/** The task for the weekly look at the long goal. */
export const weeklyTask = (): string =>
  [
    'Once a week you look at your long goal. Decide: keep it (longGoal null, dropLongGoal false), change it (longGoal with the new text and reason), or give it up (dropLongGoal true, and say why in thought).',
    'Base this on what actually happened this week (the recent steps and rejected plans), not on what you hoped. plan must be null and stayUpLate null.',
  ].join('\n')
