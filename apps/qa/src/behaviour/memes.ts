import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { CheckResult, FixKind } from '../report/finding.ts'
import type { RunData } from './read-run.ts'

/**
 * Memes, followed from start to end (audit spec 9.5): the eight steps, counted from what the run left behind, and the first step
 * where the count drops to zero. In this engine a meme is not a plan verb: it is a kind the model picks inside a sketch or tinker
 * call (`apps/mind/src/builds/tinker.ts`), checked against the formats on its trails (`memes.ts`). So:
 *
 * 1 offered     planner prompts with an Imgflip format in them (captured prompts); else trips that started at Imgflip
 * 2 read        Imgflip format records read on a trip (what `memeSeeds` takes a meme's format from)
 * 3 planner     planner prompts (morning, decide) that say "meme" and have a format in them; `unknown` without captured prompts
 * 4 chosen      plan steps that name a meme, and meme works (a meme chosen inside a sketch call leaves a work, kept or scrapped)
 * 5 allowed     chosen, less the plans turned down over a meme and the memes scrapped for their sources
 * 6 made        meme works whose answer held (not scrapped for sources or an unusable answer)
 * 7 work check  meme works that are not scraps (the browser check passed)
 * 8 shown       those with a picture (`thumb.png`) on the shelf or in a place
 *
 * Nothing here is told which step is expected to fail: it counts, and names the first zero.
 */

export interface MemeStep {
  step: number
  name: string
  /** Null is `unknown`: the run cannot tell (live, no captured prompts), never 0. */
  count: number | null
  of: number | null
  detail: string
}

export interface MemeTrail {
  steps: MemeStep[]
  /** The first step at zero, or null when a meme made it to the end (or every zero is behind an unknown). */
  stoppedAt: MemeStep | null
  shown: { id: string; title: string; thumb: string }[]
}

const IMGFLIP_FORMAT = /https:\/\/imgflip\.com\/meme\/\d+/
const PLANNER_KINDS = new Set(['morning', 'decide'])
const MEME_WORD = /\bmemes?\b/i
/** The word "meme" in a text, not counting addresses (an Imgflip format lives at https://imgflip.com/meme/<id>). */
const namesMeme = (text: string): boolean => MEME_WORD.test(text.replace(/https?:\/\/\S+/g, ' '))
/** Words that make a sentence about a meme an offer to make one (spec 9.5: "named the meme as a thing it can make, with its price"). */
const MAKING = /\b(kinds?|tinker|sketch|price|prices|points?|costs?)\b/i
/** A sentence or line that names a meme as something to make, not only the word (a seed line about memes is not an offer). */
const offersMeme = (text: string): boolean =>
  text
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/\n|(?<=[.!?])\s+/)
    .some((s) => MEME_WORD.test(s) && MAKING.test(s))
/** A scrap reason from `verifyMemeSources` or the sources schema. */
const SOURCE_REASON = /(must come from the list|sources?\b)/i
const UNUSABLE = /no usable answer/i
const TURNED_DOWN = /plan turned down/i

