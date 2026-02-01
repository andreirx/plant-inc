/**
 * Procedural plant renderer — unified two-phase architecture.
 *
 * The plant is ONE organism split across two quadrants:
 *   Q1 (Air View):  above-ground shoot — trunk, branches, leaves, flowers, fruit
 *   Q2 (Soil View): below-ground roots — taproot, laterals, root hairs
 *
 * Ground level is at the EXACT boundary between Q1 and Q2.
 * Both quadrants share a SINGLE zoom scale so the trunk and taproot
 * are visually continuous and proportionally correct.
 *
 * PHASE 1: Build both structures as data in plant-space (meters).
 *   Origin (0,0) = ground level. Y negative = up, Y positive = down.
 *   Biological constraints enforced:
 *     - Da Vinci's pipe model (parent cross-section ≥ Σ children)
 *     - Gravitropism (branches grow upward, roots grow downward)
 *     - Apical dominance (leader thicker/longer than laterals)
 *
 * PHASE 2: Compute unified scale from combined bounding box.
 *   Scale = min(airFit, soilFit, widthFit) so everything fits.
 *   Render each half into its Graphics object.
 */

import { Graphics } from 'pixi.js';
import { type SpeciesInstance } from '../../core/state';
import { type SpeciesGenome } from '../../core/data/traits';

// ──────────────────────────────────────
//  Seeded PRNG
// ──────────────────────────────────────

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
//  Shared structure types
// ──────────────────────────────────────

interface BranchNode {
  startX: number;
  startY: number;
  midX: number;
  midY: number;
  endX: number;
  endY: number;
  radius: number;
  depth: number;
  maxDepth: number;
  children: BranchNode[];
}

interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;  // Most negative (highest above ground)
  maxY: number;  // Most positive (deepest below ground)
}

interface LeafCluster { x: number; y: number; size: number; shade: number }
interface FlowerData { x: number; y: number; size: number; progress: number }
interface FruitData { x: number; y: number; size: number; ripeness: number }
interface SpikeData { x: number; y: number; angle: number; length: number }
interface RootHair { x: number; y: number; angle: number; length: number }

interface ShootStructure {
  root: BranchNode;
  bounds: BoundingBox;
  leaves: LeafCluster[];
  flowers: FlowerData[];
  fruits: FruitData[];
  spikes: SpikeData[];
}

interface RootStructure {
  root: BranchNode;
  bounds: BoundingBox;
  hairs: RootHair[];
}

// ──────────────────────────────────────
//  Constants
// ──────────────────────────────────────

const BARK_COLOR = 0x5d3a1a;
const BARK_LIGHT = 0x7a5230;
const LEAF_GREEN = 0x2d8a4e;
const FLOWER_PINK = 0xffaacc;
const FLOWER_CENTER = 0xffee55;
const FRUIT_RED = 0xe53935;
const ROOT_DARK = 0x8b6914;
const ROOT_LIGHT = 0xc4a35a;
const GROUND_COLOR = 0x4a3728;

// ══════════════════════════════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════════════════════════════

/**
 * Draw the entire plant across both quadrants with a unified scale.
 * Ground level sits at the bottom of shootGfx and the top of rootGfx.
 */
