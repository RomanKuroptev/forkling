import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { launchChromium } from '../../browser.ts'
import { FIXTURES, materialize, readQaJson } from '../../fixtures/fixtures.ts'
import { liveClone } from '../../fixtures/command.ts'
import { qaOut } from '../../paths.ts'
import { openWorld, sceneOf, type SceneObject } from '../../world/open.ts'
import { buildViewer, serveWorld, type Served } from '../../world/serve.ts'
import { centre, degrees, frontOf, headingTo, lookAt, radians, type V3 } from './aim.ts'

/**
 * The explorer's session (audit steps QW.1): one browser on one world, kept open between commands so an agent can walk step
 * by step. `pnpm qa explore open` starts it in the background; every other `pnpm qa explore <command>` is one request to it,
 * and prints what happened and the path of the picture taken after it. The agent opens that PNG to look.
 */

export const sessionDir = () => qaOut('explore')
export const sessionFile = () => join(sessionDir(), 'session.json')

export interface Reply {
  text: string
  shot?: string
}

type Qa = {
  step(ms: number): Promise<void>
  press(keys: string | string[], ms: number): Promise<void>
  stick(x: number, y: number, ms: number): Promise<void>
  visitor(): { x: number; y: number; z: number; yaw: number; pitch: number } | null
  teleport(x: number, z: number, yaw?: number): Promise<void>
  look(yaw: number, pitch: number): Promise<void>
  setCamera(pose: string | { position: V3; target: V3 } | null): Promise<void>
  cameras: Record<string, unknown>
  renderer(): Record<string, number>
}

const call = <T>(page: Page, fn: (qa: Qa, arg: unknown) => T | Promise<T>, arg?: unknown): Promise<T> =>
  page.evaluate(({ src, arg }) => {
    const qa = (globalThis as unknown as { __qa: unknown }).__qa
    return (0, eval)(`(${src})`)(qa, arg)
  }, { src: fn.toString(), arg })

const EYE = 1.6
const KEYS: Record<string, string> = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', run: 'ShiftLeft', jump: 'Space' }

export class ExploreSession {
  private n = 0
  private page: Page
  readonly label: string
  constructor(page: Page, label: string) {
    this.page = page
    this.label = label
  }

  private async where(): Promise<{ x: number; y: number; z: number; yaw: number; pitch: number }> {
    const v = await call(this.page, (qa) => qa.visitor())
    if (!v) throw new Error('the visitor is not in the world yet')
    return v
  }

