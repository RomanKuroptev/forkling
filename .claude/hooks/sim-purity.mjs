// PreToolUse hook for Edit|Write. Blocks changes under packages/sim/src/ that
// add Math.random, Date.now( or an import of three, react or node:.
import { existsSync, readFileSync } from 'node:fs'

const banned = [
  ['Math.random', /Math\.random/g],
  ['Date.now(', /Date\.now\(/g],
  ['an import of three, react or node:', /(?:from|import)\s*\(?\s*['"](?:three|react|node:)/g],
]

const count = (text, re) => (text.match(re) ?? []).length

const input = JSON.parse(readFileSync(0, 'utf8'))
const ti = input.tool_input ?? {}
const file = String(ti.file_path ?? '').replaceAll('\\', '/')
if (!/\/packages\/sim\/src\//.test(file)) process.exit(0)

const before = input.tool_name === 'Write' ? (existsSync(ti.file_path) ? readFileSync(ti.file_path, 'utf8') : '') : (ti.old_string ?? '')
const after = input.tool_name === 'Write' ? (ti.content ?? '') : (ti.new_string ?? '')

const hits = banned.filter(([, re]) => count(after, re) > count(before, re)).map(([name]) => name)
if (hits.length > 0) {
  console.error(`Blocked: packages/sim must stay pure and deterministic, but this edit adds ${hits.join(', ')}. Use the seeded PRNG in src/prng.ts and pass time in as an argument.`)
  process.exit(2)
}
