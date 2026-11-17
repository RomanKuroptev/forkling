# Lane D: the look

Plan approved by the coordinator on 17 November 2026: L3, L1, L1b, L2, L4, then a new plan for step 7.

| Slice | What | Files | Status |
|---|---|---|---|
| L3 | First person camera, drag to look, centre cursor, taskbar, 95-style touch buttons | `apps/viewer/src/player/*`, `ui/Cursor.tsx`, `ui/Taskbar.tsx`, `look.css` | PR open on `claude/v4-d-l3`, screenshots in `d-shots/l3-*` |
| L1 | One theme file, sky, sun, grid, palettes, glow, wireframe construction, signs, boot screen, error window | `apps/viewer/src/world/*` | not started |
| L1b | Buildings: six slots, five styles | `world/kitGeometry.ts` | not started |
| L2 | Monitor-head cat, face, merge.exe pop-up | `species/cat`, `forkling/ThoughtBubble.tsx` | not started |
| L4 | Site skin | `apps/site/src/style.ts`, `render.ts` | not started |
| Step 7 | Front page | `apps/site/` | not started |

## L3 notes

- Ecctrl walks the way the camera faces by default, so the camera is simply placed at the capsule's eyes (`Player.tsx`); the capsule has no mesh.
- The screen centre is the cursor: `events.compute` aims every pointer ray at the centre, and `events.update` re-aims it as the visitor walks. Reach is 14 m (`OPEN_RANGE` in `App.tsx`).
- A drag that ends over something no longer opens it (`opens()` in `hoverStore.ts`).
- `cameraClamp.ts` and its tests were removed: nothing but the old third-person camera used them.
- Fonts (Press Start 2P, VT323) come from `@fontsource/*` packages bundled by Vite, so they are served from the site itself.
- Colours in `look.css` are CSS variables for now; L1 moves them into the theme file.
- Still to check by eye: other phones, the note button position beside the Jump button on touch.
