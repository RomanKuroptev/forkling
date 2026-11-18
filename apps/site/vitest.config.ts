import { defineConfig } from 'vitest/config'

// A site build draws its share pictures (about 0.2 s each, mostly loading the system's fonts), so a build can take a few seconds when the suite runs in parallel.
export default defineConfig({ test: { name: '@forkling/site', testTimeout: 20_000 } })
