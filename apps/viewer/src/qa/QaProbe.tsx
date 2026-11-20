import { useProgress } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { chunkAt, placeCentre, toLandPlace } from '@forkling/sim'
import { useJoystickStore } from 'ecctrl/input'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { worldLand } from '../world/worldLand.ts'
import { live } from '../forkling/live.ts'
import { mergeSpot } from '../forkling/spot.ts'
import { useWorld } from '../world/WorldContext.tsx'
import { qaMode, qaTime } from './params.ts'
import { qaRegistry, type QaPose, type Vec3 } from './registry.ts'
import { closeSubject, frontPose, mergeClosePose, type PoseBox } from './cameras.ts'
import { furnitureBoxes } from '../world/solidFurniture.ts'
import { wallBoxes } from '../world/kitGeometry.ts'
import { objectEntry, placeObjects, type QaObject } from './sceneList.ts'
import { coveredDoors, placeFights } from './fights.ts'
import { thinMarks } from './marks.ts'

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
  const camera = useThree((s) => s.camera)
  const root = useThree((s) => s.scene)
  const { simWorld, world } = useWorld()
  // The land the places stand on, built the one way the viewer builds it (`worldLand`).
  const land = useMemo(() => worldLand(world), [world])
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
        // The door is on the front (+z) side of every place; a narrow picture (a phone) stands further back (issue 332).
        const lens = camera as THREE.PerspectiveCamera
        out[`front:${p.id}`] = frontPose(p, snap!.kit, snap!.heightAt(x, z), lens.aspect, lens.fov)
      }
      const pb = live.playback
      if (pb) {
        // Merge as the picture draws it, not the sim's state the drawing is still turning to follow.
        const { pos, heading } = closeSubject(mergeSpot, pb.state)
        // In front of its face, low, like `?look=forkling`, round Merge when furniture or a wall is in the way (issue 348).
        const obstacles: PoseBox[] = (snap?.places ?? []).flatMap((p) => {
          const [px, pz] = placeCentre(toLandPlace(p))
          const base = snap!.heightAt(px, pz)
          return [...furnitureBoxes(p, snap!.kit, base), ...wallBoxes(p).map((w) => ({ min: [w.x0, base, w.z0], max: [w.x1, base + w.height, w.z1] }))]
        })
        out['merge-close'] = mergeClosePose(pos, heading, (x, z) => simWorld.heightAt(x, z), obstacles)
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
      /** Every pair of box surfaces of the places that fight (z-fighting), outside and in: `fights.ts`. */
      fights: () => (qaRegistry.places ? placeFights(qaRegistry.places) : []),
      /** Door parts whose face lies just behind a face of the building, so it covers them: `fights.ts`. */
      coveredDoors: () => (qaRegistry.places ? coveredDoors(qaRegistry.places) : []),
      /** Thin marks of neglect that hang in a room and do not glow (a plank under the ceiling): `marks.ts`. */
      thinMarks: () => (qaRegistry.places ? thinMarks(qaRegistry.places) : []),
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
      /** Where Merge stands as drawn (its middle on the ground, the point the visitor keeps its distance from), its drawing scale, and the way it faces (radians, 0 along +z). */
      merge: () => (mergeSpot.position ? { ...mergeSpot.position, scale: mergeSpot.scale, heading: mergeSpot.heading } : null),
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
      /** The ground height at each point, and whether its chunk holds a place, is edge land or fog. */
      /**
       * What a ray from `origin` along `dir` first meets among the drawn things (not the invisible click targets, not the
       * visitor): its distance and, for a part of a listed object such as Merge, that object's id (`of`); null when it meets
       * nothing within `far` meters.
       */
      ray: (origin: Vec3, dir: Vec3, far: number) => {
        const caster = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...dir).normalize(), 0, far)
        for (const hit of caster.intersectObject(root, true)) {
          const mats = (hit.object as THREE.Mesh).material
          const list = Array.isArray(mats) ? mats : mats ? [mats] : []
          let shown = hit.object.visible
          for (let o = hit.object.parent; o && shown; o = o.parent) shown = o.visible
          if (!shown || list.length === 0 || list.every((m) => m.transparent && m.opacity === 0)) continue
          if (hit.object.type === 'Line' || hit.object.type === 'LineSegments' || hit.object.type === 'Points' || hit.object.type === 'Sprite') continue
          // Which listed object (Merge) the mesh is part of, if any: its animated body can reach outside its listed box.
          let of: string | undefined
          for (let o: THREE.Object3D | null = hit.object; o && !of; o = o.parent) for (const [id, e] of qaRegistry.objects) if (e.object === o) of = id
          return { distance: hit.distance, object: hit.object.name || hit.object.type, ...(of ? { of } : {}) }
        }
        return null
      },
      /** Every texture a drawn material uses whose picture never loaded (no image, or an image of no size), by object name. */
      textures: () => {
        const broken: { object: string; slot: string }[] = []
        root.traverse((o) => {
          const mats = (o as THREE.Mesh).material
          if (!mats || !o.visible) return
          for (const m of Array.isArray(mats) ? mats : [mats]) {
            for (const slot of ['map', 'emissiveMap', 'alphaMap', 'normalMap'] as const) {
              const t = (m as unknown as Record<string, THREE.Texture | null | undefined>)[slot]
              const img = t?.image as { width?: number; data?: unknown } | null | undefined
              if (t && !(img && ((img.width ?? 0) > 0 || img.data))) broken.push({ object: o.name || o.type, slot })
            }
          }
        })
        return broken
      },
      /** World points on the picture, in CSS pixels from the top left, and whether each is in front of the camera and inside the picture. */
      project: (points: Vec3[]) => {
        const size = gl.domElement.getBoundingClientRect()
        return points.map(([x, y, z]) => {
          const v = new THREE.Vector3(x, y, z).project(camera)
          const px = ((v.x + 1) / 2) * size.width
          const py = ((1 - v.y) / 2) * size.height
          return { x: px, y: py, front: v.z > -1 && v.z < 1, visible: v.z > -1 && v.z < 1 && px >= 0 && px <= size.width && py >= 0 && py <= size.height }
        })
      },
      ground: (points: [number, number][]) => points.map(([x, z]) => ({ y: land.heightAt(x, z), chunk: land.classify(chunkAt(x, z)) })),
      look: async (yaw: number, pitch: number) => {
        qaRegistry.player?.setLook(yaw, pitch)
        await step(0)
      },
    }
    Object.assign(window, { __qa: qa })
    return () => {
      delete (window as { __qa?: unknown }).__qa
    }
  }, [gl, advance, camera, root, simWorld, loading, land])
  return null
}
