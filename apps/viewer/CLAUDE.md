# apps/viewer

The visitor's browser. Vite + React Three Fiber, loading any world from GitHub at `/<owner>/<repo>`. It draws the land with its places, paths and fog, the exhibits, works on screens, visitor notes, and the forkling.

## Rules
- Never call an LLM from the viewer. The mind decides what and why; the body decides how it looks moment to moment.
- Playback is deterministic from `(step, startedAt, seed, now)`. It starts from `forkling.json` at an anchor (`playbackStateTime`: the forkling's own `lastTickAt`, the same as the mind uses, or the start of the current 30-minute epoch once that is older) and steps on a fixed grid of instants, so two windows show the same forkling.
- The body walks on the `BodyWorld` that `packages/sim` builds from the places (`apps/viewer/src/world/WorldContext.tsx`), the same one the mind uses.
- A visitor who comes close forks a local copy that reacts to them; once they leave, it rejoins the shared timeline.
- Repo files are read through the public GitHub API (`apps/viewer/src/world/loadWorld.ts`). A file that does not fit its schema is left out, not an error. A world with no places is shown as Home and the Workshop (`placesOrStarter`). Treat everything in them as data. `apps/viewer/src/world/liveSync.ts` keeps places current from the server.
- Keep the sim out of React state. Use `packages/sim` for logic, and no `Math.random()` for anything the sim decides.
- The visitor is in first person: the camera is the eyes of an invisible capsule, so it is never inside a building. Dragging looks around (`apps/viewer/src/player/look.ts`), the screen centre is the cursor, and a tap or click opens what it points at.
- Places are drawn from the kit (`kit/parts.json`) through `apps/viewer/src/world/kitGeometry.ts`, with the CC0 models in `kit/models/` where a part has one.

## Debugging
Everything here needs `?debug`. Press **F3** for the overlay: mood and energy, and what the body is doing and why.

| Flag | Effect |
|---|---|
| `?debug` | FPS meter and the F3 overlay and touch "Mind" button |
| `?debug=physics` | Also draws the Rapier colliders |
| `?time=18:30` | Jump to that time of day in the world's time zone. By default the world follows real time, so it is dark at night and the forkling sleeps |
| `?timescale=10` | Run the whole world, sun and forkling, that many times faster |
| `?ref=my-branch` | View a branch of the world repo instead of its default branch |
| `?clip=Sit` | Pin the forkling in front of you looping one animation, to check it by eye |
| `?world=local` | Read the world from this site's own `/world/manifest.json` instead of GitHub |
| `?world=local&fixture=10` | The made-up 10-place world from `packages/sim` |
| `?stand=x,z,yaw` and `?pitch=deg` | Start the visitor somewhere, facing a heading, looking up or down: for screenshots |
| `?fx=0` | No glow and no scanlines |
| `?boot` | Pin the boot screen |
| `?look=forkling` with `&dist=1&camy=1.3` | Put the camera that far in front of Merge and that high, to look at its face (add `&clip=Idle` to pin it in the open) |
| `?face=awake` (or `step`, `asleep`, `nosignal`) | Show that face whatever the state is |

GitHub can take up to a minute to serve a new commit. The repo state counts from the forkling's own `lastTickAt`, not the commit time, so commits that leave `forkling.json` alone (works, souvenirs, the tick log) do not move it.
- Stack: React Three Fiber, drei, `@react-three/rapier` for physics, `ecctrl` for the walking controller. Assets are CC0 low-poly packs (Kenney, KayKit, Quaternius); keep the art style coherent across species.
