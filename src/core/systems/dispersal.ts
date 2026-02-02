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

// ── Dispersal range by method ──
const RANGE_GRAVITY = { min: 1, max: 2 };
const RANGE_WIND = { min: 2, max: 6 };
const RANGE_ANIMAL = { min: 1, max: 4 };
const RANGE_WATER = { min: 1, max: 3 };

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

/** Get dispersal range based on method and species stats. */
function getRange(
  method: string,
  dispersalStat: number,
): { min: number; max: number } {
  let range: { min: number; max: number };
  switch (method) {
    case 'wind': range = { ...RANGE_WIND }; break;
    case 'animal': range = { ...RANGE_ANIMAL }; break;
    case 'water': range = { ...RANGE_WATER }; break;
    default: range = { ...RANGE_GRAVITY }; break;
  }
  // seed_dispersal_range stat multiplies the max range
  const mult = Math.max(1, dispersalStat);
  range.max = Math.round(range.max * mult);
  range.min = Math.min(range.min, range.max);
  return range;
}

/** Pick a random landing offset for a seed. */
function randomOffset(
  range: { min: number; max: number },
  method: string,
): { dx: number; dy: number } {
  // Random angle
  const angle = Math.random() * Math.PI * 2;
  // Random distance within range
  const dist = range.min + Math.random() * (range.max - range.min);

  let dx = Math.round(Math.cos(angle) * dist);
  let dy = Math.round(Math.sin(angle) * dist);

  // Wind: bias in a consistent direction (use a pseudo-random but stable angle)
  if (method === 'wind') {
    const windAngle = (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 6) + angle * 0.3;
    dx = Math.round(Math.cos(windAngle) * dist);
    dy = Math.round(Math.sin(windAngle) * dist);
  }

  // Ensure at least 1 tile away
  if (dx === 0 && dy === 0) dx = Math.random() < 0.5 ? 1 : -1;

  return { dx, dy };
}

/**
 * Run dispersal for all plants. Called once per tick after updateGrowth().
 */
export function updateDispersal(state: SimulationState): void {
  const { grid, species } = state;
  const dispersalStat = species.stats.seed_dispersal_range;

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

      const range = getRange('gravity', dispersalStat); // Default to gravity for now
      const seedCount = BASE_SEED_COUNT;

      for (let s = 0; s < seedCount; s++) {
        if (plantCount + newPlants.length >= MAX_PLANTS) break;

        const { dx, dy } = randomOffset(range, 'gravity');
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
