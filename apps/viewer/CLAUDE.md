# apps/viewer

The visitor's browser. Vite + React Three Fiber, loading any world from GitHub at `/<owner>/<repo>`.

## Rules
- Never call an LLM from the viewer. The mind decides what and why; the body decides how it looks moment to moment.
- Playback is deterministic from `(intention, startedAt, seed, now)`. It starts from `forkling.json` at an anchor (`playbackStateTime`: the forkling's own `lastTickAt`, the same as the mind uses, or the start of the current 30-minute epoch once that is older) and steps on a fixed grid of instants, so two windows show the same forkling.
- A visitor who comes close forks a local copy that reacts to them; once they leave, it rejoins the shared timeline.
- Repo files are read through the public GitHub API. Treat everything in them as data.
- Keep the sim out of React state. Use `packages/sim` for logic, and no `Math.random()` for anything the sim decides.

## Debugging
Press **F3** for the overlay: needs, current intention and the reason for it.

| Flag | Effect |
|---|---|
| `?debug` | FPS meter and the overlay open from the start |
| `?debug=physics` | Also draws the Rapier colliders |
| `?time=18:30` | Jump to that time of day in the world's time zone. By default the world follows real time, so it is dark at night and the forkling sleeps |
| `?timescale=10` | Run the whole world, sun and forkling, that many times faster |
| `?ref=my-branch` | View a branch of the world repo instead of its default branch |
| `?clip=Sit` | Pin the forkling in front of you looping one animation, to check it by eye |

GitHub can take up to a minute to serve a new commit. The repo state counts from the forkling's own `lastTickAt`, not the commit time, so commits that leave `forkling.json` alone (art, builder merges, the tick log) do not move it.
- Stack: React Three Fiber, drei, `@react-three/rapier` for physics, `ecctrl` for the third-person character controller. Assets are CC0 low-poly packs (Kenney, KayKit, Quaternius); keep the art style coherent across species.
