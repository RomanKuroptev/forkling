# The look: Merge 95

Decided by Roman on 16 November 2026 in the redesign thread. This file says how Merge's site and world look. It changes only what visitors see. It adds no rule, prompt, price or verb, and nothing here changes what Merge does.

Pictures are in [`look/`](look/). They were rendered with three.js from plain shapes, so the look is known to be reachable with this stack. Their content is made up; real pages show what Merge really made.

| Picture | What it shows |
|---|---|
| `look/world.png` | The world look: "the mix with heavy vaporwave" |
| `look/world-night.png` | The same world at night: dark sky with stars, lit door, window and screens, glow doing the work |
| `look/real-before.png` | Merge's real viewer today, on the 10-place fixture world |
| `look/real-after-day.png`, `look/real-after-home.png`, `look/real-after-night.png` | The same viewer and world with a rough version of L1 and an eye-height camera, made on 16 November to test this plan. This is the floor, not the ceiling: the finished L1 must look at least this good |
| `look/buildings-merge-visitor.png` | Buildings, Merge with a monitor head, the thought pop-up |
| `look/merge-options.png` | Four bodies for Merge (Roman picked D) |
| `look/front-laptop.png`, `look/front-phone-top.png`, `look/front-phone-scrolled.png` | The front page |
| `look/front.html` | The mockup's own HTML and CSS, to copy colours and sizes from |
| `look/reference/world-scene.html` | The three.js code that drew `world.png` (`?style=mixv`) and `world-night.png` (`?style=night`): the sky gradient, the striped sun, the grid, the lights, the wireframe, and the glow, scanline and colour-split shader with its numbers |
| `look/reference/l1-prototype.patch` | The rough changes behind the `real-after` pictures, as a diff against the viewer at v0.15.0. It is a quick test, with no tests of its own, a throwaway `?fp` camera and colours typed straight into files. Read it for the shaders and the numbers that worked; do not apply it as it is |
| `look/reference/merge-buildings-scene.html` | The three.js code that drew Merge's four bodies (`?m=merge`) and the buildings picture (`?m=world`): the monitor head and its face, the pop-up window, the cursor, the materials |

The two files in `look/reference/` are reference code, not code to ship: plain three.js in one page, written to make pictures. Take the colours, gradients, light settings and shader numbers from them, and rebuild them the way the viewer is built. They import three from `./node_modules/`, so to open one, copy it somewhere three is installed.

**What the pictures do not show.** They show a tiny made-up island. Merge's real world is bigger, has real places from the kit, and is seen from inside in first person. So the pictures fix the mood, colours and effects, not the layout, and matching them takes looking, not only coding. See "How to get the look right" below.

## Who it is for

Meme and casual internet people and people curious about AI first, tech people second. Most arrive on a phone from a shared link and decide in seconds. So: it must look striking in one screenshot, be funny at once, and be fast on a phone.

## What was decided

1. **One idea: you are inside Merge's computer.** The site is Merge's desktop, called **Merge 95** (the name on the start button). The live window that shows Merge is the program **merge.exe**. The 3D world is what that program opens. Do not use the name "MergeOS": other projects already have it.
2. **Front door.** The desktop, with a small live 3D window of Merge always on it. Tapping it opens the world full screen.
3. **Desktop style.** Windows 95 shapes (title bars with three buttons, raised borders, a taskbar with a start button, pixel icons) in the world's colours, on a sunset wallpaper with a striped sun and a pink grid.
4. **World style.** Heavy vaporwave: pastel land, a gradient sunset sky with a striped sun, a pink grid floor to the horizon, glow on bright things, a light CRT shimmer. Only a light pixel filter, if any.
5. **Unfinished things are cyan wireframe.** A place or project being built is drawn as glowing lines and becomes solid when it is done.
6. **Buildings follow one model.** Every building is drawn from the same six slots and is a program on Merge's computer: its front is a window with a title bar. See "The building model" below. The kit's ids, the rooms, the footprints and where the door is do not change; only how they are drawn.
7. **Merge.** Body D, confirmed by Roman: a cat body with an old monitor for a head, ears on top, its face on the screen. The face shows its state (awake, thinking, asleep, cannot reach the server). Merge is also bigger than today, so it is easy to spot and its face can be read from across a place.
8. **Thought bubble.** A small pop-up window over Merge, in the desktop style.
9. **The visitor is in first person, and is the cursor.** No body. A cursor arrow sits in the middle of the screen and turns into the hand over anything that can be opened.
10. **Technology stays.** three.js with React Three Fiber for the world, the site's own page builder with one stylesheet for the pages. No new engine and no web framework.

