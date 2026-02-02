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

export interface BranchNode {
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

export interface ShootStructure {
  root: BranchNode;
  bounds: BoundingBox;
  leaves: LeafCluster[];
  flowers: FlowerData[];
  fruits: FruitData[];
  spikes: SpikeData[];
  leafColor: number;
}

export interface RootStructure {
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

export interface PlantRenderResult {
  shoot: ShootStructure;
  roots: RootStructure;
  scale: number;
  airOffsetX: number;
  airOffsetY: number;
  soilOffsetX: number;
  soilOffsetY: number;
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
): PlantRenderResult | null {
  shootGfx.clear();
  rootGfx.clear();
  if (airW < 1 || airH < 1 || soilW < 1 || soilH < 1) return null;

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

  return { shoot, roots, scale, airOffsetX, airOffsetY, soilOffsetX, soilOffsetY };
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

  /** Build a sub-branch recursively (depth >= 1).
   *  Uses branchRng ONLY for structural decisions (geometry, sub-branching).
   *  Decoration (leaves, flowers, fruit, spikes) uses a separate decorRng
   *  so that seasonal changes don't shift the branching structure. */
  function buildBranch(
    x: number, y: number,
    angle: number, length: number, radius: number,
    depth: number,
    branchRng: SeededRandom,
  ): BranchNode {
    // ── Separate decoration RNG from structural RNG ──
    // One call to seed it, then decoration never touches branchRng again.
    const decorRng = new SeededRandom(branchRng.next() * 99999 + depth);

    // ── STRUCTURAL: segment geometry ──
    const wobble = branchRng.range(-0.08, 0.08) * length;
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

    // ── STRUCTURAL: pre-compute sub-branch parameters (stable) ──
    let lateralCount = 0;
    let hasLeaderBranch = false;
    let firstSide = 1;
    interface SubBranchParams { spread: number; jitter: number; lenMult: number }
    const lateralParams: SubBranchParams[] = [];
    let leaderJitter = 0;
    let leaderLenMult = 0;

    if (!isTerminal) {
      lateralCount = 1 + Math.floor(branchRng.next() * 2);
      hasLeaderBranch = branchRng.next() > 0.3;
      firstSide = branchRng.next() > 0.5 ? -1 : 1;
      for (let i = 0; i < lateralCount; i++) {
        lateralParams.push({
          spread: branchRng.range(0.3, 0.7),
          jitter: branchRng.range(-0.1, 0.1),
          lenMult: branchRng.range(0.45, 0.65),
        });
      }
      if (hasLeaderBranch) {
        leaderJitter = branchRng.range(-0.12, 0.12);
        leaderLenMult = branchRng.range(0.45, 0.6);
      }
    }

    // ── DECORATION: spikes (uses decorRng) ──
    if (hasSpikes && depth <= 2) {
      const n = Math.max(1, Math.floor(length / 0.3));
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        const sx = x + (endX - x) * t;
        const sy = y + (endY - y) * t;
        const side = decorRng.next() > 0.5 ? 1 : -1;
        const sa = angle + (Math.PI / 2) * side;
        const sl = 0.05 + decorRng.next() * 0.08;
        spikes.push({ x: sx, y: sy, angle: sa, length: sl });
        expand(sx + Math.cos(sa) * sl, sy + Math.sin(sa) * sl, 0);
      }
    }

    // ── DECORATION: leaves (uses decorRng) ──
    const leafRatio = plant.visibleLeafArea / Math.max(plant.leafArea, 0.001);
    if (plant.visibleLeafArea > 0.0005) {
      const baseCount = Math.max(1, Math.floor(plant.leafArea * 2 / Math.max(maxBranchDepth, 1)));
      const n = Math.max(0, Math.floor(baseCount * leafRatio));
      for (let i = 0; i < n; i++) {
        const t = decorRng.range(0.3, 1.0);
        const sp = radius * 3 + 0.05;
        const lx = x + (endX - x) * t + decorRng.range(-sp, sp);
        const ly = y + (endY - y) * t + decorRng.range(-sp, sp);
        const sz = 0.03 + Math.min(plant.leafArea * 0.005, 0.15);
        leaves.push({ x: lx, y: ly, size: sz, shade: decorRng.range(0.7, 1.0) });
        expand(lx, ly, sz);
      }
    }

    // ── DECORATION: terminal clusters, flowers, fruit (uses decorRng) ──
    if (isTerminal) {
      const cs = 0.04 + Math.min(plant.leafArea * 0.008, 0.2);
      const baseLc = 3 + Math.floor(decorRng.next() * 4);
      const lc = Math.max(0, Math.floor(baseLc * leafRatio));
      for (let i = 0; i < lc; i++) {
        const la = angle + decorRng.range(-1.0, 1.0);
        const ld = decorRng.range(0.01, cs * 1.5);
        const lx = endX + Math.cos(la) * ld;
        const ly = endY + Math.sin(la) * ld;
        leaves.push({ x: lx, y: ly, size: cs * 0.7, shade: decorRng.range(0.6, 1.0) });
        expand(lx, ly, cs);
      }

      if (plant.flowering > 0.1 && decorRng.next() < plant.flowering) {
        const fo = cs * 0.8;
        const fx = endX + decorRng.range(-fo, fo);
        const fy = endY + decorRng.range(-fo, fo);
        const fs = 0.02 + plant.flowering * 0.06;
        flowers.push({ x: fx, y: fy, size: fs, progress: plant.flowering });
        expand(fx, fy, fs * 1.5);
      }

      if (plant.fruit > 0.2 && decorRng.next() < plant.fruit) {
        const fro = cs;
        const frx = endX + decorRng.range(-fro, fro);
        const fry = endY + decorRng.range(0.01, fro * 1.5);
        const frs = 0.02 + plant.fruit * 0.05;
        fruits.push({ x: frx, y: fry, size: frs, ripeness: plant.fruit });
        expand(frx, fry, frs);
      }

      return node;
    }

    // ── STRUCTURAL: build sub-branches using pre-computed params ──
    const leaderFrac = hasLeaderBranch ? 0.55 : 0;
    const lateralFrac = (1 - leaderFrac) / Math.max(lateralCount, 1);
    const parentArea = radius * radius;

    for (let i = 0; i < lateralCount; i++) {
      const cArea = parentArea * lateralFrac;
      const cRadius = Math.sqrt(cArea);
      const p = lateralParams[i];
      const side = i === 0 ? firstSide : -firstSide;
      let cAngle = angle + p.spread * side + p.jitter;
      cAngle = Math.max(-Math.PI + Math.PI / 9, Math.min(-Math.PI / 9, cAngle));
      const cLen = length * p.lenMult;
      if (cLen > 0.01 && cRadius > 0.0005) {
        node.children.push(buildBranch(endX, endY, cAngle, cLen, cRadius, depth + 1, branchRng));
      }
    }

    if (hasLeaderBranch) {
      const lArea = parentArea * leaderFrac;
      const lRadius = Math.sqrt(lArea);
      let lAngle = angle + leaderJitter;
      lAngle = Math.max(-Math.PI + Math.PI / 9, Math.min(-Math.PI / 9, lAngle));
      const lLen = length * leaderLenMult;
      if (lLen > 0.01 && lRadius > 0.0005) {
        node.children.push(buildBranch(endX, endY, lAngle, lLen, lRadius, depth + 1, branchRng));
      }
    }

    return node;
  }

