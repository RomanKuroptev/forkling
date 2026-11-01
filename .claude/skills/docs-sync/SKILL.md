---
name: docs-sync
description: Compare the CLAUDE.md files, docs/architecture.md, docs/how-it-works.md and STATUS.md with the code and list stale claims. Use after a milestone or a larger refactor.
---

Key steps:
1. Read the root `CLAUDE.md`, the nested ones (`packages/sim`, `species`, `apps/mind`, `apps/viewer`, `apps/site`, `templates/forkling-world`), `docs/architecture.md`, `docs/how-it-works.md` and `STATUS.md`.
2. For each claim about a path, command, script, model id, cap, trigger or workflow, check it against the code: `package.json` scripts (root and `apps/*`), the workflows in `templates/forkling-world/.github/workflows` (the engine repo has none of its own to run for a world), the schemas in `packages/schema/src`, the caps in `apps/mind/src` and `packages/schema/src/mind.ts`, and the trigger kinds in `packages/sim/src/surprise.ts`.
3. Check what the docs say about visitors: nothing sends visitor events until the visit gateway exists (`docs/future.md`), so any claim that a visit reaches the mind must say it is future.
4. List stale or missing claims with `file:line` for the doc and the code that disagrees.
5. Propose fixes; apply them only if the user asks. The docs test (`test/docs.test.ts`) already checks that inline-code paths exist, so spend the effort on claims it cannot check.