## Colours and type

| Name | Hex | Used for |
|---|---|---|
| deep | `#2b0b5e` | Sky top, the ground under the grid, shadows |
| purple | `#8c1eff` | Title bar start, links |
| hot pink | `#ff3fa4` | Sky middle, grid lines, accents |
| pink | `#ff6ad5` | Soft accents |
| peach | `#ffb36b` | Horizon |
| sun | `#fff27a` | The sun, highlights |
| teal | `#7fe3d8` | Land |
| cyan | `#01cdfe` | Wireframe, main buttons, screens' glow |
| face | `#ffd6f1` | Window and button surface |
| ink | `#1a0b3b` | Text and outlines |
| terminal green | `#39ff88` | Text on Merge's screens and its face |

Type: `Press Start 2P` for title bars, buttons and the one headline; `VT323` for everything read. Both are under the Open Font License. Serve them from the site itself, not from Google.

Text must stay readable: body text no smaller than 18 px in VT323, and ink on face for anything longer than a label.

## Speed rules

1. The front page is useful before any 3D has loaded, and loads no 3D by itself.
2. The live window first shows a still picture. It starts a light "watch mode" (no physics, no walking, a camera circling Merge) only when it is on screen, and not at all on a phone that asks for reduced motion or data saving.
3. The full world with physics loads only after ENTER WORLD.
4. Glow and the CRT filter are lighter on touch devices and can be switched off with one flag.
5. The world holds 30 frames per second on Roman's laptop. This is the W5 check that was never done.

## How to get the look right

A look cannot be unit tested. Every look slice is built in a loop:

1. Build a first version.
2. Take screenshots of the 10-place fixture world (`?world=local&fixture=10`) with the viewer running, from at least three spots, all at eye height: on open land facing the sun, in front of a place, and inside a room. For L1 also at noon, dusk and night (`?time=`).
3. Open each screenshot and the reference picture side by side and write down, in plain words, where they differ: sky, sun, grid, colours, glow, how readable things are.
4. Fix the biggest difference and go back to 2. At least three rounds, and stop only when what is left is small.
5. Put the last screenshots in the PR beside the reference pictures, with the list of what still differs.

Roman then shows the PR screenshots in the redesign thread for a second pair of eyes before the slice is called done. Expect one or two more rounds of tuning after that; this is normal for visual work.

Things that most often go wrong, so check them each round: everything too dark or too washed out; glow so strong that text on screens and signs cannot be read; the grid flickering in the distance; pastel walls with no shading so buildings look flat; the filter making small text unreadable on a phone-sized window.

## What the test on the real world showed

On 16 November a rough L1 was tried on the real viewer with the 10-place fixture world (`look/real-before.png` and the three `real-after` pictures, code in `look/reference/l1-prototype.patch`). These are rules now, because each one fixed something that looked wrong:

1. **Tone mapping off.** The canvas runs `flat`. With the default tone mapping the pastels turn grey.
2. **Shade must stay coloured.** The hemisphere light's ground colour is a light purple (`#b48cff`), at about 1.9 by day. With a dark ground colour every wall facing away from the sun turns brown.
3. **No cream, peach or beige walls.** They read as brown in shade even with rule 2. Wall colours are cool pastels: lilac, mint, ice blue, pink, pale lemon at most.
4. **The grid is drawn on the land itself**, a thin pink line every 4 meters that fades out between 40 and 220 meters, as well as on the plane beyond the land. Without it the land is one flat teal sheet and nothing has scale.
5. **The sun is always big and low**, on the side of the sky where the sim's sun is, about 0.24 radians across, its centre a little above the horizon. It does not climb at noon. At night it is gone and small stars come out.
6. **Sky stops, by day:** peach `#ffb36b` at the horizon, hot pink `#ff3fa4` by 0.10 up (the sine of the angle), purple `#8c1eff` by 0.26, deep `#2b0b5e` from 0.5. By night: purple at the horizon, deep, then near black `#05021a`.
7. **Glow is gentle.** Bloom at about 0.45 with a threshold of 0.9, scanlines at about 0.035 opacity. Stronger than that and the sun turns into a white blob and text on signs is lost.
8. **Things that glow, glow by day too**, in their own colour, and stronger at night.
9. **The mist at the world's edge** takes the look's colours (towards `#ffd6f1` by day, `#b48cff` by night), not white.

