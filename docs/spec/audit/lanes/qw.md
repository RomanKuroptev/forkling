# QW acceptance runs: the agents on the planted world flaws

Agents cannot run in CI (audit steps, "Facts and choices" 7), so their planted-flaw tests are runs by hand, recorded here. The code checks' planted tests are Vitest tests (`apps/qa/test/planted/`, `apps/qa/test/browser/`).

The planted world: `pnpm qa planted-world` writes day-7 with the four flaws of QW.7 to `qa-out/planted/world` (`apps/qa/src/fixtures/planted.ts`):

1. **work-not-in-workshop**: `works/stand-still/meta.json` says it is installed in `workshop/bench/0/0`, and the Workshop does not show it (files).
2. **place-through-place**: the hillside place moved onto the Workshop (files: chunk `[0, 0]`, offset `[12, 0]`).
3. **floating-sign**: Home's sign 3 m up (`qa.json` plant).
4. **missing-texture**: every sign board drawn with a texture that never loaded (`qa.json` plant).

## Run 1: world explorer, by hand from its file (lane W, 19 November)

The lane W builder followed `.claude/agents/world-explorer.md` with the helper commands, on `qa-out/planted/world`, 8 steps.

| Flaw | Seen? | How | Picture |
|---|---|---|---|
| 1 work-not-in-workshop | yes | `scene work` lists no `stand-still` in the Workshop, though its meta.json says `installedIn: workshop/bench/0/0` | (scene list, no picture) |
| 2 place-through-place | yes | `camera front:workshop`: the hillside place's porch, columns and roof come out of the Workshop's front; walking back from the Workshop's door puts the visitor inside two sets of walls | `qa-out/explore/008-...-camera-front-workshop.png`, `007-...-at-workshop.png` |
| 3 floating-sign | yes | at the start, Home's sign posts stand empty and a board hangs above the roof line | `qa-out/explore/001-...-start.png`, `002-...-look-up.png` |
| 4 missing-texture | yes | every sign board is plain black: the Workshop's, the hillside's and the floating Home board | `qa-out/explore/008-...-camera-front-workshop.png` |

Result: **4 of 4 found.** Also seen, not planted: Home's sign says "PATCH BENCH: WORKSHOP" (Merge's own text in day-7's `places/home.json`), and the sky looking up from the start is a dark purple at 14:00.

## The code checks on the same flaws

| Flaw | Check | Test |
|---|---|---|
| 1 | `world.work-not-installed` | `apps/qa/test/browser/planted-world.test.ts` |
| 2 | `world.places-overlap` | same |
| 3 | `world.floating` | same |
| 4 | `world.missing-texture` (from the materials) | `apps/qa/test/browser/planted-world.test.ts` |

## Run 2: look reviewer, by hand from its file (lane W, 19 November)

The lane W builder followed `.claude/agents/look-reviewer.md` on run 1's pictures, against look.md and the world mockups.

| Flaw | Verdict | Why |
|---|---|---|
| 1 work-not-in-workshop | not a picture question | Nothing on a picture shows a missing work; the code checks own it. |
| 2 place-through-place | **confirmed, major** | `008-...-camera-front-workshop.png`: the hillside place's porch columns and roof grow out of the Workshop's right half, two buildings in one; `buildings-merge-visitor.png` shows each building standing apart. |
| 3 floating-sign | **confirmed, major** | `001-...-start.png`: Home's sign posts stand empty, the board hangs above the roof line. |
| 4 missing-texture | **confirmed, major** | `008-...`: every sign board is a black slab; the mockups show white window-style boards with the place's name. |

"An AI lives here, or a blocky game?": with the planted flaws it reads as a broken game level; without them (the day-7 sheet) the pastel buildings and grid read as the agreed look, but the rooms are plain and empty, closer to a demo than a lived-in place.

**Result: 3 of 3 picture flaws confirmed.**

## The code checks on all four (after W8)

| Flaw | Check |
|---|---|
| 1 | `world.work-not-installed` (W5), and `world.claim-not-in-world` for a work the Workshop page lists in a slot the Workshop does not have (W8) |
| 2 | `world.places-overlap` (W5) |
| 3 | `world.floating` (W5) |
| 4 | `world.missing-texture` (W6) |

## Still to run

- The world explorer and the look reviewer as real subagents (Opus) in `/qa`, on the planted world (`pnpm qa planted-world`) and on `live`, once lane T's skill calls them. Record each run here.
