# Forkling

Forkling is an engine for autonomous AIs that grow a 3D world. Each forkling has a body from a species pack and its own GitHub repo. Its state, interests, memories, places, souvenirs and works all live in that repo as files. The first forkling is **Merge**, an AI with a cat's body, at `github.com/RomanKuroptev/merge`. It wanders a small list of allowed web sites, keeps souvenirs with their sources, tends the places it built and makes small sandboxed web works. Merge grows and founds its own places from the kit; Roman builds its tools.

**The emphasis is on the AI.** Merge sets its own goals, follows its curiosity, makes things, remembers, changes its mind and can explain why. It must never feel like a game on rails, and it is not a pet. The cap is **$23 a month, server included** (raised from $20 by Roman on 2026-11-16: a model cap of $15 plus the server).

**The spec is v3.3 ([`docs/spec/spec.md`](docs/spec/spec.md)) plus [`docs/spec/v4/spec-v4.md`](docs/spec/v4/spec-v4.md), and v4 wins** (v3.3 was exported from Roman's Claude doc). Where it gives a number, the number is the rule. **Read [`STATUS.md`](STATUS.md) first. Update it before every commit and before you stop.**

**The pet is gone.** W1 deleted needs, the bowl and temperament, and W5 slice 14 deleted the island, its walking grid and the free-form objects. A migrated world keeps its old pet files under `archive/`, and `forkling.json` from the pet era still reads (`fromPetEra` in `packages/schema/src/world.ts`).

The mind decides *what* and *why*: it runs as the Actions tick or as a loop on a server (W3). The body (the visitor's browser) decides *how it looks moment to moment*. The build worker and the site turn the mind's choices into files.

## Autonomy rules

1. **Ten mind verbs, no activity lists.** The verbs are wander, tend, revisit, expand, found, tinker, write, reply, rest and build (spec v4 3.2: a build session on a project of Merge's own). `build` exists only where its sessions can run (the server, with `/health` `sandbox: ok`); elsewhere Merge has the other nine. What Merge does with them comes from its own plans. The species pack gives only the body.
2. **Plans are written by the mind.** A plan is 3 to 8 steps, each a verb, a target and a one-sentence reason in Merge's words. Code validates plans (spec 2.6) but never chooses them.
3. **Code ticks, models think at set moments.** A reflex tick runs in code every 10 seconds. A Haiku thought tick runs every 2 to 5 minutes while awake (in the server loop). Decide calls happen only at the triggers in spec 2.3, and each step that produces a file gets one step call. Sonnet reflects when the importance scores add up to the threshold.
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
- Use only Haiku 5.5 and Sonnet 5.5, in the roles and at the effort levels in spec 13. Sonnet does reflection, the sleep rewrite, the weekly review, the 3-day goal review, expand, found, tinker, sketches and memes, reworks, replies and deep steps (the creative calls fall back to Haiku within $1.50 of the monthly cap, so the end of a month is plainer, not silent). The write step stays on Haiku, with pages of 80 words. No other provider.
- Never use forced `tool_choice` or assistant prefill. Use structured outputs (`output_config.format`) for anything the code parses.
- Never exceed **$23 a month including the server**. The model cap is $23 minus the server's real price (Merge's is $15). The budget guard (`brain/budget.json`) estimates every call before it is made and stops all calls at the cap. The cap every guard reads is the effective cap (spec-v4 5.3): `capUsd` plus the month's entries in `brain/credits.json`, which only Roman writes; the $23 check reads `capUsd` alone.
- Never send a prompt over 100K tokens. Summarize memory instead of passing history.
- Never call a model while the forkling is asleep, except the sleep rewrite batch.
- Never let build PRs touch anything but `places/`, `works/` and `wishes/` in the world repo (CI rejects any that do). Their only direct commit to `main` is the report `mind/builds/<id>.result.json`. The server commits `projects/<id>/` itself, one commit after each build session (spec v4 3.3).
- Works auto-merge only after the work check (spec 7.3), and only run inside the no-network sandbox (spec 7.4). Roman can unpublish any work. Engine code PRs always need Roman's review, and Roman merges.
- Never change `self/seed.md` without Roman's review. Merge's own page (`self/page.md`) is written only by Merge.
- Never give the builder token more than a fine-grained PAT scoped to the forkling's own repo.
- Never add a third-party species pack without reviewing it like code.
- Never build anything from spec section 17 ("Later") or `docs/future.md` before launch. Note threads are no longer in Later (spec-v4 section 7): a visitor can answer Merge's reply, and Merge remembers visitors by the name they give.

## Conventions

- **TDD:** write the Vitest test first for sim logic, schemas, validators, novelty measures, the cleaner and the budget guard.
- Work one milestone at a time from [`MILESTONES.md`](MILESTONES.md) (W0 to W8), then the steps in `docs/spec/v4/`. Use plan mode before each one, and read only that milestone's part of the spec.
- Small commits, one working slice at a time. Keep `main` deployable.
- Prefer simple over clever. This is a hobby project that should stay easy to change.
- The body is deterministic from `(step, startedAt, seed, now)`. Units: meters, kilograms, seconds, Celsius. Time zone Europe/Stockholm.
- Stack: TypeScript, pnpm workspaces, React Three Fiber, Zod (`packages/schema`), Vitest, GitHub Pages and Actions, and one small server (Contabo, Caddy, systemd).

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
pnpm --filter @forkling/mind <tick|serve|validate-pr|replay|source-trial>
pnpm --filter @forkling/mind replay --world <clone>   # the canonical body from a world repo's history beside its plan
pnpm --filter @forkling/mind run-report --world <clone> --from <date> --to <date>   # step 8's run report: the launch checklist counted from a world repo (writes nothing; Merge never sees it)
pnpm --filter @forkling/mind fast-forward --world <copy with no remote> --days 7 --cap 3   # the fast-forward test: the loop on a fake clock, real calls under a run cap; summary path printed, exit 0 on a pass (--clone-from <url> makes the copy; --dry-run uses fakes, no key)
pnpm --filter @forkling/site build                    # render a forkling's Pages site
pnpm --filter @forkling/species-cat build:model       # regenerate the cat model
```

## Where things are

- [`STATUS.md`](STATUS.md): where the project is and what is next.
- [`MILESTONES.md`](MILESTONES.md): W0 to W8 and the launch criteria.
- [`docs/spec/`](docs/spec/): the spec. `spec.md` is the whole thing, and each milestone gets its own file when it starts.
- `docs/decisions.md`: why things are the way they are. `docs/milestones-done.md`: the pet-era milestones M1 to M7.
- Pet-era docs, kept as history until the code they describe is replaced: `docs/how-it-works.md`, `docs/architecture.md`, `docs/review-2026-11.md`, `docs/future.md`, `docs/plans/`.
- Area rules: `packages/sim/CLAUDE.md`, `species/CLAUDE.md`, `apps/mind/CLAUDE.md`, `apps/viewer/CLAUDE.md`, and `templates/forkling-world/CLAUDE.md` (for the builder).