Still wrong in the test pictures, to be fixed in L1: the sun's stripes are too few and too faint; the fixture's Home still has a brownish wall; the scaffolding and the plot markers are still wood coloured; the thought bubble, the hint bar and the signs are still in the old style.

### One theme file

Colours are typed into many files today: `Environment.tsx`, `Land.tsx`, `Paths.tsx`, `modelStyle.ts`, `constructionGeometry.ts`, `exhibitGeometry.ts`, `plotGeometry.ts`, `signGeometry.ts`, `Signs.tsx`, `mistGeometry.ts`, `noteMarks.ts`, `Notes.tsx`, `Player.tsx`, and about 30 primitives in `kit/parts.json` carry a fixed hex of their own (plants, glass, stone). L1 moves every colour the viewer draws into one file, `apps/viewer/src/world/theme.ts`, and the fixed hexes in the kit are repainted there by a lookup, so the look can be tuned in one place and the kit's file keeps its ids. A test fails if a new hex colour appears in the viewer outside the theme file.

### The 8 palettes, as tested

Ids and names stay. These are the colours of the test, with two walls changed afterwards because they went brown in shade (ember and paper). The mind is only ever shown the ids (checked in `apps/mind/src/prompts/constraints.ts`; check again in the plan).

| id | wall | trim | roof | floor | accent | wood | metal | glow |
|---|---|---|---|---|---|---|---|---|
| harbour | `#bfeaf5` | `#6a4cff` | `#01cdfe` | `#e8d9ff` | `#ff3fa4` | `#b388ff` | `#d8d8ff` | `#7ffcff` |
| meadow | `#fff3c4` | `#ff71ce` | `#7fe3d8` | `#ffe6f5` | `#ff9f43` | `#c79bff` | `#e2e0ff` | `#fff27a` |
| ember | `#ffc8e8` | `#ff4f6d` | `#ff7a59` | `#ffe9dc` | `#fff27a` | `#c06cff` | `#e8d6ff` | `#ffb36b` |
| moss | `#d6ffe9` | `#19c6a6` | `#39ff88` | `#e8fff4` | `#ff6ad5` | `#8f7bff` | `#d8f5ff` | `#baffc9` |
| dusk | `#e2ccff` | `#8c1eff` | `#5b2bd6` | `#f1e4ff` | `#ff6ad5` | `#a06bff` | `#d8d8ff` | `#ff9ad8` |
| paper | `#f4f0ff` | `#ff9ad8` | `#ffc8e8` | `#fff0fa` | `#01cdfe` | `#d0a8ff` | `#f0ecff` | `#fff27a` |
| slate | `#c9c6ff` | `#3a2a8a` | `#2b0b5e` | `#dedcff` | `#fff27a` | `#7a5cff` | `#e2e0ff` | `#7ffcff` |
| coral | `#ffc8e8` | `#ff3fa4` | `#ff6ad5` | `#ffe6f5` | `#01cdfe` | `#b967ff` | `#f5e6ff` | `#ffd0f0` |

Meadow's wall is the one pale lemon; if it reads as brown in shade, make it `#eaffd6`. Other colours that worked: land `#7fe3d8`, `#5fd0e8`, `#a6f0df`; paths `#ffd6f1`; leaves `#ff71ce` and `#d94fd0`; trunks `#8f5bff`; stone `#d8d8ff`; glass `#9ff3ff`.

## The building model

Roman on 16 November, after seeing the test pictures: the houses still look wrong, and the fix should be a design philosophy and a model that is defined once and reused. Why they looked wrong: Merge's real places are 12 by 10 meters and one floor of about 3 meters, so they are four times wider than tall and read as sheds; they are covered in thin lines (planks, trim strips, small window frames); and none has anything that stands out.

### The philosophy

1. **Silhouette first.** A building is known by its outline from 100 meters. If two styles have the same outline, one of them is wrong.
2. **Few big shapes.** No planks, no trim strips, nothing thinner than 0.15 meters except neon lines. A building is made of tens of shapes, not hundreds.
3. **Three colours.** Body, accent and glow from the place's palette, plus the two neutrals, chrome and white marble. Nothing else.
4. **One hero.** Each building has exactly one bold feature. Never two.
5. **It glows.** Every building has a lit surface that shows by day and carries the building at night, and where it can, it shows what is inside: Merge's newest work in that place.
6. **Five materials:** pastel matte, chrome, glass, neon, white marble.
7. **Every building is a program.** Its front is a window on Merge's desktop, with a title bar that carries the place's name.
8. **The same place always looks the same.** Any variation comes from the place's id through the seeded generator, never from chance.

