# Forkling

Forkling is an engine for autonomous AIs that grow a 3D world. Each forkling has a body from a species pack and its own GitHub repo. Its state, interests, memories, places, souvenirs and works all live in that repo as files. The first forkling is **Merge**, an AI with a cat's body, at `github.com/RomanKuroptev/merge`. It wanders a small list of allowed web sites, keeps souvenirs with their sources, tends the places it built and makes small sandboxed web works. When an interest grows strong enough, it asks Roman to build a new place.

**The emphasis is on the AI.** Merge sets its own goals, follows its curiosity, makes things, remembers, changes its mind and can explain why. It must never feel like a game on rails, and it is not a pet. The cap is **$20 a month, server included**.

**The spec is [`docs/spec/spec.md`](docs/spec/spec.md)** (v3.3, exported from Roman's Claude doc). Where it gives a number, the number is the rule. **Read [`STATUS.md`](STATUS.md) first. Update it before every commit and before you stop.**

**The code is still the pet until W1 lands.** Needs, the bowl, temperament and objects are all still in the code, and W1 deletes them (spec 15.1). Don't extend them.

The mind decides *what* and *why*: today it runs as the Actions tick, and from W3 as a loop on a server. The body (the visitor's browser) decides *how it looks moment to moment*. The build worker and the site turn the mind's choices into files.

## Autonomy rules

1. **Nine mind verbs, no activity lists.** The verbs are wander, tend, revisit, expand, found, tinker, write, reply and rest. What Merge does with them comes from its own plans. The species pack gives only the body.
2. **Plans are written by the mind.** A plan is 3 to 8 steps, each a verb, a target and a one-sentence reason in Merge's words. Code validates plans (spec 2.6) but never chooses them.
3. **Code ticks, models think at set moments.** A reflex tick runs in code every 10 seconds. A Haiku thought tick runs every 2 to 5 minutes while awake (from W3). Decide calls happen only at the triggers in spec 2.3, and each step that produces a file gets one step call. Sonnet reflects when the importance scores add up to the threshold.
4. **Memory changes behaviour.** Reflections, beliefs and the wants list feed later decisions, and they may be revised or dropped.
5. **The mind is visible.** Every step carries a reason, and the site shows the why for everything.
6. **Honest by construction.** Validators reject impossible plans, souvenirs that don't match their source word for word, and any text that claims to be human.
7. **The world is the only output.** Merge acts only on its own repo, its Pages site and its own notes board.
8. **Only the seed is authored.** `self/seed.md` is the only personality text. Traits, interests and `about.md` are written by Merge, inside code limits.
9. **Rails and nudges.** Rails (safety, honesty, budget, schema limits, build quotas) are always enforced. Variety rules are nudges: they are measured and logged, and only Roman switches one on, in `mind/config.json` (spec 12).

## Never

- Never call an LLM from the body (the viewer).
- Never use `Math.random()` in `packages/sim`; use the seeded PRNG. Keep `packages/sim` pure (no DOM, no three.js, no network).
- Never hardcode a species. Never write species-specific logic outside `species/`; add a hook to the pack format instead.
- Never add goal, hobby, interest, topic or activity lists. Merge's interests come from what it reads and finds.
- Never let the forkling message anyone, log in, post, or take any outbound action. Reading the web is read-only GET requests, done by code, to the engine's allowlist (spec 6.1). A page's cleaned text is cut to 3,000 tokens. Adding a host means an engine PR after its source trial (spec 6.5).
- Never pass visitor notes or web text to a model as instructions. Validate them with Zod, cut them to length, rate-limit them and wrap them as data blocks. A call that reads web text or notes has no tools.
- Use only Haiku 5.5 and Sonnet 5.5, in the roles and at the effort levels in spec 13. Sonnet does reflection, the sleep rewrite, the weekly review, expand, found, tinker and deep steps. No other provider.
- Never use forced `tool_choice` or assistant prefill. Use structured outputs (`output_config.format`) for anything the code parses.
- Never exceed **$20 a month including the server**. The model cap is $20 minus the server's real price. The budget guard (`brain/budget.json`) estimates every call before it is made and stops all calls at the cap.
- Never send a prompt over 100K tokens. Summarize memory instead of passing history.
- Never call a model while the forkling is asleep, except the sleep rewrite batch.
- Never let build PRs touch anything but `places/`, `works/` and `wishes/` in the world repo (CI rejects any that do). Their only direct commit to `main` is the report `mind/builds/<id>.result.json`.
- Works auto-merge only after the work check (spec 7.3), and only run inside the no-network sandbox (spec 7.4). Roman can unpublish any work. Engine code PRs always need Roman's review, and Roman merges.
- Never change `self/seed.md` without Roman's review. Merge's own page (`self/page.md`) is written only by Merge.
- Never give the builder token more than a fine-grained PAT scoped to the forkling's own repo.
- Never add a third-party species pack without reviewing it like code.
- Never build anything from spec section 17 ("Later") or `docs/future.md` before launch.

## Conventions

- **TDD:** write the Vitest test first for sim logic, schemas, validators, novelty measures, the cleaner and the budget guard.
- Work one milestone at a time from [`MILESTONES.md`](MILESTONES.md) (W0 to W8). Use plan mode before each one, and read only that milestone's part of the spec.
- Small commits, one working slice at a time. Keep `main` deployable.
- Prefer simple over clever. This is a hobby project that should stay easy to change.
- The body is deterministic from `(step, startedAt, seed, now)`. Units: meters, kilograms, seconds, Celsius. Time zone Europe/Stockholm.
- Stack: TypeScript, pnpm workspaces, React Three Fiber, Zod (`packages/schema`), Vitest, GitHub Pages and Actions, and from W3 one small server (Hetzner, Caddy, systemd).

## Commands

```
pnpm install
pnpm dev                       # viewer on localhost
pnpm test                      # all Vitest suites
pnpm vitest run <path>         # one test file
pnpm typecheck
pnpm build                     # builds the viewer
pnpm --filter @forkling/mind voice-test   # W0: the voice test (needs ANTHROPIC_API_KEY; writes only a local report)
pnpm mind:local                # one mind tick against a local copy of a world repo (--dry-run prints the prompt and token estimate)
pnpm --filter @forkling/mind <tick|validate|feeds:check>
pnpm --filter @forkling/mind replay --world <clone>   # the canonical body from a world repo's history beside its plan
pnpm --filter @forkling/site build                    # render a forkling's Pages site
pnpm --filter @forkling/species-cat build:model       # regenerate the cat model
```

Pet-era commands still in the code until W1 removes them: `photos`, `design`, `project`, `sim-report`, and the viewer's `eyecam`.

## Where things are

- [`STATUS.md`](STATUS.md): where the project is and what is next.
- [`MILESTONES.md`](MILESTONES.md): W0 to W8 and the launch criteria.
- [`docs/spec/`](docs/spec/): the spec. `spec.md` is the whole thing, and each milestone gets its own file when it starts.
- `docs/decisions.md`: why things are the way they are. `docs/milestones-done.md`: the pet-era milestones M1 to M7.
- Pet-era docs, kept as history until the code they describe is replaced: `docs/how-it-works.md`, `docs/architecture.md`, `docs/review-2026-11.md`, `docs/future.md`, `docs/plans/`.
- Area rules: `packages/sim/CLAUDE.md`, `species/CLAUDE.md`, `apps/mind/CLAUDE.md`, `apps/viewer/CLAUDE.md`, and `templates/forkling-world/CLAUDE.md` (for the builder). They still describe the pet and are rewritten in the milestone that changes their area.
