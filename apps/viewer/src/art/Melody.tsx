import { useEffect, useMemo } from 'react'
import { live } from '../forkling/live.ts'
import { visitor } from '../visitor.ts'
import { useWorld } from '../world/WorldContext.tsx'
import { hearsMelody, noteSchedule, pickMelody } from './gallery.ts'

/** How often it checks whether the music should sound. */
const CHECK_MS = 500
/** A rest between one playing and the next, in seconds. */
const PAUSE_SECONDS = 4

/**
 * While the forkling is composing or playing and the visitor is within earshot, its latest tune sounds. The sound
 * library loads only when that first happens, and the browser only allows sound after the visitor has pressed
 * something, so nothing plays before they have started walking about.
 */
export function Melody() {
  const { world } = useWorld()
  const melody = useMemo(() => pickMelody(world.art), [world.art])

  useEffect(() => {
    if (!melody) return
    const { notes, length } = noteSchedule(melody.content)
    let allowed = false
    let nextAt = 0
    let synth: { triggerAttackRelease(note: string, duration: number, time: number): void; dispose(): void } | null = null
    let disposed = false
    const allow = () => {
      allowed = true
    }
    window.addEventListener('pointerdown', allow)
    window.addEventListener('keydown', allow)

    const timer = setInterval(async () => {
      const playback = live.playback
      if (!allowed || !playback || performance.now() / 1000 < nextAt) return
      if (!hearsMelody(playback.state.action, playback.state.pos, visitor.position)) return
      nextAt = performance.now() / 1000 + length + PAUSE_SECONDS
      try {
        const Tone = await import('tone')
        await Tone.start()
        if (disposed) return
        if (!synth) {
          const s = new Tone.Synth().toDestination()
          s.volume.value = -14
          synth = s
        }
        const start = Tone.now() + 0.1
        for (const n of notes) synth.triggerAttackRelease(n.pitch, n.duration, start + n.at)
      } catch {
        // No sound is better than a broken page.
      }
    }, CHECK_MS)

    return () => {
      disposed = true
      clearInterval(timer)
      window.removeEventListener('pointerdown', allow)
      window.removeEventListener('keydown', allow)
      synth?.dispose()
    }
  }, [melody])

  return null
}