export function drawPlant(
  shootGfx: Graphics,
  rootGfx: Graphics,
  plant: SpeciesInstance,
  genome: SpeciesGenome,
  airW: number, airH: number,
  soilW: number, soilH: number,
): void {
  shootGfx.clear();
  rootGfx.clear();
  if (airW < 1 || airH < 1 || soilW < 1 || soilH < 1) return;

  // Phase 1: Build both structures in plant-space (meters, origin=ground)
  const shoot = buildShootStructure(plant, genome);
  const roots = buildRootStructure(plant);

  // Phase 2: Compute unified scale
  // Above-ground extent (negative Y = upward)
  const aboveH = Math.abs(shoot.bounds.minY) || 0.05;
  // Below-ground extent (positive Y = downward)
  const belowH = roots.bounds.maxY || 0.05;
  // Combined width (widest of the two)
  const totalW = Math.max(
    shoot.bounds.maxX - shoot.bounds.minX,
    roots.bounds.maxX - roots.bounds.minX,
  ) || 0.05;

  const margin = 0.88;

  // Scale that fits above-ground into air view (ground at bottom edge)
  const airScaleY = (airH * margin) / aboveH;
  // Scale that fits below-ground into soil view (surface at top edge)
  const soilScaleY = (soilH * margin) / belowH;
  // Scale that fits width into either view (use narrower)
  const minViewW = Math.min(airW, soilW);
  const widthScale = (minViewW * margin) / totalW;

  // Unified scale: most restrictive wins — everything fits both views
  const scale = Math.min(airScaleY, soilScaleY, widthScale);

  // Horizontal center: use combined center of both bounds
  const shootCenterX = (shoot.bounds.minX + shoot.bounds.maxX) / 2;
  const rootCenterX = (roots.bounds.minX + roots.bounds.maxX) / 2;
  const centerX = (shootCenterX + rootCenterX) / 2;

  // Phase 3: Render shoot (Q1) — ground at bottom of air view
  const airOffsetX = airW / 2 - centerX * scale;
  const groundPixelY = airH; // Ground = bottom edge of air quadrant
  const airOffsetY = groundPixelY; // Y=0 in plant-space maps to bottom of view

  renderShootToGfx(shootGfx, shoot, scale, airOffsetX, airOffsetY, airW);

  // Phase 3: Render roots (Q2) — surface at top of soil view
  const soilOffsetX = soilW / 2 - centerX * scale;
  const surfacePixelY = 0; // Surface = top edge of soil quadrant
  const soilOffsetY = surfacePixelY; // Y=0 in plant-space maps to top of view

  renderRootsToGfx(rootGfx, roots, scale, soilOffsetX, soilOffsetY, soilW, soilH);
}

// Legacy exports — drawPlant() should be used instead.
export function drawShoot(
  gfx: Graphics,
  _plant: SpeciesInstance,
  _genome: SpeciesGenome,
  _viewW: number,
  _viewH: number,
): void {
  gfx.clear();
}

export function drawRoots(
  gfx: Graphics,
  _plant: SpeciesInstance,
  _viewW: number,
  _viewH: number,
): void {
  gfx.clear();
}

// ══════════════════════════════════════════════════════════════════
//  SHOOT STRUCTURE BUILDER
// ══════════════════════════════════════════════════════════════════

