# Frostwind

Frostwind is a **nature-grounded world compiler for pixel-art game worlds**.
Real physics, imaginary worlds. It turns explicit models of nature, life,
culture, craft, and art direction into deterministic, inspectable scenes.

An LLM cannot see. Writing a 2D world, it guesses at every question a human
artist answers by looking: how big is a deer next to a person, does a head read
at this height, how far does a foot travel in one frame, what colour is snow in
shadow at 62 degrees north. Each answer is plausible on its own, and together
they produce a world where nothing agrees with anything.

Frostwind puts a derivation layer between intent and pixels. Physics settles
what has a physical answer: 26 px is 1.70 m, a roe buck is 1.18 m, so he is
20 px. Craft settles what the medium constrains, like the row budget a head needs
to read. Anything left over is declared as taste and applied consistently. Tests
hold all three true as the world outgrows what anyone can keep in their head.

> Nothing is drawn that can be derived. Nothing is chosen that can be measured.
> Nothing is claimed that cannot be checked.

Sprites store material, normal, occlusion, and thickness, never colour. Terrain
is queried from analytic fields rather than painted maps. Reality and the pixel
medium are both authorities; when they conflict, the legibility floor is
explicit. An LLM may research and propose schema-checked tables, and pixels
still pass through the same deterministic compiler: **the model is the
guardrail; the LLM writes tables, not pixels.**

This is a physically grounded world model and reference implementation. It is
not a general game engine or a runtime prompt-to-image system.

