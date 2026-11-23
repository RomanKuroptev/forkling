import { placeAt, advancePlayback, playbackStateTime, resolveSlot, startPlayback, type PlaybackInput } from '@forkling/sim'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { solidBody } from './solidBody.ts'
import { visitor } from '../visitor.ts'
import { disposeParts, partsGroup } from '../world/primitives.ts'
import { useWorld } from '../world/WorldContext.tsx'
import { live } from './live.ts'
import { mergeSpot } from './spot.ts'
import { perchLift } from './perch.ts'
import { createFaceScreen } from './FaceScreen.ts'
import { faceState, type FaceState } from './face.ts'
import { ThoughtBubble } from './ThoughtBubble.tsx'
import { qaMode } from '../qa/params.ts'
import { qaRegistry } from '../qa/registry.ts'

const params = new URLSearchParams(location.search)
/** `?clip=Sit` pins the forkling in front of the visitor looping one clip, to check animation by eye. */
/** `?face=awake|step|asleep|nosignal` shows that face whatever the state is, to look at it. */
const FORCED_FACE = ((): FaceState | null => {
  const f = params.get('face')
  return f === 'awake' || f === 'step' || f === 'asleep' || f === 'nosignal' ? f : null
})()
/** `?clipat=x,z` puts the pinned forkling there (with `?clip=`), to see it on open land. */
const CLIP_AT = ((): { x: number; z: number } | null => {
  const v = (params.get('clipat') ?? '').split(',').map(Number)
  return v.length === 2 && v.every(Number.isFinite) ? { x: v[0]!, z: v[1]! } : null
})()
const FORCED_CLIP = params.get('clip')
/** Slots whose clip plays once and holds, instead of looping. */
const ONCE_SLOTS = new Set(['stretch'])
const FADE = 0.25
/** Further than this from where it's shown, and the forkling is snapped rather than slid (e.g. after a re-sync). */
const SNAP_DISTANCE = 3

/** The body is drawn this much bigger than the sim's own size, so it is easy to spot and its face can be read from across a place. A drawing scale only: the sim's sizes are unchanged. */
const DRAW_SCALE = 2
/** Inside a place the furniture is made for a small cat, so the body is drawn smaller there (the scale eases from one to the other as it walks through the door). */
const INDOOR_SCALE = 1.35

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export function Forkling() {
  const { world, species, simWorld, clock } = useWorld()
  const { spawn } = simWorld
  const gltf = useGLTF(species.modelUrl)
  const group = useRef<THREE.Group>(null)
  const scaler = useRef<THREE.Group>(null)
  const body = useRef<RapierRigidBody>(null)

  // The audit harness (`?qa=1`) finds Merge's drawn body (without the thought pop-up) in `window.__qa.scene()`.
  useEffect(() => {
    if (!qaMode || !scaler.current) return
    qaRegistry.objects.set('merge', { kind: 'merge', object: scaler.current })
    return () => {
      qaRegistry.objects.delete('merge')
    }
  }, [])

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
    // The body is solid, whatever the pack's model ships with (issue 455).
    return solidBody(root)
  }, [gltf])

  // A body may have a screen: a mesh named `Face` is painted with the face (awake, in a step, asleep, no signal) from what the viewer has.
  // Made in an effect, not in render: React may render twice and keep the first result, which would paint a canvas the mesh does not show.
  const screen = useRef<ReturnType<typeof createFaceScreen> | null>(null)
  useEffect(() => {
    let face: THREE.Mesh | null = null
    model.traverse((o) => {
      if (o.name === 'Face' && (o as THREE.Mesh).isMesh) face = o as THREE.Mesh
    })
    if (!face) return
    const made = createFaceScreen(face)
    screen.current = made
    return () => {
      made.dispose()
      screen.current = null
    }
  }, [model])

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
    () => ({
      forkling: world.forkling,
      pack: species.pack,
      behaviors: species.behaviors,
      world: simWorld,
      goals: world.goals,
      stateTime: playbackStateTime(world.forkling),
    }),
    [world, species, simWorld],
  )

  const seats = useMemo(() => simWorld.spots([0, 1, 0]), [simWorld])

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
            micro: s.micro?.behavior.id ?? null,
            hour: clock.hour(),
            time: s.time,
            steps: live.playback!.steps,
            anchor: live.playback!.anchor,
            local: live.playback!.local,
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
      pb.state.pos = CLIP_AT ?? { x: spawn.x + Math.sin(spawn.yaw) * 3.5, z: spawn.z + Math.cos(spawn.yaw) * 3.5 }
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
    // Up on the seat at the desk or the workbench when that is where it is going, and down off the one it is leaving (issue 461).
    const lift = perchLift(seats, { ...(sim.intention.targetId ? { targetId: sim.intention.targetId } : {}), ...(sim.leftSeat ? { from: sim.leftSeat } : {}) }, view.shown)
    const y = simWorld.heightAt(view.shown.x, view.shown.z) + lift

    if (scaler.current) {
      const target = placeAt([view.shown.x, view.shown.z], world.places) ? INDOOR_SCALE : DRAW_SCALE
      const now = scaler.current.scale.x
      scaler.current.scale.setScalar(now + (target - now) * (1 - Math.exp(-dt * 6)))
    }
    if (group.current) {
      group.current.position.set(view.shown.x, y, view.shown.z)
      group.current.rotation.y = view.heading
    }
    body.current?.setNextKinematicTranslation({ x: view.shown.x, y, z: view.shown.z })
    mergeSpot.position = { x: view.shown.x, z: view.shown.z }
    if (scaler.current) mergeSpot.scale = scaler.current.scale.x
    mergeSpot.heading = view.heading

    if (screen.current) {
      const now = clock.now()
      const goal = world.goals.now
      screen.current.paint(FORCED_FACE ?? faceState({ stale: !clock.synced, asleep: Boolean(pb.ctx.asleep), inStep: Boolean(goal && now < Date.parse(goal.until)) }), now / 1000)
    }

    rig.mixer.update(dt)
    const micro = sim.micro?.behavior
    if (micro?.animate && !FORCED_CLIP) {
      micro.animate({ bones: rig.bones, t: sim.elapsed, progress: Math.min(1, sim.elapsed / micro.durationSec) })
    }
    if (!FORCED_CLIP) species.moodPose?.({ bones: rig.bones, t: sim.time, feelings: { valence: world.forkling.mood, arousal: (world.forkling.energy + 1) / 2 } })
  })

  return (
    <>
      <group ref={group}>
        <group ref={scaler} scale={DRAW_SCALE}>
          <primitive object={model} />
        </group>
        <ThoughtBubble />
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
