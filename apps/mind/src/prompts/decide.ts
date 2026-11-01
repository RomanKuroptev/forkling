import type { UserInput } from './user.ts'

/** The task when something has come up, or when the plan for the day has run out. */
export const decideTask = (i: UserInput): string =>
  [
    ...(i.triggers.some((t) => t.kind === 'replan')
      ? [
          `Your plan for today has run out, or there is none. Write the next one, for the remaining ${i.hoursLeft} ${i.hoursLeft === 1 ? 'hour' : 'hours'} (until bedtime ${i.bedTime}): set plan to the steps; the first starts now.`,
          'Set plan to null only if you would rather be left to wander for a while; you will be asked again in an hour.',
          '',
        ]
      : []),
    'Something has come up (see the triggers). Decide what to do next.',
    '- To carry on as planned, set plan to null.',
    '- To change course, set plan to the new steps for the rest of today; the first starts now. Say why in planReason.',
    '- Put in thought one sentence about why you do what you do next.',
    '- You may set or change the long goal if what just happened changes what you want; otherwise longGoal stays null.',
    'Set stayUpLate only if it is evening and there is something you truly want to stay up for; otherwise null.',
    'Set design only if you truly need an object that does not exist yet for something you are doing; otherwise null.',
  ].join('\n')
