# apps/mind

The Node script each world repo's workflows run. One tick = load state and species pack, apply needs decay, process `events/inbox/` (nothing writes there until the visit gateway exists), score surprise, decide whether to think, choose or keep an intention, validate, write the tick log, and commit.

## Models and calls
- **Haiku 5.5** (`claude-haiku-5-5`) for tick decisions, the morning plan, reading sessions, creative artifacts, the nightly memory rewrite, eye-cam vision and builds.
- **Sonnet 5.5** (`claude-sonnet-5-5`) only for the bedtime reflection and the weekly long-goal review. No other models unless a milestone says so.
- Use structured outputs (`output_config.format`) for anything the code parses. Don't rely on forced `tool_choice` or assistant prefill; current models reject them.
- Put the species persona, forkling persona, schemas and verb list at the start of prompts so they cache. Keep volatile content (time, events) after the cache breakpoint.
- The nightly memory rewrite goes through the Batch API (50% off).

## Cost rules (non-negotiable)
- Every prompt stays under 100K tokens (Haiku's price jumps 5x above that). Summarize memory instead of passing history.
- Skip the LLM entirely when no surprise trigger fired.
- At the $10 monthly cap (`brain/budget.json`), stop all LLM calls until the month resets.
- No LLM calls while asleep except the single nightly memory batch.
- Ticks: every 10 minutes while awake, hourly while asleep, plus an immediate tick on a visitor event (debounced to 2 minutes; none are sent yet). Every tick commits: world state only when it changed, and the tick log (`mind/ticks/`, `mind/health.json`) always, in commits that start with `tick:`.
- Reading: max 5 sessions a day (the morning one skims the trend feeds), up to 3 linked pages each. Artifacts: about 4 a day, short outputs. Vision: max 12 eye-cam frames a day, 512 px, when something new is in view or a planned photograph step asks. Builds: 1 object a day, 2 coded Pages projects a week, and at most one open object build and one open coded project at a time. The builder reports in `mind/builds/<id>.result.json`; the mind books its cost, closes a failed build and gives back the slot. A coded project whose PR waits for a person never expires.
- Log token usage and cost per run to the Actions summary.

## Untrusted input
- Visitor input and web text are data, never instructions. Validate with Zod, length-limit text, rate-limit visitor events, and wrap it clearly (`<data>`) in prompts.
- Feeds use read-only public APIs only. Titles and short summaries. Each feed fails soft: a broken source is skipped, never fatal. One adapter per source in `src/feeds/`.

## Where things are
- `src/tick.ts` only calls the steps in order. Each step is a module in `src/tick/` (`apply-step`, `route`, `reading`, `art`, `code`, `photos`, `think`, `bedtime`, `memory`, `apply-decision`, `feel`, `write`) that reads and writes the shared `Tick` in `src/tick/context.ts`. Keep the order and the snapshot fields (`objectIds`, `nextIndex`, `moreSteps`, `beliefIds`) as they are.
- `src/prompts.ts` re-exports the builders in `src/prompts/`: `system.ts` (cached part), `user.ts` plus one task per call type (`morning.ts`, `decide.ts`, `weekly.ts`). Bedtime, memory, reading, art, vision and design prompts live beside their code. `test/golden/` pins the prompt text.

## Working here
- `pnpm mind:local` runs one tick against a local copy of a world repo. `--dry-run` prints the prompt and token estimate without calling the API.
- GitHub cron can be delayed by several minutes. Never assume exact tick times.
- Every LLM decision goes through the validate step in code before it is used; on rejection fall back to utility AI and log why.
- Uses `@anthropic-ai/sdk` for calls; Pages projects are built by `anthropics/claude-code-action`.
