import { useProgress } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { placeCentre, toLandPlace } from '@forkling/sim'
import { useJoystickStore } from 'ecctrl/input'
import { useEffect, useRef } from 'react'
import { live } from '../forkling/live.ts'
import { useWorld } from '../world/WorldContext.tsx'
import { qaMode, qaTime } from './params.ts'
import { qaRegistry, type QaPose, type Vec3 } from './registry.ts'
import { objectEntry, placeObjects, type QaObject } from './sceneList.ts'

/** One stepped frame: the world moves this many milliseconds each time the harness draws. */
export const QA_FRAME_MS = 1000 / 30

/** Capsule size of the visitor (`Player.tsx`), for its box in the scene list. */
const VISITOR = { radius: 0.3, halfHeight: 0.75 }

/**
 * `window.__qa` (docs/spec/audit/spec.md 7.1), mounted inside the Canvas only with `?qa=1`. Under `?qa=1` the frame loop
 * never runs on its own: every frame is drawn by `step`, so a picture depends only on the address and the steps taken.
 */
export function QaProbe() {
  const gl = useThree((s) => s.gl)
  const advance = useThree((s) => s.advance)
  const { simWorld } = useWorld()
  const progress = useProgress()
  // The loading manager's state, read by `ready` (the hook's value is from the last render).
  const loading = useRef(progress)
  loading.current = progress

  useEffect(() => {
    if (!qaMode) return
    // Count every pass of a frame (the glow and scanlines draw more than once), reset by `frame` before each one.
    gl.info.autoReset = false
    let drawn = 0
    let seconds = 0
    const frame = (ms: number) => {
      qaTime.elapsedMs += ms
      seconds += ms / 1000
      gl.info.reset()
      advance(seconds, true)
      drawn++
    }
    // A frame that moves the world (the clock, physics, Merge, the walk) without drawing it. Drawing every stepped frame
    // queues them all for the GPU, which in software rendering can take minutes to catch up, and a screenshot waits for it.
    const silent = (ms: number) => {
      const render = gl.render
      gl.render = () => {}
      try {
        qaTime.elapsedMs += ms
        seconds += ms / 1000
        advance(seconds, true)
      } finally {
        gl.render = render
      }
    }
    const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
    const step = async (ms: number) => {
      let left = Math.max(0, ms)
      while (left > 0) {
        const dt = Math.min(QA_FRAME_MS, left)
        silent(dt)
        left -= dt
      }
      // React commits what the frames changed (the insides near the visitor, a model that loaded), then one more frame draws it.
      await settle()
      frame(0)
    }
    const loadedEnough = () => {
      const l = loading.current
      const m = qaRegistry.models
      return !l.active && l.loaded >= l.total && m.settled >= m.total && qaRegistry.places !== null && qaRegistry.objects.has('merge') && live.playback !== null && document.fonts.status === 'loaded'
    }
    const centre = (): Vec3 => {
      const places = qaRegistry.places?.places ?? []
      if (places.length === 0) return [0, 0, 0]
      const xs = places.map((p) => placeCentre(toLandPlace(p)))
      return [xs.reduce((a, p) => a + p[0], 0) / xs.length, 0, xs.reduce((a, p) => a + p[1], 0) / xs.length]
    }
    const cameras = (): Record<string, QaPose> => {
      const out: Record<string, QaPose> = {}
      const [cx, , cz] = centre()
      out.aerial = { position: [cx, 70, cz + 70], target: [cx, 0, cz] }
      const snap = qaRegistry.places
      for (const p of snap?.places ?? []) {
        const [x, z] = placeCentre(toLandPlace(p))
        const y = snap!.heightAt(x, z)
        // The door is on the front (+z) side of every place.
        out[`front:${p.id}`] = { position: [x, y + 1.6, z + p.exterior.footprint[1] / 2 + 7], target: [x, y + 2, z] }
      }
      const pb = live.playback
      if (pb) {
        const { pos, heading } = pb.state
        const y = simWorld.heightAt(pos.x, pos.z)
        // In front of its face, low, like `?look=forkling`.
        out['merge-close'] = { position: [pos.x + Math.sin(heading) * 1.5, y + 0.7, pos.z + Math.cos(heading) * 1.5], target: [pos.x, y + 0.4, pos.z] }
      }
      return out
    }
    const scene = (): QaObject[] => {
      const list = qaRegistry.places ? placeObjects(qaRegistry.places) : []
      for (const [id, { kind, object }] of qaRegistry.objects) list.push(objectEntry(id, kind, object))
      const player = qaRegistry.player
      if (player) {
        const [x, y, z] = player.position()
        list.push({ id: 'visitor', kind: 'visitor', box: { min: [x - VISITOR.radius, y - VISITOR.halfHeight, z - VISITOR.radius], max: [x + VISITOR.radius, y + VISITOR.halfHeight, z + VISITOR.radius] }, visible: false, material: 'none' })
      }
      return list
    }
    const qa = {
      seed: qaMode.seed,
      get ready() {
        if (!loadedEnough()) return false
        // The first frame is drawn as soon as everything has loaded, so `ready` means there is a picture.
        if (drawn === 0) frame(0)
        return true
      },
      step,
      now: () => qaMode!.now + qaTime.elapsedMs,
      scene,
      renderer: () => ({
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        textures: gl.info.memory.textures,
        geometries: gl.info.memory.geometries,
        programs: gl.info.programs?.length ?? 0,
        frames: drawn,
      }),
      get cameras() {
        return cameras()
      },
      /** A named camera from `cameras`, a pose, or `'visitor'` (or null) for the visitor's own eyes again. Draws one frame. */
      setCamera: async (pose: string | QaPose | null) => {
        if (pose === null || pose === 'visitor') qaRegistry.camera = null
        else if (typeof pose === 'string') {
          const named = cameras()[pose]
          if (!named) throw new Error(`no camera named ${pose}; there are ${Object.keys(cameras()).join(', ')}`)
          qaRegistry.camera = named
        } else qaRegistry.camera = pose
        await step(0)
      },
      /** Frames drawn per second of real time, drawing as fast as the browser lets it for `seconds`. */
      fps: (seconds: number) =>
        new Promise<number>((resolve) => {
          const start = performance.now()
          let frames = 0
          const tick = () => {
            frame(QA_FRAME_MS)
            frames++
            const elapsed = (performance.now() - start) / 1000
            if (elapsed >= seconds) resolve(frames / elapsed)
            else requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }),
      /** Holds keys (`KeyW`, `ShiftLeft`, ...) for `ms` of world time, the way a visitor presses them. */
      press: async (codes: string | string[], ms: number) => {
        const list = typeof codes === 'string' ? [codes] : codes
        for (const code of list) window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code }))
        await step(ms)
        for (const code of list) window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code }))
        await step(QA_FRAME_MS)
      },
      /** Pushes the phone stick (x right, y forward, each -1 to 1) for `ms`. Needs the touch controls (`?touch=1`). */
      stick: async (x: number, y: number, ms: number) => {
        useJoystickStore.getState().setJoystick(x, y)
        await step(ms)
        useJoystickStore.getState().resetJoystick()
        await step(QA_FRAME_MS)
      },
      visitor: () => {
        const p = qaRegistry.player
        if (!p) return null
        const [x, y, z] = p.position()
        return { x, y, z, ...p.look() }
      },
      /** Puts the visitor somewhere on the ground, facing `yaw`, and looks with the visitor's eyes again. */
      teleport: async (x: number, z: number, yaw?: number) => {
        qaRegistry.camera = null
        qaRegistry.player?.teleport(x, z, yaw)
        await step(QA_FRAME_MS * 3)
      },
      look: async (yaw: number, pitch: number) => {
        qaRegistry.player?.setLook(yaw, pitch)
        await step(0)
      },
    }
    Object.assign(window, { __qa: qa })
    return () => {
      delete (window as { __qa?: unknown }).__qa
    }
  }, [gl, advance, simWorld, loading])
  return null
}
