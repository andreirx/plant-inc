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
  leafColor: number;
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
const FLOWER_PINK = 0xffaacc;
const FLOWER_CENTER = 0xffee55;
const FRUIT_RED = 0xe53935;
const ROOT_DARK = 0x8b6914;
const ROOT_LIGHT = 0xc4a35a;
const GROUND_COLOR = 0x4a3728;

let _lastDrawLog = 0;

function countNodes(node: BranchNode): number {
  let count = 1;
  for (const child of node.children) count += countNodes(child);
  return count;
}

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

  // Debug: log bounds, scale, and node counts once per second
  const now = performance.now();
  if (now - _lastDrawLog > 1000) {
    _lastDrawLog = now;
    const sb = shoot.bounds;
    const rb = roots.bounds;
    const shootNodes = countNodes(shoot.root);
    const rootNodes = countNodes(roots.root);
    console.log(
      `SHOOT bounds: minY=${sb.minY.toFixed(2)} maxY=${sb.maxY.toFixed(2)} ` +
      `minX=${sb.minX.toFixed(2)} maxX=${sb.maxX.toFixed(2)} → aboveH=${aboveH.toFixed(2)}m W=${(sb.maxX - sb.minX).toFixed(2)}m`,
    );
    console.log(
      `ROOT bounds: minY=${rb.minY.toFixed(2)} maxY=${rb.maxY.toFixed(2)} ` +
      `minX=${rb.minX.toFixed(2)} maxX=${rb.maxX.toFixed(2)} → belowH=${belowH.toFixed(2)}m W=${(rb.maxX - rb.minX).toFixed(2)}m`,
    );
    console.log(
      `SCALE: ${scale.toFixed(2)}px/m (airScaleY=${airScaleY.toFixed(2)} soilScaleY=${soilScaleY.toFixed(2)} ` +
      `widthScale=${widthScale.toFixed(2)}) views: air=${airW}x${airH} soil=${soilW}x${soilH}`,
    );
    console.log(
      `TREE: ${shootNodes} shoot nodes (${shoot.root.children.length} trunk branches), ` +
      `${rootNodes} root nodes (${roots.root.children.length} taproot laterals), ` +
      `${shoot.leaves.length} leaves, branchCount=${plant.branchCount}`,
    );
  }

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
  const maxBranchDepth = Math.min(plant.branchCount + 1, 5);
  const hasSpikes = genome.activeTraits.has('spikes');

  function expand(x: number, y: number, m: number): void {
    bounds.minX = Math.min(bounds.minX, x - m);
    bounds.maxX = Math.max(bounds.maxX, x + m);
    bounds.minY = Math.min(bounds.minY, y - m);
    bounds.maxY = Math.max(bounds.maxY, y + m);
  }

  /** Build a sub-branch recursively (depth >= 1). */
  function buildBranch(
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

    const isTerminal = depth >= maxBranchDepth || length < 0.02;

    const node: BranchNode = {
      startX: x, startY: y, midX, midY, endX, endY,
      radius, depth, maxDepth: maxBranchDepth + 1, children: [],
    };

    // Spikes on branches
    if (hasSpikes && depth <= 2) {
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

    // Leaves along this branch — scaled by visibleLeafArea (deciduous drop)
    const leafRatio = plant.visibleLeafArea / Math.max(plant.leafArea, 0.001);
    if (plant.visibleLeafArea > 0.0005) {
      const baseCount = Math.max(1, Math.floor(plant.leafArea * 2 / Math.max(maxBranchDepth, 1)));
      const n = Math.max(0, Math.floor(baseCount * leafRatio));
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
      const baseLc = 3 + Math.floor(rng.next() * 4);
      const lc = Math.max(0, Math.floor(baseLc * leafRatio));
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

    // Sub-branches — pipe model + gravitropism
    const lateralCount = 1 + Math.floor(rng.next() * 2);
    const hasLeader = rng.next() > 0.3;
    const leaderFrac = hasLeader ? 0.55 : 0;
    const lateralFrac = (1 - leaderFrac) / lateralCount;
    const parentArea = radius * radius;

    for (let i = 0; i < lateralCount; i++) {
      const cArea = parentArea * lateralFrac;
      const cRadius = Math.sqrt(cArea);
      const spread = rng.range(0.3, 0.7);
      const side = i === 0 ? -1 : 1;
      let cAngle = angle + spread * side + rng.range(-0.1, 0.1);
      cAngle = Math.max(-Math.PI + Math.PI / 9, Math.min(-Math.PI / 9, cAngle));
      const cLen = length * rng.range(0.45, 0.65);
      if (cLen > 0.01 && cRadius > 0.0005) {
        node.children.push(buildBranch(endX, endY, cAngle, cLen, cRadius, depth + 1));
      }
    }

    if (hasLeader) {
      const lArea = parentArea * leaderFrac;
      const lRadius = Math.sqrt(lArea);
      let lAngle = angle + rng.range(-0.12, 0.12);
      lAngle = Math.max(-Math.PI + Math.PI / 9, Math.min(-Math.PI / 9, lAngle));
      const lLen = length * rng.range(0.45, 0.6);
      if (lLen > 0.01 && lRadius > 0.0005) {
        node.children.push(buildBranch(endX, endY, lAngle, lLen, lRadius, depth + 1));
      }
    }

    return node;
  }

  // ── Build trunk as a CHAIN of tapered segments ──
  // Each segment is its own BranchNode, linked parent→child.
  // This gives the trunk visual texture (taper, wobble per segment)
  // instead of one flat 2-line stick.
  const trunkH = plant.height;
  const trunkR = Math.max(plant.trunkRadius, 0.003);

  // One segment per ~1m, min 3 for even tiny seedlings
  const numTrunkSegs = Math.max(3, Math.ceil(trunkH / 1.0));
  const segLen = trunkH / numTrunkSegs;

  // Branch parameters
  const BRANCH_ZONE_START = 0.3;
  const numBranches = Math.max(2, Math.min(14, Math.floor(plant.branchCount * 1.5) + 2));
  let nextBranchIdx = 0; // Track which branch to spawn next

  let trunkRoot: BranchNode | null = null;
  let prevSeg: BranchNode | null = null;
  let curX = 0;
  let curY = 0;

  for (let seg = 0; seg < numTrunkSegs; seg++) {
    const t0 = seg / numTrunkSegs;       // Start fraction along trunk
    const t1 = (seg + 1) / numTrunkSegs; // End fraction
    const tMid = (t0 + t1) / 2;

    // Taper: radius decreases from base to top (60% of base at crown)
    const r0 = trunkR * (1 - t0 * 0.4);
    const segRadius = trunkR * (1 - tMid * 0.4);

    // Segment endpoint with slight organic wobble
    const wobbleX = rng.range(-0.015, 0.015) * segLen;
    const nextX = curX + wobbleX;
    const nextY = curY - segLen;
    const midWobble = rng.range(-0.01, 0.01) * segLen;

    const node: BranchNode = {
      startX: curX, startY: curY,
      midX: (curX + nextX) / 2 + midWobble, midY: (curY + nextY) / 2,
      endX: nextX, endY: nextY,
      radius: segRadius, depth: 0,
      maxDepth: maxBranchDepth + 1,
      children: [],
    };

    expand(curX, curY, r0);
    expand(node.midX, node.midY, segRadius);
    expand(nextX, nextY, segRadius * 0.9);

    // ── Attach branches at this segment if in branch zone ──
    while (nextBranchIdx < numBranches) {
      const bt = BRANCH_ZONE_START + (1 - BRANCH_ZONE_START) * ((nextBranchIdx + 0.5) / numBranches);
      if (bt > t1) break; // This branch belongs to a later segment

      // Spawn point along this segment
      const localT = (bt - t0) / (t1 - t0);
      const spawnX = curX + (nextX - curX) * localT;
      const spawnY = curY + (nextY - curY) * localT;

      const trunkRadAtH = trunkR * (1 - bt * 0.5);
      const branchAreaFrac = rng.range(0.08, 0.2);
      const branchR = Math.sqrt(trunkRadAtH * trunkRadAtH * branchAreaFrac);

      const remainingAbove = trunkH * (1 - bt);
      const branchLen = remainingAbove * rng.range(0.25, 0.5);

      const side = nextBranchIdx % 2 === 0 ? -1 : 1;
      const baseSpread = 0.4 + (1 - bt) * 0.6;
      let branchAngle = -Math.PI / 2 + side * baseSpread + rng.range(-0.15, 0.15);
      branchAngle = Math.max(-Math.PI + Math.PI / 9, Math.min(-Math.PI / 9, branchAngle));

      if (branchLen > 0.03 && branchR > 0.0005) {
        node.children.push(
          buildBranch(spawnX, spawnY, branchAngle, branchLen, branchR, 1),
        );
      }

      nextBranchIdx++;
    }

    // ── Spikes on this segment ──
    if (hasSpikes) {
      const spikesPerSeg = Math.max(1, Math.floor(segLen / 0.5));
      for (let i = 0; i < spikesPerSeg; i++) {
        const st = (i + 0.5) / spikesPerSeg;
        const sx = curX + (nextX - curX) * st;
        const sy = curY + (nextY - curY) * st;
        const side = rng.next() > 0.5 ? 1 : -1;
        const sa = side * (Math.PI / 2) + rng.range(-0.3, 0.3);
        const sl = 0.05 + rng.next() * 0.08;
        spikes.push({ x: sx, y: sy, angle: sa, length: sl });
        expand(sx + Math.cos(sa) * sl, sy + Math.sin(sa) * sl, 0);
      }
    }

    // Link into chain: previous segment's child = this segment
    if (prevSeg) {
      prevSeg.children.push(node);
    } else {
      trunkRoot = node;
    }

    prevSeg = node;
    curX = nextX;
    curY = nextY;
  }

  // ── Small leader extension at trunk tip ──
  const leaderLen = trunkH * rng.range(0.03, 0.08);
  const leaderR = trunkR * 0.35;
  const leaderAngle = -Math.PI / 2 + rng.range(-0.08, 0.08);
  if (leaderLen > 0.02 && prevSeg) {
    prevSeg.children.push(
      buildBranch(curX, curY, leaderAngle, leaderLen, leaderR, 1),
    );
  }

  return { root: trunkRoot!, bounds, leaves, flowers, fruits, spikes, leafColor: plant.leafColor };
}

// ══════════════════════════════════════════════════════════════════
//  ROOT STRUCTURE BUILDER
// ══════════════════════════════════════════════════════════════════

function buildRootStructure(plant: SpeciesInstance): RootStructure {
  const rng = new SeededRandom(plant.phenotypeSeed + 999);
  const bounds: BoundingBox = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const hairs: RootHair[] = [];
  const maxSubDepth = Math.min(4, Math.floor(Math.sqrt(plant.rootDepth) * 1.5) + 1);
  const tapRootRadius = Math.max(plant.trunkRadius * 0.8, plant.rootDepth * 0.01, 0.003);

  function expand(x: number, y: number, m: number): void {
    bounds.minX = Math.min(bounds.minX, x - m);
    bounds.maxX = Math.max(bounds.maxX, x + m);
    // Clamp minY to 0 — roots never extend above the ground surface
    bounds.minY = Math.min(bounds.minY, Math.max(0, y - m));
    bounds.maxY = Math.max(bounds.maxY, y + m);
  }

  /** Build a lateral sub-root recursively (depth >= 1). */
  function buildLateral(
    x: number, y: number,
    angle: number, length: number, radius: number,
    depth: number,
  ): BranchNode {
    const wobble = rng.range(-0.12, 0.12) * length;
    const perp = angle + Math.PI / 2;
    const midX = x + Math.cos(angle) * length * 0.45 + Math.cos(perp) * wobble;
    const midY = Math.max(0, y + Math.sin(angle) * length * 0.45 + Math.sin(perp) * wobble);
    const endX = x + Math.cos(angle) * length;
    const endY = Math.max(0, y + Math.sin(angle) * length);

    expand(x, y, radius);
    expand(midX, midY, radius);
    expand(endX, endY, radius);

    const isTerminal = depth >= maxSubDepth || length < 0.015;

    const node: BranchNode = {
      startX: x, startY: y, midX, midY, endX, endY,
      radius, depth, maxDepth: maxSubDepth + 1, children: [],
    };

    // Terminal: root hairs
    if (isTerminal) {
      const hc = 2 + Math.floor(rng.next() * 3) + Math.floor(Math.min(plant.rootDepth, 4));
      for (let i = 0; i < hc; i++) {
        const ha = angle + rng.range(-1.3, 1.3);
        const hl = 0.01 + rng.next() * 0.05 * Math.min(plant.rootDepth, 2);
        const hx = endX + Math.cos(ha) * hl;
        const hy = Math.max(0, endY + Math.sin(ha) * hl);
        hairs.push({ x: endX, y: endY, angle: ha, length: hl });
        expand(hx, hy, 0);
      }
      return node;
    }

    // Sub-laterals — pipe model, downward hemisphere
    const lateralCount = 1 + Math.floor(rng.next() * 2);
    const hasLeader = rng.next() > 0.3;
    const leaderFrac = hasLeader ? 0.5 : 0;
    const latFrac = (1 - leaderFrac) / Math.max(lateralCount, 1);
    const parentArea = radius * radius;

    for (let i = 0; i < lateralCount; i++) {
      const cArea = parentArea * latFrac;
      const cRadius = Math.sqrt(cArea);
      const spread = rng.range(0.35, 0.9);
      const side = i % 2 === 0 ? -1 : 1;
      let cAngle = angle + spread * side + rng.range(-0.15, 0.15);
      cAngle = Math.max(Math.PI / 9, Math.min(Math.PI - Math.PI / 9, cAngle));
      const cLen = length * rng.range(0.45, 0.65);
      if (cLen > 0.008 && cRadius > 0.0002) {
        node.children.push(buildLateral(endX, endY, cAngle, cLen, cRadius, depth + 1));
      }
    }

    if (hasLeader) {
      const lArea = parentArea * leaderFrac;
      const lRadius = Math.sqrt(lArea);
      let lAngle = angle + rng.range(-0.12, 0.12);
      lAngle = Math.max(Math.PI / 9, Math.min(Math.PI - Math.PI / 9, lAngle));
      const lLen = length * rng.range(0.45, 0.6);
      if (lLen > 0.008 && lRadius > 0.0002) {
        node.children.push(buildLateral(endX, endY, lAngle, lLen, lRadius, depth + 1));
      }
    }

    return node;
  }

  // ── Build taproot as a CHAIN of tapered segments ──
  // Same approach as trunk: each segment is its own BranchNode in a chain.
  const rootD = plant.rootDepth;

  const numTapSegs = Math.max(3, Math.ceil(rootD / 1.0));
  const tapSegLen = rootD / numTapSegs;

  // Lateral parameters
  const numLaterals = Math.max(3, Math.min(14, Math.floor(plant.rootDepth * 1.2) + 2));
  let nextLatIdx = 0;

  let tapRoot: BranchNode | null = null;
  let prevTapSeg: BranchNode | null = null;
  let tapX = 0;
  let tapY = 0;

  for (let seg = 0; seg < numTapSegs; seg++) {
    const t0 = seg / numTapSegs;
    const t1 = (seg + 1) / numTapSegs;
    const tMid = (t0 + t1) / 2;

    // Taper: radius decreases with depth
    const segRadius = tapRootRadius * (1 - tMid * 0.5);

    const wobbleX = rng.range(-0.015, 0.015) * tapSegLen;
    const nextX = tapX + wobbleX;
    const nextY = tapY + tapSegLen;
    const midWobble = rng.range(-0.01, 0.01) * tapSegLen;

    const node: BranchNode = {
      startX: tapX, startY: tapY,
      midX: (tapX + nextX) / 2 + midWobble, midY: (tapY + nextY) / 2,
      endX: nextX, endY: nextY,
      radius: segRadius, depth: 0,
      maxDepth: maxSubDepth + 1,
      children: [],
    };

    expand(tapX, tapY, segRadius);
    expand(node.midX, node.midY, segRadius);
    expand(nextX, nextY, segRadius * 0.9);

    // ── Attach laterals at this segment ──
    while (nextLatIdx < numLaterals) {
      const lt = (nextLatIdx + 0.5) / numLaterals;
      if (lt > t1) break;

      const localT = (lt - t0) / (t1 - t0);
      const spawnX = tapX + (nextX - tapX) * localT;
      const spawnY = tapY + (nextY - tapY) * localT;

      const tapRadAtD = tapRootRadius * (1 - lt * 0.5);
      const latAreaFrac = rng.range(0.08, 0.2);
      const latR = Math.sqrt(tapRadAtD * tapRadAtD * latAreaFrac);

      const remainingBelow = rootD * (1 - lt);
      const latLen = remainingBelow * rng.range(0.5, 0.9);

      const side = nextLatIdx % 2 === 0 ? -1 : 1;
      const surfaceAngle = Math.PI * 0.1;
      const deepAngle = Math.PI * 0.35;
      const baseAngle = surfaceAngle + lt * (deepAngle - surfaceAngle);
      let latAngle = side > 0 ? baseAngle : (Math.PI - baseAngle);
      latAngle += rng.range(-0.15, 0.15);
      latAngle = Math.max(Math.PI / 9, Math.min(Math.PI - Math.PI / 9, latAngle));

      if (latLen > 0.02 && latR > 0.0003) {
        node.children.push(
          buildLateral(spawnX, spawnY, latAngle, latLen, latR, 1),
        );
      }

      nextLatIdx++;
    }

    // Link into chain
    if (prevTapSeg) {
      prevTapSeg.children.push(node);
    } else {
      tapRoot = node;
    }

    prevTapSeg = node;
    tapX = nextX;
    tapY = nextY;
  }

  // ── Small root tip extension ──
  const tipLen = rootD * rng.range(0.03, 0.08);
  const tipR = tapRootRadius * 0.3;
  const tipAngle = Math.PI / 2 + rng.range(-0.1, 0.1);
  if (tipLen > 0.01 && prevTapSeg) {
    prevTapSeg.children.push(
      buildLateral(tapX, tapY, tipAngle, tipLen, tipR, 1),
    );
  }

  // ── Root hairs along taproot (absorption zone) ──
  const tapHairCount = Math.max(4, Math.floor(rootD * 2));
  for (let i = 0; i < tapHairCount; i++) {
    const t = rng.range(0.5, 0.95);
    const hy = rootD * t;
    const ha = rng.range(0, Math.PI * 2);
    const hl = 0.01 + rng.next() * 0.04;
    hairs.push({ x: 0, y: hy, angle: ha, length: hl });
    expand(Math.cos(ha) * hl, Math.max(0, hy + Math.sin(ha) * hl), 0);
  }

  return { root: tapRoot!, bounds, hairs };
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
    gfx.fill({ color: darkenColor(shoot.leafColor, l.shade), alpha: 0.85 });
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
