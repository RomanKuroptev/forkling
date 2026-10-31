import { appendFileSync } from 'node:fs'
import { FEEDS, httpGetJson } from './index.ts'

/** Reads every source once, for real, and says what came back. Used to confirm each is reachable from here and from GitHub Actions. */
const nowMs = Date.now()
const rows: string[] = []
let broken = 0
for (const feed of FEEDS) {
  try {
    const items = await feed.read(httpGetJson, nowMs)
    console.log(`${items.length > 0 ? 'ok  ' : 'EMPTY'} ${feed.name}: ${items.length} items${items[0] ? `, e.g. "${items[0].title}"` : ''}`)
    rows.push(`| ${feed.name} | ${items.length > 0 ? 'ok' : 'empty'} | ${items.length} |`)
    if (items.length === 0) broken++
  } catch (e) {
    console.log(`FAIL ${feed.name}: ${(e as Error).message}`)
    rows.push(`| ${feed.name} | FAILED: ${(e as Error).message} | 0 |`)
    broken++
  }
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['### Feeds', '', '| source | result | items |', '|---|---|---:|', ...rows, ''].join('\n'))
process.exitCode = broken > 0 ? 1 : 0
