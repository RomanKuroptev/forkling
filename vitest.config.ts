import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'species/*', '!species/CLAUDE.md', 'templates', 'apps/viewer', 'apps/mind', 'apps/site', { test: { name: 'docs', include: ['test/**/*.test.ts'] } }],
  },
})
