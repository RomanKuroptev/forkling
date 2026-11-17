import { PROJECT_LIMITS, type Project } from '@forkling/schema'
import { ownNotes } from './page.ts'

/**
 * The prompts of a build session (spec-v4 3.3). A session has tools, so it is shown no web text and no visitor note: its input is
 * the seed and Merge's own page, the project (its name, aim and last captions, all Merge's words), its file list, the latest
 * screenshot and the step's reason. The system part never changes from call to call, so it caches.
 */

export interface SessionSystemInput {
  seed: string
  page?: string | undefined
  /** The limits of this session, written into the text (the defaults of spec-v4 3.3). */
  limits: { turns: number; usd: number; minutes: number }
}

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`

export function buildSessionSystem(input: SessionSystemInput): string {
  return [
    ownNotes(input.page ?? '', input.seed),
    '',
    '## A build session',
    '- You are working on one of your projects: something you build over more than one sitting. You write the code, run it and look at what it does. Nobody gives you a project or tells you when one is finished.',
    `- A project's files are static web files in its src/ folder: .html, .js, .css, .json, .svg, .txt and .md. At most ${PROJECT_LIMITS.files} files, ${kb(PROJECT_LIMITS.fileBytes)} a file and ${PROJECT_LIMITS.totalBytes / (1024 * 1024)} MB in all. Names use lowercase letters, digits, -, _, . and /. The page that is shown is src/index.html.`,
    '- A page may load the project\'s own files and three libraries: p5.js (`../../../lib/p5.min.js`), Tone.js (`../../../lib/Tone.js`) and three.js (`../../../lib/three/three.module.js`, as a module), with one more `../` for each folder deeper than src/. Nothing else: no network, no storage, no cookies, no forms, no pop-ups, no camera, microphone or location. The safety policy is put into each page for you.',
    '- Your tools: list_files, read_file, write_file and delete_file for the files in src/; run, which opens src/index.html in a sandboxed browser for 5 seconds and gives back its uncaught errors, its console errors and a screenshot; look, which shows the latest screenshot again; and finish.',
    '- finish ends the session with a caption of up to 140 characters saying what changed, and one of: continue (it stays a project you are building), done, or abandon. Done and abandon need a reason of up to 140 characters. You may also give the project a new aim. A done project must pass the work check: its pages load nothing from outside, and it runs with no uncaught error and something to see. If it does not pass, it stays a project you are building and you are told why.',
    '- Every turn of yours uses a tool. A reply with no tool in it ends the session there, the same as stopping at a limit: use finish to end it with your own caption.',
    `- A session ends by itself after ${input.limits.turns} turns, after $${input.limits.usd.toFixed(2)} of spend, when your points run out (a session costs 1 point for each $0.001 it spends), or after ${input.limits.minutes} minutes. Whatever you wrote is kept, working or not.`,
    '- Each session\'s caption and its last screenshot go on your site, in order, as the story of the project.',
  ].join('\n')
}

export interface SessionUserInput {
  project: Pick<Project, 'id' | 'name' | 'aim' | 'started' | 'sessions'>
  files: readonly { path: string; bytes: number }[]
  /** Why the step is here: Merge's own words from its plan. */
  reason: string
  /** Whether the latest screenshot comes with this message, as a picture before the text. */
  hasShot: boolean
}

/** The first message of a session. Only Merge's own words and code's facts: no note, no web text (the project's `inspiredBy` is left out). */
export function buildSessionUser(input: SessionUserInput): string {
  const { project } = input
  const last = project.sessions.slice(-3)
  return [
    '## The project',
    `- ${project.name} (id: ${project.id}), started ${project.started.slice(0, 10)}.`,
    `- Aim: ${project.aim}`,
    project.sessions.length === 0
      ? '- No session yet: this is the first.'
      : [`- Sessions so far: ${project.sessions.length}. The last ${last.length === 1 ? 'one' : last.length}, oldest first:`, ...last.map((s) => `  - ${s.at.slice(0, 10)}: ${s.caption}${s.broken ? ' (it was broken)' : ''}`)].join('\n'),
    '',
    '## Its files in src/',
    ...(input.files.length === 0 ? ['None yet.'] : input.files.map((f) => `- ${f.path} (${f.bytes < 1024 ? `${f.bytes} bytes` : kb(f.bytes)})`)),
    '',
    '## Why you are working on it now',
    input.reason,
    '',
    input.hasShot ? 'The picture above is the latest screenshot.' : 'There is no screenshot yet.',
  ].join('\n')
}