function buildShootStructure(
  plant: SpeciesInstance,
  genome: SpeciesGenome,
): ShootStructure {
  const rng = new SeededRandom(plant.phenotypeSeed);
  const bounds: BoundingBox = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const leaves: LeafCluster[] = [];
  const flowers: FlowerData[] = [];
  const fruits: FruitData[] = [];
  const spikes: SpikeData[] = [];
  const maxDepth = Math.min(plant.branchCount + 1, 7);
  const hasSpikes = genome.activeTraits.has('spikes');

  function expand(x: number, y: number, m: number): void {
    bounds.minX = Math.min(bounds.minX, x - m);
    bounds.maxX = Math.max(bounds.maxX, x + m);
    bounds.minY = Math.min(bounds.minY, y - m);
    bounds.maxY = Math.max(bounds.maxY, y + m);
  }

  function buildNode(
    x: number, y: number,
    angle: number, length: number, radius: number,
    depth: number,
  ): BranchNode {
    const wobble = rng.range(-0.08, 0.08) * length;
    const perp = angle + Math.PI / 2;
    const midX = x + Math.cos(angle) * length * 0.5 + Math.cos(perp) * wobble;
    const midY = y + Math.sin(angle) * length * 0.5 + Math.sin(perp) * wobble;
    const endX = x + Math.cos(angle) * length;
    const endY = y + Math.sin(angle) * length;

    expand(x, y, radius);
    expand(midX, midY, radius);
    expand(endX, endY, radius);

    const isTerminal = depth >= maxDepth - 1 || length < 0.02;

    const node: BranchNode = {
      startX: x, startY: y, midX, midY, endX, endY,
      radius, depth, maxDepth, children: [],
    };

    // Spikes
    if (hasSpikes && depth <= 1) {
      const n = Math.max(1, Math.floor(length / 0.3));
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        const sx = x + (endX - x) * t;
        const sy = y + (endY - y) * t;
        const side = rng.next() > 0.5 ? 1 : -1;
        const sa = angle + (Math.PI / 2) * side;
        const sl = 0.05 + rng.next() * 0.08;
        spikes.push({ x: sx, y: sy, angle: sa, length: sl });
        expand(sx + Math.cos(sa) * sl, sy + Math.sin(sa) * sl, 0);
      }
    }

    // Leaves along branches
    if (plant.leafArea > 0.0005 && depth >= 1) {
      const n = Math.max(1, Math.floor(plant.leafArea * 3 / Math.max(maxDepth, 1)));
      for (let i = 0; i < n; i++) {
        const t = rng.range(0.3, 1.0);
        const sp = radius * 3 + 0.05;
        const lx = x + (endX - x) * t + rng.range(-sp, sp);
        const ly = y + (endY - y) * t + rng.range(-sp, sp);
        const sz = 0.03 + Math.min(plant.leafArea * 0.005, 0.15);
        leaves.push({ x: lx, y: ly, size: sz, shade: rng.range(0.7, 1.0) });
        expand(lx, ly, sz);
      }
    }

    // Terminal decorations
    if (isTerminal) {
      const cs = 0.04 + Math.min(plant.leafArea * 0.008, 0.2);
      const lc = 3 + Math.floor(rng.next() * 4);
      for (let i = 0; i < lc; i++) {
        const la = angle + rng.range(-1.0, 1.0);
        const ld = rng.range(0.01, cs * 1.5);
        const lx = endX + Math.cos(la) * ld;
        const ly = endY + Math.sin(la) * ld;
        leaves.push({ x: lx, y: ly, size: cs * 0.7, shade: rng.range(0.6, 1.0) });
        expand(lx, ly, cs);
      }

      if (plant.flowering > 0.1 && rng.next() < plant.flowering) {
        const fo = cs * 0.8;
        const fx = endX + rng.range(-fo, fo);
        const fy = endY + rng.range(-fo, fo);
        const fs = 0.02 + plant.flowering * 0.06;
        flowers.push({ x: fx, y: fy, size: fs, progress: plant.flowering });
        expand(fx, fy, fs * 1.5);
      }

      if (plant.fruit > 0.2 && rng.next() < plant.fruit) {
        const fro = cs;
        const frx = endX + rng.range(-fro, fro);
        const fry = endY + rng.range(0.01, fro * 1.5);
        const frs = 0.02 + plant.fruit * 0.05;
        fruits.push({ x: frx, y: fry, size: frs, ripeness: plant.fruit });
        expand(frx, fry, frs);
      }

      return node;
    }

    // Child branches — pipe model + gravitropism
    const lateralCount = 1 + Math.floor(rng.next() * 2);
    const hasLeader = rng.next() > 0.3;
    const leaderFrac = hasLeader ? 0.65 : 0;
    const lateralFrac = (1 - leaderFrac) / lateralCount;
    const parentArea = radius * radius;

    for (let i = 0; i < lateralCount; i++) {
      const cArea = parentArea * lateralFrac;
      const cRadius = Math.sqrt(cArea);
      const spread = rng.range(0.3, 0.7);
      const side = i === 0 ? -1 : 1;
      let cAngle = angle + spread * side + rng.range(-0.1, 0.1);
      // Clamp: upward hemisphere only (screen: -π=left, -π/2=up, 0=right)
      cAngle = Math.max(-Math.PI + Math.PI / 9, Math.min(-Math.PI / 9, cAngle));
      const cLen = length * rng.range(0.4, 0.65);
      if (cLen > 0.01 && cRadius > 0.0005) {
        node.children.push(buildNode(endX, endY, cAngle, cLen, cRadius, depth + 1));
      }
    }

    if (hasLeader) {
      const lArea = parentArea * leaderFrac;
      const lRadius = Math.sqrt(lArea);
      let lAngle = angle + rng.range(-0.12, 0.12);
      lAngle = Math.max(-Math.PI + Math.PI / 9, Math.min(-Math.PI / 9, lAngle));
      const lLen = length * rng.range(0.5, 0.7);
      if (lLen > 0.01 && lRadius > 0.0005) {
        node.children.push(buildNode(endX, endY, lAngle, lLen, lRadius, depth + 1));
      }
    }

    return node;
  }

  const trunkLen = plant.height;
  const trunkR = Math.max(plant.trunkRadius, 0.003);
  const root = buildNode(0, 0, -Math.PI / 2, trunkLen, trunkR, 0);

  return { root, bounds, leaves, flowers, fruits, spikes };
}

// ══════════════════════════════════════════════════════════════════
//  ROOT STRUCTURE BUILDER
// ══════════════════════════════════════════════════════════════════

