import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ArtOutput, MAX_PHOTOS_PER_DAY, type Artifact, type BudgetCall, type MindState, type PhotoShot, type SpeciesPack, type TemperamentRoll, type WorldObject } from '@forkling/schema'
import { hourInZone, localDate, skillLevel } from '@forkling/sim'
import { artifactFrom, uniqueId } from './art.ts'
import { canSpend, costUsd, estimateCallUsd, estimateTokens, monthOf, recordCall, rollLedger } from './budget.ts'
import { clampText } from './decision.ts'
import { IMAGE_TOKENS, type LlmClient } from './llm.ts'
import { buildSystem } from './prompts.ts'
import { appendStream, type NewEntry } from './stream.ts'
import { readWorld, writeJson } from './world.ts'

/** How many more frames it may take on `today`. */
export function photosLeft(state: MindState, today: string): number {
  return Math.max(0, MAX_PHOTOS_PER_DAY - (state.photos?.date === today ? state.photos.count : 0))
}

/**
 * The photo state with one more shot waiting to be rendered, or null when the day's frames are used up.
 * Yesterday's count restarts at zero, and a shot left over from yesterday is dropped: the light has moved on.
 */
export function enqueueShot(state: MindState, shot: PhotoShot, today: string): NonNullable<MindState['photos']> | null {
  if (photosLeft(state, today) === 0) return null
  const current = state.photos?.date === today ? state.photos : { date: today, count: 0, queue: [] as PhotoShot[] }
  return { date: today, count: current.count + 1, queue: [...current.queue, shot] }
}

/** The id of a frame and of the photo artifact that goes with it: its subject, made unique among `taken`. */
export function shotIdFor(subjectId: string | undefined, taken: ReadonlySet<string>): string {
  return uniqueId(subjectId ?? 'view', 'view', taken)
}

/** The nearest thing it has not met before that is close enough to see. Things in its paws don't count. */
export function noticedSubject(input: {
  objects: readonly WorldObject[]
  known: ReadonlySet<string>
  pos: { x: number; z: number }
  range: number
}): WorldObject | null {
  let best: { object: WorldObject; d: number } | null = null
  for (const object of input.objects) {
    if (input.known.has(object.id) || object.state?.held) continue
    const d = Math.hypot(object.position[0] - input.pos.x, object.position[2] - input.pos.z)
    if (d <= input.range && (!best || d < best.d)) best = { object, d }
  }
  return best?.object ?? null
}

/** A frame is a 512 px jpeg of some tens of kilobytes. Anything much bigger is not what the eye cam makes. */
export const MAX_FRAME_BYTES = 400_000
const MAX_PHOTO_TOKENS = 600

/** The user part of a vision call: the pictured moment as facts, then the task. The frame itself is attached. */
export function buildPhotoUser(input: { shot: PhotoShot; subject: WorldObject | null; temperament: TemperamentRoll | null; localTime: string; date: string }): string {
  const { shot, subject, temperament } = input
  const taste = (list: readonly { category: string; value: string }[]) => list.map((t) => `${t.value} (${t.category})`).join(', ') || 'nothing in particular'
  return [
    ...(temperament
      ? ['<you>', `likes: ${taste(temperament.likes)}`, `dislikes: ${taste(temperament.dislikes)}`, ...temperament.quirks.map((q) => `quirk (${q.id}): ${q.text}`), '</you>', '']
      : []),
    '<shot>',
    `taken: ${input.date} at ${input.localTime}`,
    `pointed at: ${subject ? clampText(subject.name, 60) : 'whatever was straight ahead'}`,
    `why: ${shot.why === 'photograph' ? 'you chose to photograph it' : 'something new came into view and you looked'}`,
    `your reason: ${clampText(shot.reason, 200)}`,
    '</shot>',
    '',
    '## Your task',
    'The picture attached is what your own eyes saw at that moment. Say what is really in it. Do not invent things that are not in the picture.',
    'Give it a title of its own, a caption of one or two sentences about what you can see, and one sentence of your own opinion of it, in your voice. Answer only with the JSON the schema asks for.',
  ].join('\n')
}

export interface PhotosDeps {
  now: Date
  /** Null when there is no key: the shots are dropped with a note. */
  llm: LlmClient | null
  pack: SpeciesPack
  speciesPersona: string
  /** Where the renderer left `<shot id>.jpg` for each queued shot. */
  framesDir: string
  dryRun?: boolean
}

export interface PhotosResult {
  written: string[]
  notes: string[]
  calls: BudgetCall[]
  /** How many photos were kept. */
  made: number
}

const isJpeg = (bytes: Buffer) => bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8

/**
 * After the tick: each queued shot has been rendered to a frame. One Haiku vision call per frame says what it shows and
 * what the forkling thinks of it. The frame goes to `art/photos/`, the words to `art/<id>.json`, and a `seen` entry
 * to the day's stream, which the bedtime reflection can cite. The queue is always emptied: a frame is only good for the
 * light it was taken in.
 */
