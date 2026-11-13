import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ExpandJob, Interests, isOpenWish, type Place, type WishDraft, type WorkConstraint } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { expandCheck, lastSizeChange, validatePlacePatch } from '@forkling/sim'
import type { BuildHandler } from '../build-worker.ts'
import { clampText } from '../decision.ts'
import { claimsHuman } from '../honesty.ts'
import { stopFailure, type LlmResult, type LlmClient } from '../llm.ts'
import { readPlaces } from '../places.ts'
import { readWishes } from '../wishes.ts'
import { createWorkerComplete } from './complete.ts'
import { drawForBuild } from './draw.ts'
import { EXPAND_MAX_TOKENS, ExpandAnswer, buildExpandRepairUser, buildExpandUser, toExpandPatch, toWishDrafts } from './expand.ts'
import { refFile } from './tend.ts'
import { readAllSouvenirs } from './works.ts'

const SONNET = 'claude-sonnet-5-5'
const KEPT_SHOWN = 5

export interface ExpandHandlerOptions {
  /** The world, read only: this handler never writes in it. */
  dir: string
  /** Null when there is no key: the job waits. */
  llm: LlmClient | null
  now: () => number
}

const readJson = (dir: string, rel: string): unknown => {
  try {
    return existsSync(join(dir, rel)) ? JSON.parse(readFileSync(join(dir, rel), 'utf8')) : null
  } catch {
    return null
  }
}

function unpack(result: LlmResult<ExpandAnswer> | null): { ok: true; answer: ExpandAnswer } | { ok: false; reason: string } {
  if (!result) return { ok: false, reason: 'no call was made (no key, the budget, or a prompt that was too long)' }
  const failure = stopFailure(result.stopReason, result.parsed)
  if (failure === 'refusal') return { ok: false, reason: 'the model refused' }
  if (failure === 'cut_off') return { ok: false, reason: 'the answer was cut off at the output limit' }
  if (!result.parsed) return { ok: false, reason: 'the model gave no usable answer' }
  return { ok: true, answer: result.parsed }
}

/**
 * The build worker's expand job (spec 10.2, W6): one Sonnet call at low effort that changes one place, a new room, an enlarged
 * room or a path, with the constraint and collision of 12.4. The change is checked by `validatePlacePatch`; if it breaks a rule, one
 * repair call gets every reason. **It writes nothing in the world and never the ledger**: the checked patch, the wishes and what
 * the calls cost go back in the result, and the loop checks the patch again and writes the place (Roman's decision, W6: one writer
 * of `places/`, so a tend and an expand never fight over a file). With no key it waits and spends nothing.
 */
export function createExpandHandler(o: ExpandHandlerOptions): BuildHandler {
  return async (raw) => {
    const parsed = ExpandJob.safeParse(raw)
    if (!parsed.success) return { status: 'failed', reason: 'the request is not an expand request' }
    const job = parsed.data
    const llm = o.llm
    if (!llm) return { status: 'later' }
    const fail = (reason: string, calls?: ReturnType<typeof createWorkerComplete>['calls']) => ({ status: 'failed' as const, reason, ...(calls ? { extra: { calls } } : {}) })

    const nowMs = o.now()
    const places = readPlaces(o.dir)
    const place: Place | undefined = places.find((p) => p.id === job.placeId)
    if (!place) return fail(`the place ${job.placeId} is not here any more`)

    // The conditions of spec 2.5 hold again at the moment of the work, before anything is spent.
    const interestsRead = Interests.safeParse(readJson(o.dir, 'brain/interests.json'))
    const interests = interestsRead.success ? interestsRead.data : Interests.parse({})
    const souvenirs = readAllSouvenirs(o.dir)
    const weights = Object.fromEntries(Object.entries(interests.topics).map(([topic, t]) => [topic, t.weight]))
    const check = expandCheck(place, weights, souvenirs)
    if (!check.ok || check.tag === null) return fail(check.reasons.join('; '))
    const tag = check.tag

    const since = lastSizeChange(place)
    const kept = souvenirs
      .filter((s) => Date.parse(s.source.fetchedAt) > since && s.topics.some((t) => t.toLowerCase() === tag.toLowerCase()))
      .slice(-KEPT_SHOWN)
      .reverse()
      .map((s) => ({ id: s.id, kind: s.kind, content: s.content, why: s.why }))

    const seed = (readJson(o.dir, 'forkling.json') as { seed?: number } | null)?.seed ?? 0
    const draw = drawForBuild(o.dir, { seed, key: `expand:${job.id}`, interests })
    const user = buildExpandUser({
      place,
      kit,
      reason: job.reason,
      tag,
      kept,
      others: places.filter((p) => p.id !== place.id).map((p) => ({ id: p.id, name: p.name, chunk: p.chunk })),
      openWishes: readWishes(o.dir).filter(isOpenWish).map((w) => ({ name: w.name, count: w.count })),
      constraint: draw.constraint,
      collision: draw.collision ?? undefined,
    })

    const { complete, calls, nowIso } = createWorkerComplete({ dir: o.dir, llm, nowMs })
    const placeIds = new Set(places.map((p) => p.id))

    /** The answer as a checked patch, or every reason it is not one. */
    const judge = (a: ExpandAnswer) => {
      const words = [a.summary, a.room?.name ?? '', ...a.wishes.flatMap((w) => [w.name, w.description])]
      if (words.some((w) => claimsHuman(w))) return { ok: false as const, reasons: ['the words claim to be human, and your words never do'] }
      const converted = toExpandPatch(a)
      if (!converted.ok) return { ok: false as const, reasons: [converted.reason] }
      const checked = validatePlacePatch(place, converted.patch, {
        kit,
        nowIso,
        placeIds,
        exists: (ref) => {
          const f = refFile(ref)
          return f !== null && existsSync(join(o.dir, f))
        },
      })
      return checked.ok ? { ok: true as const, patch: converted.patch } : { ok: false as const, reasons: checked.reasons }
    }

    const first = unpack(await complete('expand', SONNET, user, ExpandAnswer, EXPAND_MAX_TOKENS))
    if (!first.ok) return fail(first.reason, calls)
    let answer = first.answer
    let verdict = judge(answer)
    if (!verdict.ok) {
      const second = unpack(await complete('repair', SONNET, buildExpandRepairUser({ reasons: verdict.reasons, previous: answer, user }), ExpandAnswer, EXPAND_MAX_TOKENS))
      if (!second.ok) return fail(clampText(`${verdict.reasons.join('; ')} (and the second try gave nothing: ${second.reason})`, 300), calls)
      answer = second.answer
      verdict = judge(answer)
      if (!verdict.ok) return fail(clampText(verdict.reasons.join('; '), 300), calls)
    }

    const refusal = answer.constraintRefusal?.trim() ? clampText(answer.constraintRefusal.trim(), 200) : null
    const constraint: WorkConstraint = { text: clampText(draw.constraint, 200), refused: refusal !== null, reason: refusal }
    const wishes: WishDraft[] = toWishDrafts(answer, placeIds)
    return {
      status: 'done',
      extra: {
        placeId: place.id,
        patch: verdict.patch,
        wishes,
        constraint,
        collision: draw.collision ? [draw.collision.a.souvenir.id, draw.collision.b.souvenir.id] : null,
        calls,
      },
    }
  }
}
