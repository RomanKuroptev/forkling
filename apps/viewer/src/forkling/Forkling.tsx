import { advancePlayback, heightAt, resolveSlot, startPlayback, type PlaybackInput } from '@forkling/sim'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { island, spawn } from '../island.ts'
import { visitor } from '../visitor.ts'
import { useWorld } from '../world/WorldContext.tsx'
import { live } from './live.ts'

const params = new URLSearchParams(location.search)
/** `?clip=Sit` pins the forkling in front of the visitor looping one clip, to check animation by eye. */
const FORCED_CLIP = params.get('clip')
/** Slots whose clip plays once and holds, instead of looping. */
const ONCE_SLOTS = new Set(['stretch'])
const FADE = 0.25
/** Further than this from where it's shown, and the forkling is snapped rather than slid (e.g. after a re-sync). */
const SNAP_DISTANCE = 3

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export function Forkling() {
  const { world, species, simWorld, clock } = useWorld()
  const gltf = useGLTF(species.modelUrl)
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
    const available = new Set(species.slots.filter((s) => clips.has(species.animations[s]!)))
    return { mixer, bones, clips, available }
  }, [model, gltf, species])

  const input = useMemo<PlaybackInput>(
    () => ({ forkling: world.forkling, pack: species.pack, behaviors: species.behaviors, world: simWorld }),
    [world, species, simWorld],
  )

  const view = useMemo(
    () => ({ shown: null as { x: number; z: number } | null, heading: 0, current: null as THREE.AnimationAction | null, currentSlot: '' }),
    [],
  )

  useEffect(() => {
    live.playback = startPlayback(input, clock.now())
    // Lets browser tests read the forkling's state (`?debug` only).
    if (params.has('debug')) {
      Object.assign(window, {
        __forkling: () => {
          const s = live.playback!.state
          return {
            pos: s.pos,
            phase: s.phase,
            slot: s.slot,
            intention: s.intention,
            needs: s.needs,
            micro: s.micro?.behavior.id ?? null,
            hour: clock.hour(),
            time: s.time,
            steps: live.playback!.steps,
            anchor: live.playback!.anchor,
          }
        },
      })
    }
    return () => {
      live.playback = null
    }
  }, [input, clock])

  useFrame((_, delta) => {
    let pb = live.playback
    if (!pb) return
    const dt = Math.min(delta, 0.25)

    if (FORCED_CLIP) {
      // In front of the visitor spawn, facing it.
      pb.state.pos = { x: spawn.x + Math.sin(spawn.yaw) * 3.5, z: spawn.z + Math.cos(spawn.yaw) * 3.5 }
      pb.state.heading = Math.atan2(-Math.sin(spawn.yaw), -Math.cos(spawn.yaw))
      if (view.currentSlot !== FORCED_CLIP) {
        const clip = rig.clips.get(FORCED_CLIP)
        if (clip) fade(view, rig.mixer.clipAction(clip), FORCED_CLIP, false)
      }
    } else {
      pb = advancePlayback(pb, clock.now(), visitor.position)
      live.playback = pb
      const slot = resolveSlot(pb.state.slot, rig.available)
      if (slot && slot !== view.currentSlot) {
        const clip = rig.clips.get(species.animations[slot]!)
        if (clip) fade(view, rig.mixer.clipAction(clip), slot, ONCE_SLOTS.has(slot))
      }
    }
    const sim = pb.state

    // Smooth the 10 Hz sim into the frame rate, but snap after a jump.
    if (!view.shown || Math.hypot(sim.pos.x - view.shown.x, sim.pos.z - view.shown.z) > SNAP_DISTANCE) {
      view.shown = { ...sim.pos }
      view.heading = sim.heading
    }
    const follow = 1 - Math.exp(-dt * 18)
    view.shown.x += (sim.pos.x - view.shown.x) * follow
    view.shown.z += (sim.pos.z - view.shown.z) * follow
    view.heading += wrapAngle(sim.heading - view.heading) * (1 - Math.exp(-dt * 10))
    const y = heightAt(view.shown.x, view.shown.z, island)

    if (group.current) {
      group.current.position.set(view.shown.x, y, view.shown.z)
      group.current.rotation.y = view.heading
    }
    body.current?.setNextKinematicTranslation({ x: view.shown.x, y, z: view.shown.z })

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
  view: { current: THREE.AnimationAction | null; currentSlot: string },
  next: THREE.AnimationAction,
  slot: string,
  once: boolean,
) {
  next.reset()
  next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity)
  next.clampWhenFinished = once
  next.fadeIn(FADE).play()
  view.current?.fadeOut(FADE)
  view.current = next
  view.currentSlot = slot
}
