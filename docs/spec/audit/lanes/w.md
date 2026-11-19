# Lane W: the 3D world (Q1, then QW)

Plan written 19 November 2026, waiting for the coordinator's approval. Progress goes at the bottom.

## What I found before planning

- The viewer already has `?at=<iso>` (a frozen clock, used by the eye cam) and `?world=local` (reads `<origin>/world/manifest.json` and the files beside it through `localFetch`). `qa=1` builds on both.
- The viewer has no `Math.random()` today. Panels (`worldData.ts` `worldFiles`) return null for a local world, so screens, gallery and work panels are empty with `?world=local`.
- `apps/qa` has the runner, findings, sheets and `launchChromium`; `fastChecks` is still empty.

## PRs, in order (each: tests first, `STATUS.md` line for lane W, progress here)

### W1 `claude/qa-w-hooks`: `?qa=1` and `window.__qa` (Q1.1)
- Tests first (viewer Vitest): `qaParams(search)` parses `qa`, `now`, `seed` and is null without `qa=1`; `sceneList(root)` walks a three.js tree (no renderer, runs in Node) and returns id, kind, box, visible, material kind for objects tagged `userData.qa`; the clock under `qa=1` stands still and moves only by `step(ms)`; without `qa=1` nothing is installed (no `window.__qa`, same clock as today).
- Code: `apps/viewer/src/qa/` (`params.ts`, `sceneList.ts`, `QaProbe.tsx` inside the Canvas, `walk.ts`). `userData.qa = { id, kind }` tags in Places, rooms, Signs, exhibits/works, Forkling and the visitor (a tag is data on the object, it does not change what is drawn). `__qa`: `ready` (world, body and textures loaded), `step(ms)`, `scene()`, `renderer()` (`gl.info`), `cameras` and `setCamera(name)`, `fps(seconds)`, walk helpers (`press(key, ms)`, `stick(x, y, ms)`, `visitor()`). Under `qa=1` the frame loop is stepped by `step()` and anything drawn takes randomness from `seed`.
- A check in `apps/qa` that greps `apps/viewer/src` for `Math.random` (planted test: a file with it fails).
- Proof of no look change: before and after pictures at the start camera, normal mode, sent to the look reviewer.

### W2 `claude/qa-w-local-panels`: `?world=local` panels (Q1.2)
- Test first: `worldFiles` for the local world reads `<origin>/world/<path>` (same `SAFE_PATH` guard, a climbing path still gives null); a GitHub world reads as today.

### W3 `claude/qa-w-fixtures`: fixtures, the serve helper, the schema test (Q1.3)
- `test/fixtures/worlds/day-0`: the template plus Merge's `forkling.json` and `self/seed.md` (copied once from the repo, read-only), no visitors. `day-7`: the stand-in (a trimmed fresh clone of `RomanKuroptev/merge`, remote removed, journals trimmed, under 2 MB) until lane B's folder arrives. `night` and `building` are made from `day-7` by pure edits (`night`: clock after sunset; `building`: a project in progress, an open session, an unfinished place). `day-30`: `day-7` plus 23 days of the fast-forward with fakes (`--dry-run`). Each has `qa.json` with its clock.
- `apps/qa/src/fixtures/` and `pnpm qa fixtures` (rebuilds the derived ones; never touches `day-0` or `day-7`). `pnpm qa live-clone` makes `live` in `qa-out/live/` (shallow clone, remote removed, never committed).
- `apps/qa/src/world/serve.ts`: builds the viewer once (`vite build`) and serves it with a fixture under `/world/` and a manifest made at run time. `node:path` throughout.
- Tests first: every fixture parses with the schemas (`forkling.json`, places, works, projects, notes as each schema reads them); a fixture with a broken file fails (planted). Fast check `world.fixture-opens`: each fixture opens with `?world=local&qa=1&now=<clock>`, `ready` turns true within a time limit, and `scene()` lists every place, room, work and Merge from the files (planted: a fixture that never gets ready gives a finding, a closed browser gives `qa.check-did-not-run`).

