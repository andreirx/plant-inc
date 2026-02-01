/**
 * Procedural world generation pipeline.
 *
 * Pass 0: Elevation — noise-based height map. Below threshold = ocean.
 * Pass 1: Climate   — latitude gradient + noise for temperature & moisture.
 * Pass 2: Biome     — (elevation, temp, moisture) lookup to assign biome.
 * Pass 3: Soil      — weighted random from biome's soilComposition.
 * Pass 4: Start     — place initial plant at map center (on land).
 */

import { GRID_WIDTH, GRID_HEIGHT } from '../constants';
import { SOIL_TYPES, type NutrientProfile } from '../data/soil';
import { BIOMES } from '../data/biomes';
import { type GridCell, createPlantInstance } from '../state';
import { SimplexNoise } from '../../utils/noise';

// Noise sampling scales
const MOISTURE_SCALE = 0.02;
const TEMP_NOISE_SCALE = 0.015;
const ELEVATION_SCALE = 0.015;
const MOISTURE_OCTAVES = 4;
const TEMP_OCTAVES = 3;
const ELEVATION_OCTAVES = 4;

/** Elevation below this is ocean */
const SEA_LEVEL = 0.35;

interface TileClimate {
  temperature: number; // 0.0 (freezing) - 1.0 (scorching)
  moisture: number;    // 0.0 (arid) - 1.0 (saturated)
  elevation: number;   // 0.0 (deep ocean) - 1.0 (mountain peak)
}

/**
 * Biome classification from continuous (elevation, temperature, moisture).
 */
function classifyBiome(elevation: number, temp: number, moisture: number): string {
  if (elevation < SEA_LEVEL) return 'ocean';
  if (temp > 0.65 && moisture < 0.3) return 'desert';
  return 'temperate_forest';
}

/**
 * Pick a soil ID from a biome's weighted composition table.
 */
function pickSoil(biomeId: string, roll: number): string {
  const biome = BIOMES[biomeId.toUpperCase()] ?? BIOMES.TEMPERATE_FOREST;
  let cumulative = 0;
  for (const entry of biome.soilComposition) {
    cumulative += entry.weight;
    if (roll <= cumulative) return entry.soilId;
  }
  return biome.soilComposition[biome.soilComposition.length - 1].soilId;
}

function getNutrients(soilId: string): NutrientProfile {
  for (const soil of Object.values(SOIL_TYPES)) {
    if (soil.id === soilId) return { ...soil.baseNutrients };
  }
  return { nitrogen: 0.3, phosphorus: 0.3, potassium: 0.3 };
}

function getWaterRetention(soilId: string): number {
  for (const soil of Object.values(SOIL_TYPES)) {
    if (soil.id === soilId) return soil.waterRetention;
  }
  return 0.5;
}

/**
 * Generate a complete world grid.
 */
export function generateWorld(seed: number): { grid: GridCell[][]; startX: number; startY: number } {
  const moistureNoise = new SimplexNoise(seed);
  const tempNoise = new SimplexNoise(seed + 31337);
  const soilNoise = new SimplexNoise(seed + 65521);
  const elevationNoise = new SimplexNoise(seed + 9999);

  const grid: GridCell[][] = [];

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
      const climate = computeTileClimate(x, y, moistureNoise, tempNoise, elevationNoise);
      const biomeId = classifyBiome(climate.elevation, climate.temperature, climate.moisture);

      const soilRoll = soilNoise.noise2DNormalized(x * 0.1, y * 0.1);
      const soilId = pickSoil(biomeId, soilRoll);

      // Ocean tiles are fully saturated
      const moisture = biomeId === 'ocean'
        ? 1.0
        : climate.moisture * getWaterRetention(soilId);

      row.push({
        soilId,
        biomeId,
        moisture,
        nutrients: getNutrients(soilId),
        rootDensity: 0,
        plant: null,
      });
    }
    grid.push(row);
  }

  // --- Pass 4: Place starting plant on nearest LAND tile to center ---
  const cx = Math.floor(GRID_WIDTH / 2);
  const cy = Math.floor(GRID_HEIGHT / 2);

  let startX = cx;
  let startY = cy;

  if (grid[cy][cx].biomeId === 'ocean') {
    // Spiral outward to find land
    let found = false;
    for (let radius = 1; radius < 50 && !found; radius++) {
      for (let dy = -radius; dy <= radius && !found; dy++) {
        for (let dx = -radius; dx <= radius && !found; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
            if (grid[ny][nx].biomeId !== 'ocean') {
              startX = nx;
              startY = ny;
              found = true;
            }
          }
        }
      }
    }
    // Absolute fallback: force center to land
    if (!found) {
      grid[cy][cx].biomeId = 'temperate_forest';
      grid[cy][cx].soilId = 'silt';
      grid[cy][cx].moisture = 0.5;
      grid[cy][cx].nutrients = getNutrients('silt');
      startX = cx;
      startY = cy;
    }
  }

  grid[startY][startX].plant = createPlantInstance('player');

  return { grid, startX, startY };
}

function computeTileClimate(
  x: number,
  y: number,
  moistureNoise: SimplexNoise,
  tempNoise: SimplexNoise,
  elevationNoise: SimplexNoise,
): TileClimate {
  // Elevation: fractal noise, slight center-bias so map edges tend to water
  const edgeDistX = Math.min(x, GRID_WIDTH - 1 - x) / (GRID_WIDTH / 2);
  const edgeDistY = Math.min(y, GRID_HEIGHT - 1 - y) / (GRID_HEIGHT / 2);
  const edgeFalloff = Math.min(edgeDistX, edgeDistY);
  const rawElev = elevationNoise.fractal2D(
    x * ELEVATION_SCALE, y * ELEVATION_SCALE,
    ELEVATION_OCTAVES, 2.0, 0.5,
  );
  const elevation = clamp((rawElev + 1) * 0.5 * (0.5 + edgeFalloff * 0.5));

  // Latitude gradient
  const latitudeNorm = y / GRID_HEIGHT;
  const latitudeTemp = Math.sin(latitudeNorm * Math.PI);

  const tempVariation = tempNoise.fractal2D(
    x * TEMP_NOISE_SCALE, y * TEMP_NOISE_SCALE,
    TEMP_OCTAVES, 2.0, 0.5,
  );
  const temperature = clamp(latitudeTemp * 0.7 + (tempVariation + 1) * 0.5 * 0.3);

  const moistureRaw = moistureNoise.fractal2D(
    x * MOISTURE_SCALE, y * MOISTURE_SCALE,
    MOISTURE_OCTAVES, 2.0, 0.5,
  );
  const moisture = clamp((moistureRaw + 1) * 0.5);

  return { temperature, moisture, elevation };
}

function clamp(v: number, min = 0, max = 1): number {
  return v < min ? min : v > max ? max : v;
}
