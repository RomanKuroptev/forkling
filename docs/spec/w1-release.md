# W1 release: moving Merge to the nine-verb engine

The engine side of W1 is built (slices 1 to 5 of [`w1-strip-pet-care.md`](w1-strip-pet-care.md)). This is how Merge's repo gets onto it. Nothing here has been done to `RomanKuroptev/merge` yet: Merge still runs engine v0.8.0 and the pet.

## 1. Release the engine (Roman's call)

1. A release PR changes `FORKLING_REF` from `v0.8.0` to `v0.9.0` in the template's `mind.yml`, `pages.yml` and `heartbeat.yml` (a test requires them to match), the same way PR #29 did for v0.8.0.
2. Once it is merged, tag that merge commit `v0.9.0`. The tag has to contain the new pin, so it is tagged after the PR, never before.

## 2. Move Merge's repo

On a fresh clone of `RomanKuroptev/merge`, with the engine checked out at `v0.9.0`:

```bash
pnpm --filter @forkling/mind migrate-w1 --world ../merge
```

Read the plan. It prints every move, write and removal, and changes nothing. Then add `--apply`, look at `git status` in the clone, commit and push. What it does:

- **Archives the pet** under `archive/`: `objects/`, `art/`, `notebook/`, `journal/`, the memory stream, timeline, beliefs and summary, `brain/persona.md`, `temperament.json`, `skills.json` and `interests.json`, and the old goals, state and builds. The site shows the old diary at `/archive/`. Git history keeps everything.
- **Starts the mind fresh:** empty beliefs, interests, goals and state, a rested forkling with a steady mood, sitting.
- **Keeps who it is:** `forkling.json` (name, species, seed, time zone, place), `brain/budget.json` (what it has spent this month) and `mind/ticks/`.
- **Gives it the seed** (`self/seed.md`, the spec 9.1 text, written only if the world has none), the new `CLAUDE.md`, and the new `mind.yml`, `pages.yml` and `heartbeat.yml`. It removes `build.yml` and `validate.yml`.
- It is safe to run twice: a path whose archive copy exists is left alone, and the seed and state files are only written when missing.

It was dry-run, applied and ticked (`tick --dry-run`) against a local clone of Merge on 10 November. The migrated Merge produced a morning prompt of about 1,200 tokens, and the site rendered from it with an Archive page.

## 3. Watch the first days

W1's "done when" is 3 live days with no health warnings. In `mind/health.json`, check that `warnings` stays empty, decide calls stay at 12 or fewer, `allowance.points` moves as steps start, and `notebook/writing/` gains a note whenever a write step lands. Merge will mostly rest at first, because only `write` and `rest` do anything: that is the point of W1.

Rolling back is a revert of the migration commit in Merge's repo plus the pin back to `v0.8.0`.
