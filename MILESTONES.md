# Milestones

Build in thin vertical slices. Each milestone ends with something you can see or play with. Use plan mode at the start of each one, write tests first, and commit when the acceptance criteria pass.

The engine is `forkling`. The first forkling is **Merge**, a cat, living in `merge` (created from the `forkling-world` template). Cat is the first species pack; keep everything else species-agnostic.

---

## M1: Explorable island

**Goal:** walk around a small, good-looking 3D world in the browser.

- pnpm workspace scaffold (`packages/schema`, `packages/sim`, `apps/viewer`, `species/`)
- Vite + React Three Fiber + drei + Rapier
- Island roughly 100 m x 100 m: terrain, water, a few trees and rocks from a CC0 low-poly pack
- Third-person character controller (`ecctrl`): walk, run, jump, camera orbit
- Soft lighting, fog, sky
- Deploy to GitHub Pages

**Done when:** you can open the Pages link on desktop and walk around the island at a steady frame rate.

---

## M2: Merge wanders, via the first species pack

**Goal:** a forkling exists and feels alive, entirely in the browser, with all animal-specific details coming from a species pack.

- Species pack format in `packages/schema`: needs and decay rates, actions, animation slot mapping, micro-behaviors hook, base persona
- `species/cat`: rigged low-poly cat with idle, walk, run, sit, sleep and jump animations; needs `hunger`, `energy`, `curiosity`, `affection`
- `packages/sim`: needs decay from the pack, seeded PRNG, utility AI scoring actions (eat, nap, explore, perch, play, approach visitor, ignore visitor)
- Cat rule: affection only rises when Merge chooses to approach you, not when you approach it
- Grid A* pathfinding over the walkable area
- Cat micro-behaviors in the pack: groom, stretch, knead before sleeping, tail flicks, zoomies at dusk, nap in sunbeams that move with time of day
- Merge notices you within about 5 m and decides whether to care
- Debug overlay toggle showing needs, species and current intention
- A tiny placeholder second pack (e.g. a capsule "blob" species) used only in tests, to prove the engine has no cat assumptions

**Done when:** you can watch Merge go about its business for 10 minutes without getting stuck, it reacts when you walk up, and the sim tests pass for both the cat pack and the placeholder pack.

---

## M3: State lives in the forkling's repo

**Goal:** the world is loaded from `merge`, not hardcoded.

- Create the `forkling-world` template repo and the `merge` repo from it, with `forkling.json`, `objects/`, `memory/`, `journal/`
- `packages/schema`: Zod schemas for forkling, object, intention, event
- Viewer route `/<owner>/<repo>` loads `forkling.json`, its species pack and all `objects/*.json` from the GitHub API
- Body plays back the current intention deterministically from `(intention, startedAt, seed, now)`
- Schema validation errors show a friendly message instead of a blank screen

**Done when:** editing `forkling.json` or adding an object JSON in `merge` and refreshing the viewer changes the world, and two browser windows show Merge in about the same place.

---

## M4: The mind wakes up

**Goal:** Merge makes its own decisions on a schedule.

- `apps/mind`: one tick = load state and species pack, apply needs decay since `lastTickAt`, process `events/inbox/`, choose an intention, commit
- Utility AI handles routine choices with no LLM call
- Haiku 5.5 is called only when something meaningful happens: a visitor event, a strong need, a new day, or a possible build idea. It returns an intention plus a one-sentence `reason` in the forkling's voice.
- Species persona + forkling persona + schemas at the start for caching, prompts kept under 100K tokens
- `.github/workflows/mind.yml` in the template: cron every 30 min, checks out `forkling` at a pinned tag, runs the tick, commits `chore(mind): tick` with a short summary
- Night mode in the owner's time zone: sleep, no LLM calls
- Token usage written to the Actions job summary
- `pnpm mind:local` runs a tick against a local checkout

**Done when:** Merge changes what it is doing over a day with no human input, the commit log reads like a timeline of its life, and daily API spend is a few cents at most.

Note: GitHub cron schedules can be delayed by several minutes. Design for that.

---

## M5: Objects and affordances

**Goal:** the world is made of things the forkling can use.

- Object schema supports a model reference from the asset pack or a composition of primitives (box, sphere, cylinder with colors and transforms)
- Affordances (`sit`, `eat`, `play`, `sleep`, `climb`, `perch`) that the utility AI and the mind can target, filtered by what the species pack can use
- Merge's starter objects: food bowl, cardboard box, cat tree, sunny ledge, pond with fish, yarn ball, a cup on a table (for knocking off, with physics)
- The template ships a neutral starter set (bowl, bed, water, toy); species packs can suggest extras
- Hover or approach an object to see its name and `reason`

**Done when:** Merge eats when hungry, naps in the box or a sunbeam when tired, perches on the cat tree when curious, and occasionally knocks the cup off the table, all driven by state in `merge`.

---

## M6: The forkling builds things

**Goal:** Merge grows its own world through pull requests.

