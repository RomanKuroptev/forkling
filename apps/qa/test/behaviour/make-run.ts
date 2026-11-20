import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * A small made-up world after a run, for the behaviour tests: what each day made, how often Merge rested, what it thought.
 * Every planted case is a change to one of these knobs. Times are UTC; in November Stockholm is UTC+1.
 */
export interface RunShape {
  days: string[]
  /** Titles made each day (a work each, kind from `kinds` in turn). Default: two different subjects a day. */
  titles?: (day: number) => string[] | undefined
  /** The about text of a work. Default: its title. */
  about?: (title: string) => string
  kinds?: string[]
  /** Hours (UTC) the works of a day are made at. */
  hours?: number[]
  /** Steps per day and how many of them are rest. */
  steps?: number
  rest?: (day: number) => number
  thoughts?: (day: number) => string[]
  /** Plan lines per day, as `notebook/plans/<date>.md` writes them. */
  plans?: (day: number) => string[]
  /** Trails: pages read each day. */
  trails?: (day: number) => { url: string; title: string; reaction?: string; failed?: string }[]
  found?: boolean
  project?: boolean
  summary?: string | null
  /** More works, as their meta (merged over a default made on the first day). */
  works?: Record<string, unknown>[]
  /** Tick notes per day. */
  notes?: (day: number) => string[]
  /** Captured prompts (`prompts.jsonl` in the output folder). */
  prompts?: { kind: string; user: string; system?: string }[]
  /** Diary lines per day, as `journal/<date>.md` keeps them (after a title and a date line). Default: no diary. */
  diary?: (day: number) => string[] | undefined
}

const SUBJECTS = [
  'harbour cranes lifting containers dockside steel',
  'moth wings scales dust flutter',
  'barchan dunes sand ripple desert',
  'fungal networks mycelium soil threads',
  'glacier crevasse blue meltwater',
  'beekeeping hives honeycomb wax',
  'tide pools anemone barnacles rocks',
  'lighthouse lens fresnel beam keeper',
  'origami folds crease paper crane',
  'volcano basalt lava columns cooling',
  'orchestra tuning oboe pitch concert',
  'typewriter ribbon keys carriage platen',
  'kelp forest otters canopy swell',
  'sundial gnomon shadow noon hours',
]

