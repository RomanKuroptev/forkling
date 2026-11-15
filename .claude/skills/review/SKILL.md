---
name: review
description: Whole-project review against the spec, the launch criteria and docs/decisions.md. Run in a fresh Opus session.
---

Key steps:
1. Read `MILESTONES.md` (goal, launch criteria), `docs/spec/spec.md`, `docs/decisions.md` and `STATUS.md`.
2. Spawn one `explorer` per area: sim, mind, viewer, species, templates. Ask each for: places that break the Never list in `CLAUDE.md`, hardcoded goals, hobbies or species logic, and gaps against the launch criteria (W8).
3. Compare the findings with the launch criteria and the decisions log.
4. Report the real problems ranked by severity, with `file:line`. No fixes unless asked.
