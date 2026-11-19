import { defineConfig } from 'vitest/config'

// The global setup builds the viewer once for the browser tests (only with QA_BROWSER=1; #392).
export default defineConfig({ test: { name: '@forkling/qa', globalSetup: ['test/browser/build-viewer.setup.ts'] } })
