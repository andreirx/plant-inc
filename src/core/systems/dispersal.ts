/**
 * Seed dispersal system — handles fruit drop, seed scattering, and germination.
 *
 * When a plant's fruit ripens and matures, seeds are scattered to nearby tiles.
 * Dispersal range depends on species stats (seed_dispersal_range).
 * Seeds germinate on valid tiles (non-ocean, unoccupied, sufficient moisture).
 * Successful germination awards DNA points to the player.
 */

import { GRID_WIDTH, GRID_HEIGHT } from '../constants';
import { type SimulationState, createPlantInstance } from '../state';

// ── Timing (must match growth.ts values) ──
const FRUIT_MATURITY_TICKS = 50;    // Ticks at fruit=1.0 before drop
const FRUIT_COOLDOWN_TICKS = 200;   // No flowering for this long after fruit drop

// ── Dispersal ──
const BASE_SEED_COUNT = 8;          // Seeds scattered per fruit drop
const BASE_GERMINATION_CHANCE = 0.35; // 35% base chance per seed
const MAX_PLANTS = 500;             // Global population cap (performance)
const DNA_PER_GERMINATION = 1;      // DNA points awarded per successful seed

// ── Dispersal range ──
const GRAVITY_RANGE = 2;            // Base range without wind (tiles)
const WIND_RANGE_MAX = 8;           // Max extra range from strong wind

/** Count total plants on the grid. */
function countPlants(state: SimulationState): number {
  let count = 0;
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (state.grid[y][x].plant) count++;
    }
  }
  return count;
}

/**
 * Pick a random landing offset for a seed.
 *
 * Each seed has two components:
 *   1. Gravity drop — short range, random direction (falls near parent)
 *   2. Wind carry — pushes seed in the current wind direction, distance
 *      proportional to windSpeed. Stronger wind = seeds travel further.
 *
 * windAngle rotates slowly over time so seeds don't all go one direction forever.
 */
function randomOffset(
  dispersalStat: number,
  windSpeed: number,
  windAngle: number,
): { dx: number; dy: number } {
  const rangeMult = Math.max(1, dispersalStat);

  // 1. Gravity component — random direction, short range
  const gravAngle = Math.random() * Math.PI * 2;
  const gravDist = (0.5 + Math.random() * GRAVITY_RANGE) * rangeMult;
  let dx = Math.cos(gravAngle) * gravDist;
  let dy = Math.sin(gravAngle) * gravDist;

  // 2. Wind component — biased direction, distance scales with windSpeed
  // windSpeed is typically 0.1-0.3, so multiply up for meaningful tile distance
  const windDist = windSpeed * WIND_RANGE_MAX * rangeMult * (0.5 + Math.random() * 0.5);
  // Add some spread (±30°) so seeds don't land in a perfect line
  const spread = (Math.random() - 0.5) * (Math.PI / 3);
  dx += Math.cos(windAngle + spread) * windDist;
  dy += Math.sin(windAngle + spread) * windDist;

  // Round to tile coordinates
  const rdx = Math.round(dx);
  const rdy = Math.round(dy);

  // Ensure at least 1 tile away
  if (rdx === 0 && rdy === 0) return { dx: Math.random() < 0.5 ? 1 : -1, dy: 0 };

  return { dx: rdx, dy: rdy };
}

/**
 * Run dispersal for all plants. Called once per tick after updateGrowth().
 */
export function updateDispersal(state: SimulationState): void {
  const { grid, species, climate } = state;
  const dispersalStat = species.stats.seed_dispersal_range;

  // Wind direction rotates slowly over time (full rotation every ~2 years)
  // This creates natural spread patterns rather than one-directional colonization
  const windAngle = (state.tick * 0.0003) % (Math.PI * 2);

  // Track new plants to add (don't modify grid while iterating)
  const newPlants: { x: number; y: number }[] = [];
  let plantCount = -1; // Lazy — only count if needed

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const cell = grid[y][x];
      if (!cell.plant) continue;

      const plant = cell.plant;

      // ── Flower senescence: flowers wilt after fruit is ripe ──
      if (plant.fruit >= 1.0 && plant.flowering > 0) {
        plant.flowering = Math.max(0, plant.flowering - 0.05);
      }

      // ── Fruit drop check ──
      if (plant.fruit < 1.0) continue;

      const ticksSinceDrop = state.tick - plant.lastFruitDrop;
      const readyToDrop =
        plant.lastFruitDrop === 0 ||
        ticksSinceDrop > FRUIT_COOLDOWN_TICKS + FRUIT_MATURITY_TICKS;

      if (!readyToDrop) continue;
      if (plant.age % FRUIT_MATURITY_TICKS !== 0) continue;

      // ── FRUIT DROP — scatter seeds ──
      plant.fruit = 0;
      plant.flowering = 0;
      plant.lastFruitDrop = state.tick;

      // Lazy plant count
      if (plantCount < 0) plantCount = countPlants(state);

      // Population cap check
      if (plantCount + newPlants.length >= MAX_PLANTS) continue;

      const seedCount = BASE_SEED_COUNT;

      for (let s = 0; s < seedCount; s++) {
        if (plantCount + newPlants.length >= MAX_PLANTS) break;

        const { dx, dy } = randomOffset(dispersalStat, climate.windSpeed, windAngle);
        const tx = x + dx;
        const ty = y + dy;

        // Bounds check
        if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) continue;

        const target = grid[ty][tx];

        // Must be empty land (no ocean, no existing plant)
        if (target.biomeId === 'ocean') continue;
        if (target.plant) continue;

        // Check if another seed already claimed this tile this tick
        if (newPlants.some((p) => p.x === tx && p.y === ty)) continue;

        // Germination chance — moisture and biome suitability
        let chance = BASE_GERMINATION_CHANCE;
        chance *= 0.5 + target.moisture; // Dry soil = harder germination
        // Tundra is harsh
        if (target.biomeId === 'tundra') chance *= 0.3;
        // Desert is very harsh
        if (target.biomeId === 'desert') chance *= 0.2;

        if (Math.random() > chance) continue;

        newPlants.push({ x: tx, y: ty });
      }
    }
  }

  // Apply new plants
  for (const { x, y } of newPlants) {
    grid[y][x].plant = createPlantInstance(species.name);
    // Award DNA points
    species.dnaPoints += DNA_PER_GERMINATION;
  }
}
