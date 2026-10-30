import {
  collectSpots,
  createForkling,
  heightAt,
  nearestWalkable,
  resolveSlot,
  STEP,
  stepForkling,
  sunDirection,
  type Point2,
  type StepContext,
} from '@forkling/sim'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { clock, simSpeed } from '../clock.ts'
import { island, nav, spawn } from '../island.ts'
import { animations, animationSlots, behaviors, modelUrl, pack } from '../species.ts'
import { visitor } from '../visitor.ts'
import { live } from './live.ts'

const params = new URLSearchParams(location.search)
const SEED = Number(params.get('seed')) || 20260101
/** `?clip=Sit` pins the forkling in front of the visitor looping one clip, to check animation by eye. */
const FORCED_CLIP = params.get('clip')
/** Slots whose clip plays once and holds, instead of looping. */
const ONCE_SLOTS = new Set(['stretch'])
/** Minutes of world time between sunbeam refreshes. */
const SPOT_REFRESH_HOURS = 1 / 60
const FADE = 0.25

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export function Forkling() {
  const gltf = useGLTF(modelUrl)
  const group = useRef<THREE.Group>(null)
  const body = useRef<RapierRigidBody>(null)

  const model = useMemo(() => {
    const root = clone(gltf.scene)
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true
        o.receiveShadow = true
        // Skinned bounds don't follow the animation, so don't cull on them.
        o.frustumCulled = false
      }
    })
    return root
  }, [gltf])

  const rig = useMemo(() => {
    const mixer = new THREE.AnimationMixer(model)
    const bones: Record<string, THREE.Object3D> = {}
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones[o.name] = o
    })
    const clips = new Map(gltf.animations.map((c) => [c.name, c]))
    const available = new Set(animationSlots.filter((s) => clips.has(animations[s]!)))
    return { mixer, bones, clips, available }
  }, [model, gltf])

  const world = useMemo(() => {
    const start = FORCED_CLIP
      ? // In front of the visitor spawn, facing it.
        { x: spawn.x - Math.sin(spawn.yaw) * -3.5, z: spawn.z - Math.cos(spawn.yaw) * -3.5 }
      : (nearestWalkable(nav.grid, { x: spawn.x * 0.75, z: spawn.z * 0.75 }) as Point2)
    const sim = createForkling(pack, behaviors, SEED, start)
    const ctx: StepContext = { grid: nav.grid, visitor: null, timeOfDay: 12, spots: {} }
    return { sim, ctx, shown: { ...start }, heading: sim.heading, accumulator: 0, spotHour: -1, current: null as null | THREE.AnimationAction, currentSlot: '' }
  }, [])

  // Published from an effect, not the memo above: StrictMode runs memos twice and keeps only one result.
  useEffect(() => {
    const { sim } = world
    live.state = sim
    // Lets browser tests read the forkling's state (`?debug` only).
    if (params.has('debug')) {
      Object.assign(window, {
        __forkling: () => ({
          pos: sim.pos,
          phase: sim.phase,
          slot: sim.slot,
          intention: sim.intention,
          needs: sim.needs,
          micro: sim.micro?.behavior.id ?? null,
          hour: clock.hour(),
          time: sim.time,
        }),
      })
    }
    return () => {
      live.state = null
    }
  }, [world])

  useFrame((_, delta) => {
    const { sim, ctx } = world
    const dt = Math.min(delta, 0.25)
    const hour = clock.hour()

    if (FORCED_CLIP) {
      if (world.currentSlot !== FORCED_CLIP) {
        const clip = rig.clips.get(FORCED_CLIP)
        if (clip) fade(world, rig.mixer.clipAction(clip), FORCED_CLIP, false)
      }
      sim.heading = Math.atan2(-Math.sin(spawn.yaw), -Math.cos(spawn.yaw))
    } else {
      // Refresh the world's spots about once a simulated minute: sunbeams drift as the sun moves.
      if (Math.abs(hour - world.spotHour) > SPOT_REFRESH_HOURS || world.spotHour < 0) {
        world.spotHour = hour
        ctx.spots = collectSpots(pack, island, nav, spawn, sunDirection(hour))
      }
      ctx.visitor = visitor.position
      ctx.timeOfDay = hour

      world.accumulator += dt * simSpeed
      let steps = 0
      while (world.accumulator >= STEP && steps < 60) {
        stepForkling(sim, STEP, ctx)
        world.accumulator -= STEP
        steps++
      }
      if (steps === 60) world.accumulator = 0

      const slot = resolveSlot(sim.slot, rig.available)
      if (slot && slot !== world.currentSlot) {
        const clip = rig.clips.get(animations[slot]!)
        if (clip) fade(world, rig.mixer.clipAction(clip), slot, ONCE_SLOTS.has(slot))
      }
    }

    // Smooth the 10 Hz sim into the frame rate.
    const follow = 1 - Math.exp(-dt * 18)
    world.shown.x += (sim.pos.x - world.shown.x) * follow
    world.shown.z += (sim.pos.z - world.shown.z) * follow
    world.heading += wrapAngle(sim.heading - world.heading) * (1 - Math.exp(-dt * 10))
    const y = heightAt(world.shown.x, world.shown.z, island)

    if (group.current) {
      group.current.position.set(world.shown.x, y, world.shown.z)
      group.current.rotation.y = world.heading
    }
    body.current?.setNextKinematicTranslation({ x: world.shown.x, y, z: world.shown.z })

    rig.mixer.update(dt)
    const micro = sim.micro?.behavior
    if (micro?.animate && !FORCED_CLIP) {
      micro.animate({ bones: rig.bones, t: sim.elapsed, progress: Math.min(1, sim.elapsed / micro.durationSec) })
    }
  })

  return (
    <>
      <group ref={group}>
        <primitive object={model} />
      </group>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[spawn.x, 0, spawn.z]}>
        <CapsuleCollider args={[0.1, 0.22]} position={[0, 0.32, 0]} />
      </RigidBody>
    </>
  )
}

/** Crossfade from whatever is playing to `next`. */
function fade(
  world: { current: THREE.AnimationAction | null; currentSlot: string },
  next: THREE.AnimationAction,
  slot: string,
  once: boolean,
) {
  next.reset()
  next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity)
  next.clampWhenFinished = once
  next.fadeIn(FADE).play()
  world.current?.fadeOut(FADE)
  world.current = next
  world.currentSlot = slot
}
