import { useState } from 'react'
import { debugEnabled } from '../debugEnabled.ts'
import { useWorld } from '../world/WorldContext.tsx'
import { desktopHint } from './hint.ts'
import { desktopHref, worldTitle } from './topbar.ts'
import { Win } from './Win.tsx'

/**
 * The top of the world (mockup world-overlay.png): a "desktop" button back to the forkling's site, the WORLD.exe title chip, and "?" for the keys.
 * Nothing here touches the 3D scene.
 */
export function TopBar({ touch }: { touch: boolean }) {
  const { world } = useWorld()
  const [help, setHelp] = useState(false)
  const href = desktopHref({ fixed: Boolean(import.meta.env.VITE_WORLD), href: location.href, ref: world.ref })
  return (
    <>
      <div className="topbar">
        {href && (
          <a className="topbar-btn" href={href}>
            <span aria-hidden="true">&#9664;</span> desktop
          </a>
        )}
        <span className="topbar-title">{worldTitle(world.forkling.name, world.places.length)}</span>
        <button type="button" className="topbar-btn topbar-help" aria-label="Help: how to move" aria-expanded={help} onClick={() => setHelp((h) => !h)}>
          ?
        </button>
      </div>
      {help && (
        <Win title="WORLD.exe - help" className="win-help" label="How to move" onClose={() => setHelp(false)}>
          <p>{touch ? 'Stick to walk, drag to look, tap to open what you point at.' : desktopHint(world.forkling.name, debugEnabled(location.search))}</p>
        </Win>
      )}
    </>
  )
}