### The six slots

Every building, in every style, is these six things and nothing more. The code that draws exteriors (`exteriorInstances` in `apps/viewer/src/world/kitGeometry.ts`) is rebuilt around them.

| Slot | What it is | Rules |
|---|---|---|
| Base | A low slab the building stands on, wider than the footprint by 0.8 m on each side, 0.12 m high, with a thin glowing edge | Only looks: the floor inside and the door stay at ground level, so the body's path is unchanged |
| Body | The walls, on the footprint and floors the place file gives | Smooth panels in the body colour. One accent band at the foot and one at the top. Windows are few and big: at most one per 4 m of wall, at least 1.2 m wide and 1.6 m tall, and they glow |
| Front | The door wall, drawn as a window on the desktop: it rises above the roof as a false front, and its top metre is a title bar in the accent colour with the place's name and three small buttons | As tall as the larger of 1.5 times the body or the body plus 2.5 m. On a building wider than 16 m it stands only over the middle 8 m, so the outline steps up at the door |
| Crown | What stands on the roof behind the front, and gives the outline | Adds between a third and two thirds of the body's height. Set by the style |
| Hero | The one bold feature | Set by the style. Only one |
| Glow | The lit surface | At least 15 percent of the front's area. A screen shows the newest work of the place when there is one |

The sign by the door stays where it is, because it is where a visitor opens the place's history, and becomes a small window of its own.

### The five styles

The ids and names stay, because Merge picks from them. Each style is one fixed answer per slot:

| Style id | Read as | Body | Crown | Hero |
|---|---|---|---|---|
| `timber` | A pastel villa | Matte pastel panels | A low chrome pyramid | A porch of four white marble columns across the front |
| `stone` | A marble temple | White marble with the accent colour only in the bands | A dome | One tall arch around the door |
| `glass` | A screen house | Tinted glass | A flat chrome slab with a neon edge | A screen that fills the front beside the door |
| `tin-shack` | An arcade | Chrome | Three stepped blocks, each smaller than the one below | A neon sign on the roof, in the glow colour |
| `tower` | An obelisk | Matte pastel, narrowing a little as it rises | A pyramid tip that glows | The tower itself, with one glowing ring around it |

The style names no longer describe what is seen (a `timber` place is not wooden). Renaming them would change what Merge reads when it picks a style, which is a prompt change. So it is not part of this plan; it is noted here for Roman to decide later.

### What must not change

- The footprint, floors, rooms, room heights and the door's place (the middle of the +z wall): they come from the place file, and the body and the visitor's physics are built from them (`wallBoxes`, `buildBodyWorld`).
- Part ids, style ids, palette ids, and each part's `size`. The shapes inside a part (`primitives` in `kit/parts.json`) may be redrawn, after checking that nothing but the viewer and the site's pictures reads them.
- The limits of spec 5.2. If the front or the crown would break a height limit there, say so in the plan: the limit was written for rooms, and Roman decides whether decoration counts.
- The render budget test (`renderBudget`): the new buildings must cost no more than today's. Dropping planks and trim pays for the crown.
- A place being built, closed or neglected still shows that it is, in this style: being built is the finished model in cyan wireframe.

### The check for every building

Before a building is called done, look at a screenshot from 15 meters at eye height and one from 100 meters, by day and at night, and answer: Can I tell which style it is from the outline alone? Are there three colours or fewer, not counting chrome and marble? Is there exactly one hero? Does it glow by day? Is anything thinner than 0.15 meters that is not neon? Does it look like a window on a desktop from the front? Six yes answers, or it is not done.

### Later, with Roman's review

Smaller, taller places and new parts (palms, busts, checker floors, neon shapes) would help more than anything above, but they change what Merge can build or pick, so they are a rule change and not part of this plan. Furniture and the insides follow the same philosophy when their turn comes.

## The small things, so nothing is left in the old style

**Merge's face** (L2). Drawn on the screen in terminal green on near black, in big pixels (a grid of about 16 by 12), so it reads from 20 meters:

