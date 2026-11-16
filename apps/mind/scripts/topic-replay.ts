/**
 * Would the same-topic write rule (spec 12.3) have refused the pages Merge wrote? Read-only: it reads a clone of a world repo and
 * prints, for each notebook page in a date range, how many earlier pages of the same subject the rule counted, and whether the
 * write step would have been refused. In the "as it would have gone" column a refused page is taken as never written, so it does not
 * count against later ones.
 *
 *   pnpm --filter @forkling/mind topic-replay --world <clone> [--from 2026-11-11] [--to 2026-11-16] [--limit 3] [--days 7]
 */
import { parseArgs } from 'node:util'
import { writesOnTopic, type WrittenPage } from '@forkling/sim'
import { readWrittenPages } from '../src/tick/variety.ts'

const { values: a } = parseArgs({ options: { world: { type: 'string' }, from: { type: 'string', default: '2000-01-01' }, to: { type: 'string', default: new Date().toISOString().slice(0, 10) }, limit: { type: 'string', default: '3' }, days: { type: 'string', default: '7' } } })
if (!a.world) {
  console.error('Pass --world <a clone of the world repo>.')
  process.exit(1)
}
const limit = Number(a.limit)
const days = Number(a.days)
// 60 days back from the end of the range is more than the notebook of a young world holds.
const all = readWrittenPages(a.world, a.to!, 60)
const inRange = (p: WrittenPage) => p.at.slice(0, 10) >= a.from! && p.at.slice(0, 10) <= a.to!

let asGone: WrittenPage[] = []
let refusedStatic = 0
let refusedGone = 0
let shown = 0
console.log(`limit ${limit} in ${days} days; pages ${a.from} to ${a.to}`)
console.log('time              | target / title                          | counted (all earlier) | counted (as it went) | verdict')
for (const [i, page] of all.entries()) {
  const nowMs = Date.parse(page.at)
  const proposal = { target: page.target ?? page.title, reason: page.reason ?? '' }
  const earlierAll = all.slice(0, i)
  const staticHits = writesOnTopic(proposal, earlierAll, { nowMs, days })
  const goneHits = writesOnTopic(proposal, asGone, { nowMs, days })
  const refused = goneHits.length >= limit
  if (!refused) asGone = [...asGone, page]
  if (!inRange(page)) continue
  shown++
  if (staticHits.length >= limit) refusedStatic++
  if (refused) refusedGone++
  console.log(`${page.at.slice(0, 16)} | ${(page.target ?? `(${page.title})`).slice(0, 38).padEnd(38)} | ${String(staticHits.length).padStart(21)} | ${String(goneHits.length).padStart(20)} | ${refused ? 'REFUSED' : 'allowed'}`)
}
console.log(`\n${shown} pages: ${refusedStatic} refused counting every earlier page, ${refusedGone} refused as it would have gone (a refused write is not written).`)
