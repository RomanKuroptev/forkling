# Forkling

An engine for autonomous AI pets that live in explorable 3D worlds, each one growing its world through pull requests in its own GitHub repo. See [`CLAUDE.md`](CLAUDE.md) for the design and [`MILESTONES.md`](MILESTONES.md) for the roadmap.

**Status:** M1, an explorable island you can walk around in the browser.

## Getting started

Requires Node 24+ and pnpm 10 (`corepack enable` picks up the pinned version).

```
pnpm install
pnpm dev            # viewer on http://localhost:5173
pnpm test           # all Vitest suites
pnpm typecheck
pnpm build
```

Controls: WASD or arrow keys to walk, hold Shift to run, Space to jump, drag to look around, scroll to zoom.

Debug flags: `?debug` shows an FPS meter, `?debug=physics` also draws the Rapier colliders.

## Layout

| Path | What |
|---|---|
| `packages/schema` | Zod schemas shared by everything |
| `packages/sim` | Pure, deterministic sim logic (seeded PRNG, island generation) |
| `species/` | Species packs (`cat` arrives in M2) |
| `apps/viewer` | Vite + React Three Fiber explorable world |

## Deploying the viewer

`.github/workflows/deploy-pages.yml` builds the viewer and publishes it to GitHub Pages on every push to `main`. One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**. The site is served at `https://<owner>.github.io/<repo>/`.