| State | Face |
|---|---|
| Awake, between steps | Two square eyes and a small smile. A blink every few seconds |
| In a step (reading, making, tending) | The same eyes looking down, and three dots that fill one by one |
| Asleep | Two flat lines and a `z` that drifts up |
| Data is old (the server could not be reached) | `NO SIGNAL` in small letters under two `x` eyes |

The state comes only from what the viewer already has. Never draw a feeling the mind did not report.

**The thought pop-up** (L2). A window titled `merge.exe`, the same three lines as today (wants, now, because), VT323 at a size that reads on a phone, at most about 30 characters a line and 4 lines, longer text cut with `...`. It never covers Merge's face. Asleep it shows `zzz`.

**The visitor's cursor** (L3). A white arrow with an ink outline at the centre of the screen, about 24 px; the hand when something can be opened; nothing else on screen moves with it.

**Signs and labels in the world** (L1). Place signs become small windows: a gradient title bar with the place's name, face-coloured body, ink text. Hover labels and note marks use the same window style.

**The hint bar and the touch buttons** (L3). The bar of key hints becomes the taskbar at the bottom, with `Merge 95` on the start button. Touch buttons are raised 95-style buttons.

**Loading** (L1). A boot screen: `Merge 95` on the sunset wallpaper and a blocky progress bar, in place of the grey "Loading" text.

**When the world cannot load** (L1). `WorldErrorPanel` becomes an error window in the same style, saying plainly what happened.

**Icons** (L4). Small pixel-art pictures made for the site and stored with it, at 32 px, drawn twice the size on screen with no smoothing. The mockup uses emoji as stand-ins only; emoji look different on every phone, so they are not used.

**The share picture** (L4, and it matters for visitors more than most things here). Every page gets a title, a one-line description and a 1200 by 630 picture for link previews (`og:image`, `twitter:card` as a large image). The picture is the desktop with Merge in its live window. Also a favicon: Merge's monitor face, 32 px. When step 7 is live, the share picture is rebuilt with each site build from the newest card, so every shared link shows what Merge made today.

**Day and night on the site** (L4). The desktop's wallpaper follows Merge's clock in Stockholm time: sunset by day, the starry night sky while it sleeps, when the live window says that `merge.exe` is sleeping.

**Motion.** Small and slow: the blink, the dots, a slow drift of the grid on the wallpaper. Everything that moves stops for visitors whose device asks for reduced motion.

**Sound.** None. Not part of this plan.

**Readable for everyone.** Ink on face for all text that is read. Never pink text on teal or yellow on pink. Buttons at least 44 px tall on a phone.

## The build, in slices

**When.** Roman decided on 16 November: the look slices run alongside steps 1 to 8, because they do not touch the mind and so do not blur what each step is measured on. One look slice at a time.

**Order: L3, then L1, then L1b, then L2, then L4.** First person comes first because the test on the real world showed that today's camera looks down at the ground from behind the visitor, so the sky, the sun and the horizon, which carry the look, are almost never on screen. At eye height they fill half of it.

One PR per slice, tests first where there is logic, screenshots in every PR. L1 to L3 touch only the viewer and the cat's body. L4 touches only the site's stylesheet and page frame. The front page itself is [`step-7-front-page.md`](step-7-front-page.md), which now builds to these pictures.

### L1: the world's skin

