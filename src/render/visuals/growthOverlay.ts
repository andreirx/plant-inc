/**
 * Growth overlay — two layers:
 *   1. Persistent growth-point markers along trunk/taproot and at branch/root tips.
 *   2. Hover highlight + cost tooltip following the cursor.
 */

import { Graphics, Text, TextStyle } from 'pixi.js';
import { type SpeciesInstance } from '../../core/state';
import { type BranchNode, type PlantRenderResult } from './plantDrawer';
import {
  COST_SPROUT_BRANCH, COST_EXTEND_BRANCH, COST_GROW_TALLER,
  COST_SPROUT_LATERAL, COST_EXTEND_LATERAL, COST_GROW_DEEPER,
} from '../../interaction/manualGrowth';

// ── Colors ──
const GREEN = 0x4caf50;
const RED = 0xf44336;
const YELLOW = 0xf8d348;
const CYAN = 0x00bcd4;

// ── Hover overlay ──
const CIRCLE_RADIUS = 12;
const FLASH_DURATION = 200; // ms

let _flashUntil = 0;
let _flashX = 0;
let _flashY = 0;

const labelStyle = new TextStyle({
  fontFamily: 'monospace',
  fontSize: 11,
  fill: '#ffffff',
});

let _label: Text | null = null;

export function initOverlay(gfx: Graphics): void {
  _label = new Text({ text: '', style: labelStyle });
  _label.anchor.set(0.5, 1.2);
  _label.visible = false;
  gfx.parent?.addChild(_label);
}

export function updateOverlay(
  gfx: Graphics,
  visible: boolean,
  px: number,
  py: number,
  canAfford: boolean,
  costLabel: string,
): void {
  gfx.clear();

  // Flash effect
  const now = performance.now();
  if (now < _flashUntil) {
    const alpha = ((_flashUntil - now) / FLASH_DURATION) * 0.6;
    gfx.circle(_flashX, _flashY, CIRCLE_RADIUS * 2);
    gfx.fill({ color: GREEN, alpha });
  }

  if (!visible) {
    if (_label) _label.visible = false;
    return;
  }

  const color = canAfford ? GREEN : RED;

  gfx.circle(px, py, CIRCLE_RADIUS);
  gfx.stroke({ color, width: 2, alpha: 0.8 });
  gfx.circle(px, py, 3);
  gfx.fill({ color, alpha: canAfford ? 0.5 : 0.3 });

  if (_label) {
    _label.text = costLabel;
    _label.x = px;
    _label.y = py - CIRCLE_RADIUS - 2;
    _label.visible = true;
    _label.style.fill = canAfford ? '#4caf50' : '#f44336';
  }
}

export function flashAt(px: number, py: number): void {
  _flashX = px;
  _flashY = py;
  _flashUntil = performance.now() + FLASH_DURATION;
}

export function hideOverlay(gfx: Graphics): void {
  gfx.clear();
  if (_label) _label.visible = false;
}

// ═══════════════════════════════════════════════════════════════════
//  PERSISTENT GROWTH POINT MARKERS
// ═══════════════════════════════════════════════════════════════════

/** Number of spawn-point markers along the trunk/taproot. */
const SPAWN_POINTS = 6;

/** Walk a chain of depth-0 BranchNodes, return segment endpoints. */
function walkChain(root: BranchNode): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [{ x: root.startX, y: root.startY }];
  let seg: BranchNode | null = root;
  while (seg) {
    pts.push({ x: seg.endX, y: seg.endY });
    let next: BranchNode | null = null;
    for (const c of seg.children) {
      if (c.depth === 0) { next = c; break; }
    }
    seg = next;
  }
  return pts;
}

/** Interpolate along a polyline at fraction t (0..1). */
function samplePolyline(
  pts: { x: number; y: number }[],
  t: number,
): { x: number; y: number } {
  if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 };
  // Compute total length
  let totalLen = 0;
  for (let i = 1; i < pts.length; i++) {
    totalLen += Math.sqrt(
      (pts[i].x - pts[i - 1].x) ** 2 + (pts[i].y - pts[i - 1].y) ** 2,
    );
  }
  const targetDist = t * totalLen;
  let cumDist = 0;
  for (let i = 1; i < pts.length; i++) {
    const segLen = Math.sqrt(
      (pts[i].x - pts[i - 1].x) ** 2 + (pts[i].y - pts[i - 1].y) ** 2,
    );
    if (cumDist + segLen >= targetDist || i === pts.length - 1) {
      const localT = segLen > 0 ? (targetDist - cumDist) / segLen : 0;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * localT,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * localT,
      };
    }
    cumDist += segLen;
  }
  return pts[pts.length - 1];
}

/** Convert plant-space to pixel. */
function toPixel(
  plantX: number, plantY: number,
  offsetX: number, offsetY: number,
  scale: number,
): { px: number; py: number } {
  return { px: plantX * scale + offsetX, py: plantY * scale + offsetY };
}

/** Draw a small "+" cross marker. */
function drawPlus(
  gfx: Graphics, px: number, py: number,
  size: number, color: number, alpha: number,
): void {
  gfx.moveTo(px - size, py);
  gfx.lineTo(px + size, py);
  gfx.stroke({ color, width: 1.5, alpha });
  gfx.moveTo(px, py - size);
  gfx.lineTo(px, py + size);
  gfx.stroke({ color, width: 1.5, alpha });
}

