# Kit models: credits

Every model file in this folder is listed here with where it came from and its licence. **Only CC0 files may be added.** Check the pack's own page before adding a file, and keep its licence text beside it. A test (`apps/mind/test/kit-models.test.ts`) fails if a file is missing from this table, is not CC0, is not used by a part, or is heavier than the render budget allows. A part always keeps its primitives, which are drawn if its model cannot be loaded.

| File | Pack | Author | Licence | Source |
|---|---|---|---|---|
| `tree_default.glb` | Nature Kit | Kenney | CC0 1.0 | https://kenney.nl/assets/nature-kit |
| `tree_pineDefaultA.glb` | Nature Kit | Kenney | CC0 1.0 | https://kenney.nl/assets/nature-kit |
| `tree_pineTallA.glb` | Nature Kit | Kenney | CC0 1.0 | https://kenney.nl/assets/nature-kit |
| `rock_smallA.glb` | Nature Kit | Kenney | CC0 1.0 | https://kenney.nl/assets/nature-kit |
| `rock_largeA.glb` | Nature Kit | Kenney | CC0 1.0 | https://kenney.nl/assets/nature-kit |

The pack's own licence text is `License-kenney-nature-kit.txt` (Creative Commons Zero, CC0). The page at the source address states "License: Creative Commons CC0" (checked 13 November 2026). The files are the ones the viewer already shipped in `apps/viewer/public/models/nature/`, copied here unchanged.

## Not added yet

- **Furniture.** Kenney's Furniture Kit (https://kenney.nl/assets/furniture-kit) is also CC0, but its page offers no direct download (the button is a script), so no furniture model could be fetched without a person. To add one: download the kit, put the `.glb` files you want here with the pack's licence file, add a line to the table, and set `"model": { "file": "...", "scale": ... }` on the part in `kit/parts.json` (the scale makes the model about as big as the part's box). The tests above then check it.
