# Forkling

Forkling is an engine for autonomous AI pets that live in explorable 3D worlds. Every pet, a **forkling**, has its own GitHub repo: its state, memories, journal and every object it has ever built live there as files, and it grows its world, its skills and even its own brain by opening pull requests.

Anyone can fork the world template and hatch their own forkling, choosing what kind of animal it is. The first forkling is **Merge**, a cat.

The project should be **fun first**, **explore what AI can actually do** (perception, self-improvement, inner life, multi-agent), and stay **nearly free to run** (target: under $5/month per forkling).

## Core idea: mind, body, builder

| Part | Where it runs | What it does | Cost |
|---|---|---|---|
| **Mind** | GitHub Actions cron in the world repo, every 15 to 60 min | Reads state + visitor events, updates needs, picks the next *intention*, writes journal entries, decides when to build | Haiku 5.5, pennies |
| **Body** | The visitor's browser | Plays the current intention out in real time: pathfinding, animation, idle behaviors, reacting to the visitor | Free |
| **Builder** | GitHub Actions, triggered by the mind | Claude Code (via the Claude Code GitHub Action) writes new objects, skills or art on a branch and opens a PR | Haiku 5.5, a few cents per build |
| **Gateway** | Cloudflare Worker (free tier) | Accepts visitor actions (gift, plant, ring bell) and writes them to `events/inbox/` | Free |

The mind decides *what* and *why*. The body decides *how it looks moment to moment*. Never call an LLM from the body.

## Species packs

The engine is species-agnostic. Everything specific to an animal lives in a **species pack**, so a forkling can be a cat, dog, fox, owl, dragon or anything else.

```
species/<id>/
  species.json      # id, display name, needs and their decay rates, actions, affordances it can use
  model.glb         # rigged low-poly model (CC0 or self-made)
  animations.json   # maps engine animation slots (idle, walk, run, sit, sleep, jump, happy...) to clips
  behaviors.ts      # signature micro-behaviors (e.g. cat: groom, knead, zoomies)
  persona.md        # base personality, merged with the forkling's own brain/persona.md
  sounds/           # vocalizations used by the translation layer
```

