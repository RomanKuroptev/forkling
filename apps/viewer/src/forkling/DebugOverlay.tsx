import { useEffect, useState } from 'react'
import { useWorld } from '../world/WorldContext.tsx'
import { live } from './live.ts'

const startOn = new URLSearchParams(location.search).has('debug')

const formatHour = (h: number) =>
  `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`

const formatTime = (sec: number, timezone: string) =>
  new Date(sec * 1000).toLocaleTimeString('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })

/** Needs, mood and current intention for the forkling, and where its state came from. Toggle with F3. */
export function DebugOverlay() {
  const { world, species, clock } = useWorld()
  const [open, setOpen] = useState(startOn)
  const [, refresh] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F3') return
      e.preventDefault()
      setOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const id = setInterval(() => refresh((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [open])

  const pb = live.playback
  if (!open || !pb) return null
  const sim = pb.state
  const { ref, sha, forkling } = world

  return (
    <div className="debug">
      <div className="debug-title">
        {forkling.name} <span>the {species.pack.displayName.toLowerCase()} · {forkling.mood}</span>
      </div>
      {Object.entries(sim.needs).map(([id, value]) => (
        <div className="need" key={id}>
          <span>{id}</span>
          <div className="bar">
            <div style={{ width: `${value}%` }} />
          </div>
          <span>{Math.round(value)}</span>
        </div>
      ))}
      <div className="debug-line">
        <b>{sim.intention.type}</b>
        {sim.intention.targetId ? ` → ${sim.intention.targetId}` : ''}
      </div>
      <div className="debug-line quote">“{sim.intention.reason}”</div>
      <div className="debug-line">
        {sim.phase}
        {sim.micro ? ` · ${sim.micro.behavior.id}` : ''} · {sim.slot}
      </div>
      <div className="debug-line">
        {formatHour(clock.hour())} {forkling.timezone}
        {clock.synced ? '' : ' · not synced'}
      </div>
      <div className="debug-line dim">
        {ref.owner}/{ref.repo}
        {ref.ref ? `@${ref.ref}` : ''} · {sha.slice(0, 7)}
        <br />
        playing from {formatTime(pb.anchor.time, forkling.timezone)} ({pb.anchor.source})
        {pb.local ? ' · reacting to you' : ' · in sync'}
      </div>
    </div>
  )
}
