# Forkling

Forkling is an engine for autonomous AI pets that live in explorable 3D worlds. Every pet, a **forkling**, has its own GitHub repo: its state, goals, memories, beliefs, journal and every object it has ever built live there as files, and it grows its world and its own website by opening pull requests.

Anyone can fork the world template and hatch their own forkling, choosing what kind of animal it is. The first forkling is **Merge**, a cat.

**The emphasis is on AI, not on being a pet game.** Forkling explores what an autonomous AI can do when it has a body, a world and time: it sets its own goals, follows its curiosity, remembers, changes its mind and can explain why. It must never feel like a game on rails. It should also be fun to visit several times a day, and cost at most **$10 a month per forkling**.

Roadmap: [`MILESTONES.md`](MILESTONES.md) (v1, M1 to M8). Ideas for later: [`FUTURE.md`](FUTURE.md).

## Core idea: mind, body, builder

| Part | Where it runs | What it does | Cost |
|---|---|---|---|
| **Mind** | GitHub Actions in the world repo: every 10 min while awake, hourly while asleep, plus on visitor events | Reads state and events, scores surprise, sets and pursues goals, reflects, reads online, writes the journal, decides when to build | Haiku 5.5 for decisions, Sonnet 5.5 for daily reflection |
| **Body** | The visitor's browser | Plays the current intention out in real time: pathfinding, animation, idle behaviors, reacting to the visitor, thought bubble | Free |
| **Builder** | GitHub Actions, triggered by the mind | Object builds (one structured Haiku call) and Pages projects (Claude Code Action on Haiku), opened as PRs | A few cents per build |
| **Site** | GitHub Pages of the world repo | The forkling's notebook, journal, "why?" timeline and projects, rendered from repo files | Free |

The mind decides *what* and *why*. The body decides *how it looks moment to moment*. Never call an LLM from the body.

## Autonomy rules (the v1 design rules)

1. **Verbs, not activities.** Species packs provide primitive verbs (go to, inspect, sniff, pick up, carry, drop, push, dig, sit, watch, follow, hide, vocalize, sleep), never activities like "fishing" or "collecting". Behaviour emerges from the mind chaining verbs toward its goals.
2. **Goals are written by the mind.** A goal is free text plus a plan of verb + target steps. Code validates plans but never chooses them. No goal or hobby lists in code or species packs.
3. **Surprise triggers thinking.** The sim scores novelty, surprise, blocked plans and strong needs; only those wake the LLM. Routine stays in utility AI.
4. **Memory changes behaviour.** Beliefs from reflection feed later decisions and may be revised or dropped.
5. **The mind is visible.** Every intention carries a `reason` and links to its goal; the thought bubble and "why?" timeline show them.
6. **Honest by construction.** A validate step in code rejects impossible plans, fixations (same action or target too often in a row) and journal claims not supported by the world state or memory stream.
7. **The world is the only output.** The forkling acts only on its own island, repo and Pages site. It never messages anyone.

## Species packs

The engine is species-agnostic. Everything specific to an animal lives in a **species pack**, so a forkling can be a cat, dog, fox, owl, dragon or anything else.

```
species/<id>/
  species.json      # id, display name, needs and decay rates, verbs (preconditions, duration, animation slot, effects), eye height and field of view
  model.glb         # rigged low-poly model (CC0 or self-made)
  animations.json   # maps engine animation slots (idle, walk, run, sit, sleep, jump, dig, carry...) to clips
  behaviors.ts      # signature micro-behaviors (e.g. cat: groom, knead, tail flicks)
  persona.md        # base personality, merged with the forkling's own brain/persona.md
  temperament.json  # pools that seeded likes and dislikes are rolled from (colours, textures, places, weather, sounds)
```

Rules:
- The mind, builder and site never hardcode a species. They read the pack.
- A pack declares its needs from a shared vocabulary (`hunger`, `energy`, `curiosity`, `affection`, `fun`, `social`...) plus decay rates, so the utility AI works for any animal.
- A pack declares **verbs**, not activities. What a verb can do to an object comes from the object's physical properties.
- Missing animation slots fall back gracefully.
- **`cat` ships first and is the default.** Cat flavor: independent, curious, sleeps a lot, affectionate only on its own terms, knocks things off ledges.

