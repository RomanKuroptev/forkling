# Architecture

How forkling fits together. Intent lives here; the schemas in `packages/schema` and the code are the source of truth for details. For how the parts actually behave, traced through the code, see `docs/how-it-works.md`.

## Core idea: mind, body, builder

| Part | Where it runs | What it does | Cost |
|---|---|---|---|
| **Mind** | GitHub Actions in the world repo: every 10 min while awake, hourly while asleep, plus on visitor events | Reads state and events, scores surprise, sets and pursues goals, reflects, reads online, writes the journal, decides when to build | Haiku 5.5 for decisions, Sonnet 5.5 for daily reflection |
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
  mind/goals.json            # long goal, today's plan, current step, each with a reason
  memory/stream/YYYY-MM-DD.jsonl  # raw observations from sim events, kept 7 days
  memory/summary.md          # long-term memory in a fixed number of slots, rewritten nightly
  memory/beliefs.json        # beliefs with confidence, evidence and revision history
  brain/interests.json       # topics with weights that rise when fed and fade daily, plus current and past obsession phases
  brain/temperament.json     # seeded likes, dislikes and quirks, rolled once
  brain/skills.json          # skill level per verb group, raised with practice
  brain/persona.md           # its own personality on top of the species persona (human reviewed)
  brain/budget.json          # monthly ledger of tokens and dollars per call
  notebook/                  # reading notes, plans and lab notes shown on its site
  art/<id>.json              # creative artifacts: writing, SVG drawings, melodies, recipes, radio scripts, photo captions
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

