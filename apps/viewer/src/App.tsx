import { KeyboardControls, Stats, useProgress, type KeyboardControlsEntry } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Suspense } from 'react'
import { debugEnabled } from './debugEnabled.ts'
import { DebugOverlay } from './forkling/DebugOverlay.tsx'
import { Forkling } from './forkling/Forkling.tsx'
import { Player } from './player/Player.tsx'
import { ExhibitPanel } from './ui/ExhibitPanel.tsx'
import { NoteButton } from './ui/NoteForm.tsx'
import { NotePanel } from './ui/NotePanel.tsx'
import { HoverLabel } from './ui/HoverLabel.tsx'
import { desktopHint } from './ui/hint.ts'
import { touchUi } from './touch.ts'
import { useWorld } from './world/WorldContext.tsx'
import { TouchControls } from './ui/TouchControls.tsx'
import { Environment } from './world/Environment.tsx'
import { Fog } from './world/Fog.tsx'
import { Land } from './world/Land.tsx'
import { Notes } from './world/Notes.tsx'
import { Paths } from './world/Paths.tsx'
import { Places } from './world/Places.tsx'

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
  return active ? <div className="loading">Loading… {Math.round(progress)}%</div> : null
}

export function App() {
  // The land with its places, paths and fog. A world with no places is shown as Home and the Workshop (`loadWorld`).
  return (
    <>
      <KeyboardControls map={keyboardMap}>
        <Canvas shadows="percentage" dpr={touchUi ? [1, 1.25] : [1, 1.5]} camera={{ fov: 55, near: 0.1, far: 400 }}>
          <Suspense fallback={null}>
            <Environment />
            <Physics debug={physicsDebug}>
              <Land />
              <Paths />
              <Places />
              <Notes />
              <Fog />
              <Forkling />
              <Player />
            </Physics>
          </Suspense>
          {debug && <Stats />}
        </Canvas>
      </KeyboardControls>
      <Loading />
      <DebugOverlay />
      <HoverLabel />
      <ExhibitPanel />
      <NotePanel />
      <NoteButton />
      {touchUi && <TouchControls />}
      {touchUi ? (
        <div className="hud hud-touch">Left stick to walk · push to the edge to run · drag to look · pinch to zoom</div>
      ) : (
        <DesktopHud />
      )}
    </>
  )
}

/** The key hints. With `?debug`, F3 opens the mind of whichever forkling is being watched. */
function DesktopHud() {
  const { world } = useWorld()
  return <div className="hud">{desktopHint(world.forkling.name, debugEnabled(location.search))}</div>
}
