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
| 4 | W6 (picture checks: missing or black textures) | W6 |

## Still to run

- The world explorer as a real subagent (Opus) in `/qa`, on the planted world and on `live`, once lane T's skill calls it.
- The look reviewer on run 1's pictures: it must confirm 2, 3 and 4 on the pictures.
