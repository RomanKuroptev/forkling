---
name: docs-sync
description: Compare the CLAUDE.md files, docs/architecture.md and STATUS.md with the code and list stale claims. Use after a milestone or a larger refactor.
---

Key steps:
1. Read the root `CLAUDE.md`, the nested ones (`packages/sim`, `species`, `apps/mind`, `apps/viewer`, `templates/forkling-world`), `docs/architecture.md` and `STATUS.md`.
2. For each claim about a path, command, script, model id, cap or workflow, check it against the code (`package.json` scripts, `.github/workflows`, `packages/schema`, caps in `apps/mind/src`).
3. List stale or missing claims with `file:line` for the doc and the code that disagrees.
4. Propose fixes; apply them only if the user asks.
