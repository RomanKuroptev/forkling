---
name: review
description: Whole-project review against the v1 goals and docs/decisions.md. Run in a fresh Opus session.
---

Key steps:
1. Read `MILESTONES.md` (v1 goal, criteria, design rules), `docs/decisions.md`, `docs/architecture.md` and `STATUS.md`.
2. Spawn one `explorer` per area: sim, mind, viewer, species, templates. Ask each for: places that break the Never list in `CLAUDE.md`, hardcoded goals, hobbies or species logic, and gaps against the v1 criteria.
3. Compare the findings with the eight v1 criteria and the decisions log.
4. Report the real problems ranked by severity, with `file:line`. No fixes unless asked.
