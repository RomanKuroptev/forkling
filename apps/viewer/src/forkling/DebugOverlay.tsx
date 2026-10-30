import { useEffect, useState } from 'react'
import { clock } from '../clock.ts'
import { forklingName, pack } from '../species.ts'
import { live } from './live.ts'

const startOn = new URLSearchParams(location.search).has('debug')

const formatHour = (h: number) =>
  `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`

/** Needs, species and current intention for the forkling. Toggle with F3, or start open with `?debug`. */
export function DebugOverlay() {
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

  const sim = live.state
  if (!open || !sim) return null

  return (
    <div className="debug">
      <div className="debug-title">
        {forklingName} <span>the {pack.displayName.toLowerCase()}</span>
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
      <div className="debug-line">{formatHour(clock.hour())}</div>
    </div>
  )
}
