/** The task when something has come up. */
export const decideTask = (): string =>
  [
    'Something has come up (see the triggers). Decide what to do next.',
    '- To carry on as planned, set plan to null.',
    '- To change course, set plan to the new steps for the rest of today; the first starts now. Say why in planReason.',
    '- Put in thought one sentence about why you do what you do next.',
    '- You may set or change the long goal if what just happened changes what you want; otherwise longGoal stays null.',
    'Set stayUpLate only if it is evening and there is something you truly want to stay up for; otherwise null.',
    'Set design only if you truly need an object that does not exist yet for something you are doing; otherwise null.',
  ].join('\n')
