import type { ModelPart, WorldObject } from '@forkling/schema'
import { heightAt } from '@forkling/sim'
import { useFrame } from '@react-three/fiber'
import { BallCollider, ConeCollider, CuboidCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef, useState } from 'react'
import { live } from '../forkling/live.ts'
import { island } from '../island.ts'
import { visitor } from '../visitor.ts'
import { bodyOf, shouldRun, TINKER_RANGE, VISITOR_RANGE } from './contraptionRules.ts'
import { interactPress, reach } from './interact.ts'
import { disposeParts, partsGroup } from './primitives.ts'

/** Rolling and air resistance, the same as the headless run the mind records, so a run looks the way it was told. */
const DAMPING = 0.3

/** One part as a visual: a group holding a single primitive at its own origin, sized for the object's scale. */
function usePartVisual(part: ModelPart, scale: number) {
  const group = useMemo(() => partsGroup([{ ...part, at: [0, 0, 0], size: [part.size[0] * scale, part.size[1] * scale, part.size[2] * scale] }]), [part, scale])
  useEffect(() => () => disposeParts(group), [group])
  return group
}

function Shape({ part, scale, massKg, dynamic }: { part: ModelPart; scale: number; massKg: number; dynamic: boolean }) {
  const [sx, sy, sz] = [part.size[0] * scale, part.size[1] * scale, part.size[2] * scale]
  const mass = dynamic ? { mass: massKg } : {}
  const common = { friction: 0.6, restitution: 0.2, ...mass }
  switch (part.shape) {
    case 'box':
      return <CuboidCollider args={[sx / 2, sy / 2, sz / 2]} {...common} />
    case 'sphere':
      return <BallCollider args={[Math.max(sx, sy, sz) / 2]} {...common} />
    case 'cylinder':
      return <CylinderCollider args={[sy / 2, Math.max(sx, sz) / 2]} {...common} />
    case 'cone':
      return <ConeCollider args={[sy / 2, Math.max(sx, sz) / 2]} {...common} />
  }
}

/** A part while the contraption runs: a body of its own in the physics world, pushed once if it is the trigger. */
function RunningPart({ part, index, object, origin }: { part: ModelPart; index: number; object: WorldObject; origin: [number, number, number] }) {
  const c = object.contraption!
  const { body, massKg } = bodyOf(object, index)
  const dynamic = body === 'dynamic'
  const ref = useRef<RapierRigidBody>(null)
  const visual = usePartVisual(part, object.scale)

  useEffect(() => {
    if (!dynamic || c.trigger.part !== index) return
    // One push, after the body exists in the world.
    const timer = setTimeout(() => ref.current?.applyImpulse({ x: c.trigger.impulse[0], y: c.trigger.impulse[1], z: c.trigger.impulse[2] }, true), 60)
    return () => clearTimeout(timer)
  }, [dynamic, c.trigger, index])

  const s = object.scale
  return (
    <RigidBody
      ref={ref}
      type={dynamic ? 'dynamic' : 'fixed'}
      colliders={false}
      position={[origin[0] + part.at[0] * s, origin[1] + part.at[1] * s, origin[2] + part.at[2] * s]}
      {...(part.rotation ? { rotation: part.rotation } : {})}
      linearDamping={dynamic ? DAMPING : 0}
      angularDamping={dynamic ? DAMPING : 0}
    >
      <Shape part={part} scale={s} massKg={massKg} dynamic={dynamic} />
      <primitive object={visual} />
    </RigidBody>
  )
}

/**
 * An object that runs a physics sequence: at rest it is a plain model. When the forkling starts tinkering with it, or a
 * visitor within reach presses E, its parts become bodies in the physics world and the one push sets them off. After
 * `runSec` it is put back as it was. The mind ran the same sequence headless to know how it ended.
 */
export function Contraption({ object }: { object: WorldObject }) {
  const c = object.contraption!
  const parts = 'parts' in object.model ? object.model.parts : []
  const [x, , z] = object.position
  const y = heightAt(x, z, island)
  const [run, setRun] = useState<number | null>(null)
  const state = useRef({ wasTinkering: false, pressed: false, until: 0, count: 0, seenPresses: interactPress.count() })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyE' && !e.repeat) state.current.pressed = true
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      reach.forget(object.id)
    }
  }, [object.id])

  useFrame(() => {
    const s = state.current
    const playback = live.playback
    const tinkering = Boolean(playback && playback.state.action.id === 'tinker' && Math.hypot(playback.state.pos.x - x, playback.state.pos.z - z) <= TINKER_RANGE)
    const vp = visitor.position
    const running = run !== null
    const distance = vp ? Math.hypot(vp.x - x, vp.z - z) : Infinity
    reach.report(object.id, distance <= VISITOR_RANGE && !running)
    // The touch button counts as the E key: a press since this contraption last looked.
    const touched = interactPress.count() !== s.seenPresses
    s.seenPresses = interactPress.count()
    if (shouldRun({ running, tinkering, wasTinkering: s.wasTinkering, visitorPressed: s.pressed || touched, visitorDistance: distance })) {
      s.count += 1
      s.until = performance.now() + c.runSec * 1000
      setRun(s.count)
    } else if (running && performance.now() > s.until) {
      setRun(null)
    }
    s.wasTinkering = tinkering
    s.pressed = false
  })

  const rest = useMemo(() => partsGroup(parts), [parts])
  useEffect(() => () => disposeParts(rest), [rest])

  if (run === null) {
    return (
      <group position={[x, y, z]} rotation={object.rotation} scale={object.scale} name={object.id}>
        <primitive object={rest} />
      </group>
    )
  }
  return (
    <group name={`${object.id}-running`}>
      {parts.map((part, i) => (
        <RunningPart key={`${run}-${i}`} part={part} index={i} object={object} origin={[x, y, z]} />
      ))}
    </group>
  )
}
