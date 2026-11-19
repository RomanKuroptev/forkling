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

## Run 3: world explorer as a real Opus subagent (19 November, after W8)

Started from lane W's session with only the agent file as instructions, on `pnpm qa planted-world` (about 38 steps, 3 teleports after getting stuck) and on the live world (`pnpm -s qa explore open live`, a fresh clone at Merge's fdec3c8, about 30 steps). It was not told which flaws were planted. Findings in `qa-out/review/world-explorer-{planted,live}.json` (16 and 10, all `minor` as its file says).

| Planted flaw | Found? | Its finding |
|---|---|---|
| 1 work-not-in-workshop | **yes** | `workshop-stand-still-missing`: meta.json says installed in the Workshop, the Workshop lists it in a slot that does not exist, `scene` does not have it |
| 2 place-through-place | **yes** | `hillside-room-through-workshop`, and what it causes: `hillside-door-blocked-by-workshop` (stuck 5.3 m short), `workshop-gallery-terminal-walled-off`, `workshop-floor-flicker` |
| 3 floating-sign | **yes** | `home-sign-floating-on-roof` |
| 4 missing-texture | **yes** | `signs-black-no-text` |

**4 of 4 found.** Real findings beside the planted ones (both worlds unless marked): the Workshop screens show plain blue, not the works; souvenirs are identical blank pink blocks; a big empty frame hangs in Home's doorway; Home's Counter Room is 1 m wide with no door, so its newest work cannot be seen (planted world, which is day-7); walking backwards near a sign puts the camera inside it; **live: walking past the edge of the land drops the visitor under the world**; live: the Workshop floor flickers, the all-works terminal is blank and can be walked into, signs show the name twice; on a phone the visitor can walk into Merge.

## Run 4: look reviewer as a real Opus subagent, on run 3

From its agent file, every evidence picture opened, against look.md and the four world mockups. Files: `qa-out/review/look-reviewer-{planted,live}.json` and the `-rejected.md` beside them.

- **Planted world, 11 confirmed** (major: hillside-room-through-workshop, hillside-door-blocked-by-workshop, signs-black-no-text, home-sign-floating-on-roof, home-counter-room-unreachable, workshop-screens-blank, camera-inside-workshop-sign; minor: workshop-gallery-terminal-walled-off, workshop-floor-flicker, home-frame-in-doorway, souvenirs-blank-blocks). **All three picture flaws (2, 3, 4) confirmed major.** Flaw 1 is "unsure: a data finding, the files settle it", as its file says it should be.
- **Live world, 7 confirmed** (major: fall-off-land-edge, workshop-screens-blank, workshop-floor-flicker, home-frame-in-doorway; minor: workshop-terminal-blank, souvenirs-blank-blocks, workshop-sign-name-twice).
- **Rejected:** land-big-and-empty in both (look.md: the mockups fix mood, colours and effects, not layout). **Unsure:** walk-through-terminal and phone-overlay-covers-merge (live), merge-inside-home-bench and hillside-sign-text-cut (planted), each with the picture that would settle it.
- Not filed, said in its reply: Home's walls read warm grey or beige with orange trim (look.md rule 3: no beige walls); no thought pop-up over Merge in any picture.
- "An AI lives here, or a blocky game?": "for now more like a blocky game": the outside has the vaporwave mood, the insides are bare pastel boxes with blank screens and identical blocks; Merge's monitor face is the one thing that feels alive.
- One deviation: its file says to remove rejected fingerprints from the explorer's file; the brief for this run said not to touch those files, so it left them.

**Result: the explorer found all 4 planted flaws, and the look reviewer confirmed all 3 that a picture can show.**

## For QR (code checks the explorer showed are missing)

Each confirmed finding gets a code check in its fix PR (audit steps QW.2). The ones the current checks do not catch yet:
- falling off the land (the walk never leaves the land; a walk out past the edge would);
- screens showing a flat colour instead of the work (`exhibitInstances` draws a lit panel; the picture checks do not look at screens);
- floor flicker inside rooms (the flicker check runs only at the fronts);
- a frame in a doorway, a room with no way in, the camera inside a sign when walking backwards;
- signs that show the name twice (`world.label-text` compares the words, not their repetition).

## Still to run

- In `/qa release` before each release: both agents on the planted world and on `live`, recorded here.
