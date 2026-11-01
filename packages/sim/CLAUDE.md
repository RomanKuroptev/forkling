# packages/sim

The pure, deterministic sim. It runs in the browser, in the mind and in CI, so it must stay pure.

## Rules
- Keep it pure: no DOM, no three.js, no React, no network, no `node:` imports.
- No `Math.random()`. Use the seeded PRNG in `src/prng.ts`. No `Date.now()` either; time comes in as an argument.
- The body is deterministic from `(intention, startedAt, seed, now)`, so every visitor sees roughly the same forkling at the same moment.
- Surprise scoring, mood appraisal and the sleep schedule are deterministic too, so the two-seed divergence test can run headless in CI.
- Never write species-specific logic here. If a feature needs it, add a hook to the pack format instead. The tests run against a made-up "blob" pack with no animations to prove the engine has no cat assumptions.
- Never add goal, hobby, interest or activity lists. Behaviour needs a new verb, a tool or place, a material or an object property.
- The sim works out what a verb can do with an object from the object's physical properties, not from named affordances.

## Working here
- TDD: write the Vitest test first for sim logic, then the code.
- The headless runner steps the world without a renderer. Use it to test behaviour over simulated days.
- Surprise triggers decide when the mind wakes the LLM: novelty, a blocked step (once per step), a strong need the body cannot fix by itself, a step that ran out, a replan (the day is planned and nothing is running), a new day, bedtime, and the weekly review. No trigger means no LLM call; utility AI keeps the forkling busy.
- The plan owns the visible action. Drift fills gaps and looks after a critical need with one action, then the plan goes on. A step's effect lands only after the body really spent time on its verb (`tallyWindow`).
- Run one file with `pnpm vitest run packages/sim/test/<file>`.
