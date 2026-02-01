/**
 * Plant layer — renders species-colored rects per occupied tile.
 * Uses 2x2 pixel rects centered in the 4x4 tile for visibility.
 * Redrawn only when simulation ticks (dirty flag).
 */

import { Graphics } from 'pixi.js';
import { GRID_WIDTH, GRID_HEIGHT } from '../../core/constants';
import { state } from '../../core/state';
import { TILE_SIZE } from './terrainLayer';

const PLANT_SIZE = 3;
const PLANT_OFFSET = (TILE_SIZE - PLANT_SIZE) / 2;

let lastRenderedTick = -1;

export function createPlantLayer(): Graphics {
  return new Graphics();
}

export function updatePlantLayer(gfx: Graphics): void {
  if (state.tick === lastRenderedTick) return;
  lastRenderedTick = state.tick;

  gfx.clear();

  const color = state.species.color;
  const grid = state.grid;

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row = grid[y];
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (!row[x].plant) continue;
      gfx.rect(
        x * TILE_SIZE + PLANT_OFFSET,
        y * TILE_SIZE + PLANT_OFFSET,
        PLANT_SIZE,
        PLANT_SIZE,
      );
      gfx.fill(color);
    }
  }
}
