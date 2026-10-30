# Forkling

An engine for autonomous AI pets that live in explorable 3D worlds, each one growing its world through pull requests in its own GitHub repo. See [`CLAUDE.md`](CLAUDE.md) for the design and [`MILESTONES.md`](MILESTONES.md) for the roadmap.

**Status:** M2, an explorable island with Merge, a cat who wanders it, naps in sunbeams and decides whether to care that you showed up.

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

Press **F3** to see Merge's needs, current intention and the reason for it.

URL flags, mostly for testing:

| Flag | Effect |
|---|---|
| `?debug` | FPS meter and Merge's overlay open from the start |
| `?debug=physics` | Also draws the Rapier colliders |
| `?time=18:30` | Start at that time of day. By default the world follows your local clock, so it is dark at night and Merge sleeps |
| `?timescale=60` | Make the day run that many times faster |
| `?simspeed=10` | Run Merge's brain that many times faster than real time |
| `?seed=7` | A different Merge, same species |
| `?clip=Sit` | Pin Merge in front of you looping one animation, to check it by eye |

## Layout

| Path | What |
|---|---|
| `packages/schema` | Zod schemas shared by everything |
| `packages/sim` | Pure, deterministic sim logic: seeded PRNG, island generation, needs, utility AI, A* pathfinding, sun and sunbeams, the forkling body, and a headless runner |
| `species/cat` | The cat species pack: needs, actions, animation map, persona, behaviors and a generated model |
| `apps/viewer` | Vite + React Three Fiber explorable world |

## Species packs

Everything animal-specific lives in a pack under `species/<id>/`; the engine reads it and never hardcodes a species. The format is `SpeciesPack` in `packages/schema`. A pack's `species.json` declares its needs and decay rates, its actions (what they satisfy, where they happen, which animation slot they play) and weights that give it a personality. `behaviors.ts` holds signature micro-behaviors as code. `packages/sim` tests run against a made-up "blob" pack with no animations, to prove the engine has no cat assumptions.

The cat's model is generated, not downloaded. To change it, edit `species/cat/src/buildCat.ts` or `clips.ts` and run:

```
pnpm --filter @forkling/species-cat build:model
```

## Deploying the viewer

`.github/workflows/deploy-pages.yml` builds the viewer and publishes it to GitHub Pages on every push to `main`. One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**. The site is served at `https://<owner>.github.io/<repo>/`.

## Credits

Trees and rocks are from the [Nature Kit](https://kenney.nl/assets/nature-kit) by Kenney (CC0), in `apps/viewer/public/models/nature/`. The kit's colours are overridden in code to match the island palette.
