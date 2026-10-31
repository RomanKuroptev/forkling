import RAPIER from '@dimforge/rapier3d-compat'
import type { ModelPart, WorldObject } from '@forkling/schema'

/** A part has to travel at least this far, in meters, for the contraption to count as having done something. */
export const MOVED_METERS = 0.05
/** At the end of the run, moving parts slower than this are at rest. */
const REST_SPEED = 0.05
const REST_SPIN = 0.2
/** A part this far from where it started, or this far below the ground, has left the island. */
const ESCAPE_METERS = 10
const FALL_BELOW = -5
const STEP = 1 / 60
/** Rolling and air resistance, so a rolling part comes to rest. */
const DAMPING = 0.3

export interface ContraptionRun {
  /** Some part travelled further than `MOVED_METERS`. */
  moved: boolean
  /** The furthest any moving part got from where it started, in meters. */
  maxTravel: number
  /** Every moving part was at rest at the end. */
  settled: boolean
  /** A part left the island. */
  escaped: boolean
}

let ready: Promise<void> | null = null

/** Euler angles in three.js's XYZ order as a quaternion, which is how the viewer turns a part. */
function quaternion([x, y, z]: readonly [number, number, number]): { x: number; y: number; z: number; w: number } {
  const [c1, c2, c3] = [Math.cos(x / 2), Math.cos(y / 2), Math.cos(z / 2)]
  const [s1, s2, s3] = [Math.sin(x / 2), Math.sin(y / 2), Math.sin(z / 2)]
  return { x: s1 * c2 * c3 + c1 * s2 * s3, y: c1 * s2 * c3 - s1 * c2 * s3, z: c1 * c2 * s3 + s1 * s2 * c3, w: c1 * c2 * c3 - s1 * s2 * s3 }
}

function shapeFor(part: ModelPart, scale: number): RAPIER.ColliderDesc {
  const [sx, sy, sz] = part.size.map((n) => n * scale) as [number, number, number]
  switch (part.shape) {
    case 'box':
      return RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2)
    case 'sphere':
      return RAPIER.ColliderDesc.ball(Math.max(sx, sy, sz) / 2)
    case 'cylinder':
      return RAPIER.ColliderDesc.cylinder(sy / 2, Math.max(sx, sz) / 2)
    case 'cone':
      return RAPIER.ColliderDesc.cone(sy / 2, Math.max(sx, sz) / 2)
  }
}

/**
 * Plays a contraption out headless: the parts that move are dynamic bodies, everything else is fixed, the ground is flat
 * at the object's base, and one push on the trigger part sets it off. Deterministic for the same engine version and
 * inputs, so what the mind records is what a visitor sees. Null for an object that is not a contraption.
 */
export async function runContraption(object: WorldObject): Promise<ContraptionRun | null> {
  const c = object.contraption
  if (!c || !('parts' in object.model)) return null
  ready ??= RAPIER.init()
  await ready

  const scale = object.scale
  const parts = object.model.parts
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = STEP
  world.createCollider(RAPIER.ColliderDesc.cuboid(100, 0.5, 100).setTranslation(0, -0.5, 0).setFriction(0.8))

  const moving = new Map<number, { body: RAPIER.RigidBody; start: { x: number; y: number; z: number } }>()
  parts.forEach((p, index) => {
    const spec = c.bodies.find((b) => b.part === index)
    const dynamic = spec?.body === 'dynamic'
    const [x, y, z] = [p.at[0] * scale, p.at[1] * scale, p.at[2] * scale]
    const desc = (dynamic ? RAPIER.RigidBodyDesc.dynamic().setLinearDamping(DAMPING).setAngularDamping(DAMPING) : RAPIER.RigidBodyDesc.fixed()).setTranslation(x, y, z)
    if (p.rotation) desc.setRotation(quaternion(p.rotation))
    const body = world.createRigidBody(desc)
    const collider = shapeFor(p, scale).setFriction(0.6).setRestitution(0.2)
    if (dynamic) collider.setMass(spec.massKg)
    world.createCollider(collider, body)
    if (dynamic) moving.set(index, { body, start: { x, y, z } })
  })

  const pushed = moving.get(c.trigger.part)
  pushed?.body.applyImpulse({ x: c.trigger.impulse[0], y: c.trigger.impulse[1], z: c.trigger.impulse[2] }, true)

  let maxTravel = 0
  let escaped = false
  const steps = Math.round(c.runSec / STEP)
  for (let i = 0; i < steps; i++) {
    world.step()
    for (const { body, start } of moving.values()) {
      const t = body.translation()
      const travel = Math.hypot(t.x - start.x, t.y - start.y, t.z - start.z)
      maxTravel = Math.max(maxTravel, travel)
      if (travel > ESCAPE_METERS || t.y < FALL_BELOW) escaped = true
    }
  }
  const settled = [...moving.values()].every(({ body }) => {
    const v = body.linvel()
    const w = body.angvel()
    return Math.hypot(v.x, v.y, v.z) < REST_SPEED && Math.hypot(w.x, w.y, w.z) < REST_SPIN
  })
  world.free()
  return { moved: maxTravel > MOVED_METERS, maxTravel: Math.round(maxTravel * 1000) / 1000, settled, escaped }
}