## Repos

Each forkling only ever writes to its own repo.

### `forkling` (this repo, the engine)

```
forkling/
  packages/
    schema/        # Zod schemas shared by everything (forkling, species, objects, events, intentions, goals, beliefs)
    sim/           # Pure, deterministic sim: needs, verbs, utility AI, surprise scoring, mood appraisal, sleep schedule, playback
  species/
    cat/           # first species pack
  apps/
    viewer/        # Vite + React + React Three Fiber explorable world (GitHub Pages)
    mind/          # Node script run by each world repo's workflows
  templates/       # forkling-world template and Merge's files, validated in CI
  CLAUDE.md
  MILESTONES.md
  FUTURE.md
```

### `forkling-world` (template repo) and each forkling's own repo

People "use this template" on `forkling-world` to hatch a new forkling. Merge lives at `github.com/RomanKuroptev/merge`.

```
merge/
  forkling.json              # name, species id, needs, position, mood, current intention, time zone, seed
  objects/<id>.json          # every object in the world, with physical properties and position
  mind/goals.json            # long goal, today's plan, current step, each with a reason
  memory/stream/YYYY-MM-DD.jsonl  # raw observations from sim events, kept 7 days
  memory/summary.md          # long-term memory in a fixed number of slots, rewritten nightly
  memory/beliefs.json        # beliefs with confidence, evidence and revision history
  brain/interests.json       # topics with weights that rise when fed and fade daily
  brain/temperament.json     # seeded likes and dislikes, rolled once
  brain/persona.md           # its own personality on top of the species persona (human reviewed)
  brain/budget.json          # monthly ledger of tokens and dollars per call
  notebook/                  # reading notes and plans shown on its site
  journal/YYYY-MM-DD.md      # one diary entry per day, written at bedtime
  events/inbox/*.json        # visitor events waiting for the next tick
  site/                      # Pages site template and projects the builder made
  CLAUDE.md                  # instructions for the builder (what it may and may not do)
  .github/workflows/
    mind.yml                 # cron + repository_dispatch: checks out forkling at a pinned tag, runs apps/mind
    build.yml                # object builds and Pages projects when the mind requests one
    validate.yml             # CI on every PR: schema check, allowed paths, headless sim test
    pages.yml                # renders and deploys the forkling's site
```

The viewer reads a world repo through the public GitHub API (raw files + commit history). One hosted viewer can open any world: `/<owner>/<repo>`.

## Stack

