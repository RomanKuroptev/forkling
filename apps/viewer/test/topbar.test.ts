import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { desktopHref, narrowHint, shortHint, worldTitle } from '../src/ui/topbar.ts'

/** Step 7, the world overlay (mockup world-overlay.png): "desktop" button, the WORLD.exe title chip, and the "?" help. */

describe('worldTitle', () => {
  it('names the world and counts its places', () => {
    expect(worldTitle('Merge', 3)).toBe("WORLD.exe - Merge's island · 3 places")
    expect(worldTitle('Merge', 1)).toBe("WORLD.exe - Merge's island · 1 place")
    expect(worldTitle('Merge', 0)).toBe("WORLD.exe - Merge's island")
  })
})

describe('desktopHref: the way back to the forkling\'s site', () => {
  it('inside the site\'s own /world/ it is the folder above, whatever the address is', () => {
    expect(desktopHref({ fixed: true, href: 'https://romankuroptev.github.io/merge/world/?time=22', ref: { owner: 'RomanKuroptev', repo: 'merge' } })).toBe('https://romankuroptev.github.io/merge/')
    expect(desktopHref({ fixed: true, href: 'http://localhost:5213/merge/world/', ref: { owner: 'a', repo: 'b' } })).toBe('http://localhost:5213/merge/')
  })

  it('on the engine\'s own address it is the world\'s site on GitHub Pages', () => {
    expect(desktopHref({ fixed: false, href: 'https://romankuroptev.github.io/forkling/someone/cat', ref: { owner: 'Someone', repo: 'cat' } })).toBe('https://someone.github.io/cat/')
  })

  it('is none for a world made up in the browser', () => {
    expect(desktopHref({ fixed: false, href: 'http://localhost:5173/?world=local', ref: { owner: 'local', repo: 'world' } })).toBeNull()
  })
})

describe('shortHint', () => {
  it('is the one line at the bottom: walk and look, and where the rest is', () => {
    expect(shortHint()).toBe('WASD to walk · drag to look · ? for the rest')
  })
})

describe('narrowHint', () => {
  it('fits a phone-width taskbar beside the start button, and keeps the way to the help', () => {
    expect(narrowHint()).toBe('drag to look · ? help')
    expect(narrowHint().length).toBeLessThan(shortHint().length)
  })
})

describe('the title-bar buttons are drawn', () => {
  const css = readFileSync(new URL('../src/look-windows.css', import.meta.url), 'utf8')
  it('has a minimize bar, a maximize box and a close cross, and the cross is the close button', () => {
    expect(css).toMatch(/\.win-buttons i:nth-child\(1\)[^}]*linear-gradient/)
    expect(css).toMatch(/\.win-buttons i:nth-child\(2\)::after/)
    expect(css).toMatch(/\.win \.win-title button\.win-close \{[^}]*45deg/)
  })
})
