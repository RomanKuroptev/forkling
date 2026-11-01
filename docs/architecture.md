# Architecture

How forkling fits together. Intent lives here; the schemas in `packages/schema` and the code are the source of truth for details. For how the parts actually behave, traced through the code, see `docs/how-it-works.md`.

## Core idea: mind, body, builder

| Part | Where it runs | What it does | Cost |
|---|---|---|---|
| **Mind** | GitHub Actions in the world repo: every 10 min while awake, hourly while asleep (a visitor-event trigger exists but nothing sends events yet: the visit gateway is future work, see `docs/future.md`) | Reads state and events, scores surprise, sets and pursues goals, reflects, reads online, writes the journal, decides when to build | Haiku 5.5 for decisions, Sonnet 5.5 for daily reflection |
| **Body** | The visitor's browser | Plays the current intention out in real time: pathfinding, animation, idle behaviors, reacting to the visitor, thought bubble | Free |
| **Builder** | GitHub Actions, triggered by the mind | Object builds (one structured Haiku call) and Pages projects (Claude Code Action on Haiku), opened as PRs | A few cents per build |
| **Site** | GitHub Pages of the world repo | The forkling's notebook, journal, "why?" timeline and projects, rendered from repo files | Free |

The mind decides *what* and *why*. The body decides *how it looks moment to moment*.

## Repos

Each forkling only ever writes to its own repo.

### `forkling` (this repo, the engine)

```
forkling/
  packages/
    schema/        # Zod schemas shared by everything (forkling, species, objects, events, intentions, goals, beliefs)
    sim/           # Pure, deterministic sim: needs, verbs, skills, growth over time, utility AI, surprise scoring, mood appraisal, sleep schedule, playback
  species/
    cat/           # first species pack
  apps/
    viewer/        # Vite + React + React Three Fiber explorable world (GitHub Pages)
    mind/          # Node script run by each world repo's workflows (feeds/ holds one adapter per trend source)
    site/          # Renders a forkling's Pages site from its repo files
  templates/       # forkling-world template and Merge's files, validated in CI
  CLAUDE.md
  STATUS.md
  MILESTONES.md
  docs/            # architecture, finished milestones, decisions, future ideas, plans
```

### `forkling-world` (template repo) and each forkling's own repo

People "use this template" on `forkling-world` to hatch a new forkling. Merge lives at `github.com/RomanKuroptev/merge`.

```
merge/
  forkling.json              # name, species id, needs, position, mood, current intention, inventory, time zone, seed
  objects/<id>.json          # every object in the world, with physical properties and position
  mind/goals.json            # long goal, today's plan, current step (with the seconds the body really spent on it), each with a reason
  mind/state.json            # what the mind has seen and counted: known objects, limits used, the open builds, cooldowns
  mind/ticks/YYYY-MM-DD.jsonl  # one line per tick, quiet ones too: what woke it, every try at a call, the step before and after. Kept 14 days
  mind/health.json           # a rolling summary with a warnings list, rebuilt every tick: the first thing to read to ask "is it stuck?"
  mind/builds/<id>.json      # a build the mind asked for; <id>.result.json is the builder's report back (status, reason, what it spent)
  memory/stream/YYYY-MM-DD.jsonl  # raw observations from sim events, kept 7 days
  memory/timeline/YYYY-MM-DD.jsonl  # one line per step it started and why, kept for good (the "why?" page)
  memory/summary.md          # long-term memory in a fixed number of slots, rewritten nightly
  memory/beliefs.json        # beliefs with confidence, evidence and revision history
  brain/interests.json       # topics with weights that rise when fed and fade daily, plus current and past obsession phases
  brain/temperament.json     # seeded likes, dislikes and quirks, rolled once (made on the first tick)
  brain/skills.json          # skill level per verb group, raised with practice
  brain/persona.md           # its own personality on top of the species persona (human reviewed)
  brain/budget.json          # monthly ledger of tokens and dollars per call (made on the first tick, for the month it is in)
  notebook/                  # reading notes, plans and lab notes shown on its site
  art/<id>.json              # creative artifacts: writing, SVG drawings, melodies, recipes, radio scripts, photo captions
  journal/YYYY-MM-DD.md      # one diary entry per day, written at bedtime
  events/inbox/*.json        # visitor events waiting for the next tick (nothing writes here yet: the visit gateway is future work)
  site/                      # Pages site template and projects the builder made
  CLAUDE.md                  # instructions for the builder (what it may and may not do)
  .github/workflows/
    mind.yml                 # cron + repository_dispatch: checks out forkling at a pinned tag, runs apps/mind. Every tick commits (log-only commits start with "tick:")
    heartbeat.yml            # opt-in: dispatches mind.yml every 10 minutes, because the GitHub cron barely fires
    build.yml                # object builds and Pages projects when the mind requests one, in a group of its own; a small books job commits the builder's report
    validate.yml             # CI on every PR: schema check, allowed paths, headless sim test; notes when a person closes a builder PR
    pages.yml                # renders and deploys the forkling's site
```

The viewer reads a world repo through the public GitHub API (raw files + commit history). One hosted viewer can open any world: `/<owner>/<repo>`.

