import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { FIXTURES } from '../../fixtures/fixtures.ts'
import { startSession } from './session.ts'

// The background process `pnpm qa explore open` starts: one browser on one world until `pnpm qa explore close`.
const { values, positionals } = parseArgs({ allowPositionals: true, options: { phone: { type: 'boolean', default: false }, headed: { type: 'boolean', default: false }, now: { type: 'string' } } })
const target = positionals[0]!
const world = (FIXTURES as readonly string[]).includes(target) || target === 'live' ? target : resolve(process.env.INIT_CWD ?? process.cwd(), target)
await startSession(world, { phone: values.phone, headed: values.headed, ...(values.now ? { now: values.now } : {}) })
