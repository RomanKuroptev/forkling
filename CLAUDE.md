# Forkling

Forkling is an engine for autonomous AI pets that live in explorable 3D worlds. Every pet, a **forkling**, has its own GitHub repo: its state, goals, memories, beliefs, journal and every object it has ever built live there as files, and it grows its world and its own website by opening pull requests. Anyone can fork the world template and hatch their own forkling, choosing what kind of animal it is. The first forkling is **Merge**, a cat who lives like a person, at `github.com/RomanKuroptev/merge`.

**The emphasis is on AI, not on being a pet game.** Forkling explores what an autonomous AI can do when it has a body, a world and time: it sets its own goals, follows its curiosity and the internet's, makes things, remembers, changes its mind and can explain why. It must never feel like a game on rails. It should also be fun to visit several times a day, and cost at most **$10 a month per forkling**.

**Read [`STATUS.md`](STATUS.md) first. Update it before every commit and before you stop.**

The mind (GitHub Actions) decides *what* and *why*. The body (the visitor's browser) decides *how it looks moment to moment*. The builder (Actions) and the site (Pages) turn it into files.

## Autonomy rules (the v1 design rules)

1. **Verbs, not activities.** Species packs provide primitive verbs, never activities like "gardening". Behaviour emerges from the mind chaining verbs toward its goals. Tools and places unlock verbs.
2. **Goals are written by the mind.** Free text plus a plan of verb + target steps. Code validates plans but never chooses them.
3. **Surprise triggers thinking.** Only novelty, surprise, blocked plans and strong needs wake the LLM. Routine stays in utility AI.
4. **Memory changes behaviour.** Beliefs feed later decisions and may be revised or dropped.
5. **The mind is visible.** Every intention carries a `reason` and links to its goal.
6. **Honest by construction.** A validate step in code rejects impossible plans, fixations and unsupported journal claims.
7. **The world is the only output.** The forkling acts only on its own island, repo and Pages site.
8. **Every creative act leaves an artifact.** Quality follows the skill level, which only rises with practice.
9. **Interests come from outside and inside.** Daily read-only feeds plus seeded temperament and quirks; obsessions spike and burn out.

## Never

- Never call an LLM from the body (the viewer).
- Never use `Math.random()` in `packages/sim`; use the seeded PRNG. Keep `packages/sim` pure (no DOM, no three.js, no network).
- Never hardcode a species. Never write species-specific logic outside `species/`; add a hook to the pack format instead.
- Never add goal, hobby, interest or activity lists. Add a verb, a tool or place, a material or an object property instead.
- Never let the forkling message anyone, log in, post, or take any outbound action. Online reading is read-only public APIs only, titles and short summaries.
- Never pass visitor input or web text to the LLM as instructions. Validate with Zod, length-limit it, rate-limit visitor events, wrap it as data.
- Never use a model other than Haiku 5.5 (decisions, plans, reading, art, vision, builds, nightly rewrite) and Sonnet 5.5 (bedtime reflection, weekly long-goal review) unless a milestone says so.
- Never use forced `tool_choice` or assistant prefill; use structured outputs (`output_config.format`) for anything the code parses.
- Never exceed **$10 a month per forkling**. At the cap, the mind stops all LLM calls until the month resets (budget guard, `brain/budget.json`).
- Never send a prompt over 100K tokens. Summarize memory instead of passing history.
- Never call the LLM when no surprise trigger fired, or while the forkling is asleep (except the single nightly memory batch).
- Never let the builder's pull requests touch anything but `objects/`, `art/`, `site/`, `notebook/` and `journal/` in its own world repo (CI rejects any that do). Its only direct commit to `main` is its own report, `mind/builds/<id>.result.json`, which the mind reads. The builder never writes the ledger, the stream or the mind's state.
- Never change `brain/persona.md` without human review. Code PRs (Pages projects) always need human review; only pure data PRs (`objects/` only) may auto-merge.
- Never give the builder token more than a fine-grained PAT scoped to the forkling's own repo. `main` is branch-protected.
- Never add a third-party species pack without reviewing it like code.
- Never build anything from `docs/future.md` during v1.

## Conventions

- **TDD:** write the Vitest test first for sim logic, schemas, species pack loading, validation and the budget guard.
- Work one milestone at a time from `MILESTONES.md`. Use plan mode before starting each one.
- Small commits, one working slice at a time. Keep `main` deployable.
- Prefer simple over clever. This is a hobby project that should stay easy to change.
- The body is deterministic from `(intention, startedAt, seed, now)`. Units: meters, kilograms, seconds, Celsius.
- Stack: TypeScript, pnpm workspaces, React Three Fiber, Zod (`packages/schema`), Vitest, GitHub Pages and Actions.

## Commands

```
pnpm install
pnpm dev                       # viewer on localhost
pnpm test                      # all Vitest suites
pnpm vitest run <path>         # one test file
pnpm typecheck
pnpm build                     # builds the viewer
pnpm mind:local                # one mind tick against a local copy of a world repo (--dry-run prints the prompt and token estimate)
pnpm --filter @forkling/mind <tick|photos|design|validate|project|feeds:check>
pnpm --filter @forkling/mind sim-report --days 14 --seed 1   # time per verb, plan share, critical needs, from the sim
pnpm --filter @forkling/mind replay --world <clone>          # the canonical body from a world repo's history beside its plan
pnpm --filter @forkling/site build                    # render a forkling's Pages site
pnpm --filter @forkling/species-cat build:model       # regenerate the cat model
pnpm --filter @forkling/viewer eyecam                 # eye-cam frames
```

## Where things are

- [`STATUS.md`](STATUS.md): where the project is and what is next.
- [`MILESTONES.md`](MILESTONES.md): the v1 goal, criteria, verbs and M8. Finished milestones are in `docs/milestones-done.md`.
- `docs/how-it-works.md`: how the parts connect, traced through the code. `docs/review-2026-11.md`: what looks misaligned, with purpose questions to decide.
- `docs/architecture.md`: mind, body, builder, site, and the repo layouts. `docs/decisions.md`: why things are the way they are. `docs/future.md`: ideas after v1. `docs/plans/`: saved plans.
- Area rules: `packages/sim/CLAUDE.md`, `species/CLAUDE.md`, `apps/mind/CLAUDE.md`, `apps/viewer/CLAUDE.md`, and `templates/forkling-world/CLAUDE.md` (for the builder).