/** Draw an arrow marker (for grow taller / deeper). */
function drawArrow(
  gfx: Graphics, px: number, py: number,
  size: number, direction: 'up' | 'down', color: number, alpha: number,
): void {
  const dy = direction === 'up' ? -1 : 1;
  // Shaft
  gfx.moveTo(px, py);
  gfx.lineTo(px, py + dy * size * 2);
  gfx.stroke({ color, width: 2, alpha });
  // Arrowhead
  gfx.moveTo(px - size * 0.6, py + dy * size);
  gfx.lineTo(px, py + dy * size * 2);
  gfx.lineTo(px + size * 0.6, py + dy * size);
  gfx.stroke({ color, width: 2, alpha });
}

/** Draw a small diamond (for branch/root tip extend). */
function drawDiamond(
  gfx: Graphics, px: number, py: number,
  size: number, color: number, alpha: number,
): void {
  gfx.moveTo(px, py - size);
  gfx.lineTo(px + size, py);
  gfx.lineTo(px, py + size);
  gfx.lineTo(px - size, py);
  gfx.closePath();
  gfx.stroke({ color, width: 1.5, alpha });
}

/**
 * Draw persistent growth-point markers on the AIR view (shoot).
 * Shows where the player can click to add branches or grow taller.
 */
export function drawShootGrowthPoints(
  gfx: Graphics,
  plant: SpeciesInstance,
  result: PlantRenderResult,
): void {
  gfx.clear();
  const { scale, airOffsetX: ox, airOffsetY: oy } = result;
  const energy = plant.energy;
  const markerSize = Math.max(4, Math.min(8, scale * 0.05));

  // --- Trunk spawn points (new branch locations) ---
  const trunkPts = walkChain(result.shoot.root);
  const canSprout = energy >= COST_SPROUT_BRANCH;
  const spawnColor = canSprout ? GREEN : RED;
  const spawnAlpha = canSprout ? 0.7 : 0.35;

  for (let i = 1; i <= SPAWN_POINTS; i++) {
    const t = 0.2 + (i / (SPAWN_POINTS + 1)) * 0.65; // 20%-85% of trunk height
    const pt = samplePolyline(trunkPts, t);
    const { px, py } = toPixel(pt.x, pt.y, ox, oy, scale);
    drawPlus(gfx, px, py, markerSize, spawnColor, spawnAlpha);
  }

  // --- Grow taller arrow at trunk tip ---
  const canGrow = energy >= COST_GROW_TALLER;
  const tipPt = trunkPts[trunkPts.length - 1];
  if (tipPt) {
    const { px, py } = toPixel(tipPt.x, tipPt.y, ox, oy, scale);
    drawArrow(gfx, px, py - markerSize * 2, markerSize, 'up',
      canGrow ? CYAN : RED, canGrow ? 0.8 : 0.35);
  }

  // --- Existing manual branch tips (extend markers) ---
  const canExtend = energy >= COST_EXTEND_BRANCH;
  const extColor = canExtend ? YELLOW : RED;
  const extAlpha = canExtend ? 0.75 : 0.35;

  for (const mb of plant.manualBranches) {
    // Approximate the tip position in plant-space
    // Find trunk spawn Y from heightFraction
    const spawnPt = samplePolyline(trunkPts, mb.heightFraction);
    const tipX = spawnPt.x + Math.cos(mb.angle) * mb.length;
    const tipY = spawnPt.y + Math.sin(mb.angle) * mb.length;
    const { px, py } = toPixel(tipX, tipY, ox, oy, scale);
    drawDiamond(gfx, px, py, markerSize * 0.8, extColor, extAlpha);
  }
}

/**
 * Draw persistent growth-point markers on the SOIL view (roots).
 * Shows where the player can click to add laterals or grow deeper.
 */
export function drawRootGrowthPoints(
  gfx: Graphics,
  plant: SpeciesInstance,
  result: PlantRenderResult,
): void {
  gfx.clear();
  const { scale, soilOffsetX: ox, soilOffsetY: oy } = result;
  const energy = plant.energy;
  const markerSize = Math.max(4, Math.min(8, scale * 0.05));

  // --- Taproot spawn points (new lateral locations) ---
  const tapPts = walkChain(result.roots.root);
  const canSprout = energy >= COST_SPROUT_LATERAL;
  const spawnColor = canSprout ? GREEN : RED;
  const spawnAlpha = canSprout ? 0.7 : 0.35;

  for (let i = 1; i <= SPAWN_POINTS; i++) {
    const t = 0.1 + (i / (SPAWN_POINTS + 1)) * 0.75; // 10%-85% of root depth
    const pt = samplePolyline(tapPts, t);
    const { px, py } = toPixel(pt.x, pt.y, ox, oy, scale);
    drawPlus(gfx, px, py, markerSize, spawnColor, spawnAlpha);
  }

  // --- Grow deeper arrow at taproot tip ---
  const canGrow = energy >= COST_GROW_DEEPER;
  const tipPt = tapPts[tapPts.length - 1];
  if (tipPt) {
    const { px, py } = toPixel(tipPt.x, tipPt.y, ox, oy, scale);
    drawArrow(gfx, px, py + markerSize * 2, markerSize, 'down',
      canGrow ? CYAN : RED, canGrow ? 0.8 : 0.35);
  }

  // --- Existing manual root tips (extend markers) ---
  const canExtend = energy >= COST_EXTEND_LATERAL;
  const extColor = canExtend ? YELLOW : RED;
  const extAlpha = canExtend ? 0.75 : 0.35;

  for (const mr of plant.manualRoots) {
    const spawnPt = samplePolyline(tapPts, mr.depthFraction);
    const tipX = spawnPt.x + Math.cos(mr.angle) * mr.length;
    const tipY = spawnPt.y + Math.sin(mr.angle) * mr.length;
    const { px, py } = toPixel(tipX, tipY, ox, oy, scale);
    drawDiamond(gfx, px, py, markerSize * 0.8, extColor, extAlpha);
  }
}
