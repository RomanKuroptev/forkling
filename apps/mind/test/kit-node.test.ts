import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

// Vitest's loader reads JSON without an import attribute, but the mind runs on plain Node (the server and the Actions tick),
// which refuses a JSON module that lacks `with { type: 'json' }`. This loads the kit the way they do.
describe('the kit loads on plain Node', () => {
  it('imports the kit in a fresh node process', () => {
    const file = fileURLToPath(new URL('../../../packages/schema/src/kit-data.ts', import.meta.url))
    const script = `const { kit } = await import(${JSON.stringify(pathToFileURL(file).href)}); console.log(kit.parts.length)`
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })
    expect(Number(out.trim())).toBeGreaterThanOrEqual(60)
  })
})