  // ── Build trunk as a CHAIN of fixed-length segments ──
  // STABILITY: Each segment uses a per-index seeded RNG so that growing
  // taller only adds new segments at the top — existing segments never change.
  const trunkH = plant.height;
  const trunkR = Math.max(plant.trunkRadius, 0.003);

  const TRUNK_SEG = 0.5; // Fixed 50cm segments — never changes with height
  const numFullTrunkSegs = Math.floor(trunkH / TRUNK_SEG);
  const topRemainder = trunkH - numFullTrunkSegs * TRUNK_SEG;
  const totalTrunkSegs = numFullTrunkSegs + (topRemainder > 0.01 ? 1 : 0);

  // Branch parameters
  const BRANCH_ZONE_START = 0.3;
  const numBranches = Math.max(2, Math.min(14, Math.floor(plant.branchCount * 1.5) + 2));

  // First pass: build the trunk chain (segments only)
  let trunkRoot: BranchNode | null = null;
  let prevSeg: BranchNode | null = null;
  let curX = 0;
  let curY = 0;

  const trunkSegRefs: { node: BranchNode; t0: number; t1: number;
    sx: number; sy: number; ex: number; ey: number }[] = [];

  for (let seg = 0; seg < totalTrunkSegs; seg++) {
    const isTopPartial = seg === numFullTrunkSegs && topRemainder > 0.01;
    const actualSegLen = isTopPartial ? topRemainder : TRUNK_SEG;

    const t0 = (seg * TRUNK_SEG) / trunkH;
    const t1 = Math.min(1, (seg * TRUNK_SEG + actualSegLen) / trunkH);
    const tMid = (t0 + t1) / 2;

    const r0 = trunkR * (1 - t0 * 0.4);
    const segRadius = trunkR * (1 - tMid * 0.4);

    // Per-segment RNG — stable regardless of total segment count
    // Zigzag: alternate sign so wobble doesn't accumulate into a lean
    const segRng = new SeededRandom(plant.phenotypeSeed * 100 + seg + 1);
    const wobbleMag = segRng.range(0.005, 0.015) * actualSegLen;
    const wobbleX = (seg % 2 === 0 ? 1 : -1) * wobbleMag;
    const nextX = curX + wobbleX;
    const nextY = curY - actualSegLen;
    const midWobble = segRng.range(-0.01, 0.01) * actualSegLen;

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

    // Spikes on this segment (per-segment RNG)
    if (hasSpikes) {
      const segSpikeRng = new SeededRandom(plant.phenotypeSeed * 300 + seg + 1);
      const spikesPerSeg = Math.max(1, Math.floor(actualSegLen / 0.5));
      for (let i = 0; i < spikesPerSeg; i++) {
        const st = (i + 0.5) / spikesPerSeg;
        const sx = curX + (nextX - curX) * st;
        const sy = curY + (nextY - curY) * st;
        const side = segSpikeRng.next() > 0.5 ? 1 : -1;
        const sa = side * (Math.PI / 2) + segSpikeRng.range(-0.3, 0.3);
        const sl = 0.05 + segSpikeRng.next() * 0.08;
        spikes.push({ x: sx, y: sy, angle: sa, length: sl });
        expand(sx + Math.cos(sa) * sl, sy + Math.sin(sa) * sl, 0);
      }
    }

    // Link into chain
    if (prevSeg) {
      prevSeg.children.push(node);
    } else {
      trunkRoot = node;
    }

    trunkSegRefs.push({ node, t0, t1, sx: curX, sy: curY, ex: nextX, ey: nextY });
    prevSeg = node;
    curX = nextX;
    curY = nextY;
  }