export function makeRun(shape: RunShape): { world: string; out: string } {
  const root = mkdtempSync(join(tmpdir(), 'qa-run-'))
  const world = join(root, 'world')
  const out = join(root, 'out')
  const w = (rel: string, content: string) => {
    mkdirSync(join(world, rel, '..'), { recursive: true })
    writeFileSync(join(world, rel), content)
  }
  w('forkling.json', JSON.stringify({ name: 'Test', species: 'cat', timezone: 'Europe/Stockholm' }))
  const kinds = shape.kinds ?? ['art', 'game', 'tool']
  const hours = shape.hours ?? [7, 13]
  let n = 0
  shape.days.forEach((date, d) => {
    const titles = shape.titles?.(d) ?? [SUBJECTS[(2 * d) % SUBJECTS.length]!.split(' ').slice(0, 2).join(' '), SUBJECTS[(2 * d + 1) % SUBJECTS.length]!.split(' ').slice(0, 2).join(' ')]
    titles.forEach((title, i) => {
      const id = `w${n}`
      const subject = SUBJECTS.find((s) => s.startsWith(title)) ?? title
      w(`works/${id}/meta.json`, JSON.stringify({ id, title, kind: kinds[n % kinds.length], about: shape.about?.(title) ?? subject, made: `${date}T${String(hours[i % hours.length]).padStart(2, '0')}:00:00.000Z`, status: 'shelf', sources: [] }))
      n++
    })
    const steps = shape.steps ?? 10
    const rest = shape.rest?.(d) ?? 1
    const stream: string[] = []
    for (let s = 0; s < steps; s++) {
      const verb = s < rest ? 'rest' : ['wander', 'tinker', 'write', 'tend'][s % 4]!
      stream.push(JSON.stringify({ id: `${date}#${s}`, at: `${date}T${String(6 + s).padStart(2, '0')}:00:00.000Z`, kind: 'step', verb, text: `Started ${verb}.` }))
    }
    const thoughts = shape.thoughts?.(d) ?? [`On day ${d} the ${SUBJECTS[d % SUBJECTS.length]} stayed with me.`, `Later I kept thinking about ${SUBJECTS[(d + 5) % SUBJECTS.length]} for a while.`]
    thoughts.forEach((t, i) => stream.push(JSON.stringify({ id: `${date}#t${i}`, at: `${date}T${String(8 + i).padStart(2, '0')}:30:00.000Z`, kind: 'thought', text: t })))
    w(`memory/stream/${date}.jsonl`, `${stream.join('\n')}\n`)
    w(`mind/ticks/${date}.jsonl`, `${JSON.stringify({ at: `${date}T08:00:00.000Z`, asleep: false, calls: [{ kind: 'decide', model: 'claude-haiku-5-5', usd: 0.002, ok: true }], notes: shape.notes?.(d) ?? [] })}\n`)
    const plans = shape.plans?.(d)
    if (plans) w(`notebook/plans/${date}.md`, `# Plan for ${date}\n\n${plans.join('\n')}\n`)
    const trails = shape.trails?.(d)
    const diary = shape.diary?.(d)
    if (diary) w(`journal/${date}.md`, `# A day\n\n*${date}*\n\n${diary.join('\n\n')}\n`)
    if (trails) w(`trails/${date}-1.json`, JSON.stringify({ id: `${date}-1`, date, purpose: 'to read', start: { kind: 'feed', value: trails[0]?.url ?? '' }, pages: trails.map((p) => ({ ...p, fetchedAt: `${date}T09:00:00.000Z`, topics: [] })) }))
  })
  if (shape.found ?? true) w('places/home.json', JSON.stringify({ id: 'home', name: 'Home', history: [{ verb: 'found', at: `${shape.days[1] ?? shape.days[0]}T10:00:00.000Z`, summary: 'a room' }] }))
  if (shape.project ?? true) w('projects/clock/project.json', JSON.stringify({ id: 'clock', name: 'Clock', status: 'building', sessions: [{ at: `${shape.days[0]}T15:00:00.000Z` }] }))
  const first = shape.days[0]!
  const last = shape.days.at(-1)!
  for (const extra of shape.works ?? []) {
    const meta: Record<string, unknown> = { title: 'Extra', kind: 'art', about: 'an extra work', made: `${first}T12:00:00.000Z`, status: 'shelf', sources: [], ...extra }
    const id = String(meta.id ?? `x${n++}`)
    w(`works/${id}/meta.json`, JSON.stringify({ ...meta, id }))
    if (meta.status !== 'scrap') w(`works/${id}/thumb.png`, 'png')
  }
  if (shape.prompts) {
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'prompts.jsonl'), shape.prompts.map((p) => JSON.stringify({ at: `${first}T08:00:00.000Z`, model: 'claude-haiku-5-5', system: p.system ?? '', user: p.user, kind: p.kind, parsed: true })).join('\n'))
  }
  const summary = shape.summary === undefined ? `# Fast-forward: PASS\n\n- Simulated: ${first} to ${last} (${shape.days.length} days asked), 100 ticks\n- Spent: $1.000 of a $3 cap; the daily pace is $0.42\n\n## Crashes: 0\n\n\n## Rails broken: 0\n\n` : shape.summary
  if (summary !== null) {
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'summary.md'), summary)
  }
  return { world, out }
}

/** The work check block a planner prompt carries once a work was made (issue #400), as the engine writes it. */
export const WORKS_CHECKED =
  '\n\n<works-checked>\nEach work you make is run once in a sandboxed browser for a few seconds before it is kept (the work check). What it found for your recent works:\n- "No, Then Yes" (sketch, made 2026-11-19): ran in the check and drew something to see\n</works-checked>'
/** The visits block a planner prompt carries (issue #422), as the engine writes it. */
export const VISITS = '\n\n<data source="visits">\nvisitors today: 1\nplaces they stood in: home (1)\n</data>'

/** A run in which one meme made it all the way through: the planner was offered a format and told it may make a meme. */
export const WITH_A_MEME: Omit<RunShape, 'days'> = {
  prompts: [
    { kind: 'morning', user: `Tinker kinds: art, game, meme (a meme costs 30 points). Starting points: https://imgflip.com/meme/181913649${VISITS}${WORKS_CHECKED}` },
    { kind: 'decide', user: `Tinker kinds: art, game, meme (a meme costs 30 points). Starting points: https://imgflip.com/meme/181913649${VISITS}${WORKS_CHECKED}` },
  ],
  trails: (d) => (d === 0 ? [{ url: 'https://imgflip.com/meme/181913649', title: 'Drake Hotline Bling', reaction: 'No, then yes.' }] : []),
  works: [{ id: 'no-then-yes', title: 'No, Then Yes', kind: 'meme', about: 'me and my plans, in two panels', made: '2026-11-19T15:00:00.000Z' }],
}

export const WEEK = ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25']