function buildRootStructure(plant: SpeciesInstance): RootStructure {
  const rng = new SeededRandom(plant.phenotypeSeed + 999);
  const bounds: BoundingBox = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const hairs: RootHair[] = [];
  const maxDepth = Math.min(7, Math.floor(Math.sqrt(plant.rootDepth) * 3) + 1);
  const tapRootRadius = Math.max(plant.trunkRadius * 0.8, plant.rootDepth * 0.01, 0.003);

  function expand(x: number, y: number, m: number): void {
    bounds.minX = Math.min(bounds.minX, x - m);
    bounds.maxX = Math.max(bounds.maxX, x + m);
    bounds.minY = Math.min(bounds.minY, y - m);
    bounds.maxY = Math.max(bounds.maxY, y + m);
  }

  function buildNode(
    x: number, y: number,
    angle: number, length: number, radius: number,
    depth: number,
  ): BranchNode {
    const wobble = rng.range(-0.15, 0.15) * length;
    const perp = angle + Math.PI / 2;
    const midX = x + Math.cos(angle) * length * 0.45 + Math.cos(perp) * wobble;
    const midY = y + Math.sin(angle) * length * 0.45 + Math.sin(perp) * wobble;
    const endX = x + Math.cos(angle) * length;
    const endY = y + Math.sin(angle) * length;

    expand(x, y, radius);
    expand(midX, midY, radius);
    expand(endX, endY, radius);

    const isTerminal = depth >= maxDepth - 1 || length < 0.015;

    const node: BranchNode = {
      startX: x, startY: y, midX, midY, endX, endY,
      radius, depth, maxDepth, children: [],
    };

    // Terminal: root hairs
    if (isTerminal) {
      const hc = 2 + Math.floor(rng.next() * 4) + Math.floor(plant.rootDepth);
      for (let i = 0; i < hc; i++) {
        const ha = angle + rng.range(-1.3, 1.3);
        const hl = 0.01 + rng.next() * 0.05 * Math.min(plant.rootDepth, 2);
        hairs.push({ x: endX, y: endY, angle: ha, length: hl });
        expand(endX + Math.cos(ha) * hl, endY + Math.sin(ha) * hl, 0);
      }
      return node;
    }

    // Laterals — pipe model, count scales with maturity
    const maturityBonus = Math.min(plant.rootDepth * 0.3, 1.5);
    const depthPenalty = depth * 0.3;
    const lateralCount = Math.max(1, Math.floor(2 + maturityBonus - depthPenalty + rng.next()));
    const hasTap = rng.next() > 0.25;
    const tapFrac = hasTap ? 0.5 : 0;
    const latFrac = (1 - tapFrac) / Math.max(lateralCount, 1);
    const parentArea = radius * radius;

    for (let i = 0; i < lateralCount; i++) {
      const cArea = parentArea * latFrac;
      const cRadius = Math.sqrt(cArea);
      const spread = rng.range(0.35, 1.0);
      const side = i % 2 === 0 ? -1 : 1;
      let cAngle = angle + spread * side + rng.range(-0.2, 0.2);
      // Clamp to downward hemisphere
      cAngle = Math.max(Math.PI / 9, Math.min(Math.PI - Math.PI / 9, cAngle));
      const cLen = length * rng.range(0.3, 0.55);
      const spawnT = rng.range(0.2, 0.8);
      const sx = x + (endX - x) * spawnT;
      const sy = y + (endY - y) * spawnT;
      if (cLen > 0.008 && cRadius > 0.0002) {
        node.children.push(buildNode(sx, sy, cAngle, cLen, cRadius, depth + 1));
      }
    }

    if (hasTap) {
      const tArea = parentArea * tapFrac;
      const tRadius = Math.sqrt(tArea);
      let tAngle = angle + rng.range(-0.15, 0.15);
      tAngle = Math.max(Math.PI / 9, Math.min(Math.PI - Math.PI / 9, tAngle));
      const tLen = length * rng.range(0.4, 0.6);
      if (tLen > 0.008 && tRadius > 0.0002) {
        node.children.push(buildNode(endX, endY, tAngle, tLen, tRadius, depth + 1));
      }
    }

    return node;
  }

  const root = buildNode(0, 0, Math.PI / 2, plant.rootDepth, tapRootRadius, 0);
  return { root, bounds, hairs };
}

// ══════════════════════════════════════════════════════════════════
//  RENDERERS
// ══════════════════════════════════════════════════════════════════