### W4 `claude/qa-w-explorer`: the world explorer and the look reviewer (QW.1, QW.6)
- `apps/qa/src/review/explore/`: small commands, each prints a screenshot path: `open <fixture|live> [--phone]`, `walk-to <place|x,z>`, `turn <deg>`, `look-up`, `look-at <id>`, `shot`, `where`, `scene`. They keep one browser session between commands (a small local session server, closed by `close`), so the agent can walk step by step. A Vitest test drives them on `day-0` once (opens, walks, a PNG exists).
- `.claude/agents/world-explorer.md` (Opus): the goals of spec 7.4, the finding format, starts `minor`.
- `.claude/agents/look-reviewer.md` (Opus): confirms or rejects a finding on the picture; judges fix PRs against `look.md` and the four world mockups.

### W5 `claude/qa-w-inventory`: geometry checks from `scene()` (QW.3 part 1, QW.7 planted)
- Pure measures first, tests first, in `packages/sim/src/qa-geometry.ts` (box overlap, sits on ground within 5 cm, inside the land, touches nothing): numbers in, numbers out.
- Checks: every place, room and finished work is in the scene once and visible, no leftovers; every finished work is shown somewhere; nothing floats or sinks; no overlaps; places inside the land; unfinished drawn cyan wireframe and finished not; Merge present, right size, on the ground, in the start view; label text equals the files.
- Planted fixtures for QW.7 are made at test time from `day-7` (not committed copies): a work the site says is in the Workshop but is not; a wall pushed through another; a floating sign; a missing texture. Where the files cannot say it (the floating sign, the missing texture), `qa.json` carries a `plant` entry that the viewer reads only under `qa=1` (move object id up, break a texture address). One line in `docs/decisions.md`.

### W6 `claude/qa-w-pictures`: poses, sheets and picture checks (QW.3 part 2)
- Pure first: `cameraPoses(places, seed)` in sim gives the 40 seeded poses (fronts, sides, backs, inside rooms, land edge, sky, low, Merge from four sides), same seed same poses.
- Checks per pose: not blank, palette (look.md world colours, night at night), too dark or bright, flicker (camera moved 1 mm, patch boxed), missing or stretched textures (magenta or black pixels, loader errors, UV stretch over 4x), camera inside a mesh, labels readable (projected letters at least 10 px at 390 wide), phone overlay not covering Merge. The world sheets (PNG) go into the report. Each check has a planted picture or scene.
- CI time: if all fixtures at 40 poses make `qa.yml` too slow, `fast` runs `day-7` and `building` and `pnpm qa world` runs all; I will measure and write the numbers here.

### W7 `claude/qa-w-walk`: walking and physics (QW.3 part 3)
- Walk from the start to every door with the real keys (a seeded walk on the walking grid, then pressed through `__qa`), stuck is a finding; invisible walls and walk-through walls (the Rapier colliders against the drawn walls); holes (rays out of each room); things inside things (mesh boxes); floating small parts; the camera never inside a mesh during the walk. Planted for each.

### W8 `claude/qa-w-claims-fps`: claims, budget, fps (QW.4, QW.5)
- Claims: what the built site and the diary say is in the world (a work in a room, a new room, a project being built) is looked up in `scene()`; said but not there, or there but not in the files, is `major`. Planted: the W5 "work in the Workshop" fixture.
- Budget in CI: draw calls and triangles from `renderer()` at `day-30` (150 and 300,000 to start), frame time in SwiftShader against the last run (+50% is `minor`). Planted: a fixture with too many places.
- `pnpm qa fps`: headed Chromium with the GPU, 1280x800 and the phone preset with 4x CPU slowdown, 20 s per fixture on a fixed path, floors from spec 7.5; prints the numbers here on this PC.

### Then
- Acceptance runs of the explorer and look reviewer on the planted flaws, recorded in `docs/spec/audit/lanes/qw.md`. Switch `day-7` to lane B's folder when it arrives (one PR, re-runs the derived fixtures).

## Choices (simple ones, to go into `docs/decisions.md` when made)
- Planted world flaws that files cannot express use a `plant` entry in `qa.json`, honoured only with `qa=1`.
- Planted fixtures are made at test time from `day-7`, not committed, to keep the repo small.
- Geometry helpers that are only numbers go into `packages/sim`; anything reading files or the browser stays in `apps/qa`.

