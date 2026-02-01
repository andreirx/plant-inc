/**
 * Procedural world generation pipeline.
 *
 * Pass 1: Climate — latitude gradient + noise for temperature & moisture.
 * Pass 2: Biome  — (temp, moisture) lookup to assign biome per tile.
 * Pass 3: Soil   — weighted random from biome's soilComposition.
 * Pass 4: Start  — place initial plant at map center.
 */

import { GRID_WIDTH, GRID_HEIGHT } from '../constants';
import { SOIL_TYPES, type NutrientProfile } from '../data/soil';
import { BIOMES } from '../data/biomes';
import { type GridCell, type SpeciesInstance } from '../state';
import { SimplexNoise } from '../../utils/noise';

// Noise sampling scales
const MOISTURE_SCALE = 0.02;
const TEMP_NOISE_SCALE = 0.015;
const MOISTURE_OCTAVES = 4;
const TEMP_OCTAVES = 3;

interface TileClimate {
  temperature: number; // 0.0 (freezing) - 1.0 (scorching)
  moisture: number;    // 0.0 (arid) - 1.0 (saturated)
}

/**
 * Biome classification from continuous (temperature, moisture) values.
 * Returns the biome ID that best matches the climate point.
 */
function classifyBiome(temp: number, moisture: number): string {
  // Hot + dry = desert
  if (temp > 0.65 && moisture < 0.3) return 'desert';
  // Default to temperate forest
  return 'temperate_forest';
}

/**
 * Pick a soil ID from a biome's weighted composition table.
 * Uses a seeded value (0..1) so generation is deterministic.
 */
function pickSoil(biomeId: string, roll: number): string {
  const biome = BIOMES[biomeId.toUpperCase()] ?? BIOMES.TEMPERATE_FOREST;
  let cumulative = 0;
  for (const entry of biome.soilComposition) {
    cumulative += entry.weight;
    if (roll <= cumulative) return entry.soilId;
  }
  // Fallback to last entry
  return biome.soilComposition[biome.soilComposition.length - 1].soilId;
}

/** Resolve base nutrients from a soil type ID */
function getNutrients(soilId: string): NutrientProfile {
  for (const soil of Object.values(SOIL_TYPES)) {
    if (soil.id === soilId) return { ...soil.baseNutrients };
  }
  return { nitrogen: 0.3, phosphorus: 0.3, potassium: 0.3 };
}

/** Resolve water retention from a soil type ID */
function getWaterRetention(soilId: string): number {
  for (const soil of Object.values(SOIL_TYPES)) {
    if (soil.id === soilId) return soil.waterRetention;
  }
  return 0.5;
}

/**
 * Generate a complete world grid.
 * @param seed — deterministic seed for noise functions.
 * @returns A 2D array of GridCells (GRID_HEIGHT rows x GRID_WIDTH cols).
 */
export function generateWorld(seed: number): GridCell[][] {
  const moistureNoise = new SimplexNoise(seed);
  const tempNoise = new SimplexNoise(seed + 31337);
  const soilNoise = new SimplexNoise(seed + 65521);

  const grid: GridCell[][] = [];

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
      // --- Pass 1: Climate ---
      const climate = computeTileClimate(x, y, moistureNoise, tempNoise);

      // --- Pass 2: Biome ---
      const biomeId = classifyBiome(climate.temperature, climate.moisture);

      // --- Pass 3: Soil ---
      const soilRoll = soilNoise.noise2DNormalized(x * 0.1, y * 0.1);
      const soilId = pickSoil(biomeId, soilRoll);

      row.push({
        soilId,
        biomeId,
        moisture: climate.moisture * getWaterRetention(soilId),
        nutrients: getNutrients(soilId),
        rootDensity: 0,
        plant: null,
      });
    }
    grid.push(row);
  }

  // --- Pass 4: Place starting plant at center ---
  const cx = Math.floor(GRID_WIDTH / 2);
  const cy = Math.floor(GRID_HEIGHT / 2);
  const startPlant: SpeciesInstance = {
    genomeId: 'player',
    age: 0,
    health: 1.0,
    biomass: 1.0,
  };
  grid[cy][cx].plant = startPlant;

  return grid;
}

function computeTileClimate(
  x: number,
  y: number,
  moistureNoise: SimplexNoise,
  tempNoise: SimplexNoise,
): TileClimate {
  // Latitude gradient: y=0 is north pole (cold), y=middle is equator (hot)
  const latitudeNorm = y / GRID_HEIGHT; // 0..1
  const latitudeTemp = Math.sin(latitudeNorm * Math.PI); // 0 at poles, 1 at equator

  // Noise-based local variation
  const tempVariation = tempNoise.fractal2D(
    x * TEMP_NOISE_SCALE,
    y * TEMP_NOISE_SCALE,
    TEMP_OCTAVES, 2.0, 0.5,
  );
  // Combine: latitude dominates (70%), noise adds detail (30%)
  const temperature = clamp(latitudeTemp * 0.7 + (tempVariation + 1) * 0.5 * 0.3);

  // Moisture: purely noise-driven with some latitude influence
  const moistureRaw = moistureNoise.fractal2D(
    x * MOISTURE_SCALE,
    y * MOISTURE_SCALE,
    MOISTURE_OCTAVES, 2.0, 0.5,
  );
  const moisture = clamp((moistureRaw + 1) * 0.5);

  return { temperature, moisture };
}

function clamp(v: number, min = 0, max = 1): number {
  return v < min ? min : v > max ? max : v;
}
