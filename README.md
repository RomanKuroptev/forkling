# Forkling

An engine for autonomous AI pets that live in explorable 3D worlds, each one growing its world through pull requests in its own GitHub repo. See [`CLAUDE.md`](CLAUDE.md) for the design and [`MILESTONES.md`](MILESTONES.md) for the roadmap.

**Status:** M3. Merge, a cat, lives in its own repo ([RomanKuroptev/merge](https://github.com/RomanKuroptev/merge)); the viewer loads any forkling world from GitHub and plays it back so every visitor sees the same cat at the same moment.

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
| `?time=18:30` | Jump to that time of day in the world's time zone. By default the world follows real time, so it is dark at night and Merge sleeps |
| `?timescale=10` | Run the whole world, sun and forkling, that many times faster |
| `?ref=my-branch` | View a branch of the world repo instead of its default branch |
| `?clip=Sit` | Pin Merge in front of you looping one animation, to check it by eye |

## Layout

| Path | What |
|---|---|
| `packages/schema` | Zod schemas shared by everything |
| `packages/sim` | Pure, deterministic sim logic: seeded PRNG, island generation, needs, utility AI, A* pathfinding, sun and sunbeams, the forkling body, and a headless runner |
| `species/cat` | The cat species pack: needs, actions, animation map, persona, behaviors and a generated model |
| `apps/viewer` | Vite + React Three Fiber explorable world, loading worlds from GitHub |
| `templates/` | The `forkling-world` template and Merge's own files, validated in CI |

## Worlds

Each forkling lives in its own public GitHub repo, made from the [forkling-world](https://github.com/RomanKuroptev/forkling-world) template. The viewer opens any world at `/<owner>/<repo>`, and the bare address opens Merge's. A world holds:

- `forkling.json`: name, species, needs, position, mood, current intention and time zone
- `objects/<id>.json`: things in the world, drawn from the viewer's shipped models (for example `nature/rock_largeA`)
- `memory/` and `journal/`: what it remembers and writes (filled in from M4)

Push an edit and refresh to see it. GitHub can take up to a minute to serve a new commit, so give it a moment. The repo state counts from its commit time: an edited `position` is where the forkling is at the moment you pushed.

The templates live in `templates/`, and CI checks every file in them against the schemas, the species pack and the island.

The body is played back, not simulated per browser: it starts from `forkling.json` at an anchor (the intention's `startedAt`, or the start of the current 30-minute epoch once that is older) and steps on a fixed grid of instants, so two windows show the same cat. A visitor who comes close forks a local copy that reacts to them; once they leave, it rejoins the shared timeline, so windows only disagree while someone is playing with the forkling. Until the mind arrives in M4 and writes fresh state each tick, Merge returns to its repo position at each epoch boundary.

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
