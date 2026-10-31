import { KeyboardControls, Stats, useProgress, type KeyboardControlsEntry } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Suspense } from 'react'
import { DebugOverlay } from './forkling/DebugOverlay.tsx'
import { Forkling } from './forkling/Forkling.tsx'
import { GalleryWall } from './art/GalleryWall.tsx'
import { Melody } from './art/Melody.tsx'
import { Player } from './player/Player.tsx'
import { touchUi } from './touch.ts'
import { TouchControls } from './ui/TouchControls.tsx'
import { Environment } from './world/Environment.tsx'
import { Objects } from './world/Objects.tsx'
import { Props } from './world/Props.tsx'
import { Terrain } from './world/Terrain.tsx'
import { Water } from './world/Water.tsx'

const keyboardMap: KeyboardControlsEntry[] = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'leftward', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'rightward', keys: ['ArrowRight', 'KeyD'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
]

const params = new URLSearchParams(location.search)
const debug = params.has('debug')
const physicsDebug = params.get('debug') === 'physics'

function Loading() {
  const { active, progress } = useProgress()
  return active ? <div className="loading">Loading island… {Math.round(progress)}%</div> : null
}

export function App() {
  return (
    <>
      <KeyboardControls map={keyboardMap}>
        <Canvas shadows="percentage" dpr={touchUi ? [1, 1.25] : [1, 1.5]} camera={{ fov: 55, near: 0.1, far: 400 }}>
          <Suspense fallback={null}>
            <Environment />
            <Physics debug={physicsDebug}>
              <Terrain />
              <Props />
              <Objects />
              <GalleryWall />
              <Water />
              <Forkling />
              <Player />
            </Physics>
          </Suspense>
          {debug && <Stats />}
        </Canvas>
      </KeyboardControls>
      <Loading />
      <DebugOverlay />
      {touchUi && <TouchControls />}
      <Melody />
      {touchUi ? (
        <div className="hud hud-touch">Left stick to walk · push to the edge to run · drag to look · pinch to zoom</div>
      ) : (
        <div className="hud">
          WASD / arrows to walk · hold Shift to run · Space to jump · drag to look · scroll to zoom · E near a contraption sets it off · F3 for Merge’s mind
        </div>
      )}
    </>
  )
}