- `apps/viewer/src/world/Environment.tsx`: replace the physical sky with the gradient sky and striped sun. The world still follows real time: by day the sunset look, by night a darker purple sky with stars, the sun low or gone, and glow doing the work. Keep the sun direction from `packages/sim` for the light.
- A grid floor beyond the land, to the horizon. Fog in the sky's colours.
- Land and paths in the palette above (`Land.tsx`, `Paths.tsx`, `modelStyle.ts`).
- The 8 palettes in `kit/parts.json` keep their ids and names and get new colours in this family. First check where else the hex values are read (the site, the mind's prompts, tests). If the mind is ever shown a colour, stop and tell Roman.
- Screens, lamps and signs glow (the kit's `glow` flag already exists). Add bloom and a light scanline pass.
- A place being built: its future walls and roof as cyan wireframe in place of the timber scaffolding (`constructionGeometry.ts`). Keep the guarantee that nothing blocks the way in.
- Do not swap one kit part for another (a pine stays a tree of that shape). New parts such as palms, columns and neon signs change what Merge can pick, so they are a later step that Roman reviews.

Done when: screenshots at noon, dusk and night on the 10-place fixture world, at eye height, sit beside `look/real-after-day.png`, `look/real-after-night.png` and `look/world.png`, look at least as good as the `real-after` pictures, and Roman says so; 30 fps on his laptop; all tests pass.

### L1b: the buildings

- Rebuild the drawing of exteriors around "The building model": the six slots, the five styles, the check.
- Everything under "What must not change" in that section holds.
- Start with one style on the fixture world, show screenshots, and only then do the other four. A model that is wrong is cheaper to fix after one style than after five.

Done when: all five styles pass the six questions of the check in screenshots at 15 and 100 meters, by day and at night; the render budget test passes; the body still walks in and out of every place in the fixture world; Roman has seen the screenshots in the redesign thread.

### L2: Merge's body and the thought pop-up

- `species/cat/src/buildCat.ts`: the monitor head with ears, pastel body, then `pnpm --filter @forkling/species-cat build:model`. All animation clips must still play.
- The face is drawn by the viewer from state the body already has (awake, in a step, asleep, stale data). No new data from the mind.
- `apps/viewer/src/forkling/ThoughtBubble.tsx` and its styles: the pop-up window. Same lines as today, same hide key.
- Make Merge bigger. Start at about one and a half times today's size and settle it by eye with Roman from screenshots. First check what depends on the body's size (doors, the cat bed, where it stands at a desk, how close a visitor counts as near, anything in `packages/sim`). If the size is more than a drawing scale, say so in the plan before changing it.

Done when: every clip checked by eye with `?clip=`, the four faces shown in screenshots, tests pass.

### L3: first person

- `apps/viewer/src/player/Player.tsx`: the camera at eye height, no visitor body, look by mouse drag or touch drag, the same walk stick on phones. First check what the walking controller (`ecctrl`) offers for first person and say so in the plan.
- The centre cursor: an arrow that becomes the hand when `hoverStore` has something. Tap or click opens it.
- The camera clamp code for the third-person camera may no longer be needed. Remove it only if its tests show nothing else uses it.
- The forkling still reacts when the visitor comes close.

Done when: a visitor can walk into a room, look at a work and open it, on a laptop and on a phone-sized touch window; tests pass.

### L4: the site's skin

- `apps/site/src/style.ts` and the page frame in `render.ts`: every existing page becomes a window on the desktop, with the same content. The wrapping row of links becomes desktop icons on a laptop and a start menu on a phone.
- One stylesheet, no framework, no script needed to read a page. A small script may let windows be dragged on a laptop.
- Works and projects keep their sandbox frame untouched.

Done when: every page type has a screenshot at 390 px and 1280 px, nothing overflows sideways on a phone, tests and the site build pass.

### Then: step 7, the front page

As its own file says, with the watch mode of the speed rules added to slice B. Its mockups are redone from Merge's real content once projects (step 4) and visitor threads (step 5) exist.

## Do not touch

- `apps/mind`, any prompt, `self/seed.md`, prices, points, rules, `brain/budget.json`, Merge's live repo.
- Part ids, style ids and palette ids in the kit.
- The rule that the viewer never calls a model.

## A cheap test before the big slices

Before L4 and step 7, Roman shows the pictures in `look/` to a handful of people who have never seen Merge and notes which one they react to and what they think it is. If they do not get "an AI lives here and makes things" within a few seconds, the headline and the live window change before anything is built.

## Prompts for Claude Code

For Roman. A fresh session in `C:\Code\forkling` per slice.

### L1 (the second slice to build, after L3)

```
Use plan mode. Do not write code until I say yes to the plan.

Read, in this order: CLAUDE.md, STATUS.md, apps/viewer/CLAUDE.md and
docs/spec/v4/look.md. Open and look at the pictures in docs/spec/v4/look/,
above all the real-after pictures, world.png, world-night.png and
buildings-merge-visitor.png, and read the reference code in
docs/spec/v4/look/reference/, above all l1-prototype.patch.

Plan slice L1 (the world's skin) from look.md.

In the plan, show me in plain words:
1. Which files change.
2. Where the kit's palette colours are read outside the viewer. If the mind is
   ever shown a colour value, stop and tell me.
3. How day, dusk and night will look, which numbers you take from the
   reference code, and how the theme file is laid out.
4. What the glow and the CRT filter cost in frames per second, and how they are
   made lighter on phones.
5. Anything in look.md that does not match the code you find. Do not guess:
   tell me and suggest the fix.

Rules: this slice changes only how things look. Do not touch apps/mind, any
prompt, any kit id, or Merge's live repo. Do not release. Speak to me in plain
language; I am not deeply technical.

Then stop and wait for my OK.
```

After I say yes:

```
Build slice L1 as planned: tests first where there is logic, small commits, one
PR. Follow "How to get the look right" in look.md: run the viewer, take the
screenshots, open them next to the reference pictures, say what differs, fix
it, and do that at least three rounds. Show me the last screenshots and the
list of what still differs. Do NOT merge yet: I will show the screenshots in
my redesign thread first. Update STATUS.md. Do not release until I say so.
```

### L3 (build this one first)

```
Use plan mode. Do not write code until I say yes to the plan.

Read, in this order: CLAUDE.md, STATUS.md, apps/viewer/CLAUDE.md and
docs/spec/v4/look.md. Open and look at the pictures in docs/spec/v4/look/.

Plan slice L3 (first person) from look.md, with the parts of "The small
things" that belong to L3: the visitor's cursor, and the hint bar and touch
buttons.

In the plan, show me in plain words:
1. Which files change.
2. What the walking controller (ecctrl) offers for first person, and what you
   will do if it does not fit.
3. What happens to the third-person camera clamp code and its tests.
4. How walking and looking work on a phone.
5. Anything in look.md that does not match the code you find. Do not guess:
   tell me and suggest the fix.

Rules: this slice changes only the visitor's view and controls. Do not touch
apps/mind, any prompt, any kit id, or Merge's live repo. Do not release. Speak
to me in plain language; I am not deeply technical.

Then stop and wait for my OK.
```

After I say yes:

```
Build slice L3 as planned: tests first where there is logic, small commits, one
PR. Follow "How to get the look right" in look.md: run the viewer, take
screenshots on the 10-place fixture world (on open land, in front of a place,
inside a room, and one at phone size), and check each by eye. Show me the
screenshots. Do NOT merge yet: I will show them in my redesign thread first.
Update STATUS.md. Do not release until I say so.
```

### L1b (the buildings, after L1)

```
Use plan mode. Do not write code until I say yes to the plan.

Read, in this order: CLAUDE.md, STATUS.md, apps/viewer/CLAUDE.md and
docs/spec/v4/look.md, above all the section "The building model". Open and
look at the pictures in docs/spec/v4/look/: buildings-merge-visitor.png is the
feeling to reach, real-after-day.png shows the sheds this slice must get rid
of.

Plan slice L1b (the buildings) from look.md.

In the plan, show me in plain words:
1. Which files change, and whether anything but the viewer reads the shapes
   inside a kit part.
2. For each of the five styles, how you will build the six slots, with sizes.
3. Whether the front or the crown breaks any limit in spec 5.2. If so, stop
   and ask me.
4. What the new buildings cost against the render budget, compared to today.
5. Which style you build first, and why.
6. Anything in look.md that does not match the code you find. Do not guess:
   tell me and suggest the fix.

Rules: this slice changes only how buildings are drawn. Footprints, floors,
rooms, the door's place and every kit id stay as they are. Do not touch
apps/mind, any prompt, or Merge's live repo. Do not release. Speak to me in
plain language; I am not deeply technical.

Then stop and wait for my OK.
```

After I say yes:

```
Build the first style of slice L1b as planned: tests first where there is
logic, small commits, one PR. Follow "How to get the look right" and "The
check for every building" in look.md: screenshots from 15 and 100 meters at
eye height, by day and at night, and the six questions answered for each.
Show me the screenshots and the answers, then stop. Do NOT build the other
styles and do NOT merge yet: I will show the screenshots in my redesign thread
first. Update STATUS.md. Do not release until I say so.
```

### L2 and L4

The same two prompts as L1, with `L1 (the world's skin)` replaced by `L2 (Merge's body and the thought pop-up)` or `L4 (the site's skin)`, and these plan questions in place of 2 to 4:

- L2: how the face is chosen from state the viewer already has; what depends on Merge's size and how much bigger you suggest; proof that every animation clip still plays.
- L4: a screenshot plan for every page type at 390 px and 1280 px; how the links are reached on a phone; where the fonts and icons are served from; how the share picture is made.