function renderShootToGfx(
  gfx: Graphics,
  shoot: ShootStructure,
  scale: number,
  offsetX: number,
  offsetY: number,
  viewW: number,
): void {
  const { root, leaves, flowers, fruits, spikes } = shoot;

  // Ground line at the very bottom of this view
  gfx.moveTo(0, offsetY);
  gfx.lineTo(viewW, offsetY);
  gfx.stroke({ color: GROUND_COLOR, width: 2 });

  // Branches
  renderBranch(gfx, root, scale, offsetX, offsetY, BARK_COLOR, BARK_LIGHT);

  // Spikes
  for (const s of spikes) {
    const sx = s.x * scale + offsetX;
    const sy = s.y * scale + offsetY;
    const sl = s.length * scale;
    gfx.moveTo(sx, sy);
    gfx.lineTo(sx + Math.cos(s.angle) * sl, sy + Math.sin(s.angle) * sl);
    gfx.stroke({ color: 0x8b4513, width: Math.max(1, scale * 0.003) });
  }

  // Leaves
  for (const l of leaves) {
    const lx = l.x * scale + offsetX;
    const ly = l.y * scale + offsetY;
    const lw = Math.max(2, l.size * scale);
    gfx.ellipse(lx, ly, lw, Math.max(1, lw * 0.5));
    gfx.fill({ color: darkenColor(LEAF_GREEN, l.shade), alpha: 0.85 });
  }

  // Flowers
  for (const f of flowers) {
    const fx = f.x * scale + offsetX;
    const fy = f.y * scale + offsetY;
    const fs = Math.max(2, f.size * scale);
    for (let i = 0; i < 5; i++) {
      const pa = (i / 5) * Math.PI * 2;
      gfx.circle(fx + Math.cos(pa) * fs, fy + Math.sin(pa) * fs, fs * 0.35);
      gfx.fill({ color: FLOWER_PINK, alpha: 0.7 * f.progress });
    }
    gfx.circle(fx, fy, fs * 0.2);
    gfx.fill(FLOWER_CENTER);
  }

  // Fruit
  for (const fr of fruits) {
    const frx = fr.x * scale + offsetX;
    const fry = fr.y * scale + offsetY;
    const frs = Math.max(2, fr.size * scale);
    gfx.circle(frx, fry, frs);
    gfx.fill({ color: FRUIT_RED, alpha: 0.6 + fr.ripeness * 0.4 });
  }
}

function renderRootsToGfx(
  gfx: Graphics,
  roots: RootStructure,
  scale: number,
  offsetX: number,
  offsetY: number,
  viewW: number,
  viewH: number,
): void {
  const { root, hairs } = roots;

  // Soil surface at top of this view
  gfx.moveTo(0, offsetY);
  gfx.lineTo(viewW, offsetY);
  gfx.stroke({ color: GROUND_COLOR, width: 2 });

  // Soil background
  gfx.rect(0, offsetY, viewW, viewH - offsetY);
  gfx.fill({ color: 0x3d2b1f, alpha: 0.15 });

  // Root branches
  renderBranch(gfx, root, scale, offsetX, offsetY, ROOT_DARK, ROOT_LIGHT);

  // Root hairs
  for (const h of hairs) {
    const hx = h.x * scale + offsetX;
    const hy = h.y * scale + offsetY;
    const hl = h.length * scale;
    gfx.moveTo(hx, hy);
    gfx.lineTo(hx + Math.cos(h.angle) * hl, hy + Math.sin(h.angle) * hl);
    gfx.stroke({ color: ROOT_LIGHT, width: 0.5, alpha: 0.5 });
  }
}

/** Shared recursive renderer for both branch and root nodes. */
function renderBranch(
  gfx: Graphics,
  node: BranchNode,
  scale: number,
  offsetX: number,
  offsetY: number,
  darkColor: number,
  lightColor: number,
): void {
  const x1 = node.startX * scale + offsetX;
  const y1 = node.startY * scale + offsetY;
  const mx = node.midX * scale + offsetX;
  const my = node.midY * scale + offsetY;
  const x2 = node.endX * scale + offsetX;
  const y2 = node.endY * scale + offsetY;
  const w = Math.max(1, node.radius * 2 * scale);

  const color = node.depth === 0
    ? darkColor
    : lerpColor(darkColor, lightColor, node.depth / Math.max(node.maxDepth, 1));

  gfx.moveTo(x1, y1);
  gfx.lineTo(mx, my);
  gfx.stroke({ color, width: w });

  gfx.moveTo(mx, my);
  gfx.lineTo(x2, y2);
  gfx.stroke({ color, width: w * 0.85 });

  for (const child of node.children) {
    renderBranch(gfx, child, scale, offsetX, offsetY, darkColor, lightColor);
  }
}
