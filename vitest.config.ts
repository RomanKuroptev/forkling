import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'species/*', '!species/README.md', 'apps/viewer'],
  },
})
