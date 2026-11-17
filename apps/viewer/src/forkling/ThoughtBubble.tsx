import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useWorld } from '../world/WorldContext.tsx'
import { bubbleHidden } from './bubbleHidden.ts'
import { live } from './live.ts'
import { clampPopup, fitPopup } from './popup.ts'
import { bubbleLines, type BubbleLine } from './thoughts.ts'

/** How often the bubble re-reads the body. The sim runs at 10 Hz, but nobody reads a thought that fast. */
const REFRESH_MS = 1000

const LABEL: Record<BubbleLine['kind'], string> = { goal: 'wants', step: 'now', reason: 'because', sleep: '' }

/** What the forkling wants right now and why, floating over it. Reads the repo's goals and the body's live intention. */
export function ThoughtBubble() {
  const { world, clock } = useWorld()
  const [lines, setLines] = useState<BubbleLine[] | null>(null)
  const hidden = useSyncExternalStore(bubbleHidden.subscribe, bubbleHidden.get)

  // B hides and shows it, for those with a keyboard. The touch button is in TouchControls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyB' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) bubbleHidden.toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const update = () => {
      const pb = live.playback
      const intention = pb?.state.intention ?? world.forkling.intention
      setLines(bubbleLines(world.goals, intention, pb?.ctx.asleep ?? world.forkling.asleep, clock.now()))
    }
    update()
    const id = setInterval(update, REFRESH_MS)
    return () => clearInterval(id)
  }, [world, clock])

  if (!lines || hidden) return null
  const shown = fitPopup(lines)
  return (
    <Html position={[0, ANCHOR_HEIGHT, 0]} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }} calculatePosition={popupPosition}>
      <div className="thought win-thought" role="status">
        <div className="win-title">
          <span>merge.exe</span>
          <span className="win-buttons" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="win-thought-body">
          {shown.map((line) => (
            <p key={line.kind} className={`thought-${line.kind}`}>
              {LABEL[line.kind] && <span>{LABEL[line.kind]}</span>} {line.text}
            </p>
          ))}
        </div>
      </div>
    </Html>
  )
}

/** Above the top of Merge's monitor, so the pop-up never covers its face. */
const ANCHOR_HEIGHT = 0.9 * 2.5

const projected = new THREE.Vector3()

/** The anchor projected onto the screen, then pulled in so the whole pop-up stays on the screen (phones cut it off before). */
function popupPosition(object: THREE.Object3D, camera: THREE.Camera, size: { width: number; height: number }): [number, number] {
  projected.setFromMatrixPosition(object.matrixWorld).project(camera)
  if (projected.z > 1) return [-9999, -9999]
  const x = (projected.x * size.width) / 2 + size.width / 2
  const y = (-projected.y * size.height) / 2 + size.height / 2
  const narrow = size.width <= 640
  const popup = { width: narrow ? Math.min(200, size.width * 0.56) : 250, height: 120 }
  return clampPopup(x, y, popup, size)
}