**[Play it in the browser](https://project-frostwind.fly.dev/)**, or build it
from source with the three commands below. The code is open source under the
[MIT licence](LICENSE).

## Showcase

<p align="center">
  <img src="docs/images/frostwood.png" alt="Frostwood winter forest, cabins, lake and traveller" width="32%">
  <img src="docs/images/meadow.png" alt="Sun Meadow with palms, sward, dust path and traveller" width="32%">
  <img src="docs/images/swamp.png" alt="Green Swamp landing, pile houses, water and residents" width="32%">
</p>
<p align="center"><em>Frostwood · Sun Meadow · Green Swamp</em></p>

<p align="center">
  <img src="docs/images/desert.png" alt="Amber Waste oasis with date palms, salt crust and dunes" width="49%">
  <img src="docs/images/desert-storm.png" alt="Blown sand over the Amber Waste dune field" width="49%">
</p>
<p align="center"><em>Amber Waste · the same dunes under blown sand</em></p>

<p align="center">
  <img src="docs/images/hollow.png" alt="Amethyst Hollow crystal sea, each group in its own pool of violet light" width="49%">
  <img src="docs/images/hollow-hall.png" alt="Amethyst Hollow hall with the Mirror pool, cap houses, lamp posts and the pale herd" width="49%">
</p>
<p align="center"><em>Amethyst Hollow · the Amethyst Sea and the hall</em></p>

<p align="center">
  <img src="docs/images/pond-court.png" alt="Compiled Pond Court with analytic pond, paving and ruined masonry" width="49%">
  <img src="docs/images/swamp-lakehouse.png" alt="Compiled Swamp Lakehouse above its sinkhole basin" width="49%">
</p>
<p align="center"><em>Pond Court · Swamp Lakehouse</em></p>

<p align="center">
  <img src="docs/images/creatures.png" alt="Staged boreal fauna and folk on snow" width="49%">
  <img src="docs/images/machines.png" alt="Three meadow dream-machine body plans" width="49%">
</p>
<p align="center"><em>Boreal fauna and folk · Meadow dream-machines</em></p>

These are deterministic captures from the real renderer, not concept art. The
capture commands are in [tools/shot.mjs](tools/shot.mjs).

## Quick start and controls

Use a current Node.js LTS release, npm, and a WebGL-capable browser.

```bash
git clone https://github.com/trinity-works/frostwind.git
cd frostwind
npm install
npx playwright install chromium   # browser captures and frame tests only
npm run build
```

Open `dist/frostwood.html` directly; it is a self-contained page that works from
`file://`. The title screen offers Frostwood, Sun Meadow, Green Swamp, Amber Waste and
Amethyst Hollow;
Manifesto opens the project statement. Deep links skip the menu.

- Walk: arrow keys or WASD (touch: drag the stick; diagonals allowed)
- Run: Shift (keyboard only)
- Map: M
- Menu: open the non-destructive world picker over the current scene
- World controls: the ⚙ panel changes seed, resolution, density, snow, water,
  fog, wind, light, and render passes
- Start in Sun Meadow: `dist/frostwood.html?at=meadow`
- Start at its settlement: `dist/frostwood.html?at=meadow&poi=village`

The default scene is Frostwood. Its distant portal rebuilds the resident scene
as Sun Meadow. Cabins, steadings, and swamp houses are outdoor props; doors do
not cross into a separate room place.

## What is implemented

The compiler is a five-stage pipeline:

1. **World model:** analytic terrain, water, slope, shore distance, paths,
places, and affordance fields. 2. **Sprite synthesis:** growth and
construction grammars emit material, normal, occlusion, thickness, and contact
channels. 3. **Placement:** streamable jittered grids and explicit place plans
select valid candidates from the fields. 4. **Composite:** ordered GPU passes
draw ground, shadows, reflections, sprites, and fire. 5. **Quantise:** Bayer
dither and a scene-local locked palette resolve the final pixels.

Current proofs:

- **Frostwood:** boreal light, snow, lakes, trails, cabins, animals, people,
  and tracks.
- **Sun Meadow:** a separate latitude, derived summer ramps, pond optics,
  palms, open-grown crowns, sward, steading, wind machines, and dream-machines.
- **Green Swamp:** shared hydrology drives travel, rain response, habitat,
  resident work, pile houses, and the compiled Swamp Lakehouse.
- **Amber Waste:** one wind field drives dune shape, where a wall may stand,
  blown-sand transport above a threshold, and what a worm can swim through. The
  first world to spend the angle of repose.
- **Amethyst Hollow:** a cavern with no sun. Emission bands give the lamp
  colours, each luminous body lights its own pool of floor, and rooms cut in
  rock say where a body walks.
- **Pond Court:** `fields → affordance → cultural plan → candidates → pixels`.
- **Built form:** one construct layer owns cabinet projection, face values,
  drawn-base collision, and lift. Cabins, steadings, pavilions, pile houses,
  lakehouses, and ruins remain explicit vernaculars.
- **Pixel bodies:** a grid-authored folk cast with biome-owned dress,
  displacement-locked walk/run, and transient gaze; two rigged quadrupeds, a
  roe deer and a wolf, whose measured disagreements decided how much machinery
  they may share; hand-drawn small animals; botanical grammars; and a parallel
  non-human machine morphology.

The authored/procedural boundary is deliberate: nature generates continuous
conditions and variation; authors state culture, landmarks, identity, and
exceptions that no physical law can choose.

### Known limits

- The current scene rosters pack to 1024x2048 for boreal, 1024x1024 for meadow
  and desert, and 1024x512 for swamp.
- Sun Meadow has an explicit traveller plus three unique machine lives; its
  houses remain exterior builders.
- The construct layer shares mechanics, while each vernacular still has an
  explicit builder rather than a general architecture grammar.
- Pond Court and the Swamp Lakehouse are bespoke compiled places. There is no
  general place search or beauty-search interface.
- Night is not represented. Dialogue, quests, and persistent game saves remain
  outside the compiler's scope.
- Frostwood and Green Swamp have their own music. Amber Waste and Amethyst
  Hollow borrow Frostwood's piece. Sun Meadow's piece is an optional paid file.
  A tree without the file plays Frostwood's piece in Sun Meadow. See
  [assets/music/CREDITS.md](assets/music/CREDITS.md).

## Create a new world

A world is data: plan rows and tables, in the order the `add-world` skill
(`.claude/skills/add-world/SKILL.md`) lists with the check for each step.

1. **State the plan.** Add a `BIOMES` row in [src/biome.js](src/biome.js):
   scene, latitude, water model, traversal surfaces, ground remap, place ring,
   settlement slots, cultures, and portals. [src/worldgen.js](src/worldgen.js)
   composes the stages in [src/world/](src/world/) from that row. Add a stage
   branch only for a new model (a new kind of water, a new landform), keyed on
   the plan.
2. **Declare surfaces and ramps.** Append new surface rows in
   [src/surface.js](src/surface.js); persisted surface ids must never be
   reordered. Add physically derived ramps in
   [src/sunlight.js](src/sunlight.js), or a clearly authored ramp in
   [src/palette.js](src/palette.js). Ramp ids are also append-only.
3. **Add life as data.** Add semantic conditions, resources, activity,
   sociality, behavior, provenance, and non-claims in
   [src/life.js](src/life.js); add authored human meanings only in
   [src/culture.js](src/culture.js). Botanical distributions and growth
   grammars remain in [src/species.js](src/species.js). State the wild cohorts
   in `ROSTER` in [src/world/life-field.js](src/world/life-field.js).
4. **Register the scene.** Add a `SCENES` row in
   [src/scene.js](src/scene.js) with its biome, output ramps, haze treatment,
   and water reflection window.
5. **Compile authored places.** Follow
   [src/pond-court.js](src/pond-court.js): derive a plan from fields, generate
   candidates, reject illegal ones, and emit ordinary scene props. A place does
   not get a branch in the renderer.
6. **Prove the result.** Add direct model tests first. Run `npm run test:palette`
   to see which ramps moved, then look at a real frame before accepting it.

Keep one sun, palette request, generator, atlas, and bake context per resident
scene. If two worlds need different physical conditions, make two scenes and a
portal; do not hide both inside one biome function.

## Extend the compiler

For a new physical, biological, cultural, or craft rule:

1. Classify it as **measured law**, **derived consequence**, **authored taste**,
   **medium constraint**, or **fictional law**.
2. Put one authority in the owning layer:
   - dimensions in [src/scale.js](src/scale.js);
   - terrain, water, dunes, siting, placement, and ground in the stages of
     [src/world/](src/world/);
   - semantic life, culture, continuity, and behavior in
     [src/life.js](src/life.js), [src/culture.js](src/culture.js),
     [src/life-session.js](src/life-session.js), and
     [src/behavior.js](src/behavior.js);
   - surface/material behavior in [src/surface.js](src/surface.js);
   - light, atmosphere, canopy, and water optics in
     [src/sunlight.js](src/sunlight.js);
   - morphology and growth in [src/species.js](src/species.js),
     [src/body-deer.js](src/body-deer.js), or [src/machine.js](src/machine.js);
   - sprite-channel operations in [src/sprite.js](src/sprite.js);
   - composition and world state in [src/scene.js](src/scene.js).
3. Make drawing and placement read that authority. A table no executable path
   reads is documentation, not a model.
4. Add a narrow test that measures the cause and, where relevant, its drawn
   consequence. A check names an authority and says what moved.
5. Add or move the row in [docs/CANON.md](docs/CANON.md), including provenance,
   scope, concessions, and the exact executable reader.

The renderer owns the frame; the scene owns the world. Do not add biome,
doorway, entity, or place branches to [src/render.js](src/render.js).

## Work with a coding agent

The repository ships the contract its own agents work under, so a coding agent
can extend a world without guessing:

- [AGENTS.md](AGENTS.md): the golden rule, the pipeline, and one authority per
  dimension. Claude Code, Codex and Cursor read it.
- [.claude/rules/](.claude/rules/): one path-scoped rule per authority cluster.
  Each names its owning spec and its closest test. `npm run rules` mirrors them
  to `.cursor/rules/`.
- [.claude/skills/](.claude/skills/): `add-world`, `add-character` and
  `frame-check`, each a checked list of steps.

Open the repository in your agent and ask for a world, for example:

> Add a tundra world with a frozen river, a reindeer herd and a herders' camp.

The agent writes plan rows, tables and tests. The compiler derives the pixels.

## Commands and verification

```bash
npm run build            # dist/frostwood.html
npm run dev              # rebuild the game on change
npm run lab              # dist/lab.html: sprite/figure inspection
npm run preview          # 13.5-second, three-world MP4 from the current build
npm run context:stats    # always-loaded, routed, and repository prose budgets
npm run lint             # undefined names, unused bindings, world stage wiring
npm run codehash         # which edited files changed code, which only comments
npm run rules            # write the Cursor rule mirror from .claude/rules

npm run test:built-form  # scale, construction, pavilion, architecture, steading
npm run test:people      # both human rasters, culture, and attention
npm run test:world       # scene, palette, weather, biome, and swamp integration
npm run test:life        # life, ecology, culture, continuity, disturbance
npm run test:culture     # dress vocabulary and weather selection only
npm run test:folk:contract
npm run test:folk:raster
npm run test:folk:colour
npm run test:biome
npm run test:machine
npm run test:pond-court
npm run test:swamp       # swamp hydrology, settlement and lakehouse
npm run test:desert      # dune field, oasis, and the worm
npm run test:architecture
npm run test:palette     # every ramp and scene snap list, no browser
npm run palette:update   # rewrite the colour baseline once you have read the delta
npm run test:frame       # one real frame per world, against its locked palette
npm run test:music
npm run test:review      # three-option human pixel-review manifests
npm test                 # every *.test.mjs, without rebuilding
npm run verify           # lint, build, then the full test suite
```

Useful captures:

```bash
node tools/shot.mjs --out docs/images/frostwood.png --zoom 3
node tools/shot.mjs --scene meadow --common --out docs/images/meadow.png --zoom 3
node tools/shot.mjs --scene swamp --settlement --out docs/images/swamp.png --zoom 3
node tools/shot.mjs --scene swamp --lakehouse --out docs/images/swamp-lakehouse.png --zoom 3
node tools/shot.mjs --creatures --at 0,1000 --out docs/images/creatures.png --zoom 4
node tools/shot.mjs --machines --out docs/images/machines.png --zoom 4
node tools/shot.mjs --scene meadow --poi pondCourt --out docs/images/pond-court.png --zoom 3
node tools/shot.mjs --oasis --out docs/images/desert.png --zoom 3
node tools/shot.mjs --dunes --wind 2.4 --out docs/images/desert-storm.png --zoom 3
node tools/shot.mjs --scene hollow --at -1010,560 --out docs/images/hollow.png --zoom 3
node tools/shot.mjs --scene hollow --at 60,570 --out docs/images/hollow-hall.png --zoom 3
```

### Human pixel review

`.claude/rules/pixel-review-gate.md` owns the gate. The agent measures and
looks at its own frames; a change that alters a world's look carries a before
and after pair. An open question with no law and no defect goes to a
three-option human review, and `test/review.test.mjs` holds the manifest
fixture.

```bash
node tools/review.mjs review/roof.json
```

The command writes `review/FW-VR-<date>-<hash>.html` and a normalized JSON
record, and it rejects any option count other than three. Reply with the
printed review ID and `A`, `B`, or `C`, for example `FW-VR-20260807-12AB34CD
B`.

The preview renderer needs `ffmpeg` on `PATH` and reads the current
`dist/frostwood.html`. Playwright records the deterministic world plate, then
Remotion cuts the three world clips:

```bash
node tools/preview.mjs --draft             # short capture smoke check
npm run preview                            # capture and polish the full handoff
npm run preview:capture                    # refresh only the source plate
npm run preview:studio                     # tune the Remotion composition
npm run preview:polish                     # render the current source plate
```

The final render is three 4.5-second cuts: Frostwood, Sun Meadow, and Green
Swamp. It keeps the 960×540 viewport scaled exactly 2×, eased diagonal camera
motion, staged wildlife, and each world's music with short cut fades. The only
overlay is a compact upper-left world name, main-menu icon, seed, pinned time,
and viewport. Generated videos stay under `artifacts/preview/`.

Direct tests own equations, dimensions, and tables. Rig identity owns synthesized
figure bytes. `test:palette` owns every ramp and scene snap list. The frame gate
owns the one claim no model test can make, that the shader agrees with the model:
every pixel a GPU drew is an entry in the palette that world declared. Visual
review remains the authority for intentional art changes. A check names an
authority and says what moved; it does not prove beauty.

## Repository map

```text
src/
  main.js                  bootstrap, controls, DOM boundary
  scale.js                 dimensional authority: 26 px = 1.70 m
  render.js                GPU frame, batches, render targets and passes
  scene.js                 resident world, entities, places and portals
  worldgen.js              composes the world stages in dependency order
  world/                   terrain, dunes, swamp water, water, siting, life
                           field, placement, ground painters, chunk bake
  biome.js                 world plans, placement lattices, habitat niches
  weather.js               rain, blown sand and gust fronts on one wind axis
  life.js culture.js       semantic species and authored cultural authority
  life-session.js          clock, records, events, memory and snapshots
  behavior.js life-runtime.js  pure decisions and nearby realization
  surface.js               append-only material/surface table
  sunlight.js palette.js   physical light/ramps and locked palette bakes
  sprite.js species.js     channel operations and plant grammars
  gait.js quadruped.js     Hildebrand contact schedules; the shared limb solver
  body-deer.js figure-deer.js  the first rigged animal
  body-wolf.js figure-wolf.js  the second rigged animal, and the shared seam's proof
  people.js                the one cast list and world-to-traveller wardrobe map
  body-folk.js figure-folk.js  grid-authored human anatomy and raster
  animal.js fauna.js       hand-drawn small animals and actor expression rows
  machine.js               non-human morphology and dream-law boundary
  construct.js             shared built-form volume, projection and contact
  cabin.js steading.js pavilion.js  explicit built-form generators
  swamp-settlement.js swamp-lakehouse.js  compiled swamp settlement and place
  ruins.js pond-court.js   ruins synthesis and compiled-place plan
  atlas.js                 synthesis orchestration and GPU atlas packing
  shaders/                 GLSL templates; palette resolution happens here

assets/                    fonts and music, each with its own licence file
reference/                 retained human source studies, not runtime assets
lab/                       browser inspection entry points
tools/                     captures, lint, code identity, rule mirror
test/                      model specifications and rendered regression gates
docs/                      canon, decisions, biome and machine specifications
build.mjs                  game/lab single-file build targets
```

## Documentation path

Read in this order:

1. [VISION.md](VISION.md): the derivation layer, two canons, method limits
2. [ARCHITECTURE.md](ARCHITECTURE.md): pipeline, ownership, scene exclusivity
3. [docs/CANON.md](docs/CANON.md): encoded, downgraded, refused, and available laws
4. [docs/DECISIONS.md](docs/DECISIONS.md): current decisions and concessions
5. [ROADMAP.md](ROADMAP.md): completed foundations and open structural debt

Then route by subject:

- Worlds and ecology: [docs/MEADOW.md](docs/MEADOW.md) (biome physics);
  [docs/SWAMP.md](docs/SWAMP.md); [docs/DESERT.md](docs/DESERT.md);
  habitat dossiers under [docs/life/](docs/life/)
- Semantic life and culture: [LIFE.md](LIFE.md)
- Production morphology and pixel-medium laws: [docs/LIFE.md](docs/LIFE.md)
- Source studies retained behind the current folk raster: [reference/](reference/)
- Machines and invented physics: [docs/MACHINES.md](docs/MACHINES.md)
- Projection: [PROJECTION.md](PROJECTION.md)
- Pixel craft: [PIXEL-ART.md](PIXEL-ART.md)
- Contribution/agent constraints: [AGENTS.md](AGENTS.md)

## References and research leads

The full provenance register, including unsupported folklore, is
[docs/CANON.md](docs/CANON.md). Important encoded starting points include:

- Lindenmayer, *Journal of Theoretical Biology* (1968): growth grammars.
- Monsi & Saeki, *Japanese Journal of Botany* 14:22–52 (1953):
  Beer–Lambert canopy attenuation.
- Naka & Rushton, *Journal of Physiology* 185:536–555 (1966):
  photoreceptor response.
- Hallé, Oldeman & Tomlinson, *Tropical Trees and Forests* (1978):
  architectural plant models.
- Livingstone & Hubel, *Science* 240:740–749 (1988): form failure at
  equiluminance.
- Pope & Fry, *Applied Optics* 36(33):8710–8723 (1997): pure-water
  absorption.
- Merrell et al., *ACM TOG* 30(4), SIGGRAPH (2011): outdoor yard circulation
  clearance (`YARD_M`).

Promising sources not yet encoded:

- Dreyfuss, *The Measure of Man*, and NASA-STD-3000: anthropometric
  percentiles for limb ratios.
- Inman, *Human Walking* (1981), and Perry, *Gait Analysis* (1992):
  quantitative stance/swing timing and joint angles.
- Horton (1945) and Strahler (1952): ordered drainage networks.
- Soil and snow mechanics literature on angle of repose: slope terracing and
  deposition; the current `SURFACE.repose` column is not yet executable.
- West, Brown & Enquist, *Science* (1997): metabolic scaling; currently
  declined for world-height selection because the pixel frame, not mass, is the
  binding authority.

## Contributing

Issues and pull requests are welcome at
[trinity-works/frostwind](https://github.com/trinity-works/frostwind).

- [AGENTS.md](AGENTS.md) is the contract for people and agents alike: find the
  one authority, edit it, and add the closest test.
- Run `npm run verify` before you open a pull request. It runs lint, the build
  and the full test suite.
- A change to drawn output needs a before and after frame from
  [tools/shot.mjs](tools/shot.mjs).
- Add an asset only with a licence that allows redistribution, and record it
  beside the file.

## Licence and credits

Code and documentation are under the [MIT licence](LICENSE), copyright Trinity
Labs Pte. Ltd. Third-party material keeps its own licence:

- **Music:** Veil of Dreams and Lily-Paddling Down the Stream by
  [Fablefly Music](https://fablefly-music.itch.io/), CC BY 4.0. The hosted
  demo also plays their track Sunny Stroll, an optional file that the public
  repository does not carry.
  See [assets/music/CREDITS.md](assets/music/CREDITS.md).
- **Font:** Pixelify Sans, SIL Open Font License 1.1. See
  [assets/fonts/OFL.txt](assets/fonts/OFL.txt).
- **Runtime library:** [three.js](https://threejs.org/), MIT. The build bundles
  it into `dist/frostwood.html`.
- **Preview video only:** `npm run preview` uses
  [Remotion](https://www.remotion.dev/), which has its own licence. Some
  companies need a paid Remotion licence. The game, the lab and the tests do
  not use it.
- **Craft sources:** [PIXEL-ART.md](PIXEL-ART.md) checks the pipeline against
  published tutorials and names each source.

> Nature provides the laws. Life provides growth and interaction. Culture
> provides meaning. Craft provides the language. Beauty provides direction.
> Frostwind compiles the world.
