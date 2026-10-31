import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Suspense, useRef } from 'react'
import type { PerspectiveCamera } from 'three'
import { GalleryWall } from '../art/GalleryWall.tsx'
import { Environment } from '../world/Environment.tsx'
import { Objects } from '../world/Objects.tsx'
import { Props } from '../world/Props.tsx'
import { Terrain } from '../world/Terrain.tsx'
import { useWorld } from '../world/WorldContext.tsx'
import { Water } from '../world/Water.tsx'
import type { EyeCamShot } from './params.ts'

declare global {
  interface Window {
    /** Set once the frame has been drawn with everything loaded, so a headless browser knows when to take it. */
    __eyecamReady?: boolean
  }
}

/** The camera sits at the eye and looks at the subject, with the species' own field of view. */
function Rig({ shot, fovDeg }: { shot: EyeCamShot; fovDeg: number }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  useFrame(() => {
    camera.position.set(...shot.eye)
    camera.fov = fovDeg
    camera.lookAt(...shot.look)
    camera.updateProjectionMatrix()
  })
  return null
}

/** Mounts only once everything under the same Suspense has loaded; flags readiness after a few frames have been drawn. */
function Ready() {
  const frames = useRef(0)
  useFrame(() => {
    frames.current += 1
    if (frames.current === 3) window.__eyecamReady = true
  })
  return null
}

/**
 * What the forkling's own eyes see: the world from `shot.eye` at the world clock's moment (`?at=`), square, with no
 * body, controls or interface. The renderer script screenshots this page to make the frame for a photo.
 */
export function EyeCam({ shot }: { shot: EyeCamShot }) {
  const { world } = useWorld()
  const fovDeg = world.pack.perception.fovDeg
  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh' }}>
      <Canvas shadows="percentage" dpr={1} gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ fov: fovDeg, near: 0.05, far: 400 }}>
        <Suspense fallback={null}>
          <Environment />
          <Physics>
            <Terrain />
            <Props />
            <Objects />
            <GalleryWall />
            <Water />
          </Physics>
          <Rig shot={shot} fovDeg={fovDeg} />
          <Ready />
        </Suspense>
      </Canvas>
    </div>
  )
}
