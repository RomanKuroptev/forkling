import type { FakeAnswers } from '@forkling/mind/src/fast-forward-fakes.ts'
import type { LlmRequest } from '@forkling/mind/src/llm.ts'

/**
 * Fake models for `pnpm qa behaviour --fake` (audit spec 9.1 and steps.md QB.7). They are stand-ins that make the engine do
 * something on the web snapshot, so a 30-day run on fakes exercises crashes, rails, money and growth. The planted ones break
 * one behaviour on purpose, and each must raise its own alarm. None is a voice: they say nothing about what Merge would do.
 * The words below are the fake's own titles for its sketches, not topics for Merge (Merge never sees this file).
 */

export const SCENARIOS = ['plain', 'same-topic', 'no-memes', 'rest-40'] as const
export type Scenario = (typeof SCENARIOS)[number]

const TITLES = ['Harbour Cranes', 'Moth Scales', 'Dune Ripples', 'Mycelium Threads', 'Glacier Blue', 'Hive Wax', 'Tide Pool', 'Fresnel Lens', 'Paper Crane', 'Basalt Columns', 'Oboe Pitch', 'Typewriter Ribbon', 'Kelp Canopy', 'Sundial Noon', 'Rain Gauge', 'Weather Vane', 'Kite String', 'Lantern Moth', 'Salt Flats', 'Ice Ferns']
const KINDS = ['art', 'game', 'tool', 'sound', 'zine']

const step = (verb: string, target: string | null, minutes: number, reason: string, over: Record<string, unknown> = {}) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null, ...over })

/** The pages a morning offers, by address, from the starting-points data block of the prompt. */
export function startingPoints(user: string): string[] {
  const block = /<data source="starting-points">([\s\S]*?)<\/data>/.exec(user)?.[1] ?? ''
  return [...new Set([...block.matchAll(/https:\/\/[^\s|)<>]+/g)].map((m) => m[0]))]
}

/** An Imgflip format the sketch prompt offers as a meme source, if any. */
export const memeFormat = (user: string): string | null => /looked \| (https:\/\/imgflip\.com\/meme\/\d+)/.exec(user)?.[1] ?? null

const page = (title: string, n: number) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><canvas id="c" width="400" height="300"></canvas><script>const g=document.getElementById('c').getContext('2d');g.fillStyle='hsl(${(n * 47) % 360},60%,50%)';g.fillRect(0,0,400,300);g.fillStyle='#000';g.fillText(${JSON.stringify(title)},20,150)</script></body></html>`

/** A short line that differs from the last few: two of the fake's titles, paired differently each time. */
const say = (n: number) => `${TITLES[n % TITLES.length]!.toLowerCase()} and ${TITLES[(n * 7 + 3) % TITLES.length]!.toLowerCase()} are on my mind.`

export function scenarioAnswers(scenario: Scenario): FakeAnswers {
  let sketches = 0
  return {
    morning: (req: LlmRequest, n: number) => {
      const starts = startingPoints(req.user)
      // Imgflip first when the morning offers it, so there is a format to make a meme from.
      const ordered = [...starts.filter((u) => u.includes('imgflip.com')), ...starts.filter((u) => !u.includes('imgflip.com'))]
      const a = ordered[0] ?? 'Lighthouse'
      const b = ordered[1] ?? ordered[0] ?? 'Moth'
      const plan =
        scenario === 'rest-40'
          ? [step('wander', a, 30, 'I want to read where the day starts.'), step('rest', null, 30, 'A rest.'), step('tinker', `sketch ${n}`, 45, 'I want to make a small thing.', { size: 'sketch' }), step('rest', null, 30, 'Another rest.'), step('tinker', `sketch ${n}b`, 45, 'One more small thing.', { size: 'sketch' })]
          : [step('wander', a, 30, 'I want to read where the day starts.'), step('tinker', `sketch ${n}`, 45, 'I want to make a small thing.', { size: 'sketch' }), step('wander', b, 30, 'I want to read one more place.'), step('tinker', `sketch ${n}b`, 45, 'One more small thing.', { size: 'sketch' }), step('rest', null, 30, 'A rest at the end.')]
      return { thought: 'A day of reading and making.', longGoal: null, dropLongGoal: false, plan, planReason: 'Read, make, read, make.', stayUpLate: null }
    },
    // A different line each time, as a repeated thought is a finding of its own.
    decide: (_req: LlmRequest, n: number) => ({ thought: `The plan holds; ${say(n)}`, longGoal: null, dropLongGoal: false, plan: null, planReason: null, stayUpLate: null }),
    read: (_req: LlmRequest, n: number) => ({ reaction: `I read it: ${say(n + 7)}`, topics: [], interest: 5, souvenir: null, next: null, look: null }),
    sketch: (req: LlmRequest) => {
      sketches++
      const format = memeFormat(req.user)
      // One sketch in four is a meme when a format is on offer: memes among other things, not instead of them. Titles and
      // captions share no word, so the plain fake alone never trips the repeated-words alarm.
      const a = TITLES[(sketches * 3) % TITLES.length]!
      const b = TITLES[(sketches * 3 + 1) % TITLES.length]!
      if (format && scenario !== 'no-memes' && sketches % 4 === 1) {
        return { meta: { title: `${a} vs ${b}`, kind: 'meme', about: `${a.toLowerCase()} vs ${b.toLowerCase()}.`, interest: null, sources: [{ role: 'looked', url: format }, { role: 'read', url: format }] }, html: page(`${a} vs ${b}`, sketches) }
      }
      const title = scenario === 'same-topic' ? `Loop Counter ${sketches}` : `${a} ${Math.floor(sketches / TITLES.length) + 1}`
      const about = scenario === 'same-topic' ? 'The loop counter counts its own loop, and the loop goes round again.' : `${KINDS[sketches % KINDS.length]}: ${a.toLowerCase()}.`
      return { meta: { title, kind: KINDS[sketches % KINDS.length], about, interest: null, sources: [] }, html: page(title, sketches) }
    },
  }
}
