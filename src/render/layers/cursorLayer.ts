/**
 * Cursor layer — highlights the currently selected tile on the map.
 */

import { Graphics } from 'pixi.js';
import { TILE_SIZE } from './terrainLayer';

const CURSOR_COLOR = 0xffffff;
const CURSOR_ALPHA = 0.8;
const CURSOR_WIDTH = 1;

export function createCursorLayer(): Graphics {
  const gfx = new Graphics();
  gfx.visible = false;
  return gfx;
}

export function updateCursorLayer(
  gfx: Graphics,
  tileX: number,
  tileY: number,
): void {
  gfx.clear();
  gfx.rect(
    tileX * TILE_SIZE,
    tileY * TILE_SIZE,
    TILE_SIZE,
    TILE_SIZE,
  );
  gfx.stroke({ color: CURSOR_COLOR, alpha: CURSOR_ALPHA, width: CURSOR_WIDTH });
  gfx.visible = true;
}