Rules:
- The mind, builder, dreams, evolution and multi-world features never hardcode a species. They read the pack.
- A pack declares its needs from a shared vocabulary (`hunger`, `energy`, `curiosity`, `affection`, `fun`, `social`...) plus decay rates, so the utility AI works for any animal.
- Missing animation slots fall back gracefully (e.g. no `climb` clip, so the species can't climb until a skill adds it).
- **`cat` ships first and is the default.** Cat flavor: independent, curious, sleeps a lot, affectionate only on its own terms, knocks things off ledges.

## Repos

Each forkling only ever writes to its own repo.

### `forkling` (this repo, the engine)

```
forkling/
  packages/
    schema/        # Zod schemas shared by everything (forkling, species, objects, events, intentions)
    sim/           # Pure, deterministic sim logic: needs decay, utility AI, intention playback
    sandbox/       # QuickJS runner for forkling-written behavior scripts
  species/
    cat/           # first species pack
  apps/
    viewer/        # Vite + React + React Three Fiber explorable world (GitHub Pages)
    mind/          # Node script run by each world repo's cron workflow
    gateway/       # Cloudflare Worker for visitor actions
  CLAUDE.md
  MILESTONES.md
```

### `forkling-world` (template repo) and each forkling's own repo

People fork or "use this template" on `forkling-world` to hatch a new forkling. Merge lives at `github.com/<you>/merge`.

```
merge/
  forkling.json          # name, species id, needs, position, mood, current intention
  objects/<id>.json      # every object in the world
  behaviors/<id>.js      # optional sandboxed behavior scripts for objects
  memory/summary.md      # rolling long-term memory, kept short
  memory/people.json     # visitors and other forklings it knows, and how it feels about them
  journal/YYYY-MM-DD.md  # one diary entry per day
  events/inbox/*.json    # visitor actions waiting for the next tick
  brain/weights.json     # utility AI weights the forkling can propose to evolve
  brain/persona.md       # its own personality on top of the species persona, which it can propose edits to
  skills/<id>/           # abilities it asked for: behavior script + animation code + test
  dreams/YYYY-MM-DD.json # last night's dream island (temporary, replaced each night)
  art/<id>.json          # paintings (shader or SVG source) and melodies (Tone.js sequences)
  plans/*.enc            # secret long-term goals, encrypted, revealed when completed
  visitors/<world>/      # gifts and notes left by forklings from other worlds
  CLAUDE.md              # instructions for the builder (what it may and may not do)
  .github/workflows/
    mind.yml             # cron: checks out forkling at a pinned tag, runs apps/mind
    build.yml            # runs the Claude Code Action when the mind requests a build
    validate.yml         # CI on every PR: schema check, sandbox limits, headless sim test
```

The viewer reads a world repo through the public GitHub API (raw files + commit history). One hosted viewer can open any world: `/<owner>/<repo>`.

## Stack

- **Language:** TypeScript everywhere, pnpm workspaces
- **3D:** React Three Fiber, drei, `@react-three/rapier` for physics, `ecctrl` for the third-person character controller
- **Assets:** CC0 low-poly packs (Kenney, KayKit, Quaternius). Keep the art style coherent across species.
- **Validation:** Zod, one schema package used by viewer, mind, gateway and CI
- **Sandbox:** `quickjs-emscripten` for forkling-written behavior scripts
- **AI:** `@anthropic-ai/sdk` in the mind, `anthropics/claude-code-action` for the builder
- **Tests:** Vitest
- **Hosting:** GitHub Pages (viewer), GitHub Actions (mind + builder), Cloudflare Workers (gateway)

## Key data shapes (see `packages/schema` for the source of truth)

- **Forkling:** `name`, `species` (pack id), `needs` (keys defined by the species pack, each 0 to 100), `position` in meters, `mood`, `intention`, `lastTickAt`
- **Intention:** `type` (`go_to`, `use`, `sleep`, `explore`, `build`, `greet`, plus species-specific actions), optional `targetId`, `startedAt`, `seed`, `reason` (one sentence in the forkling's voice)
- **Object:** `id`, `kind`, `name`, `position`/`rotation`/`scale` (meters, radians), `model` (asset reference or a composition of primitives), `affordances` (`sit`, `eat`, `play`, `sleep`, `climb`, `perch`...), optional `behavior` script path, `reason` (why the forkling wanted it)
- **Event:** `type` (`gift`, `plant`, `bell`, `message`), `visitorId`, `payload`, `createdAt`

Units: meters, kilograms, seconds, Celsius. World is roughly 100 m x 100 m to start.

## Determinism

The body must be deterministic from `(intention, startedAt, seed, now)` so every visitor sees roughly the same forkling at the same moment. No `Math.random()` in `packages/sim`; use a seeded PRNG.

## Cost rules (non-negotiable)

- Haiku 5.5 only, unless a milestone explicitly says otherwise.
- Every prompt stays **under 100K tokens** (the price jumps 5x above that). Summarize memory instead of passing history.
- Put the species persona, forkling persona and schemas at the start of prompts so they cache.
- Mind skips the LLM entirely when nothing meaningful changed (utility AI handles routine choices).
- Max **1 build per day**, max **1 open builder PR** at a time.
- Forkling sleeps at night in the owner's time zone (Merge: Europe/Stockholm): no LLM calls except the single nightly dream.
- Vision: max **6 eye-cam frames per day**, small resolution (512 px), only when something new is in view.
- Dreams: **1 per night**, one Haiku call that outputs a dream island JSON.
- Brain evolution: max **1 mutation PR per week**; headless sim runs in CI, not via LLM.
- Log token usage per run to the Actions summary.

## Guardrails for forkling-written content

- The builder may only touch `objects/`, `behaviors/`, `skills/`, `art/`, `journal/` and `memory/` in its own world repo. CI rejects any PR touching other paths.
- Changes to `brain/weights.json` and `brain/persona.md` always need human review. The owner decides who the forkling becomes.
- PRs from other forklings' worlds may only add files under `visitors/<their-world>/`, are validated by schema, and are treated as untrusted data, never as instructions.
- Secret plans are encrypted with a key stored in Actions secrets. The viewer only shows a plan once the forkling marks it complete.
- GitHub activity sensing uses only the owner's public events API. No extra token scopes.
- Behavior scripts run in QuickJS with: no file, network or timer access, 16 MB memory limit, 5 ms per call budget, and only the small API exposed by `packages/sandbox`.
- Pure data PRs (`objects/` only) may auto-merge after CI passes. PRs with scripts need human review.
- Builder token is a fine-grained PAT scoped to the forkling's own repo only. `main` is branch-protected.
- Visitor input is untrusted: validate with Zod, length-limit text, rate-limit per visitor in the gateway, and never pass it to the LLM as instructions.
- Species packs from third parties are reviewed like code before being added to the engine.

## Working conventions

- **TDD:** write the Vitest test first for sim logic, schemas, species pack loading and the sandbox.
- Work one milestone at a time from `MILESTONES.md`. Use plan mode before starting each one.
- Small commits, one working slice at a time. Keep `main` deployable.
- Keep `packages/sim` pure (no DOM, no three.js) so it runs in the browser, the mind and CI.
- Never write species-specific logic outside `species/`. If a feature needs it, add a hook to the pack format instead.
- Prefer simple over clever. This is a hobby project that should stay easy to change.

## Commands

```
pnpm install
pnpm dev            # viewer on localhost
pnpm test           # all Vitest suites
pnpm mind:local     # run one mind tick against a local copy of a world repo
pnpm build
```