  // Second pass: attach auto-generated branches (always rendered).
  const branchSideFlip = Math.floor(plant.phenotypeSeed * 7) % 2 === 0 ? 1 : -1;

  for (let bi = 0; bi < numBranches; bi++) {
    const bt = BRANCH_ZONE_START + (1 - BRANCH_ZONE_START) * ((bi + 0.5) / numBranches);

    let tgt = trunkSegRefs[trunkSegRefs.length - 1];
    for (const s of trunkSegRefs) {
      if (bt >= s.t0 && bt <= s.t1) { tgt = s; break; }
    }

    const localT = Math.min(1, Math.max(0, (bt - tgt.t0) / (tgt.t1 - tgt.t0)));
    const spawnX = tgt.sx + (tgt.ex - tgt.sx) * localT;
    const spawnY = tgt.sy + (tgt.ey - tgt.sy) * localT;

    const pairIdx = Math.floor(bi / 2);
    const pairRng = new SeededRandom(plant.phenotypeSeed * 250 + pairIdx + 1);
    const branchAreaFrac = pairRng.range(0.08, 0.2);
    const branchLenMult = pairRng.range(0.25, 0.5);

    const bRng = new SeededRandom(plant.phenotypeSeed * 200 + bi + 1);

    const trunkRadAtH = trunkR * (1 - bt * 0.5);
    const branchR = Math.sqrt(trunkRadAtH * trunkRadAtH * branchAreaFrac);

    // Gentle taper: length drops to 40% at the top, not 0%.
    // This prevents the "upper sibling" in each pair from being much shorter
    // than the lower one, which caused permanent left/right asymmetry.
    const lengthBudget = trunkH * (1 - bt * 0.6);
    const branchLen = lengthBudget * branchLenMult;

    const side = (bi % 2 === 0 ? -1 : 1) * branchSideFlip;
    const baseSpread = 0.4 + (1 - bt) * 0.6;
    let branchAngle = -Math.PI / 2 + side * baseSpread + bRng.range(-0.15, 0.15);
    branchAngle = Math.max(-Math.PI + Math.PI / 9, Math.min(-Math.PI / 9, branchAngle));

    if (branchLen > 0.03 && branchR > 0.0005) {
      tgt.node.children.push(
        buildBranch(spawnX, spawnY, branchAngle, branchLen, branchR, 1, bRng),
      );
    }
  }

