import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves the viewer under /<repo>/; the deploy workflow sets VITE_BASE.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  // Rapier inlines its WASM, so one large chunk is expected.
  build: { chunkSizeWarningLimit: 4000 },
})
