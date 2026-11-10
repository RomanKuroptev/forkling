/**
 * W0 voice test (spec section 16). Throwaway: it writes only a local report and never touches a world repo.
 *
 *   ANTHROPIC_API_KEY=... pnpm --filter @forkling/mind voice-test -- --merge <clone of RomanKuroptev/merge>
 *
 * Steps: fetch 20 real items from the first allowlist; one Haiku read call each; 50 Haiku thought lines over that day;
 * one Sonnet reflection and one Sonnet diary entry; the sameness measure (spec 12.1) over Merge's pet-era text and the
 * new text. Stops before any call that would take the spend past --cap (default $1).
 *
 * Flags: --out <dir>, --merge <dir>, --cap <usd>, --offset <n> (a different mix of items), --seed-file <path>,
 * --offline (fetch and measure only, no model calls).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import type { z } from 'zod'
import { maxSimilarity, samenessProfile, words, wornPhrases, type SamenessProfile } from '@forkling/sim'
import { costUsd, estimateCallUsd, estimateTokens, type ModelId } from '../src/budget.ts'
import { hasCredentials } from '../src/credentials.ts'
import { anthropicClient, IMAGE_TOKENS, type LlmClient, type LlmImage } from '../src/llm.ts'
import { checkSouvenir } from '../src/web/souvenir.ts'
import {
  claimsHuman, DiaryAnswer, diaryPrompt, ReadAnswer, readPrompt, ReflectionAnswer, reflectionPrompt, system, ThoughtAnswer, thoughtPrompt,
} from './voice/calls.ts'
import { readPast, type PastText } from './voice/history.ts'
import { fetchJpeg, fetchLog, gather, type Item } from './voice/sources.ts'

const here = dirname(fileURLToPath(import.meta.url))
const { values: args } = parseArgs({
  options: {
    out: { type: 'string' },
    merge: { type: 'string' },
    cap: { type: 'string', default: '1' },
    offset: { type: 'string', default: '0' },
    'seed-file': { type: 'string' },
    offline: { type: 'boolean', default: false },
  },
})

const HAIKU: ModelId = 'claude-haiku-5-5'
const SONNET: ModelId = 'claude-sonnet-5-5'
const cap = Number(args.cap)
const offset = Number(args.offset)
const now = new Date()
const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, '-')
const out = resolve(args.out ?? join(here, '..', '..', '..', 'voice-test-out', stamp))
const seed = readFileSync(args['seed-file'] ?? join(here, 'voice', 'seed.md'), 'utf8')
const sys = system(seed)
const log = (line: string) => console.log(line)

if (!args.offline && !hasCredentials(process.env)) {
  console.error('No API key found. Set ANTHROPIC_API_KEY, or run with --offline to fetch and measure only.')
  process.exit(1)
}

// ---- Spending ----

interface Spend { kind: string; model: ModelId; usd: number; input: number; output: number; stop: string | null }
const spend: Spend[] = []
const spent = () => spend.reduce((a, s) => a + s.usd, 0)
let estimated = 0
const client: LlmClient | null = args.offline ? null : anthropicClient()

async function call<T>(kind: string, model: ModelId, user: string, schema: z.ZodType<T>, maxTokens: number, effort: 'low' | 'medium', images: LlmImage[] = []): Promise<T | null> {
  // A large picture costs more than a 512 px frame; 2,000 tokens covers a 1,200 px one.
  const estimate = estimateCallUsd(model, estimateTokens(sys + user) + images.length * IMAGE_TOKENS * 6, maxTokens)
  estimated += estimate
  if (!client) return null
  if (spent() + estimate > cap) {
    log(`  skipped ${kind}: it could take the spend past $${cap}`)
    return null
  }
  try {
    const r = await client.complete({ kind: 'voice', model, system: sys, user, images, maxTokens, effort, schema })
    spend.push({ kind, model, usd: costUsd(model, r.usage), input: r.usage.input + r.usage.cacheRead + r.usage.cacheWrite, output: r.usage.output, stop: r.stopReason })
    if (!r.parsed) log(`  ${kind}: no usable answer (stop reason ${r.stopReason})`)
    return r.parsed
  } catch (error) {
    log(`  ${kind}: failed: ${(error as Error).message}`)
    spend.push({ kind, model, usd: 0, input: 0, output: 0, stop: 'error' })
    return null
  }
}

// ---- 1. Fetch ----

log(`Fetching 20 items (offset ${offset})...`)
const { items, skipped } = await gather(now, offset, log)
log(`Got ${items.length} items, skipped ${skipped.length}.`)

// ---- 2. Read calls ----

interface Read { n: number; item: Item; answer: ReadAnswer | null; souvenir: string }
const reads: Read[] = []
const purpose = 'see what is out there today; nothing in particular'
log('Reading...')
for (const [i, item] of items.entries()) {
  // Records come with a picture: the read call looks at it (spec 7.8), so a meme format is more than its name.
  const jpeg = item.kind === 'record' && item.image && !args.offline ? await fetchJpeg(item.image) : null
  const images: LlmImage[] = jpeg ? [{ mediaType: 'image/jpeg', base64: jpeg }] : []
  const answer = await call(`read ${i + 1}`, HAIKU, readPrompt(item, purpose, images.length > 0), ReadAnswer, 1200, 'low', images)
  let souvenir = 'none'
  if (answer?.souvenir) {
    const s = answer.souvenir
    if (item.tier === 'voices' && s.kind === 'fact') souvenir = 'dropped: a fact from a voices site'
    else {
      const check = checkSouvenir(s.kind === 'fact' ? { kind: 'fact', content: s.content, evidence: s.evidence } : { kind: 'quote', content: s.content }, item.text)
      souvenir = check.ok ? `kept (${s.kind})` : `dropped: ${check.reason}`
    }
  }
  reads.push({ n: i + 1, item, answer, souvenir })
  if (answer) log(`  ${i + 1}. ${item.title}: interest ${answer.interest}, souvenir ${souvenir}`)
}

// ---- 3. Thought ticks over the day ----

const TICKS = 50
const energyWord = (e: number) => (e > 0.3 ? 'rested' : e > -0.1 ? 'a bit tired' : 'tired')
interface Tick { clock: string; events: string[]; answer: ThoughtAnswer | null }
const ticks: Tick[] = []
const recent: string[] = []
let lastItem = -1
log('Thinking...')
for (let t = 0; t < TICKS && reads.length > 0; t++) {
  const idx = Math.floor((t * reads.length) / TICKS)
  const read = reads[idx]!
  const minutes = 9 * 60 + t * 15
  const clock = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  const events: string[] = []
  if (idx !== lastItem) {
    events.push(`Started reading "${read.item.title}" on ${read.item.source}.`)
    if (read.answer) events.push(`My reaction: ${read.answer.reaction}`)
    if (read.souvenir.startsWith('kept') && read.answer?.souvenir) events.push(`Kept a souvenir: "${read.answer.souvenir.content}"`)
    if (read.souvenir.startsWith('dropped')) events.push(`Tried to keep a souvenir but it was dropped (${read.souvenir.slice(9)}).`)
    lastItem = idx
  }
  const energy = 0.5 - idx * 0.05
  const answer = await call(`thought ${t + 1}`, HAIKU, thoughtPrompt({
    clock, mood: `steady, ${energyWord(energy)}`, step: `wander: reading "${read.item.title}" (${read.item.source})`,
    expected: 'to find something worth keeping', events, recent: recent.slice(-5),
  }), ThoughtAnswer, 600, 'low')
  ticks.push({ clock, events, answer })
  if (answer) recent.push(answer.thought)
}

// ---- 4. Reflection and diary ----

const streamLines: string[] = []
for (const r of reads) {
  if (!r.answer) continue
  streamLines.push(`[r${r.n}] read "${r.item.title}" (${r.item.source}), interest ${r.answer.interest}: ${r.answer.reaction}`)
  if (r.souvenir.startsWith('kept') && r.answer.souvenir) streamLines.push(`[s${r.n}] kept a ${r.answer.souvenir.kind}: "${r.answer.souvenir.content}" because ${r.answer.souvenir.why}`)
}
ticks.forEach((t, i) => t.answer && streamLines.push(`[t${i + 1}] ${t.clock} thought: ${t.answer.thought}`))
const stream = streamLines.join('\n')

log('Reflecting...')
const reflection = await call('reflection', SONNET, reflectionPrompt(stream, 'steady, tired'), ReflectionAnswer, 6000, 'medium')
log('Writing the diary...')
const diary = await call('diary', SONNET, diaryPrompt(stream, reflection), DiaryAnswer, 4000, 'low')

// ---- 5. Sameness (spec 12.1) ----

const past: PastText | null = args.merge ? readPast(resolve(args.merge)) : null
const firstFive = (t: string) => words(t).slice(0, 5).join(' ')
const fmt = (p: SamenessProfile) =>
  `${p.count} texts: mean ${p.mean.toFixed(2)}, median ${p.p50.toFixed(2)}, 90th percentile ${p.p90.toFixed(2)}, max ${p.max.toFixed(2)}; over ${Object.entries(p.over).map(([k, v]) => `${k}: ${v} (${p.count ? Math.round((100 * v) / p.count) : 0}%)`).join(', ')}`

const sameness: string[] = []
if (past) {
  const journalTexts = past.journal.map((j) => j.text)
  const sameStart = past.journal.filter((j, i) => past.journal.slice(Math.max(0, i - 14), i).some((o) => firstFive(o.text) === firstFive(j.text))).length
  sameness.push(
    `- **Pet-era thought lines** (window 50; the rail hides a line over 0.6): ${fmt(samenessProfile(past.thoughts, { window: 50, thresholds: [0.35, 0.5, 0.6] }))}`,
    `- **Pet-era plan reasons** (window 30; the writing nudge is 0.35): ${fmt(samenessProfile(past.reasons, { window: 30, thresholds: [0.2, 0.35, 0.5] }))}`,
    `- **Pet-era journal entries** (window 14; the diary nudge is 0.3): ${fmt(samenessProfile(journalTexts, { window: 14, thresholds: [0.1, 0.2, 0.3] }))}; ${sameStart} start with the same 5 words as one of the 14 before`,
  )
  const worn = wornPhrases([...past.thoughts, ...past.reasons, ...journalTexts])
  sameness.push(`- **Worn phrases** in the pet-era text (used 4 or more times): ${worn.length ? worn.slice(0, 15).map((w) => `"${w.phrase}" ×${w.count}`).join(', ') : 'none'}`)
} else {
  sameness.push('- Pet-era text not measured: pass --merge <clone of the merge repo>.')
}
const newThoughts = ticks.flatMap((t) => (t.answer ? [t.answer.thought] : []))
const newReactions = reads.flatMap((r) => (r.answer ? [r.answer.reaction] : []))
if (newThoughts.length) sameness.push(`- **New thought lines** (window 50): ${fmt(samenessProfile(newThoughts, { window: 50, thresholds: [0.35, 0.5, 0.6] }))}`)
if (newReactions.length) sameness.push(`- **New read reactions** (window 20): ${fmt(samenessProfile(newReactions, { window: 20, thresholds: [0.2, 0.35] }))}`)
const newWorn = wornPhrases([...newThoughts, ...newReactions, diary?.entry ?? ''])
if (newThoughts.length) sameness.push(`- **Worn phrases** in the new text: ${newWorn.length ? newWorn.slice(0, 15).map((w) => `"${w.phrase}" ×${w.count}`).join(', ') : 'none'}`)

// ---- 6. Report ----

const human = [...newThoughts, ...newReactions, diary?.entry ?? ''].filter(claimsHuman)
const wc = (t: string) => words(t).length
const q = (t: string) => t.replace(/\n+/g, ' ')
const report: string[] = [
  `# Voice test, ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
  '',
  args.offline ? '**Offline run:** items were fetched and the sameness measured; no model calls were made.' : '',
  `Spend: **$${spent().toFixed(3)}** in ${spend.length} calls (cap $${cap}; the estimate before calling, assuming no cache and full outputs, was $${estimated.toFixed(3)}).`,
  `Items read: ${items.length}. Fetches: ${fetchLog.length}, failed ${fetchLog.filter((f) => f.status !== 200).length}. Hosts: ${[...new Set(fetchLog.map((f) => new URL(f.url).host))].join(', ')}.`,
  human.length ? `**Claims to be human:** ${human.length} (see below).` : 'Claims to be human: none.',
  '',
  '## The seed',
  '',
  ...seed.trim().split('\n').map((l) => `> ${l}`),
  '',
  '## Diary entry (Sonnet)',
  '',
  diary ? `${diary.entry}\n\n(${wc(diary.entry)} words)` : '(no entry)',
  '',
  '## Reflection (Sonnet)',
  '',
  reflection
    ? [
        '**Questions**', '', ...reflection.questions.map((x) => `- ${x}`), '',
        '**Insights**', '', ...reflection.insights.map((x) => `- ${x.text} (cites ${x.cites.join(', ') || 'nothing'})`), '',
        '**Wants**', '', ...reflection.wants.map((x) => `- ${x.kind}: ${x.text}. Why: ${x.why}`),
      ].join('\n')
    : '(no reflection)',
  '',
  '## Reads (Haiku)',
  '',
  '| # | Item | Source | Interest | Topics | Next | Souvenir |',
  '|---|---|---|---|---|---|---|',
  ...reads.map((r) => `| ${r.n} | [${r.item.title.replace(/\|/g, '/')}](${r.item.url}) | ${r.item.source} | ${r.answer?.interest ?? '-'} | ${r.answer?.topics.join(', ') ?? ''} | ${r.answer?.next != null ? (r.item.links[r.answer.next - 1]?.title ?? `#${r.answer.next}`) : 'stop'} | ${r.souvenir} |`),
  '',
  ...reads.flatMap((r) => [
    `**${r.n}. ${r.item.title}.** ${r.answer ? q(r.answer.reaction) : '(no answer)'}`,
    r.answer?.souvenir ? `  Souvenir (${r.answer.souvenir.kind}, ${r.souvenir}): "${q(r.answer.souvenir.content)}"${r.answer.souvenir.evidence ? `; evidence: "${q(r.answer.souvenir.evidence)}"` : ''}. Why: ${r.answer.souvenir.why}` : '',
    '',
  ]).filter((l, i, a) => l !== '' || a[i - 1] !== ''),
  '## Thought lines (Haiku)',
  '',
  ...ticks.map((t, i) => {
    const line = t.answer?.thought ?? '(none)'
    const sim = maxSimilarity(line, newThoughts.slice(Math.max(0, i - 50), i))
    return `${i + 1}. ${t.clock} ${line} _(surprise ${t.answer?.surprise ?? '-'}${sim > 0.6 ? `, hidden by the rail: similarity ${sim.toFixed(2)}` : ''}${line.length > 140 ? `, over 140 characters (${line.length})` : ''})_`
  }),
  '',
  '## Sameness (spec 12.1)',
  '',
  'Similarity is the overlap of word 3-grams with the closest earlier text in the window: 0 shares nothing, 1 is a copy. "Over" counts texts whose closest match is above each threshold.',
  '',
  ...sameness,
  '',
  human.length ? `## Claims to be human\n\n${human.map((h) => `- ${q(h)}`).join('\n')}\n` : '',
  '## Calls',
  '',
  '| Call | Model | In tokens | Out tokens | Stop | $ |',
  '|---|---|---|---|---|---|',
  ...spend.map((s) => `| ${s.kind} | ${s.model.replace('claude-', '')} | ${s.input} | ${s.output} | ${s.stop ?? ''} | ${s.usd.toFixed(4)} |`),
  '',
  skipped.length ? `## Skipped items\n\n${skipped.map((s) => `- ${s}`).join('\n')}\n` : '',
]

mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'report.md'), report.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n'))
writeFileSync(join(out, 'raw.json'), JSON.stringify({ seed, items, reads, ticks, reflection, diary, spend, skipped, fetchLog }, null, 2))
log(`\nReport: ${join(out, 'report.md')}`)
log(`Spend: $${spent().toFixed(3)} (estimate before calling $${estimated.toFixed(3)})`)