  // Third pass: attach manual (player-placed) branches on top of auto branches.
  for (const mb of plant.manualBranches) {
    const bt = Math.min(1, Math.max(0, mb.heightFraction));

    let tgt = trunkSegRefs[trunkSegRefs.length - 1];
    for (const s of trunkSegRefs) {
      if (bt >= s.t0 && bt <= s.t1) { tgt = s; break; }
    }

    const localT = Math.min(1, Math.max(0, (bt - tgt.t0) / (tgt.t1 - tgt.t0)));
    const spawnX = tgt.sx + (tgt.ex - tgt.sx) * localT;
    const spawnY = tgt.sy + (tgt.ey - tgt.sy) * localT;

    const trunkRadAtH = trunkR * (1 - bt * 0.5);
    const branchR = Math.sqrt(trunkRadAtH * trunkRadAtH * 0.12);
    const bRng = new SeededRandom(mb.seed);

    let branchAngle = mb.angle;
    branchAngle = Math.max(-Math.PI + Math.PI / 9, Math.min(-Math.PI / 9, branchAngle));

    if (mb.length > 0.03 && branchR > 0.0005) {
      tgt.node.children.push(
        buildBranch(spawnX, spawnY, branchAngle, mb.length, branchR, 1, bRng),
      );
    }
  }

  // ── Small leader extension at trunk tip ──
  const leaderRng = new SeededRandom(plant.phenotypeSeed * 400 + 1);
  const leaderLen = trunkH * leaderRng.range(0.03, 0.08);
  const leaderR = trunkR * 0.35;
  const leaderAngle = -Math.PI / 2 + leaderRng.range(-0.08, 0.08);
  if (leaderLen > 0.02 && prevSeg) {
    prevSeg.children.push(
      buildBranch(curX, curY, leaderAngle, leaderLen, leaderR, 1, leaderRng),
    );
  }