## Coordinator's notes on approval (19 November)
- W1: normal mode is proven unchanged by pictures before and after at the same camera and clock, numbers in the PR (no look reviewer yet).
- `plant` in `qa.json` only for what files cannot say (floating sign, missing texture). The work missing from the Workshop and the wall through a wall are planted through the world files. The hook is tiny, ignored without `qa=1`, with a test.
- CI time: measure first. If split, `pnpm qa world` runs every fixture; tell the coordinator the command name for lane T; all world sheets stay in the `/qa` report.
- `day-30` uses the existing `--dry-run` fakes; do not edit `fast-forward-fakes.ts` (lane B owns it).
- `day-7`: the R2 fast-forward world is at `C:\Code\forkling-qa-data\r2\ff-r2a-world` (20 MB, trim to about 2 MB), its summary in `C:\Code\forkling-qa-data\r2\ff-r2a-out`. No stand-in is needed: W3 uses it directly.

## Progress
- 19 November: plan written and approved.
- W1 (`claude/qa-w-hooks`): `apps/viewer/src/qa/` (`params.ts`, `sceneList.ts`, `registry.ts`, `QaProbe.tsx`, `seedRandom.ts`), hooks in `Places`, `Forkling`, `Player`, `App`, `clock.ts`; viewer tests `apps/viewer/test/qa.test.ts`; check `world.viewer-math-random` with its planted test. On the 10-place fixture in SwiftShader: `ready` after about 1.3 s; `scene()` has 10 places, 10 rooms, 58 exhibits, 10 signs, 10 title bars, 2 plots, Merge and the visitor; 46 draw calls and 40,379 triangles a frame; `fps(2)` about 17 in SwiftShader; W held for 1.5 s walks the visitor 2.9 m.
- W1 merged (#280), W2 merged (#281), W3 merged (#287), W4 merged (#289).
- W3 (`claude/qa-w-fixtures`): fixtures in `test/fixtures/worlds/` (`apps/qa/src/fixtures/`: `fixtures.ts`, `schema.ts`, `trim.ts`, `derive.ts`, `command.ts`), the serve helper and opener (`apps/qa/src/world/serve.ts`, `open.ts`), the check `world.fixture-opens` with `world.scene-lists-files` (raw place files against `__qa.scene()`), planted tests in `apps/qa/test/planted/scene-lists-files.test.ts` and `apps/qa/test/browser/fixture-opens.test.ts` (qa.yml runs them with `QA_BROWSER=1`). day-7 is 1.6 MB from the R2 world; day-30 is grown by code (`apps/qa/src/fixtures/day30.ts`, seeded) after the 23-day fake run proved too slow. **Found: Merge's live Workshop was dropped by the viewer** (exhibit id of 42 characters; fixed on read by #285).
- W4 (`claude/qa-w-explorer`, on top of W3): `apps/qa/src/review/explore/` (`aim.ts` pure aiming with a test, `session.ts`, `daemon.ts`, `command.ts`), `pnpm qa explore ...`, `.claude/agents/world-explorer.md`, `.claude/agents/look-reviewer.md`, browser test `apps/qa/test/browser/explore.test.ts`. Tried by hand on day-7: open, walk-to workshop (arrived), walk-to merge (arrived inside Home, about 40 s), look-at merge, camera aerial.
- W5 (`claude/qa-w-geometry-2`, on top of W4): `packages/sim/src/qa-geometry.ts` (test first), `apps/qa/src/world/geometry.ts` and `collect.ts`, `__qa.ground`, the viewer plant hook `apps/viewer/src/qa/plant.ts` (lifted sign, missing sign texture) read from `qa.json` under `?qa=1`, unit planted tests `apps/qa/test/planted/world-geometry.test.ts`, browser planted tests `apps/qa/test/browser/planted-world.test.ts`.
- W6 (`claude/qa-w-pictures-2`): `packages/sim/src/qa-poses.ts` (test first), `apps/qa/src/world/picture.ts` (pure measures), `pictures.ts` (the pass and the sheet), `phone.ts`, `__qa.project()` and `__qa.textures()`, sign letter sizes in `scene()`. Planted: `apps/qa/test/planted/world-picture.test.ts`, `world-phone.test.ts`, and the missing texture in `apps/qa/test/browser/planted-world.test.ts`.
- W7 (`claude/qa-w-walk`): `apps/qa/src/world/walk.ts`, `__qa.ray()`, plant `walkThrough` and `invisibleWall`; planted: `apps/qa/test/planted/world-walk.test.ts` and the browser tests (a wall walked through and an invisible wall found; clean day-7 walks clean).