  private async describeWhere(): Promise<string> {
    const v = await this.where()
    const scene = await sceneOf(this.page)
    const inside = scene.find((o) => o.kind === 'place' && o.box && v.x >= o.box.min[0] && v.x <= o.box.max[0] && v.z >= o.box.min[2] && v.z <= o.box.max[2])
    const near = scene
      .filter((o) => o.box && ['place', 'merge', 'work', 'sign'].includes(o.kind))
      .map((o) => ({ o, d: Math.hypot(centre(o.box!)[0] - v.x, centre(o.box!)[2] - v.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 5)
      .map(({ o, d }) => `${o.kind} ${o.id} ${d.toFixed(1)} m`)
    return `at x ${v.x.toFixed(1)}, z ${v.z.toFixed(1)}, facing ${degrees(v.yaw)} deg, looking ${degrees(v.pitch)} deg up; ${inside ? `inside ${inside.id}` : 'outside'}; nearest: ${near.join(', ')}`
  }

  async shot(name = 'view'): Promise<string> {
    mkdirSync(sessionDir(), { recursive: true })
    const file = join(sessionDir(), `${String(++this.n).padStart(3, '0')}-${this.label}-${name.replace(/[^a-z0-9-]+/gi, '-').slice(0, 40)}.png`)
    await this.page.screenshot({ path: file, timeout: 120_000 })
    return file
  }

  private async find(id: string): Promise<SceneObject> {
    const scene = await sceneOf(this.page)
    const hit = scene.find((o) => o.id === id) ?? scene.find((o) => o.kind === id) ?? scene.find((o) => o.id.endsWith(`/${id}`) || o.name?.toLowerCase() === id.toLowerCase())
    if (!hit?.box) throw new Error(`nothing called "${id}" in the scene; try "scene" for the list`)
    return hit
  }

  /** Walks with the real W key toward a point, turning to face it first, in steps of half a second, until close or stuck. */
  private async walkTo(target: { x: number; z: number }, stopAt = 1.2): Promise<string> {
    let last = Infinity
    let stuck = 0
    for (let i = 0; i < 80; i++) {
      const v = await this.where()
      const d = Math.hypot(target.x - v.x, target.z - v.z)
      if (d <= stopAt) return `arrived (${d.toFixed(1)} m away)`
      if (last - d < 0.15) stuck++
      else stuck = 0
      if (stuck >= 3) return `stuck ${d.toFixed(1)} m short, at x ${v.x.toFixed(1)}, z ${v.z.toFixed(1)}: something is in the way`
      last = d
      await call(this.page, (qa, a) => qa.look((a as number[])[0]!, 0), [headingTo(v, target)])
      await call(this.page, (qa, a) => qa.press('KeyW', (a as number[])[0]!), [Math.min(500, (d / 2.5) * 1000)])
    }
    return 'gave up after 40 s of walking'
  }

  async run(command: string, args: string[]): Promise<Reply> {
    const num = (i: number, fallback?: number): number => {
      const v = Number(args[i])
      if (Number.isFinite(v)) return v
      if (fallback !== undefined) return fallback
      throw new Error(`"${command}" needs a number as argument ${i + 1}`)
    }
    // Walking and looking are the visitor's own eyes again: the walk follows the camera, so a named camera must not stay on.
    if (['walk', 'walk-to', 'turn', 'look-up', 'look-down', 'look-at', 'teleport', 'stick'].includes(command)) await call(this.page, (qa) => qa.setCamera(null))
    switch (command) {
      case 'shot':
        return { text: await this.describeWhere(), shot: await this.shot(args[0]) }
      case 'where':
        return { text: await this.describeWhere() }
      case 'scene': {
        const scene = await sceneOf(this.page)
        const kinds = args.length ? scene.filter((o) => args.includes(o.kind)) : scene
        return { text: kinds.map((o) => `${o.kind} ${o.id}${o.name ? ` "${o.name}"` : ''}${o.text ? ` [${o.text}]` : ''} ${o.visible ? 'shown' : 'not drawn now'} ${o.material}${o.box ? ` at ${centre(o.box).map((n) => n.toFixed(1)).join(', ')}` : ''}`).join('\n') }
      }
      case 'walk': {
        // walk forward|back|left|right <ms> [run]
        const key = KEYS[args[0] ?? 'forward']
        if (!key) throw new Error(`walk forward, back, left or right, not ${args[0]}`)
        const keys = args.includes('run') ? [key, KEYS.run!] : [key]
        await call(this.page, (qa, a) => qa.press((a as [string[], number])[0], (a as [string[], number])[1]), [keys, num(1, 1000)])
        return { text: await this.describeWhere(), shot: await this.shot(`walk-${args[0]}`) }
      }
      case 'walk-to': {
        // walk-to <id> | <x> <z>
        let target: { x: number; z: number }
        let name: string
        if (args.length >= 2 && Number.isFinite(Number(args[0]))) {
          target = { x: num(0), z: num(1) }
          name = `${target.x},${target.z}`
        } else {
          const o = await this.find(args[0] ?? '')
          target = o.kind === 'place' ? frontOf(o.box!, 3) : { x: centre(o.box!)[0], z: centre(o.box!)[2] }
          name = o.id
        }
        const result = await this.walkTo(target)
        return { text: `walk to ${name}: ${result}. ${await this.describeWhere()}`, shot: await this.shot(`to-${name}`) }
      }
      case 'turn': {
        const v = await this.where()
        await call(this.page, (qa, a) => qa.look((a as number[])[0]!, (a as number[])[1]!), [v.yaw + radians(num(0)), v.pitch])
        return { text: await this.describeWhere(), shot: await this.shot(`turn-${args[0]}`) }
      }
      case 'look-up':
      case 'look-down': {
        const v = await this.where()
        const deg = num(0, 30) * (command === 'look-up' ? 1 : -1)
        await call(this.page, (qa, a) => qa.look((a as number[])[0]!, (a as number[])[1]!), [v.yaw, Math.max(-1.45, Math.min(1.45, v.pitch + radians(deg)))])
        return { text: await this.describeWhere(), shot: await this.shot(command) }
      }
      case 'look-at': {
        const o = await this.find(args[0] ?? '')
        const v = await this.where()
        const aim = lookAt([v.x, v.y + EYE - 0.9, v.z], centre(o.box!))
        await call(this.page, (qa, a) => qa.look((a as number[])[0]!, (a as number[])[1]!), [aim.yaw, aim.pitch])
        return { text: `looking at ${o.kind} ${o.id}. ${await this.describeWhere()}`, shot: await this.shot(`at-${o.id}`) }
      }
      case 'teleport': {
        await call(this.page, (qa, a) => qa.teleport((a as number[])[0]!, (a as number[])[1]!, (a as number[])[2]), [num(0), num(1), args[2] ? radians(num(2)) : undefined])
        return { text: await this.describeWhere(), shot: await this.shot('teleport') }
      }
      case 'stick': {
        // stick <x> <y> <ms>: the phone stick (open with --phone)
        await call(this.page, (qa, a) => qa.stick((a as number[])[0]!, (a as number[])[1]!, (a as number[])[2]!), [num(0), num(1), num(2, 1000)])
        return { text: await this.describeWhere(), shot: await this.shot('stick') }
      }
      case 'camera': {
        // camera <name> | visitor: a named camera (aerial, front:<place>, merge-close), or back to the visitor's eyes
        const name = args[0] ?? 'visitor'
        await call(this.page, (qa, a) => qa.setCamera((a as string[])[0] === 'visitor' ? null : (a as string[])[0]!), [name])
        const names = await call(this.page, (qa) => Object.keys(qa.cameras))
        return { text: `camera ${name} (cameras: ${names.join(', ')})`, shot: await this.shot(`camera-${name}`) }
      }
      case 'wait': {
        await call(this.page, (qa, a) => qa.step((a as number[])[0]!), [num(0, 1000)])
        return { text: await this.describeWhere(), shot: await this.shot('wait') }
      }
      case 'renderer':
        return { text: JSON.stringify(await call(this.page, (qa) => qa.renderer())) }
      default:
        throw new Error(`no command "${command}"`)
    }
  }
}

/** Starts a session on a fixture, the live clone, or a world folder, and serves commands until `close`. Run in its own process. */
export async function startSession(target: string, opts: { phone: boolean; headed: boolean; now?: string }): Promise<void> {
  let world: string
  let now: string
  if ((FIXTURES as readonly string[]).includes(target)) {
    world = materialize(target, qaOut('explore', 'world'))
    now = opts.now ?? readQaJson(target).now
  } else if (target === 'live') {
    world = liveClone(qaOut())
    now = opts.now ?? new Date().toISOString()
  } else {
    world = target
    now = opts.now ?? readQaJson('', target).now
  }
  const viewer = await buildViewer()
  const served: Served = await serveWorld(viewer, world)
  const browser: Browser = await launchChromium({ headed: opts.headed })
  const page = await openWorld(browser, served.url, { now, phone: opts.phone })
  const session = new ExploreSession(page, `${target.replace(/[^a-z0-9-]+/gi, '-').slice(-20)}${opts.phone ? '-phone' : ''}`)
  let queue = Promise.resolve()
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      queue = queue.then(async () => {
        const { command, args } = JSON.parse(body || '{}') as { command: string; args: string[] }
        let reply: Reply
        let status = 200
        if (command === 'close') {
          reply = { text: 'closed' }
        } else {
          try {
            reply = await session.run(command, args ?? [])
          } catch (e) {
            status = 400
            reply = { text: e instanceof Error ? e.message : String(e) }
          }
        }
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(reply))
        if (command === 'close') {
          await browser.close()
          await served.close()
          rmSync(sessionFile(), { force: true })
          process.exit(0)
        }
      })
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const first = await session.run('shot', ['start'])
  mkdirSync(sessionDir(), { recursive: true })
  writeFileSync(sessionFile(), JSON.stringify({ port: (server.address() as AddressInfo).port, pid: process.pid, target, phone: opts.phone, now, first }))
}
