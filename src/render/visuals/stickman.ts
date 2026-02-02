/**
 * 2m stickman — scale reference figure drawn in the air view.
 * Uses the unified scale from PlantRenderResult so proportions are correct.
 */

import { Graphics } from 'pixi.js';

const STICKMAN_HEIGHT = 2.0; // meters
const COLOR = 0x999999;
const LABEL_COLOR = 0xbbbbbb;
const ALPHA = 0.45;

/**
 * Draw a 2m stick figure to the right of the plant's bounding box.
 * @param gfx       - Graphics layer in the air view (drawn after the plant)
 * @param scale     - px per meter (from PlantRenderResult)
 * @param offsetX   - air view X offset
 * @param offsetY   - air view Y offset (ground pixel Y)
 * @param shootMaxX - rightmost extent of shoot in meters (plant-space)
 */
export function drawStickman(
  gfx: Graphics,
  scale: number,
  offsetX: number,
  offsetY: number,
  shootMaxX: number,
): void {
  // Position stickman to the right of the plant with a gap
  const gapM = 0.3; // 30cm gap from plant edge
  const baseX = shootMaxX + gapM; // meters in plant-space

  // Convert to pixel coords — ground is at offsetY, Y negative = up
  const px = (x: number) => x * scale + offsetX;
  const py = (y: number) => y * scale + offsetY;

  const h = STICKMAN_HEIGHT;
  const headR = h * 0.08;      // head radius
  const neckY = -h + headR * 2; // bottom of head
  const shoulderY = neckY + h * 0.05;
  const hipY = -h * 0.4;
  const armLen = h * 0.18;
  const footSpread = h * 0.08;
  const lineW = Math.max(1, scale * 0.015);

  // Head
  gfx.circle(px(baseX), py(-h + headR), headR * scale);
  gfx.fill({ color: COLOR, alpha: ALPHA });

  // Body (neck to hip)
  gfx.moveTo(px(baseX), py(neckY));
  gfx.lineTo(px(baseX), py(hipY));
  gfx.stroke({ color: COLOR, width: lineW, alpha: ALPHA });

  // Arms
  gfx.moveTo(px(baseX - armLen), py(shoulderY - h * 0.02));
  gfx.lineTo(px(baseX), py(shoulderY));
  gfx.lineTo(px(baseX + armLen), py(shoulderY - h * 0.02));
  gfx.stroke({ color: COLOR, width: lineW, alpha: ALPHA });

  // Left leg
  gfx.moveTo(px(baseX), py(hipY));
  gfx.lineTo(px(baseX - footSpread), py(0));
  gfx.stroke({ color: COLOR, width: lineW, alpha: ALPHA });

  // Right leg
  gfx.moveTo(px(baseX), py(hipY));
  gfx.lineTo(px(baseX + footSpread), py(0));
  gfx.stroke({ color: COLOR, width: lineW, alpha: ALPHA });

  // "2m" label — small text to the right of the figure
  // Draw a vertical bracket line with a label
  const bracketX = baseX + h * 0.15;
  const tickW = h * 0.03;

  // Vertical line
  gfx.moveTo(px(bracketX), py(-h));
  gfx.lineTo(px(bracketX), py(0));
  gfx.stroke({ color: LABEL_COLOR, width: Math.max(1, scale * 0.005), alpha: 0.35 });

  // Top tick
  gfx.moveTo(px(bracketX - tickW), py(-h));
  gfx.lineTo(px(bracketX + tickW), py(-h));
  gfx.stroke({ color: LABEL_COLOR, width: Math.max(1, scale * 0.005), alpha: 0.35 });

  // Bottom tick
  gfx.moveTo(px(bracketX - tickW), py(0));
  gfx.lineTo(px(bracketX + tickW), py(0));
  gfx.stroke({ color: LABEL_COLOR, width: Math.max(1, scale * 0.005), alpha: 0.35 });
}
