# Plant Inc

A "Plague Inc"-style strategy simulation where you design a plant species to conquer a procedurally generated world. Watch seedlings grow into trees, roots reach deep for water, and leaves change color and drop for winter — all driven by real biology.

## What It Does Today

**Biologically grounded growth.** Plants photosynthesize, respire, absorb water and nutrients through roots, and allocate energy to whichever organ is the current bottleneck. Drought? Grow roots. Shade? Grow tall. Balanced conditions? Grow everything.

**Seasonal phenology.** Leaves turn from green through yellow, orange, and brown in autumn, then drop. The plant enters winter dormancy (70% reduced respiration, no growth). In spring, leaves regrow at an energy cost once temperatures rise above 5°C.

**Procedural rendering.** A two-phase renderer builds the plant as a data structure (trunk, branches, roots, leaves) with biological constraints — Da Vinci's pipe model, gravitropism, apical dominance — then calculates a bounding box and renders both the above-ground shoot and below-ground roots at a unified scale.

**Climate system.** Sinusoidal temperature and sunlight cycles. Episodic rain events driven by humidity. Evaporation, drainage, and nutrient cycling (microbial decomposition + rare animal fertilization).

**7-biome world.** Procedurally generated 256x256 map with ocean, desert, tundra, temperate forest, tropical rainforest, savanna, and wetland. Each biome has distinct soil composition, native fauna, and climate modifiers.

**4-quadrant interface:**

| | Left | Right |
|---|---|---|
| **Top** | Air View — shoot system, sky, weather | Map View — world tilemap, biome distribution |
| **Bottom** | Soil View — root system, moisture | Evolution UI — trait tree, inspector, speed controls |

## Roadmap

### Phase 1: Ecosystem Interactions
- **Pollinators** visit flowers, accelerating reproduction
- **Herbivores** eat biomass, creating selective pressure for defenses (spikes, toxins)
- **Mycorrhizal networks** — fungi trade soil nutrients for plant sugars

### Phase 2: Seed Dispersal & Competition
- **Seed production** from ripe fruit, dispersal strategies (wind, animal, gravity)
- **Germination** on suitable tiles — new plants compete for light, water, nutrients
- **Population dynamics** — species spread across the map, compete at biome boundaries

### Phase 3: Player Agency & Strategy
- **Trait evolution** — spend DNA points on adaptations (deeper roots, broader leaves, frost resistance, thorns)
- **Win condition** — cover X% of habitable land before a rival species does
- **Events** — forest fires, droughts, ice ages, invasive species

### Phase 4: Polish
- Particle effects (falling leaves, rain, pollen)
- Sound design (wind, rain, birdsong keyed to biome)
- Mobile touch controls
- Save/load

## Tech Stack

| | |
|---|---|
| Language | TypeScript 5.7 (strict mode) |
| Renderer | PixiJS 8 (WebGL/WebGPU) |
| Bundler | Vite 6 |
| Tests | Vitest |
| Architecture | Clean separation: `core/` (simulation) · `render/` (visuals) · `ui/` (DOM) |

## Getting Started

```bash
npm install
npm run dev        # http://localhost:3000
```

## Project Structure

```
src/
  core/            # Pure simulation — no render/UI imports
    data/          # Biomes, soil types, traits, plant archetypes
    systems/       # Climate, growth, map generation
    state.ts       # Global simulation state
    loop.ts        # Fixed-timestep game loop
    constants.ts

  render/          # Visual layer — reads state, never mutates it
    layers/        # Terrain, plants, cursor, atmosphere
    visuals/       # Procedural plant drawer (two-phase: build → render)
    app.ts         # PixiJS application factory

  ui/              # DOM interface
    components/    # Inspector, evolution tree, speed controls
    layout.ts      # 4-quadrant CSS grid

  utils/           # Noise, events
  main.ts          # Bootstrap
```

## Scripts

```bash
npm run dev          # Vite dev server
npm run build        # Type-check + production build
npm run type-check   # tsc --noEmit
npm run test         # Vitest
npm run preview      # Preview production build
```

## License

Private — not yet published.
