import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { viewerBuildEnv } from '../src/viewer.ts'

/** Step 7, one address: the site build also builds the 3D viewer into `<out>/world/`, for the world of that site. */

const read = (rel: string) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')) as { dependencies?: Record<string, string> }

describe('viewerBuildEnv', () => {
  it('builds the viewer under the site\'s own path, for the world the site belongs to, with the server and the check key', () => {
    expect(viewerBuildEnv({ baseUrl: 'https://owner.github.io/merge/', mindUrl: 'https://mind.example.org', siteKey: '0x4AAAAAAGDF-jzbhPC47urx' })).toEqual({
      VITE_BASE: '/merge/world/',
      VITE_WORLD: 'owner/merge',
      VITE_MIND_URL: 'https://mind.example.org',
      VITE_TURNSTILE_SITE_KEY: '0x4AAAAAAGDF-jzbhPC47urx',
    })
  })

  it('leaves the server and the key empty when there are none, and the world from the repository name when the address is not a github.io one', () => {
    expect(viewerBuildEnv({ baseUrl: 'https://merge.example.org/', repository: 'owner/merge' })).toEqual({ VITE_BASE: '/world/', VITE_WORLD: 'owner/merge', VITE_MIND_URL: '', VITE_TURNSTILE_SITE_KEY: '' })
  })

  it('has no viewer to build when it cannot tell the world or the path', () => {
    expect(viewerBuildEnv({})).toBeNull()
    expect(viewerBuildEnv({ baseUrl: 'https://merge.example.org/' })).toBeNull()
    expect(viewerBuildEnv({ baseUrl: 'not an address', repository: 'owner/merge' })).toBeNull()
  })

  it('ignores a repository name that is not one, and takes the world from the address', () => {
    expect(viewerBuildEnv({ baseUrl: 'https://owner.github.io/merge/', repository: 'a b/c' })?.VITE_WORLD).toBe('owner/merge')
    expect(viewerBuildEnv({ baseUrl: 'https://merge.example.org/', repository: 'a b/c' })).toBeNull()
  })
})

describe('the install filter of the Pages workflow', () => {
  it('reaches the viewer: @forkling/site depends on it, and the viewer on the cat species it draws', () => {
    // `pnpm install --filter "@forkling/site..."` installs the site and everything it depends on.
    expect(read('../package.json').dependencies).toHaveProperty('@forkling/viewer', 'workspace:*')
    expect(read('../../viewer/package.json').dependencies).toHaveProperty('@forkling/species-cat', 'workspace:*')
  })
})
