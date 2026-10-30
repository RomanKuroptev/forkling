import { CameraControls, CameraControlsImpl, useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Ecctrl, type EcctrlHandle } from 'ecctrl'
import { useEffect, useRef } from 'react'
import { heightAt } from '@forkling/sim'
import { island, spawn } from '../island.ts'
import { visitor } from '../visitor.ts'

const CAPSULE_RADIUS = 0.3
const CAPSULE_HALF_HEIGHT = 0.45
/** Camera looks slightly above the body centre, roughly at head height. */
const EYE_OFFSET = 0.5

/** `?clip=Sit` pins the forkling in front of the visitor, so this camera frames it from the side instead. */
const clipMode = new URLSearchParams(location.search).has('clip')

/** The visitor: a simple capsule avatar driven by ecctrl, with an orbiting follow camera. */
export function Player() {
  const body = useRef<EcctrlHandle>(null)
  const camera = useRef<CameraControlsImpl>(null)
  const [, getKeys] = useKeyboardControls()

  useEffect(() => {
    const c = camera.current
    if (!c) return
    // Lets browser tests read the visitor's position (`?debug` only).
    if (new URLSearchParams(location.search).has('debug')) {
      Object.assign(window, { __forklingPlayer: () => body.current?.currPos.toArray() })
    }
    c.mouseButtons.right = CameraControlsImpl.ACTION.NONE
    c.mouseButtons.middle = CameraControlsImpl.ACTION.NONE
    if (clipMode) {
      const forward = { x: Math.sin(spawn.yaw), z: Math.cos(spawn.yaw) }
      const cat = { x: spawn.x + forward.x * 3.5, z: spawn.z + forward.z * 3.5 }
      const y = heightAt(cat.x, cat.z, island)
      c.setLookAt(cat.x + forward.z * 1.4, y + 0.5, cat.z - forward.x * 1.4, cat.x, y + 0.2, cat.z, false)
      return
    }
    // Start behind the visitor, looking inland.
    const back = 7
    c.setLookAt(
      spawn.x - Math.sin(spawn.yaw) * back,
      spawn.y + 4,
      spawn.z - Math.cos(spawn.yaw) * back,
      spawn.x,
      spawn.y + 1,
      spawn.z,
      false,
    )
  }, [])

  useFrame(() => {
    const b = body.current
    const c = camera.current
    if (!b || !c) return
    b.setMovement(getKeys())
    const p = b.currPos
    visitor.position = { x: p.x, z: p.z }
    if (!clipMode) c.moveTo(p.x, p.y + EYE_OFFSET, p.z, true)
  })

  return (
    <>
      <CameraControls
        ref={camera}
        makeDefault
        minDistance={2.5}
        maxDistance={18}
        maxPolarAngle={Math.PI * 0.49}
        smoothTime={0.12}
      />
      <Ecctrl
        ref={body}
        position={[spawn.x, spawn.y + 1.5, spawn.z]}
        rotation={[0, spawn.yaw, 0]}
        capsuleRadius={CAPSULE_RADIUS}
        capsuleHalfHeight={CAPSULE_HALF_HEIGHT}
        maxWalkVel={2.5}
        maxRunVel={6}
        jumpVel={6.5}
        enableToggleRun={false}
      >
        <mesh castShadow>
          <capsuleGeometry args={[CAPSULE_RADIUS, CAPSULE_HALF_HEIGHT * 2, 4, 8]} />
          <meshStandardMaterial color="#f2a65a" flatShading />
        </mesh>
        {/* A little visor so you can tell which way the visitor faces. */}
        <mesh position={[0, CAPSULE_HALF_HEIGHT * 0.8, CAPSULE_RADIUS * 0.85]} castShadow>
          <boxGeometry args={[0.32, 0.12, 0.12]} />
          <meshStandardMaterial color="#2d3a4a" />
        </mesh>
      </Ecctrl>
    </>
  )
}
