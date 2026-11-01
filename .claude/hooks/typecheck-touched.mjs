// PostToolUse hook for Edit|Write. Typechecks only the workspace package that
// holds the touched file and prints the errors, if any.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const input = JSON.parse(readFileSync(0, 'utf8'))
const file = String(input.tool_input?.file_path ?? '')
if (!/\.tsx?$/.test(file)) process.exit(0)

const root = String(input.cwd ?? process.cwd())
let dir = dirname(file)
let name
while (dir.length >= root.length && dir !== dirname(dir)) {
  const pkg = join(dir, 'package.json')
  if (existsSync(pkg)) {
    const rel = dir.slice(root.length).replaceAll('\\', '/')
    if (/^\/(packages|apps|species)\//.test(rel)) name = JSON.parse(readFileSync(pkg, 'utf8')).name
    break
  }
  dir = dirname(dir)
}
if (!name) process.exit(0)

const run = spawnSync(`pnpm --filter ${name} typecheck`, { cwd: root, shell: true, encoding: 'utf8' })
const errors = `${run.stdout}${run.stderr}`.split('\n').filter((line) => line.includes('error TS'))
if (errors.length > 0) {
  console.error(`Typecheck errors in ${name}:\n${errors.join('\n')}`)
  process.exit(2)
}
