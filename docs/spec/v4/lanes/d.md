# Lane D: the look

Plan approved by the coordinator on 17 November 2026: L3, L1, L1b, L2, L4, then a new plan for step 7.

| Slice | What | Status |
|---|---|---|
| L3 | First person, centre cursor, taskbar, 95-style touch buttons | merged (#184) |
| L1 | One theme file, sky, striped sun, grid, palettes, glow, wireframe construction, window signs, boot screen, error window, taskbar bevel and logo, Jump without the grey circle | PR open on `claude/v4-d-l1`, screenshots `d-shots/l1-*` |
| L1b | Buildings: six slots, five styles | not started |
| L2 | Monitor-head cat, face, merge.exe pop-up (also: clamp the bubble inside the screen, from the L3 review) | not started |
| L4 | Site skin | not started |
| Step 7 | Front page | not started |

## Folded in from the coordinator

- L3 review follow-ups 1 and 2 (start button bevel and logo, grey circle behind Jump) are in L1. Follow-up 3 (salmon triangle at the bottom left): it is a visitor note's paper lying on the path in the fixture world (a note mark), not the capsule or a visitor mesh, so nothing to hide. Follow-up 4 (thought bubble cut off at the left edge at 390 px) goes with L2, which restyles the bubble.
- Step 5 threads (#183): the viewer's note panel (`ui/NotePanel.tsx`) needs a threaded view and an answer box in the look's style, with the rules of `/notes/` in `apps/site`: oldest note first, "Answer" under the newest reply of an open thread, a closed thread says "This thread is closed. Leave a new note above." Planned with L2 (it is a window, like the pop-up).

## L1 notes

- All colours the viewer draws are in `apps/viewer/src/world/theme.ts`; `test/theme.test.ts` fails on a hex colour typed anywhere else in the viewer's .ts and .tsx files. Fixed hexes of the kit are repainted by `KIT_REPAINT` (a test checks every one is listed). CSS files still hold the desktop colours as variables (`look.css`, `look-world.css`).
- Palettes: ids and names unchanged; the mind sees only ids (checked in `apps/mind/src/builds/found-build.ts`); the site reads only each palette's accent hex for a map pin.
- Sky: gradient stops of look.md (peach, hot pink by 0.10, purple by 0.26, deep from 0.5), a striped sun 0.24 rad wide always low on the sim's sun side, stars at night. Tone mapping is off (`flat`). The grid is on the land (4 m, fading 40 to 220 m) and beyond it (8 m, fading by 380 m).
- Hemisphere light: ground colour light purple, 2.5 by day. Sun 2.2 by day.
- Glow: bloom 0.45 (0.3 on touch) and scanlines 0.035 (none on touch); `?fx=0` turns both off. Lamps and windows glow by day in their own colour, stronger at night.
- Place being built: the scaffolding keeps its geometry and the "nothing blocks the way in" tests, drawn as glowing cyan lines. It is not yet the full finished model as wireframe: that comes with L1b, when the buildings have the six-slot model.
- Signs are small windows: ink frame, gradient title bar with three buttons, face body, ink text.
- New debug flags: `?pitch=deg`, `?fx=0`, `?boot`.
- Still differs from the pictures: walls in shade are a dusty rose rather than clean pastel; the sun's top is peach rather than lemon at dusk; stars are small specks; hover labels and note marks are not yet windows (the labels come with L2's pop-up work); frame rate on Roman's laptop not measured.
