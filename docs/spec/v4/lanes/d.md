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

## L2 notes

- Merge has a monitor for a head (chrome bezel, dark screen, ears on top, pastel body); the face is a quad named `Face` painted by the viewer from state it already has: no signal (clock not synced), asleep, in a step (a goal step is running), else awake. Draw scale 1.5 (`DRAW_SCALE` in `Forkling.tsx`); the sim sizes (capsule, grid, furniture spots) are unchanged, so this is a drawing scale only.
- The pop-up is `merge.exe`: at most 4 lines of about 30 characters, cut with `...`, kept inside the screen (`clampPopup`). Hover labels and the note windows use the same window look (`Win.tsx`, `look-windows.css`).
- The note panel shows the whole thread (oldest first), an Answer button under the newest reply of an open thread (sends with `replyTo`), and a closed thread says so.
- Not checked in the world: the face in a screenshot (the sitting cat faces the wall at its desk in the fixture, and `?clip=` needs a camera fix after L3 when `?stand` is used); the four faces are shown from the same grid code on a plain page. Every animation clip still plays by test (the clip list is unchanged) but I did not check each by eye.
## L1b notes (tower first)

- Front and crown clamped to the 12 m limit of spec 5.2, Roman to decide. The clamp is `MAX_OUTLINE_HEIGHT` in `apps/viewer/src/world/building.ts`; lifting it is one constant.
- The tower is drawn by `buildingModel` (six slots); the four other styles keep the old drawing until the first style is reviewed. Style ids are unchanged.
- Shape of a kit part is not read by anything but the viewer, the kit tests and the mind kit-model test; nothing was changed there.
- Crown rule as built: its tip rises above the front by half the body, and it stands right behind the front, so it shows in the front view.
- Not done yet: the place name as text on the front title bar (the sign by the door carries it), the front screen showing the newest work (no such data in the viewer yet), and the finished model as wireframe for a place being built (L1b-3).
- 100 m views are not possible in the fixture world (it is only about 190 m long), so the far shots are 75 m, from behind.
- Later look PR: strengthen the land grid a little at night (reviewer note on L1).
- L4 also: lane C sharing: PNG share pictures instead of the SVG for notes threads (`notes/t/<thread>.svg`), and styling the thread pages.

## L4 notes

- L4a: every site page is a window on Merge 95 (title bar, three buttons), the links are desktop icons on a laptop and the start menu on every screen (a checkbox and its label, no script). Fonts come from `@fontsource/*` (dependencies of `apps/site`, so the Pages workflow's `--filter "@forkling/site..."` install brings them in) and are copied to `fonts/` by `buildSite`. `layout` takes `shell: 'bare'` for step 7's desktop page.
- L4d (a build session's newest project screenshot on the Workshop bench) is dropped until after R2.

## Step 7B notes (front page)

- `/` is `shell: 'bare'`: headline (today.json `who`, else "Merge is an AI. It lives here and makes things."), merge.exe (Merge live), today.txt (cards from today.json), project window, notes.exe (latest answered note, the existing form, the disclosure). No 3D loads: ENTER WORLD is a link to the viewer (`viewerAddress(baseUrl)`: `https://owner.github.io/forkling/owner/repo`). Pictures are span backgrounds, never `<img>`.
- Merge live: `front.js` polls `<mind>/now.json` every 30 s (LIVE / ASLEEP, step, thought, night wallpaper follows `asleep`); no answer shows LAST SEEN with the repo's state and its time.
- `/under-the-hood/` holds the old home content (wants, today's plan with reasons, obsessed, latest diary) plus budget (month, spent, cap, server, by kind, earlier months), points and health (engine, ticks, failures, warnings). Linked from the menu, the icons and the front page footer.
- Missing data, shown empty: Merge has no `self/about.md` (headline falls back), no project in progress (window left out), no `now.json` in a static build, no progress bar for the project (no data), the still is the share picture (no 3D screenshot file), no visit counter note.
- Not done in 7B: viewer and site on one address and redirects from viewer addresses (a deploy change, needs coordinator), "since your last visit" as picture cards (changes.json has no pictures), world overlay (own PR).

## Step 7 world overlay notes

- Top bar in the viewer (mockup world-overlay): a "desktop" button (the folder above when inside the site's own /world/, else the world's Pages site, none for a made-up world), the title chip "WORLD.exe - Merge's island · N places" (hidden under 760 px), and "?" which opens the full key list in a window. The bottom line is now short ("WASD to walk · drag to look · ? for the rest"); the taskbar stays (panels are sized to it).
- Not done from the mockup: the dark "click to say hi to Merge" chip near the cursor (no such interaction exists), the "toaster_lab.wip" status window for a place being built, and removing the taskbar.
- Step 7 one address (PR after 7B): `@forkling/site` depends on `@forkling/viewer` (so `pnpm install --filter "@forkling/site..."` selects site, schema, sim, viewer and species-cat; checked with `pnpm --filter "@forkling/site..." list`). `cli.ts` builds the viewer into `<out>/world/` with `VITE_BASE=<site path>world/`, `VITE_WORLD=owner/repo` (GITHUB_REPOSITORY, else the github.io address), `VITE_MIND_URL`, `VITE_TURNSTILE_SITE_KEY`; `--no-viewer` skips it. A viewer built with `VITE_WORLD` shows that one world whatever the path. On the engine's own Pages (`VITE_WORLD_SITE` set in deploy-pages.yml) a visit for Merge's world (bare address, Merge's repo path, `?world=RomanKuroptev/merge`) goes to `<site>world/` with the query kept; other worlds, `?world=local` and the fixture stay. ENTER WORLD links to `world/`. Measured against a clone of Merge's repo: the viewer build took 0.9 s locally, `world/` is 4.4 MB, the whole site 10 MB.
- Earlier note, now done: viewer and site on one address and redirects from viewer addresses (a deploy change, needs coordinator), "since your last visit" as picture cards (changes.json has no pictures), world overlay (own PR).