export async function runPhotos(dir: string, deps: PhotosDeps): Promise<PhotosResult> {
  const nowMs = deps.now.getTime()
  const w = readWorld(dir, (f) => monthOf(f.timezone, nowMs))
  const { forkling } = w
  const tz = forkling.timezone
  const today = localDate(tz, nowMs)
  const result: PhotosResult = { written: [], notes: [], calls: [], made: 0 }
  const shots = w.mindState.photos?.queue ?? []
  if (shots.length === 0) return result

  const system = buildSystem({ pack: deps.pack, name: forkling.name, speciesPersona: deps.speciesPersona, persona: w.persona })
  let budget = rollLedger(w.budget, monthOf(tz, nowMs))
  const taken = new Set(w.art.map((a) => a.id))
  const hour = hourInZone(tz, nowMs)
  const localTime = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`
  const seen: NewEntry[] = []
  const made: { artifact: Artifact; bytes: Buffer }[] = []

  for (const shot of shots) {
    const framePath = join(deps.framesDir, `${shot.id}.jpg`)
    if (!existsSync(framePath)) {
      result.notes.push(`shot ${shot.id}: no frame was rendered`)
      continue
    }
    const bytes = readFileSync(framePath)
    if (!isJpeg(bytes) || bytes.length > MAX_FRAME_BYTES) {
      result.notes.push(`shot ${shot.id}: the frame is not a jpeg of a sane size`)
      continue
    }
    const subject = shot.subjectId ? (w.objects.find((o) => o.id === shot.subjectId) ?? null) : null
    const user = buildPhotoUser({ shot, subject, temperament: w.temperament, localTime, date: today })
    const tokens = estimateTokens(system) + estimateTokens(user) + IMAGE_TOKENS
    const maxUsd = estimateCallUsd('claude-haiku-5-5', tokens, MAX_PHOTO_TOKENS)
    if (deps.dryRun) {
      result.notes.push(`dry run: vision call for ${shot.id}, about ${tokens} tokens, at most $${maxUsd.toFixed(4)}`)
      continue
    }
    if (!deps.llm) {
      result.notes.push(`shot ${shot.id}: no credentials, so no caption`)
      continue
    }
    if (!canSpend(budget, maxUsd)) {
      result.notes.push(`shot ${shot.id}: monthly budget reached ($${budget.spentUsd.toFixed(2)} of $${budget.capUsd}): no call`)
      continue
    }
    try {
      const answer = await deps.llm.complete({
        kind: 'vision',
        model: 'claude-haiku-5-5',
        system,
        user,
        images: [{ mediaType: 'image/jpeg', base64: bytes.toString('base64') }],
        maxTokens: MAX_PHOTO_TOKENS,
        effort: 'low',
        schema: ArtOutput.photo,
      })
      const call: BudgetCall = { at: deps.now.toISOString(), kind: 'vision', model: 'claude-haiku-5-5', ...answer.usage, usd: costUsd('claude-haiku-5-5', answer.usage) }
      result.calls.push(call)
      budget = recordCall(budget, call)
      if (!answer.parsed) {
        result.notes.push(`shot ${shot.id}: no usable caption (stopped: ${answer.stopReason ?? 'unknown'})`)
        continue
      }
      const artifact = artifactFrom('photo', answer.parsed, {
        skillLevel: skillLevel(w.skills, 'mind'),
        ...(shot.goalRef ? { goalRef: shot.goalRef } : {}),
        obsessionRef: w.interests.current?.topic,
        nowIso: shot.at,
        takenIds: taken,
        photo: { id: shot.id, subjectId: shot.subjectId, noticed: shot.why === 'noticed' },
      })
      if (!artifact || artifact.kind !== 'photo') {
        result.notes.push(`shot ${shot.id}: the caption was not usable`)
        continue
      }
      taken.add(artifact.id)
      made.push({ artifact, bytes })
      seen.push({
        at: deps.now.toISOString(),
        kind: 'seen',
        text: `Photographed ${subject ? subject.name : 'the view'}: "${artifact.title}". ${artifact.content.caption}`,
        verb: 'photograph',
        ...(subject ? { objectId: subject.id } : {}),
        ...(shot.goalRef ? { goalRef: shot.goalRef } : {}),
      })
    } catch (e) {
      result.notes.push(`shot ${shot.id}: call failed: ${(e as Error).message}`)
    }
  }
  if (deps.dryRun) return result

  for (const { artifact, bytes } of made) {
    if (artifact.kind !== 'photo') continue
    mkdirSync(join(dir, 'art/photos'), { recursive: true })
    writeFileSync(join(dir, 'art', artifact.content.image), bytes)
    result.written.push(`art/${artifact.content.image}`)
    if (writeJson(dir, `art/${artifact.id}.json`, artifact)) result.written.push(`art/${artifact.id}.json`)
  }
  result.made = made.length
  if (seen.length > 0) {
    appendStream(dir, today, seen)
    result.written.push(`memory/stream/${today}.jsonl`)
  }
  if (result.calls.length > 0 && writeJson(dir, 'brain/budget.json', budget)) result.written.push('brain/budget.json')
  const mind: MindState = { ...w.mindState, photos: { ...w.mindState.photos!, queue: [] } }
  if (writeJson(dir, 'mind/state.json', mind)) result.written.push('mind/state.json')
  return result
}
