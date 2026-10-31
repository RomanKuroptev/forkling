import { Html } from '@react-three/drei'
import { useEffect, useState } from 'react'
import { useWorld } from '../world/WorldContext.tsx'
import { live } from './live.ts'
import { bubbleLines, type BubbleLine } from './thoughts.ts'

/** How often the bubble re-reads the body. The sim runs at 10 Hz, but nobody reads a thought that fast. */
const REFRESH_MS = 1000

const LABEL: Record<BubbleLine['kind'], string> = { goal: 'wants', step: 'now', reason: 'because', sleep: '' }

/** What the forkling wants right now and why, floating over it. Reads the repo's goals and the body's live intention. */
export function ThoughtBubble() {
  const { world, clock } = useWorld()
  const [lines, setLines] = useState<BubbleLine[] | null>(null)

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

  if (!lines) return null
  return (
    <Html position={[0, 0.6, 0]} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div className="thought" role="status">
        {lines.map((line) => (
          <p key={line.kind} className={`thought-${line.kind}`}>
            {LABEL[line.kind] && <span>{LABEL[line.kind]}</span>} {line.text}
          </p>
        ))}
      </div>
    </Html>
  )
}
