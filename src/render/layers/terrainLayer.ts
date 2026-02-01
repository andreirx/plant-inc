/**
 * Terrain layer — renders the soil grid as a static bitmap.
 * Drawn once at world generation time; never redrawn during gameplay.
 */

import { Graphics } from 'pixi.js';
import { SOIL_TYPES } from '../../core/data/soil';
import { type GridCell } from '../../core/state';

/** Pixels per grid tile on the map view */
export const TILE_SIZE = 4;

/** Build a soil-ID-to-color lookup for fast access */
const soilColorMap = new Map<string, number>();
for (const soil of Object.values(SOIL_TYPES)) {
  soilColorMap.set(soil.id, soil.color);
}

const FALLBACK_COLOR = 0x333333;

/**
 * Creates a PIXI.Graphics containing one 4x4 rect per grid cell,
 * colored by soil type. This is a static layer — add it once to the stage.
 */
export function createTerrainLayer(grid: GridCell[][]): Graphics {
  const gfx = new Graphics();

  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const color = soilColorMap.get(row[x].soilId) ?? FALLBACK_COLOR;
      gfx.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      gfx.fill(color);
    }
  }

  return gfx;
}
