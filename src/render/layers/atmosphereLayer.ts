/**
 * Atmosphere overlay — full-screen tint on the Air quadrant.
 * Darkens at night (low sunlight) and adds gray wash during rain.
 */

import { Graphics } from 'pixi.js';
import { state } from '../../core/state';

export function createAtmosphereOverlay(width: number, height: number): Graphics {
  const gfx = new Graphics();
  return gfx;

  // Initial size set; updated each frame via updateAtmosphereOverlay
  void width;
  void height;
}

export function updateAtmosphereOverlay(gfx: Graphics, width: number, height: number): void {
  gfx.clear();

  const { sunlight, humidity } = state.climate;

  // Night darkness: sunlight 1.0 = transparent, 0.0 = deep navy
  const darkness = 1.0 - sunlight;
  if (darkness > 0.01) {
    gfx.rect(0, 0, width, height);
    gfx.fill({ color: 0x000033, alpha: darkness * 0.85 });
  }

  // Rain overlay: gray wash when humidity is high
  if (humidity > 0.7) {
    const rainAlpha = (humidity - 0.7) / 0.3; // 0..1 over the 0.7-1.0 range
    gfx.rect(0, 0, width, height);
    gfx.fill({ color: 0x666688, alpha: rainAlpha * 0.3 });
  }
}