export function memeTrail(run: RunData): MemeTrail {
  const planner = run.prompts?.filter((p) => PLANNER_KINDS.has(p.kind)) ?? null
  const withFormat = planner?.filter((p) => IMGFLIP_FORMAT.test(p.user) || IMGFLIP_FORMAT.test(p.system)) ?? null
  const imgflipStarts = run.trailPages.filter((p) => IMGFLIP_FORMAT.test(p.url)).length

  const offered: MemeStep = planner
    ? { step: 1, name: 'offered', count: withFormat!.length, of: planner.length, detail: `${withFormat!.length} of ${planner.length} morning and decide prompts had an Imgflip format in them` }
    : imgflipStarts > 0
      ? { step: 1, name: 'offered', count: imgflipStarts, of: null, detail: `trips reached ${imgflipStarts} Imgflip format pages (no captured prompts, so the morning lists themselves are not known)` }
      : { step: 1, name: 'offered', count: null, of: null, detail: 'no captured prompts and no trip reached Imgflip, so whether formats were offered is unknown' }

  const formatsRead = run.read.filter((p) => IMGFLIP_FORMAT.test(p.url))
  const failed = run.trailPages.filter((p) => IMGFLIP_FORMAT.test(p.url) && p.failed)
  const read: MemeStep = { step: 2, name: 'read', count: formatsRead.length, of: formatsRead.length + failed.length, detail: `${formatsRead.length} Imgflip format pages read${failed.length ? `, ${failed.length} not read (${[...new Set(failed.map((f) => f.failed))].slice(0, 2).join('; ')})` : ''}` }

  const seenPrompts = withFormat?.filter((p) => offersMeme(p.system) || offersMeme(p.user)) ?? null
  const mentioned = withFormat?.filter((p) => namesMeme(p.system) || namesMeme(p.user)).length ?? 0
  const seen: MemeStep = seenPrompts
    ? {
        step: 3,
        name: 'seen by the planner',
        count: seenPrompts.length,
        of: planner!.length,
        detail: `a meme was offered as a thing to make (a kind, a tinker or a price, with a format in the prompt) in ${seenPrompts.length} of ${planner!.length} morning and decide prompts${mentioned > seenPrompts.length ? `; the word "meme" was in ${mentioned}, but not as something it can make` : ''}`,
      }
    : { step: 3, name: 'seen by the planner', count: null, of: null, detail: 'unknown: the run kept no prompts (the tick log cannot tell what the planner saw)' }

  const planSteps = run.plans.filter((s) => namesMeme(`${s.target} ${s.reason}`))
  const memeWorks = run.made.filter((m) => m.kind === 'meme')
  const chosenCount = planSteps.length + memeWorks.length
  const chosen: MemeStep = { step: 4, name: 'chosen', count: chosenCount, of: null, detail: `${planSteps.length} plan steps named a meme; ${memeWorks.length} meme works were attempted` }

  const turnedDown = run.ticks.flatMap((t) => t.notes).filter((n) => TURNED_DOWN.test(n) && namesMeme(n))
  const sourceScraps = memeWorks.filter((m) => m.status === 'scrap' && !UNUSABLE.test(m.scrapReason) && SOURCE_REASON.test(m.scrapReason))
  const allowedCount = Math.max(0, chosenCount - turnedDown.length - sourceScraps.length)
  const allowed: MemeStep = { step: 5, name: 'allowed', count: allowedCount, of: chosenCount, detail: `${turnedDown.length} plans turned down over a meme, ${sourceScraps.length} memes scrapped for their sources${turnedDown[0] ? ` (for example: ${turnedDown[0].slice(0, 160)})` : ''}` }

  const unusable = memeWorks.filter((m) => m.status === 'scrap' && UNUSABLE.test(m.scrapReason))
  const madeWorks = memeWorks.filter((m) => !sourceScraps.includes(m) && !unusable.includes(m))
  const made: MemeStep = { step: 6, name: 'made', count: madeWorks.length, of: memeWorks.length, detail: `${madeWorks.length} meme answers held${unusable.length ? `, ${unusable.length} unusable` : ''}` }

  const passedWorks = madeWorks.filter((m) => m.status !== 'scrap')
  const passed: MemeStep = { step: 7, name: 'passed the work check', count: passedWorks.length, of: madeWorks.length, detail: `${passedWorks.length} passed the browser check, ${madeWorks.length - passedWorks.length} became scraps` }

  const shownWorks = passedWorks.flatMap((m) => {
    const thumb = join(run.world, 'works', m.id, 'thumb.png')
    return existsSync(thumb) ? [{ id: m.id, title: m.title, thumb }] : []
  })
  const shown: MemeStep = { step: 8, name: 'shown', count: shownWorks.length, of: passedWorks.length, detail: `${shownWorks.length} have a picture for the cards and the gallery (in the world: lane W's world checks)` }

  const steps = [offered, read, seen, chosen, allowed, made, passed, shown]
  // A meme that was shown did not stop, even if an earlier count is 0 (a meme chosen inside a sketch call needs no plan step).
  return { steps, stoppedAt: shownWorks.length > 0 ? null : (steps.find((s) => s.count === 0) ?? null), shown: shownWorks }
}

const FIX_FOR_STEP: Record<number, FixKind> = { 1: 'data', 2: 'data', 3: 'prompt', 4: 'prompt', 5: 'code', 6: 'prompt', 7: 'code', 8: 'look' }

export const stepLine = (s: MemeStep): string => `${s.step} ${s.name}: ${s.count === null ? 'unknown' : s.of === null ? s.count : `${s.count} of ${s.of}`}`

/** The meme findings of a run: where memes stop (major), and one `info` per meme shown, with its picture for the look reviewer. */
export function memeFindings(run: RunData): { trail: MemeTrail; results: Omit<CheckResult, 'area'>[] } {
  const trail = memeTrail(run)
  const results: Omit<CheckResult, 'area'>[] = []
  const s = trail.stoppedAt
  if (s) {
    const unknownBefore = trail.steps.filter((x) => x.step < s.step && x.count === null).map((x) => x.name)
    results.push({
      id: 'behaviour.memes',
      fingerprint: `behaviour.memes|${run.label}`,
      severity: 'major',
      fixKind: FIX_FOR_STEP[s.step]!,
      title: `No memes: they stop at step ${s.step}, "${s.name}"`,
      what: `${trail.steps.filter((x) => x.step < s.step).map((x) => x.detail).join('; ')}; but ${s.detail}.${unknownBefore.length ? ` (Unknown before it: ${unknownBefore.join(', ')}.)` : ''}`,
      causes: 'Visitors never see a meme, though meme formats are part of what Merge reads.',
      evidence: [],
      fixture: run.label,
    })
  }
  for (const m of trail.shown) {
    results.push({
      id: 'behaviour.meme-look',
      fingerprint: `behaviour.meme-look|${run.label}|${m.id}`,
      severity: 'info',
      fixKind: 'look',
      title: `Does "${m.title}" read as a meme? (for the look reviewer)`,
      what: `A meme is redrawn in code, never the template picture. The look reviewer decides from the picture whether a visitor sees it as a meme; only text in a box is a major look finding.`,
      causes: 'A meme nobody recognises as one is not a meme to a visitor.',
      evidence: [m.thumb],
      fixture: run.label,
    })
  }
  return { trail, results }
}
