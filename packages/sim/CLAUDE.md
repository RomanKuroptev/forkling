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
- Surprise triggers (novelty, a blocked plan step, a strong need, a goal step finished, a new day) decide when the mind wakes the LLM. No trigger means no LLM call; utility AI keeps the forkling busy.
- Run one file with `pnpm vitest run packages/sim/test/<file>`.
