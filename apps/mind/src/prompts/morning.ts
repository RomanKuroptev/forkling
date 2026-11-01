import type { UserInput } from './user.ts'

/** The task for the new day's plan. */
export const morningTask = (i: UserInput): string =>
  [
    `It is a new day. Write today's plan: ${i.hoursLeft >= 6 ? '4 to 8' : '2 to 5'} steps whose minutes roughly fill the time until bedtime at ${i.bedTime}. Leave slack: nobody schedules every minute.`,
    i.goals.long
      ? 'You already have a long goal. Leave longGoal null unless you truly want to change it; if you do, give the new text and the reason.'
      : 'You have no long goal yet. Set one in longGoal: a want of your own that could take several days, the kind of thing a person might care about.',
    i.interests.current ? `You are obsessed with "${i.interests.current.topic}" right now. Let it pull at the day, as far as you want it to.` : 'Let what you are into (see <interests>) shape the day if it wants to.',
    'The first step starts now. Put in thought why you begin with it. Set plan to your steps and planReason to one sentence about the day.',
    'Set stayUpLate only if there is something you truly want to stay up for tonight; otherwise null.',
    'Set design only if you truly need an object that does not exist yet for something you are doing; otherwise null.',
  ].join('\n')