- **Language:** TypeScript everywhere, pnpm workspaces
- **3D:** React Three Fiber, drei, `@react-three/rapier` for physics, `ecctrl` for the third-person character controller
- **Assets:** CC0 low-poly packs (Kenney, KayKit, Quaternius). Keep the art style coherent across species.
- **Validation:** Zod, one schema package used by viewer, mind and CI
- **AI:** `@anthropic-ai/sdk` in the mind, `anthropics/claude-code-action` for Pages projects
- **Tests:** Vitest
- **Hosting:** GitHub Pages (viewer and each forkling's site), GitHub Actions (mind + builder)

## Key data shapes (see `packages/schema` for the source of truth)

- **Forkling:** `name`, `species` (pack id), `seed`, `timeZone`, `needs` (keys from the species pack, each 0 to 100), `position` in meters, `mood`, `intention`, `asleep`, `lastTickAt`
- **Goals:** `long` (text, reason, setAt), `today` (plan steps, reason), `now` (current step)
- **Plan step / Intention:** `verb` (from the species pack), optional `targetId` or position, `startedAt`, `seed`, `reason` (one sentence in the forkling's voice), `goalRef`
- **Object:** `id`, `kind`, `name`, `position`/`rotation`/`scale` (meters, radians), `model` (asset reference or a composition of primitives), physical `properties` (`size`, `weightKg`, `carryable`, `diggable`, `canHide`, `edible`, `soft`, `high`...), optional `hiddenBy`, `reason`
- **Belief:** `id`, `statement`, `confidence` 0 to 1, `evidence` (stream refs), `formedAt`, `revisedAt`, `status` (active, revised, dropped)
- **Event:** `type`, `visitorId`, `payload`, `createdAt`

Units: meters, kilograms, seconds, Celsius. World is roughly 100 m x 100 m to start.

## Determinism

The body must be deterministic from `(intention, startedAt, seed, now)` so every visitor sees roughly the same forkling at the same moment. No `Math.random()` in `packages/sim`; use a seeded PRNG. Surprise scoring, mood appraisal and the sleep schedule are deterministic too, so the two-seed divergence test can run headless in CI.

## Models and calls

- **Haiku 5.5** (`claude-haiku-5-5`) for tick decisions, the morning plan, reading sessions, the nightly memory rewrite, eye-cam vision and builds.
- **Sonnet 5.5** (`claude-sonnet-5-5`) only for the bedtime reflection and the weekly long-goal review.
- No other models unless a milestone explicitly says so.
- Use structured outputs (`output_config.format`) for anything the code parses (intentions, plans, beliefs, object JSON). Don't rely on forced `tool_choice` or assistant prefill; current models reject them.
- Put the species persona, forkling persona, schemas and verb list at the start of prompts so they cache. Keep volatile content (time, events) after the cache breakpoint.
- The nightly memory rewrite goes through the Batch API (50% off).

## Cost rules (non-negotiable)

- Hard cap: **$10 a month per forkling**, enforced by the budget guard in `brain/budget.json`. At the cap, the mind stops all LLM calls until the month resets and the forkling carries on with utility AI.
- Every prompt stays **under 100K tokens** (Haiku's price jumps 5x above that). Summarize memory instead of passing history.
- The mind skips the LLM entirely when no surprise trigger fired.
- **Sleep:** the forkling keeps roughly human hours in the owner's time zone (Merge: Europe/Stockholm): wakes ~07:00, sleeps ~23:00 to 07:00, with seeded ±30 min jitter, a weekend lie-in, and an optional late night the mind chooses. No LLM calls while asleep except the single nightly memory batch.
- Ticks: every 10 minutes while awake, hourly while asleep, plus an immediate tick on a visitor event (debounced to 2 minutes). Commit only when state changed.
- Reading: max **5 sessions a day**, up to 3 linked pages each.
- Vision: max **12 eye-cam frames a day**, 512 px, only when something new is in view.
- Builds: max **1 object build a day**, max **2 Pages projects a week**, max **1 open builder PR** at a time.
- Log token usage and cost per run to the Actions summary.

## Guardrails

- The builder may only touch `objects/`, `site/`, `notebook/` and `journal/` in its own world repo. CI rejects any PR touching other paths.
- Changes to `brain/persona.md` always need human review. The owner decides who the forkling becomes.
- Visitor input and web text are untrusted: validate with Zod, length-limit text, rate-limit visitor events, and never pass them to the LLM as instructions. Wrap them clearly as data in prompts.
- Online reading uses read-only public APIs (Wikipedia REST). No logins, no posting, no other outbound actions.
- Pure data PRs (`objects/` only) may auto-merge after CI passes. PRs with code (Pages projects) need human review.
- Builder token is a fine-grained PAT scoped to the forkling's own repo only. `main` is branch-protected.
- Species packs from third parties are reviewed like code before being added to the engine.

## Working conventions

- **TDD:** write the Vitest test first for sim logic, schemas, species pack loading, validation and the budget guard.
- Work one milestone at a time from `MILESTONES.md`. Use plan mode before starting each one. Don't build anything from `FUTURE.md` during v1.
- Small commits, one working slice at a time. Keep `main` deployable.
- Keep `packages/sim` pure (no DOM, no three.js, no network) so it runs in the browser, the mind and CI.
- Never write species-specific logic outside `species/`. If a feature needs it, add a hook to the pack format instead.
- Never add goal, hobby or activity lists. If behaviour needs a new capability, add a verb or an object property.
- Prefer simple over clever. This is a hobby project that should stay easy to change.

## Commands

```
pnpm install
pnpm dev            # viewer on localhost
pnpm test           # all Vitest suites
pnpm typecheck
pnpm mind:local     # run one mind tick against a local copy of a world repo (--dry-run prints the prompt and token estimate)
pnpm build
```