- Mind can choose a `build` intention with a short description of what it wants and why
- Template `CLAUDE.md`: builder instructions (allowed paths, object schema, art style, size limits, PR description in the forkling's voice, species-appropriate ideas)
- `build.yml`: runs the Claude Code GitHub Action with Haiku 5.5, creates a branch and opens a PR
- `validate.yml`: Zod schema check, allowed-paths check, headless sim test that loads the world and runs 1000 ticks
- `packages/sandbox`: QuickJS runner for optional `behaviors/*.js` with memory and time limits
- Pure data PRs auto-merge after CI. Script PRs wait for review.
- Caps: 1 build per day, 1 open builder PR at a time

**Done when:** Merge decides it wants something, a PR appears, CI passes, it merges, and the new object shows up in the viewer and Merge uses it.

---

## M7: Visitors can interact

**Goal:** you and your friends can affect the forkling's life.

- `apps/gateway`: Cloudflare Worker that validates visitor actions and writes them to `events/inbox/` in the target world repo
- Viewer actions: leave a gift, plant something, ring the bell, leave a short message
- Anonymous visitor ID stored in the browser, optional display name
- Per-visitor rate limiting in the gateway
- Mind processes events on the next tick and updates `memory/people.json`
- Forklings greet visitors they know differently from strangers

**Done when:** you leave a gift, and within one tick Merge reacts, mentions it in its journal, and treats you more warmly next visit.

---

## M8: It perceives

**Goal:** the forkling reacts to what it actually sees and to your real life, not just JSON.

- **Eye cam:** render a 512 px frame from the forkling's eye position (height and field of view come from the species pack). A browser visit or a headless render in Actions (Playwright) captures it when something new is in view.
- Send the frame to Haiku with vision. The forkling forms an opinion about what it sees ("a strange tall thing appeared near my box") and stores it in memory.
- Eye cam viewer mode: see the world through the forkling's eyes. For Merge: low to the ground, slight fisheye.
- **It notices your life:** the mind reads the owner's public GitHub events. Late-night commits make it worried, a quiet week makes it sulk, a big merge earns a slow blink (Merge especially approves of merges).
- Day and night cycle matching the owner's real local time, so it actually sleeps when you do.

**Done when:** a visitor places an odd object, and on the next vision tick Merge comments on it in its journal without the object ever being described to it in text.

---

## M9: It changes itself

**Goal:** a real self-improvement loop, with CI and the owner as the safety net.

- **Brain evolution:** weekly, the mind proposes a mutation to `brain/weights.json` with a hypothesis ("I think I'd be happier if I napped less and explored more"). CI runs the headless sim for both versions and posts the happiness comparison on the PR. The owner merges or rejects.
- **Learns new abilities:** the forkling opens an issue describing a skill it wants ("I want to climb trees"). The builder implements it under `skills/<id>/` as a behavior script, procedural animation code and a test. Skills unlock new affordances and can fill animation slots the species pack lacks.
- **Personality drift:** occasionally the forkling proposes an edit to `brain/persona.md` based on what has happened to it. Always human reviewed.
- Viewer page "Evolution log": timeline of every brain, skill and persona change with before/after.

**Done when:** Merge has requested and gained at least one ability it didn't start with, and a merged weight mutation measurably changed its behavior.

---

## M10: It has an inner life

**Goal:** the forkling has things going on that you discover rather than read.

- **Dreams you can visit:** one Haiku call each night turns recent memories into a surreal dream island (`dreams/YYYY-MM-DD.json`): warped scale, objects from its day in odd places, impossible colors. At night the viewer offers a portal into the dream. Gone by morning.
- **Secret plans:** the mind keeps encrypted long-term goals in `plans/`. You discover them through clues: half-built structures, repeated trips to the same spot, cryptic journal lines. When complete, the plan is revealed with its full history.
- **Art:** the forkling paints canvases as generated shader or SVG code, influenced by mood and recent dreams. They hang in its house, which slowly becomes a gallery.
- **Music:** it hums short Tone.js melodies that reflect its mood. Walk close to hear them.
- **Time travel:** slider that replays the commit history so you can watch the island, the gallery and its skills grow.

**Done when:** you visit a dream that clearly contains things from Merge's day, and you correctly guess a secret plan before it is revealed.

---

## M11: Forklings everywhere

**Goal:** many forklings, many species, many worlds, one small social network living in git.

- **Hatching:** anyone creates a world from the `forkling-world` template and picks a species pack in a setup step. On its first tick the forkling names itself and renames its repo to match (unless the owner already named it, like Merge).
- **Second species pack:** ship at least one more (e.g. dog or fox) to prove the format end to end.
- **Visiting other worlds:** a registry file in `forkling` lists known worlds. Occasionally a forkling "travels": its mind reads another world's public state and opens a PR adding a gift or note under `visitors/<its-world>/`. The host reacts on its next tick.
- Friendships and rivalries form in `memory/people.json`, including across species. Merge may have strong opinions about dogs.
- Viewer shows visiting forklings as ghosts for a day after they visit, using their own species model.
- **Translation layer:** forklings never speak, only body language and species sounds from their pack. A "translation" subtitle unlocks gradually as your bond grows, and it's not always flattering.

**Done when:** two forklings of different species in two different repos have visited each other, remember it, and their journals disagree about how it went.

---

## Later ideas

- Seasons that change the island over the year
- Small rule-based critters (mice, birds, butterflies) that forklings chase, with strategies that evolve
- Voice: talk to the forkling through the browser mic, and it decides whether to listen
- The forkling reviews your real pull requests and leaves comments in character
- A yearly autobiography or comic strip generated from its commit history
- Community species packs with a review process
- Upgrade the mind to a cheap VPS for faster ticks, without changing the architecture
