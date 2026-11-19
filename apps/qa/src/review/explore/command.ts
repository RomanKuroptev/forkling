import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sessionDir, sessionFile, type Reply } from './session.ts'

export const EXPLORE_USAGE = `  explore open <fixture|live|world dir> [--phone] [--headed] [--now <iso>]   start walking a world (day-0, day-7, day-30, night, building, live)
  explore <command> [args]     one step in the open world; prints what happened and the path of the picture taken:
          shot [name] | where | scene [kind...] | walk forward|back|left|right <ms> [run] | walk-to <id> | walk-to <x> <z>
          turn <deg> | look-up [deg] | look-down [deg] | look-at <id> | teleport <x> <z> [deg] | stick <x> <y> <ms> (phone)
          camera <aerial|front:<place>|merge-close|visitor> | wait <ms> | renderer | close`

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const print = (r: Reply) => console.log(r.shot ? `${r.text}\npicture: ${r.shot}` : r.text)

async function send(command: string, args: string[]): Promise<number> {
  if (!existsSync(sessionFile())) {
    console.log('no world is open: start with `pnpm qa explore open <fixture>`')
    return 2
  }
  const { port } = JSON.parse(readFileSync(sessionFile(), 'utf8')) as { port: number }
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, { method: 'POST', body: JSON.stringify({ command, args }) })
    print((await res.json()) as Reply)
    return res.ok ? 0 : 1
  } catch {
    rmSync(sessionFile(), { force: true })
    console.log('the explorer session has gone away: open the world again')
    return 2
  }
}

export async function exploreCommand(argv: string[]): Promise<number> {
  const [command, ...args] = argv
  if (!command) {
    console.log(EXPLORE_USAGE)
    return 2
  }
  if (command !== 'open') return send(command, args)
  const target = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--now')
  if (!target) {
    console.log(EXPLORE_USAGE)
    return 2
  }
  if (existsSync(sessionFile())) await send('close', [])
  mkdirSync(sessionDir(), { recursive: true })
  const log = join(sessionDir(), 'session.log')
  const out = openSync(log, 'w')
  const daemon = fileURLToPath(new URL('./daemon.ts', import.meta.url))
  const child = spawn(process.execPath, [daemon, ...args], { detached: true, stdio: ['ignore', out, out], windowsHide: true })
  child.unref()
  for (let i = 0; i < 240; i++) {
    await sleep(500)
    if (existsSync(sessionFile())) {
      const s = JSON.parse(readFileSync(sessionFile(), 'utf8')) as { first: Reply; now: string }
      print({ ...s.first, text: `${target} open at ${s.now}. ${s.first.text}` })
      return 0
    }
    if (child.exitCode !== null) break
  }
  console.log(`the world did not open; see ${log}:\n${existsSync(log) ? readFileSync(log, 'utf8').slice(-1500) : ''}`)
  return 1
}
