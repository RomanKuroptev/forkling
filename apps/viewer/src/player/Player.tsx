import { useKeyboardControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Ecctrl, type EcctrlHandle } from 'ecctrl'
import { useButtonStore, useJoystickStore } from 'ecctrl/input'
import { useEffect, useRef } from 'react'
import { parseStand } from '../world/at.ts'
import { useWorld } from '../world/WorldContext.tsx'
import { touchUi } from '../touch.ts'
import { live } from '../forkling/live.ts'
import { visitor } from '../visitor.ts'
import { applyLookDrag, lookEuler, type Look } from './look.ts'
import { mergeMovement } from './touchInput.ts'

const CAPSULE_RADIUS = 0.3
const CAPSULE_HALF_HEIGHT = 0.45
/** Eyes sit this far above the capsule's centre, about 1.6 m above the ground. */
const EYE_OFFSET = 0.7

/** `?clip=Sit` pins the forkling in front of the visitor, so this camera frames it from the side instead. */
/** `?look=forkling` puts the camera 2 m in front of the forkling, facing its face (for screenshots; the walk keys still work but the view stays on it). */
const lookAtForkling = new URLSearchParams(location.search).get('look') === 'forkling'
/** `?dist=` changes how far in front, in meters (default 2). */
const lookDistance = Number(new URLSearchParams(location.search).get('dist')) || 2
/** `?camy=` changes how high the camera is above the ground, in meters (default 0.6). */
const lookHeight = Number(new URLSearchParams(location.search).get('camy')) || 0.6
const clipMode = new URLSearchParams(location.search).has('clip')

/**
 * The visitor: an invisible capsule driven by ecctrl. The camera is its eyes, in first person. Ecctrl walks the way the camera
 * faces, so turning the view turns the walk. Dragging on the canvas (mouse or one finger) looks around.
 */
export function Player() {
  const { simWorld } = useWorld()
  // `?stand=x,z,yaw` starts the visitor somewhere else, to look at a part of the world.
  const at = parseStand(location.search)
  const spawn = at ? { x: at.x, z: at.z, y: simWorld.heightAt(at.x, at.z), yaw: at.yaw } : simWorld.visitorSpawn
  const body = useRef<EcctrlHandle>(null)
  const look = useRef<Look>({ yaw: spawn.yaw, pitch: (Number(new URLSearchParams(location.search).get('pitch')) || 0) * (Math.PI / 180) })
  const frame = useRef(0)
  const [, getKeys] = useKeyboardControls()
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const events = useThree((s) => s.events)

  useEffect(() => {
    // Lets browser tests read the visitor's position and view (`?debug` only).
    if (new URLSearchParams(location.search).has('debug')) {
      Object.assign(window, { __forklingPlayer: () => body.current?.currPos.toArray(), __forklingLook: () => look.current })
    }
    // The cursor is the middle of the screen: every pointer event aims its ray there, wherever the pointer really is.
    events.compute = (_event, state) => {
      state.pointer.set(0, 0)
      state.raycaster.setFromCamera(state.pointer, state.camera)
    }
    if (clipMode) {
      const forward = { x: Math.sin(spawn.yaw), z: Math.cos(spawn.yaw) }
      const cat = { x: spawn.x + forward.x * 3.5, z: spawn.z + forward.z * 3.5 }
      const y = simWorld.heightAt(cat.x, cat.z)
      camera.position.set(cat.x + forward.z * 1.4, y + 0.5, cat.z - forward.x * 1.4)
      camera.lookAt(cat.x, y + 0.2, cat.z)
    }
  }, [])

  // Dragging looks around. Only the first pointer that lands on the canvas does; the stick and buttons are other elements.
  useEffect(() => {
    if (clipMode) return
    const el = gl.domElement
    let id: number | null = null
    let lastX = 0
    let lastY = 0
    const down = (e: PointerEvent) => {
      if (id !== null || (e.pointerType === 'mouse' && e.button !== 0)) return
      id = e.pointerId
      lastX = e.clientX
      lastY = e.clientY
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      look.current = applyLookDrag(look.current, e.clientX - lastX, e.clientY - lastY)
      lastX = e.clientX
      lastY = e.clientY
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId === id) id = null
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [gl])

  useFrame(() => {
    const b = body.current
    if (!b) return
    // The touch controls add to the keyboard; with nothing touched this is the keyboard's state unchanged.
    const stick = touchUi ? (useJoystickStore.getState().joysticks.default ?? { x: 0, y: 0, active: false }) : undefined
    b.setMovement(mergeMovement(getKeys(), stick, { jump: useButtonStore.getState().buttons.jump }))
    const p = b.currPos
    visitor.position = { x: p.x, z: p.z }
    const pb = live.playback
    if (lookAtForkling && pb) {
      const { pos, heading } = pb.state
      const y = simWorld.heightAt(pos.x, pos.z)
      camera.position.set(pos.x + Math.sin(heading) * lookDistance, y + lookHeight, pos.z + Math.cos(heading) * lookDistance)
      camera.lookAt(pos.x, y + 0.55, pos.z)
      return
    }
    if (clipMode) return
    camera.position.set(p.x, p.y + EYE_OFFSET, p.z)
    camera.quaternion.setFromEuler(lookEuler(look.current))
    // The cursor is the middle of the screen, so what it points at changes as the visitor walks and turns, with no pointer move.
    if (++frame.current % 3 === 0) events.update?.()
  })

  return (
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
    />
  )
}
