/**
 * Plant layer — renders a 1x1 rect per occupied tile on the minimap.
 * Uses species color from state. Redrawn only when simulation ticks
 * (not every animation frame) via a dirty flag.
 */

import { Graphics } from 'pixi.js';
import { GRID_WIDTH, GRID_HEIGHT } from '../../core/constants';
import { state } from '../../core/state';
import { TILE_SIZE } from './terrainLayer';

let lastRenderedTick = -1;

export function createPlantLayer(): Graphics {
  return new Graphics();
}

/**
 * Redraw plant markers if the simulation has advanced since last draw.
 * Called every animation frame but only does work on new ticks.
 */
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
      gfx.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      gfx.fill(color);
    }
  }
}
