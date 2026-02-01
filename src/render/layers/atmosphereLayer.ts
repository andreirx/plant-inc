/**
 * Atmosphere background — sky gradient behind the plant in the Air quadrant.
 *
 * Draws a vertical gradient that transitions:
 *   Day (sunlight=1):  bright blue sky
 *   Night (sunlight=0): deep navy sky
 *   Rain (humidity>0.7): shifts toward overcast gray
 *
 * This is a BACKGROUND layer — the plant draws on top of it.
 */

import { Graphics } from 'pixi.js';
import { state } from '../../core/state';
import { TICKS_PER_DAY, DAYS_PER_YEAR } from '../../core/constants';

// Sky palette
const DAY_TOP = { r: 0x4a, g: 0x90, b: 0xe2 };    // #4A90E2 — clear blue
const DAY_BOTTOM = { r: 0x87, g: 0xce, b: 0xeb };  // #87CEEB — light blue
const NIGHT_TOP = { r: 0x00, g: 0x00, b: 0x22 };   // Deep navy
const NIGHT_BOTTOM = { r: 0x0a, g: 0x0a, b: 0x2e }; // Lighter navy
const RAIN_GRAY = { r: 0x6b, g: 0x72, b: 0x80 };   // Overcast gray

const GRADIENT_SLICES = 20; // Horizontal strips to simulate gradient

interface RGB { r: number; g: number; b: number }

function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function rgbToHex(c: RGB): number {
  return (c.r << 16) | (c.g << 8) | c.b;
}

export function createAtmosphereOverlay(_width: number, _height: number): Graphics {
  return new Graphics();
}

export function updateAtmosphereOverlay(gfx: Graphics, width: number, height: number, interpolation = 0): void {
  gfx.clear();

  // Compute visual sunlight/humidity from continuous interpolated time
  // so the sky animates smoothly at 60fps even when ticks fire at 2/sec (0.1x)
  const continuousTick = state.tick + interpolation;
  const totalDays = continuousTick / TICKS_PER_DAY;
  const dayFraction = totalDays - Math.floor(totalDays);
  const dayOfYear = Math.floor(totalDays) % DAYS_PER_YEAR;
  const yearProgress = dayOfYear / DAYS_PER_YEAR;

  const sunlight = Math.max(0, Math.sin(dayFraction * Math.PI));
  const humidity = 0.5 + 0.2 * Math.sin(yearProgress * Math.PI * 2 + (-Math.PI / 2) + Math.PI);

  // Lerp between day and night palette based on sunlight
  const top = lerpRGB(NIGHT_TOP, DAY_TOP, sunlight);
  const bottom = lerpRGB(NIGHT_BOTTOM, DAY_BOTTOM, sunlight);

  // Rain: shift toward overcast gray
  const rainFactor = humidity > 0.7 ? (humidity - 0.7) / 0.3 : 0;
  const finalTop = lerpRGB(top, RAIN_GRAY, rainFactor * 0.6);
  const finalBottom = lerpRGB(bottom, RAIN_GRAY, rainFactor * 0.4);

  // Draw gradient as horizontal slices
  const sliceH = height / GRADIENT_SLICES;
  for (let i = 0; i < GRADIENT_SLICES; i++) {
    const t = i / (GRADIENT_SLICES - 1);
    const color = lerpRGB(finalTop, finalBottom, t);
    gfx.rect(0, i * sliceH, width, sliceH + 1); // +1 to avoid hairline gaps
    gfx.fill(rgbToHex(color));
  }
}
