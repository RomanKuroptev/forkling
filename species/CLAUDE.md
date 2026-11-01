# Species packs

The engine is species-agnostic. Everything specific to an animal lives in a pack under `species/<id>/`, so a forkling can be a cat, dog, fox, owl, dragon or anything else. The format is `SpeciesPack` in `packages/schema`.

```
species/<id>/
  species.json      # id, display name, body plan (quadruped/upright), needs and decay rates, verbs (group, preconditions, duration, animation slot, effects), eye height and field of view
  model.glb         # rigged low-poly model (CC0 or self-made)
  animations.json   # maps engine animation slots (idle, walk, run, sit, sleep, jump, dig, carry...) to clips
  behaviors.ts      # signature micro-behaviors (e.g. cat: groom, knead, tail flicks)
  persona.md        # base personality, merged with the forkling's own brain/persona.md
  temperament.json  # pools that seeded likes, dislikes and quirks are rolled from
```

## Rules
- The mind, builder and site never hardcode a species. They read the pack.
- A pack declares its needs from a shared vocabulary (`hunger`, `energy`, `curiosity`, `affection`, `fun`, `social`...) plus decay rates, so the utility AI works for any animal.
- A pack declares a **body plan** (quadruped, upright or both) and **verbs**, not activities. Which verb groups a body allows comes from its body plan. What a verb can do to an object comes from the object's physical properties.
- Never add goal, hobby, interest or activity lists to a pack. Seeded likes, dislikes and quirks are a starting temperament, rolled from pools in `temperament.json`.
- Missing animation slots fall back gracefully.
- Never write species-specific logic outside `species/`. If a feature needs it, add a hook to the pack format.
- Species packs from third parties are reviewed like code before being added to the engine.

## `cat` ships first and is the default
An upright cat that drops to four legs to run, play and sleep. Cat flavor: independent, curious, sleeps a lot, affectionate only on its own terms, knocks things off tables.

## Working here
- `behaviors.ts` holds signature micro-behaviors as code (cat: groom, knead, tail flicks).
- The cat's model is generated, not downloaded. To change it, edit `species/cat/src/buildCat.ts` or `clips.ts` and run `pnpm --filter @forkling/species-cat build:model`.
- Keep the art style coherent across species. Prefer CC0 low-poly assets (Kenney, KayKit, Quaternius).