  return { root: trunkRoot!, bounds, leaves, flowers, fruits, spikes, leafColor: plant.leafColor };
}

// ══════════════════════════════════════════════════════════════════
//  ROOT STRUCTURE BUILDER
// ══════════════════════════════════════════════════════════════════

function buildRootStructure(plant: SpeciesInstance): RootStructure {
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

  /** Build a lateral sub-root recursively (depth >= 1).
   *  Same structural/decoration RNG split as buildBranch — root hair
   *  generation (which varies with rootDepth) uses decorRng so it
   *  doesn't shift the sub-lateral structure. */
  function buildLateral(
    x: number, y: number,
    angle: number, length: number, radius: number,
    depth: number,
    latRng: SeededRandom,
  ): BranchNode {
    // ── Separate decoration RNG ──
    const decorRng = new SeededRandom(latRng.next() * 99999 + depth);

    // ── STRUCTURAL: segment geometry ──
    const wobble = latRng.range(-0.12, 0.12) * length;
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

    // ── STRUCTURAL: pre-compute sub-lateral parameters (stable) ──
    let lateralCount = 0;
    let hasLeaderLat = false;
    let firstLatSide = 1;
    interface SubLatParams { spread: number; jitter: number; lenMult: number }
    const latParams: SubLatParams[] = [];
    let leaderJitter = 0;
    let leaderLenMult = 0;

    if (!isTerminal) {
      lateralCount = 1 + Math.floor(latRng.next() * 2);
      hasLeaderLat = latRng.next() > 0.3;
      firstLatSide = latRng.next() > 0.5 ? -1 : 1;
      for (let i = 0; i < lateralCount; i++) {
        latParams.push({
          spread: latRng.range(0.35, 0.9),
          jitter: latRng.range(-0.15, 0.15),
          lenMult: latRng.range(0.45, 0.65),
        });
      }
      if (hasLeaderLat) {
        leaderJitter = latRng.range(-0.12, 0.12);
        leaderLenMult = latRng.range(0.45, 0.6);
      }
    }

    // ── DECORATION: root hairs at terminal (uses decorRng) ──
    if (isTerminal) {
      const hc = 2 + Math.floor(decorRng.next() * 3) + Math.floor(Math.min(plant.rootDepth, 4));
      for (let i = 0; i < hc; i++) {
        const ha = angle + decorRng.range(-1.3, 1.3);
        const hl = 0.01 + decorRng.next() * 0.05 * Math.min(plant.rootDepth, 2);
        const hx = endX + Math.cos(ha) * hl;
        const hy = Math.max(0, endY + Math.sin(ha) * hl);
        hairs.push({ x: endX, y: endY, angle: ha, length: hl });
        expand(hx, hy, 0);
      }
      return node;
    }

    // ── STRUCTURAL: build sub-laterals using pre-computed params ──
    const leaderFrac = hasLeaderLat ? 0.5 : 0;
    const latFrac = (1 - leaderFrac) / Math.max(lateralCount, 1);
    const parentArea = radius * radius;

    for (let i = 0; i < lateralCount; i++) {
      const cArea = parentArea * latFrac;
      const cRadius = Math.sqrt(cArea);
      const p = latParams[i];
      const side = i === 0 ? firstLatSide : -firstLatSide;
      let cAngle = angle + p.spread * side + p.jitter;
      cAngle = Math.max(Math.PI / 9, Math.min(Math.PI - Math.PI / 9, cAngle));
      const cLen = length * p.lenMult;
      if (cLen > 0.008 && cRadius > 0.0002) {
        node.children.push(buildLateral(endX, endY, cAngle, cLen, cRadius, depth + 1, latRng));
      }
    }

    if (hasLeaderLat) {
      const lArea = parentArea * leaderFrac;
      const lRadius = Math.sqrt(lArea);
      let lAngle = angle + leaderJitter;
      lAngle = Math.max(Math.PI / 9, Math.min(Math.PI - Math.PI / 9, lAngle));
      const lLen = length * leaderLenMult;
      if (lLen > 0.008 && lRadius > 0.0002) {
        node.children.push(buildLateral(endX, endY, lAngle, lLen, lRadius, depth + 1, latRng));
      }
    }

    return node;
  }

  // ── Build taproot as a CHAIN of fixed-length segments ──
  // Same stability approach as trunk: fixed segment length, per-index RNG.
  const rootD = plant.rootDepth;

  const TAP_SEG = 0.5; // Fixed 50cm segments
  const numFullTapSegs = Math.floor(rootD / TAP_SEG);
  const tapRemainder = rootD - numFullTapSegs * TAP_SEG;
  const totalTapSegs = numFullTapSegs + (tapRemainder > 0.01 ? 1 : 0);

  // Lateral parameters — roots branch more densely than shoots
  const numLaterals = Math.max(4, Math.min(20, Math.floor(plant.rootDepth * 2.5) + 3));

  // First pass: build taproot chain
  let tapRoot: BranchNode | null = null;
  let prevTapSeg: BranchNode | null = null;
  let tapX = 0;
  let tapY = 0;

  const tapSegRefs: { node: BranchNode; t0: number; t1: number;
    sx: number; sy: number; ex: number; ey: number }[] = [];

  for (let seg = 0; seg < totalTapSegs; seg++) {
    const isBottomPartial = seg === numFullTapSegs && tapRemainder > 0.01;
    const actualSegLen = isBottomPartial ? tapRemainder : TAP_SEG;

    const t0 = (seg * TAP_SEG) / rootD;
    const t1 = Math.min(1, (seg * TAP_SEG + actualSegLen) / rootD);
    const tMid = (t0 + t1) / 2;

    const segRadius = tapRootRadius * (1 - tMid * 0.5);

    // Per-segment RNG — zigzag to prevent drift
    const segRng = new SeededRandom(plant.phenotypeSeed * 500 + seg + 1);
    const wobbleMag = segRng.range(0.005, 0.015) * actualSegLen;
    const wobbleX = (seg % 2 === 0 ? 1 : -1) * wobbleMag;
    const nextX = tapX + wobbleX;
    const nextY = tapY + actualSegLen;
    const midWobble = segRng.range(-0.01, 0.01) * actualSegLen;

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

    // Link into chain
    if (prevTapSeg) {
      prevTapSeg.children.push(node);
    } else {
      tapRoot = node;
    }

    tapSegRefs.push({ node, t0, t1, sx: tapX, sy: tapY, ex: nextX, ey: nextY });
    prevTapSeg = node;
    tapX = nextX;
    tapY = nextY;
  }

  // Second pass: attach auto-generated laterals (always rendered).
  const rootSideFlip = Math.floor(plant.phenotypeSeed * 7) % 2 === 0 ? 1 : -1;

  for (let li = 0; li < numLaterals; li++) {
    const lt = (li + 0.5) / numLaterals;

    let tgt = tapSegRefs[tapSegRefs.length - 1];
    for (const s of tapSegRefs) {
      if (lt >= s.t0 && lt <= s.t1) { tgt = s; break; }
    }

    const localT = Math.min(1, Math.max(0, (lt - tgt.t0) / (tgt.t1 - tgt.t0)));
    const spawnX = tgt.sx + (tgt.ex - tgt.sx) * localT;
    const spawnY = tgt.sy + (tgt.ey - tgt.sy) * localT;

    const pairIdx = Math.floor(li / 2);
    const pairRng = new SeededRandom(plant.phenotypeSeed * 650 + pairIdx + 1);
    const latAreaFrac = pairRng.range(0.08, 0.2);
    const latLenMult = pairRng.range(0.5, 0.9);

    const lRng = new SeededRandom(plant.phenotypeSeed * 600 + li + 1);

    const tapRadAtD = tapRootRadius * (1 - lt * 0.5);
    const latR = Math.sqrt(tapRadAtD * tapRadAtD * latAreaFrac);

    // Gentle taper: same fix as shoot branches — prevents pair asymmetry.
    const lengthBudget = rootD * (1 - lt * 0.6);
    const latLen = Math.max(rootD * 0.15, lengthBudget * latLenMult);

    const side = (li % 2 === 0 ? -1 : 1) * rootSideFlip;
    const surfaceAngle = Math.PI * 0.08;
    const deepAngle = Math.PI * 0.2;
    const baseAngle = surfaceAngle + lt * (deepAngle - surfaceAngle);
    let latAngle = side > 0 ? baseAngle : (Math.PI - baseAngle);
    latAngle += lRng.range(-0.12, 0.12);
    latAngle = Math.max(Math.PI / 9, Math.min(Math.PI - Math.PI / 9, latAngle));

    if (latLen > 0.02 && latR > 0.0003) {
      tgt.node.children.push(
        buildLateral(spawnX, spawnY, latAngle, latLen, latR, 1, lRng),
      );
    }
  }

  // Third pass: attach manual (player-placed) roots on top of auto laterals.
  for (const mr of plant.manualRoots) {
    const lt = Math.min(1, Math.max(0, mr.depthFraction));

    let tgt = tapSegRefs[tapSegRefs.length - 1];
    for (const s of tapSegRefs) {
      if (lt >= s.t0 && lt <= s.t1) { tgt = s; break; }
    }

    const localT = Math.min(1, Math.max(0, (lt - tgt.t0) / (tgt.t1 - tgt.t0)));
    const spawnX = tgt.sx + (tgt.ex - tgt.sx) * localT;
    const spawnY = tgt.sy + (tgt.ey - tgt.sy) * localT;

    const tapRadAtD = tapRootRadius * (1 - lt * 0.5);
    const latR = Math.sqrt(tapRadAtD * tapRadAtD * 0.12);
    const lRng = new SeededRandom(mr.seed);

    let latAngle = mr.angle;
    latAngle = Math.max(Math.PI / 9, Math.min(Math.PI - Math.PI / 9, latAngle));

    if (mr.length > 0.02 && latR > 0.0003) {
      tgt.node.children.push(
        buildLateral(spawnX, spawnY, latAngle, mr.length, latR, 1, lRng),
      );
    }
  }

  // ── Small root tip extension ──
  const tipRng = new SeededRandom(plant.phenotypeSeed * 700 + 1);
  const tipLen = rootD * tipRng.range(0.03, 0.08);
  const tipR = tapRootRadius * 0.3;
  const tipAngle = Math.PI / 2 + tipRng.range(-0.1, 0.1);
  if (tipLen > 0.01 && prevTapSeg) {
    prevTapSeg.children.push(
      buildLateral(tapX, tapY, tipAngle, tipLen, tipR, 1, tipRng),
    );
  }

  // ── Root hairs along taproot (absorption zone) ──
  const tapHairCount = Math.max(4, Math.floor(rootD * 2));
  for (let i = 0; i < tapHairCount; i++) {
    const hairRng = new SeededRandom(plant.phenotypeSeed * 800 + i + 1);
    const t = hairRng.range(0.5, 0.95);
    const hy = rootD * t;
    const ha = hairRng.range(0, Math.PI * 2);
    const hl = 0.01 + hairRng.next() * 0.04;
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
