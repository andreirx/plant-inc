/**
 * Procedural plant renderer — draws a plant's above-ground shoot system
 * and below-ground root system using recursive branching.
 *
 * Shoot system (Air View): Trunk grows upward from bottom-center, branches
 * fork off at intervals, terminal branches bear leaf clusters, flowers,
 * and fruit. Trunk/branches drawn as brown lines with tapered widths.
 * Leaves drawn as green ellipses at branch tips and along branches.
 *
 * Root system (Soil View): Taproot grows downward from top-center, lateral
 * roots branch off with wobble, terminal roots show fine root hairs.
 *
 * Uses phenotypeSeed for deterministic per-plant visual variation.
 */

import { Graphics } from 'pixi.js';
import { type SpeciesInstance } from '../../core/state';
import { type SpeciesGenome } from '../../core/data/traits';

// Seeded PRNG for deterministic branching per plant instance
class SeededRandom {
  private s: number;
  constructor(seed: number) {
    this.s = (seed * 2147483647) | 0 || 1;
  }
  next(): number {
    this.s = (this.s * 16807) % 2147483647;
    return (this.s - 1) / 2147483646;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

// ──────────────────────────────────────
//  Color utilities
// ──────────────────────────────────────

function darkenColor(color: number, factor: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * factor);
  const g = Math.floor(((color >> 8) & 0xff) * factor);
  const b = Math.floor((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

// ──────────────────────────────────────
//  ABOVE GROUND — Shoot System
// ──────────────────────────────────────

const BARK_COLOR = 0x5d3a1a;
const BARK_LIGHT = 0x7a5230;
const LEAF_GREEN = 0x2d8a4e;
const LEAF_DARK = 0x1b5e30;
const LEAF_LIGHT = 0x4caf50;
const FLOWER_PINK = 0xffaacc;
const FLOWER_CENTER = 0xffee55;
const FRUIT_RED = 0xe53935;

/**
 * Draw the above-ground portion of a plant.
 * Anchored at bottom-center of the provided area.
 */
export function drawShoot(
  gfx: Graphics,
  plant: SpeciesInstance,
  genome: SpeciesGenome,
  viewW: number,
  viewH: number,
): void {
  gfx.clear();

  const rng = new SeededRandom(plant.phenotypeSeed);

  // Scale: map plant.height (meters) into pixel space
  // At height 0.05m (seedling) we want ~30px, at 3m we want ~70% of view
  const maxDrawH = viewH * 0.7;
  const scale = Math.min(maxDrawH / Math.max(plant.height, 0.05), viewH * 2);

  const baseX = viewW / 2;
  const baseY = viewH - 20; // Ground line

  // Draw ground line
  gfx.moveTo(0, baseY);
  gfx.lineTo(viewW, baseY);
  gfx.stroke({ color: 0x4a3728, width: 2 });

  // Draw the plant growing upward
  const trunkH = plant.height * scale;
  const trunkW = Math.max(1.5, plant.trunkRadius * scale * 50);

  drawBranch(gfx, rng, {
    x: baseX,
    y: baseY,
    angle: -Math.PI / 2, // Straight up
    length: trunkH,
    width: trunkW,
    depth: 0,
    maxDepth: Math.min(plant.branchCount + 1, 7),
    leafArea: plant.leafArea,
    leafColor: genome.color === 0xff0000 ? LEAF_GREEN : genome.color, // Override red genome with green leaves
    hasSpikes: genome.activeTraits.has('spikes'),
    flowering: plant.flowering,
    fruit: plant.fruit,
    plantHeight: plant.height,
  });
}

interface BranchParams {
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  depth: number;
  maxDepth: number;
  leafArea: number;
  leafColor: number;
  hasSpikes: boolean;
  flowering: number;
  fruit: number;
  plantHeight: number;
}

function drawBranch(gfx: Graphics, rng: SeededRandom, p: BranchParams): void {
  if (p.length < 1) return;

  const endX = p.x + Math.cos(p.angle) * p.length;
  const endY = p.y + Math.sin(p.angle) * p.length;

  // Slight natural curve via midpoint offset
  const midT = 0.5;
  const wobble = rng.range(-3, 3);
  const perpAngle = p.angle + Math.PI / 2;
  const midX = p.x + Math.cos(p.angle) * p.length * midT + Math.cos(perpAngle) * wobble;
  const midY = p.y + Math.sin(p.angle) * p.length * midT + Math.sin(perpAngle) * wobble;

  // Branch color: darker for trunk, lighter for twigs
  const branchColor = p.depth === 0 ? BARK_COLOR : lerpColor(BARK_COLOR, BARK_LIGHT, p.depth / p.maxDepth);
  const w = Math.max(1, p.width);

  // Draw as two line segments through midpoint for natural curve
  gfx.moveTo(p.x, p.y);
  gfx.lineTo(midX, midY);
  gfx.stroke({ color: branchColor, width: w });

  gfx.moveTo(midX, midY);
  gfx.lineTo(endX, endY);
  gfx.stroke({ color: branchColor, width: w * 0.8 });

  // ── Spikes along trunk/main branches ──
  if (p.hasSpikes && p.depth <= 1) {
    const spikeCount = Math.floor(p.length / 15);
    for (let i = 1; i <= spikeCount; i++) {
      const t = i / (spikeCount + 1);
      const sx = p.x + (endX - p.x) * t;
      const sy = p.y + (endY - p.y) * t;
      const side = rng.next() > 0.5 ? 1 : -1;
      const spikeAngle = p.angle + (Math.PI / 2) * side;
      const sLen = 3 + rng.next() * 4;
      gfx.moveTo(sx, sy);
      gfx.lineTo(sx + Math.cos(spikeAngle) * sLen, sy + Math.sin(spikeAngle) * sLen);
      gfx.stroke({ color: 0x8b4513, width: 1 });
    }
  }

  // ── Leaves along branches (not just at tips) ──
  if (p.leafArea > 0.001 && p.depth >= 1) {
    const leavesOnBranch = Math.max(1, Math.floor(p.leafArea * 15 / Math.max(p.maxDepth, 1)));
    for (let i = 0; i < leavesOnBranch; i++) {
      const t = rng.range(0.3, 1.0); // Position along branch
      const lx = p.x + (endX - p.x) * t + rng.range(-5, 5);
      const ly = p.y + (endY - p.y) * t + rng.range(-5, 5);
      const leafW = 3 + p.leafArea * 4;
      const leafH = 1.5 + p.leafArea * 2;
      const shade = rng.range(0.7, 1.0);
      gfx.ellipse(lx, ly, leafW, leafH);
      gfx.fill({ color: darkenColor(LEAF_GREEN, shade), alpha: 0.85 });
    }
  }

  // ── Terminal: leaf clusters, flowers, fruit ──
  if (p.depth >= p.maxDepth - 1 || p.length < 8) {
    // Leaf cluster at branch tip
    const leafSize = Math.max(2, 3 + p.leafArea * 6);
    const leafCount = 3 + Math.floor(rng.next() * 4);
    for (let i = 0; i < leafCount; i++) {
      const lAngle = p.angle + rng.range(-1.0, 1.0);
      const lDist = rng.range(1, leafSize * 1.5);
      const lx = endX + Math.cos(lAngle) * lDist;
      const ly = endY + Math.sin(lAngle) * lDist;
      const shade = rng.range(0.6, 1.0);
      const color = lerpColor(LEAF_DARK, LEAF_LIGHT, shade);
      gfx.ellipse(lx, ly, leafSize * 0.7, leafSize * 0.35);
      gfx.fill({ color, alpha: 0.9 });
    }

    // Flowers (when flowering > 0.1)
    if (p.flowering > 0.1 && rng.next() < p.flowering) {
      const fx = endX + rng.range(-4, 4);
      const fy = endY + rng.range(-4, 4);
      const fSize = 2 + p.flowering * 5;
      // 5 petals
      for (let i = 0; i < 5; i++) {
        const pa = (i / 5) * Math.PI * 2;
        const px = fx + Math.cos(pa) * fSize;
        const py = fy + Math.sin(pa) * fSize;
        gfx.circle(px, py, fSize * 0.35);
        gfx.fill({ color: FLOWER_PINK, alpha: 0.7 * p.flowering });
      }
      // Center pistil
      gfx.circle(fx, fy, fSize * 0.2);
      gfx.fill(FLOWER_CENTER);
    }

    // Fruit (when fruit > 0.2)
    if (p.fruit > 0.2 && rng.next() < p.fruit) {
      const frx = endX + rng.range(-6, 6);
      const fry = endY + rng.range(1, 10);
      const frSize = 2 + p.fruit * 5;
      gfx.circle(frx, fry, frSize);
      gfx.fill({ color: FRUIT_RED, alpha: 0.6 + p.fruit * 0.4 });
    }

    return;
  }

  // ── Recurse: spawn child branches ──
  const childCount = 1 + Math.floor(rng.next() * 2);
  for (let i = 0; i < childCount; i++) {
    const spread = rng.range(0.25, 0.75);
    const side = i === 0 ? -1 : 1;
    const childAngle = p.angle + spread * side + rng.range(-0.15, 0.15);
    const childLength = p.length * rng.range(0.45, 0.7);
    const childWidth = p.width * 0.55;

    drawBranch(gfx, rng, {
      ...p,
      x: endX,
      y: endY,
      angle: childAngle,
      length: childLength,
      width: childWidth,
      depth: p.depth + 1,
    });
  }

  // Extra: sometimes a continuation branch (main leader)
  if (rng.next() > 0.4) {
    drawBranch(gfx, rng, {
      ...p,
      x: endX,
      y: endY,
      angle: p.angle + rng.range(-0.15, 0.15),
      length: p.length * rng.range(0.5, 0.65),
      width: p.width * 0.65,
      depth: p.depth + 1,
    });
  }
}

// ──────────────────────────────────────
//  BELOW GROUND — Root System
// ──────────────────────────────────────

const ROOT_DARK = 0x8b6914;
const ROOT_LIGHT = 0xc4a35a;

/**
 * Draw the below-ground root system.
 * Anchored at top-center of the provided area.
 */
export function drawRoots(
  gfx: Graphics,
  plant: SpeciesInstance,
  viewW: number,
  viewH: number,
): void {
  gfx.clear();

  const rng = new SeededRandom(plant.phenotypeSeed + 999);

  const maxDrawH = viewH * 0.7;
  const scale = Math.min(maxDrawH / Math.max(plant.rootDepth, 0.05), viewH * 2);

  const baseX = viewW / 2;
  const baseY = 15; // Soil surface near top

  // Soil surface line
  gfx.moveTo(0, baseY);
  gfx.lineTo(viewW, baseY);
  gfx.stroke({ color: 0x4a3728, width: 2 });

  // Draw a soil gradient background hint
  gfx.rect(0, baseY, viewW, viewH - baseY);
  gfx.fill({ color: 0x3d2b1f, alpha: 0.15 });

  const rootH = plant.rootDepth * scale;
  const rootW = Math.max(1.5, plant.trunkRadius * scale * 35);

  drawRoot(gfx, rng, {
    x: baseX,
    y: baseY,
    angle: Math.PI / 2, // Straight down
    length: rootH,
    width: rootW,
    depth: 0,
    maxDepth: Math.min(5, Math.floor(plant.rootDepth / 0.2) + 1),
  });
}

interface RootParams {
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  depth: number;
  maxDepth: number;
}

function drawRoot(gfx: Graphics, rng: SeededRandom, p: RootParams): void {
  if (p.length < 2) return;

  // Roots wobble more than branches
  const wobble = rng.range(-12, 12);
  const perpAngle = p.angle + Math.PI / 2;

  const midX = p.x + Math.cos(p.angle) * p.length * 0.45 + Math.cos(perpAngle) * wobble;
  const midY = p.y + Math.sin(p.angle) * p.length * 0.45 + Math.sin(perpAngle) * wobble;
  const endX = p.x + Math.cos(p.angle) * p.length;
  const endY = p.y + Math.sin(p.angle) * p.length;

  const color = lerpColor(ROOT_DARK, ROOT_LIGHT, p.depth / Math.max(p.maxDepth, 1));
  const w = Math.max(1, p.width);

  // Draw as two segments through midpoint for curve
  gfx.moveTo(p.x, p.y);
  gfx.lineTo(midX, midY);
  gfx.stroke({ color, width: w });

  gfx.moveTo(midX, midY);
  gfx.lineTo(endX, endY);
  gfx.stroke({ color, width: w * 0.7 });

  // ── Terminal: root hairs ──
  if (p.depth >= p.maxDepth - 1 || p.length < 10) {
    const hairCount = 3 + Math.floor(rng.next() * 5);
    for (let i = 0; i < hairCount; i++) {
      const hAngle = p.angle + rng.range(-1.3, 1.3);
      const hLen = 2 + rng.next() * 10;
      gfx.moveTo(endX, endY);
      gfx.lineTo(endX + Math.cos(hAngle) * hLen, endY + Math.sin(hAngle) * hLen);
      gfx.stroke({ color: ROOT_LIGHT, width: 0.5, alpha: 0.5 });
    }
    return;
  }

  // ── Lateral roots ──
  const childCount = 2 + Math.floor(rng.next() * 2);
  for (let i = 0; i < childCount; i++) {
    const spread = rng.range(0.35, 1.0);
    const side = i % 2 === 0 ? -1 : 1;
    const childAngle = p.angle + spread * side + rng.range(-0.2, 0.2);
    const childLength = p.length * rng.range(0.35, 0.6);
    const childWidth = p.width * 0.45;

    // Spawn from along the root, not just the tip
    const spawnT = rng.range(0.25, 0.75);
    const spawnX = p.x + (endX - p.x) * spawnT;
    const spawnY = p.y + (endY - p.y) * spawnT;

    drawRoot(gfx, rng, {
      x: spawnX,
      y: spawnY,
      angle: childAngle,
      length: childLength,
      width: childWidth,
      depth: p.depth + 1,
      maxDepth: p.maxDepth,
    });
  }

  // Continuation (taproot leader)
  if (rng.next() > 0.3) {
    drawRoot(gfx, rng, {
      x: endX,
      y: endY,
      angle: p.angle + rng.range(-0.2, 0.2),
      length: p.length * rng.range(0.4, 0.6),
      width: p.width * 0.6,
      depth: p.depth + 1,
      maxDepth: p.maxDepth,
    });
  }
}
