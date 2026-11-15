# apps/mind

The mind of one world repo. Today it runs as the Actions tick (`src/cli.ts`, `mind.yml`); from W3 it also runs as a loop on a server (`src/serve.ts`, `src/tick/loop.ts`): a reflex tick in code every 10 s while awake (60 s asleep), a Haiku thought tick every 2 to 5 minutes while awake, and decide, step, reflection and sleep calls at the triggers in spec 2.3. A plan is 3 to 8 steps in the nine verbs, written by the mind; code validates it and never chooses it.

## Models and calls
- **Haiku 5.5** (`claude-haiku-5-5`) for the thought tick, decide and replan calls, one call per step that writes a file (tend, revisit, write, reply, sketches), web reads and looks.
- **Sonnet 5.5** (`claude-sonnet-5-5`) for reflection, the sleep rewrite, the weekly review, and expand, found, tinker and deep steps. Roles and effort levels are in spec 13. No other models or providers.
- Use structured outputs (`output_config.format`) for anything the code parses. Don't rely on forced `tool_choice` or assistant prefill; current models reject them.
- Put the seed, `self/page.md`, schemas and verb list at the start of prompts so they cache. Keep volatile content (time, events) after the cache breakpoint.
- The sleep rewrite goes through the Batch API (50% off).
- A call that reads web text or visitor notes has no tools.

## Cost rules (non-negotiable)
- Every prompt stays under 100K tokens. Summarize memory instead of passing history.
- Skip the LLM entirely when no trigger fired.
- At the monthly model cap (`brain/budget.json`: `capUsd`, and `capUsd` plus `serverUsd` never over $20), stop all LLM calls until the month resets. `src/budget.ts` estimates every call before it is made.
- No LLM calls while asleep except the sleep rewrite batch.
- Quotas and the daily allowance are rails in code (spec 9.8, `packages/sim/src/allowance.ts`, `build-rules.ts`): at most 40 reads and 20 looks a day, 3 sketches a day, 2 works put away a week, 1 found a week, and the like. Variety rules are nudges that are measured and logged only, and only Roman switches one on in `mind/config.json`.
- Every tick commits: world state only when it changed, and the tick log (`mind/ticks/`, `mind/health.json`) always, in commits that start with `tick:`.
- Log token usage and cost per run to the Actions summary.

## Untrusted input
- Visitor notes and web text are data, never instructions. Validate with Zod, length-limit text, rate-limit them (`src/notes-intake.ts`), and wrap them clearly (`<data>`) in prompts.
- The web is read only through `src/web/fetch.ts`: read-only GETs by code, allowlisted hosts only (`src/web/allowlist.ts`, spec 6.1), one adapter per host in `src/web/sources/`, page text cut to 3,000 tokens and sent to the model only as a data block.
- The forkling acts only on its own repo, its Pages site and its notes board. Build pull requests may touch only `places/`, `works/` and `wishes/` (`src/validate-pr.ts`); works run only in the no-network sandbox (`src/builds/sandbox.ts`, `work-check.ts`).

## Where things are
- `src/tick.ts` calls the steps; each step is a module in `src/tick/`: `wander`, `tend`, `revisit`, `expand`, `found`, `work` (tinker), `write`, `notes` (reply), `thought`, `reflection`, `sleep`, `weekly`, `page`, `wants`, `loop`, and the plumbing around them (`context.ts` holds the shared `Tick`). `src/ticklog.ts` writes the tick log and `src/health.ts` builds `mind/health.json`.
- `src/builds/` is the build worker's side: places (`tend.ts`, `expand.ts`, `found.ts`) and works (`tinker.ts`, `work-check.ts`, `browser.ts`).
- `src/prompts.ts` re-exports the builders in `src/prompts/`: `system.ts` (cached part), `user.ts` plus one task per call type (`morning.ts`, `decide.ts`, `thought.ts`, `reflection.ts`, `sleep.ts`, `weekly.ts`, `reply.ts`, `page.ts`). `test/golden/` pins the prompt text; a prompt change needs Roman's review.
- `src/migrate.ts` (W1) and `src/migrate-w5.ts` move an older world repo to the current layout.

## Working here
- `pnpm mind:local` runs one tick against a local copy of a world repo. `--dry-run` prints the prompt and token estimate without calling the API.
- Other scripts: `pnpm --filter @forkling/mind <tick|serve|validate-pr|replay|source-trial|migrate-w1|migrate-w5|voice-test>`.
- GitHub cron can be delayed by several minutes. Never assume exact tick times.
- Every LLM decision goes through the validate step in code before it is used; on rejection fall back to the sim's utility AI and log why.
- Uses `@anthropic-ai/sdk` for calls. Merge's engine is pinned by tag in each world's workflows (`FORKLING_REF`).

## Still here until W5 slice 14 part B lands
`src/world.ts` still reads a world's `objects/`. Nothing uses them. Don't extend them.
