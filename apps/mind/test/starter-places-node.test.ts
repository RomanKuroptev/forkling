import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

// Vitest's loader reads JSON without an import attribute, but the mind runs on plain Node, which refuses a JSON module that
// lacks `with { type: 'json' }`. This loads the starter places the way the server and the Actions tick do.
describe('the starter places load on plain Node', () => {
  it('imports Home and the Workshop in a fresh node process', () => {
    const file = fileURLToPath(new URL('../../../packages/sim/src/starter-places.ts', import.meta.url))
    const script = `const { starterPlaces } = await import(${JSON.stringify(pathToFileURL(file).href)}); console.log(starterPlaces().map((p) => p.id).join(','))`
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })
    expect(out.trim()).toBe('home,workshop')
  })
})
