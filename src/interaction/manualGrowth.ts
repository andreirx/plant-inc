/**
 * Manual growth interaction — click on the tree to add branches/roots.
 *
 * Coordinate conversion: pixel → plant-space (meters, origin=ground)
 * Hit-testing: walk BranchNode tree, find closest segment
 * Growth actions: spend energy to sprout/extend branches and roots
 */

import { type SpeciesInstance, type ManualBranch, type ManualRoot } from '../core/state';
import { type BranchNode, type PlantRenderResult } from '../render/visuals/plantDrawer';

// ── Energy costs (exported for overlay affordability checks) ──
export const COST_SPROUT_BRANCH = 5;
export const COST_EXTEND_BRANCH = 3;
export const COST_SPROUT_LATERAL = 5;
export const COST_EXTEND_LATERAL = 3;
export const COST_GROW_TALLER = 4;
export const COST_GROW_DEEPER = 4;

// ── Growth amounts ──
const BRANCH_EXTEND = 0.15;  // meters per click
const ROOT_EXTEND = 0.15;
const HEIGHT_GROW = 0.3;
const ROOT_DEPTH_GROW = 0.3;
const NEW_BRANCH_LENGTH = 0.3;
const NEW_ROOT_LENGTH = 0.3;

// ── Hit-testing thresholds ──
const TRUNK_TOP_ZONE = 0.15; // Fraction of trunk height considered "top"
const TAP_BOTTOM_ZONE = 0.15;
const HIT_RADIUS_PX = 30;    // Max pixel distance for a hit

export type GrowthAction =
  | { type: 'sprout_branch'; heightFraction: number; side: -1 | 1 }
  | { type: 'extend_branch'; branchId: number }
  | { type: 'grow_taller' }
  | { type: 'sprout_lateral'; depthFraction: number; side: -1 | 1 }
  | { type: 'extend_lateral'; rootId: number }
  | { type: 'grow_deeper' }
  | null;

export interface HitResult {
  action: GrowthAction;
  cost: number;
  label: string;
  plantX: number;
  plantY: number;
}

/** Convert pixel coordinates to plant-space meters. */
function pixelToPlant(
  px: number, py: number,
  offsetX: number, offsetY: number,
  scale: number,
): { x: number; y: number } {
  return {
    x: (px - offsetX) / scale,
    y: (py - offsetY) / scale,
  };
}

/** Distance from point (px,py) to line segment (ax,ay)→(bx,by). */
function distToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): { dist: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) {
    const d = Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    return { dist: d, t: 0 };
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  const dist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
  return { dist, t };
}

/**
 * Walk the trunk chain (depth=0 nodes) and find the closest trunk segment.
 * Returns the height fraction along the trunk.
 */
function findClosestTrunkSegment(
  root: BranchNode,
  plantX: number,
  plantY: number,
): { dist: number; heightFraction: number; isTop: boolean } | null {
  let bestDist = Infinity;
  let bestFrac = 0;
  let totalHeight = 0;
  let cumHeight = 0;

  // First pass: measure total trunk height
  let seg: BranchNode | null = root;
  while (seg) {
    const segLen = Math.sqrt(
      (seg.endX - seg.startX) ** 2 + (seg.endY - seg.startY) ** 2,
    );
    totalHeight += segLen;
    let nextChain: BranchNode | null = null;
    for (const c of seg.children) {
      if (c.depth === 0) { nextChain = c; break; }
    }
    seg = nextChain;
  }

  // Second pass: find closest
  seg = root;
  cumHeight = 0;
  while (seg) {
    const segLen = Math.sqrt(
      (seg.endX - seg.startX) ** 2 + (seg.endY - seg.startY) ** 2,
    );
    const { dist, t } = distToSegment(
      plantX, plantY,
      seg.startX, seg.startY,
      seg.endX, seg.endY,
    );
    if (dist < bestDist) {
      bestDist = dist;
      bestFrac = totalHeight > 0 ? (cumHeight + segLen * t) / totalHeight : 0;
    }
    cumHeight += segLen;

    let nextChain: BranchNode | null = null;
    for (const c of seg.children) {
      if (c.depth === 0) { nextChain = c; break; }
    }
    seg = nextChain;
  }

  if (bestDist === Infinity) return null;
  return {
    dist: bestDist,
    heightFraction: bestFrac,
    isTop: bestFrac > (1 - TRUNK_TOP_ZONE),
  };
}

/**
 * Find the closest manual branch to a click point.
 * Checks if the click is near any existing manual branch tip for extension.
 */
function findClosestManualBranch(
  plant: SpeciesInstance,
  plantX: number,
  plantY: number,
  trunkHeight: number,
): { branchId: number; dist: number } | null {
  let bestDist = Infinity;
  let bestId = -1;

  for (const mb of plant.manualBranches) {
    // Approximate branch tip position
    const spawnY = -(mb.heightFraction * trunkHeight);
    const tipX = Math.cos(mb.angle) * mb.length;
    const tipY = spawnY + Math.sin(mb.angle) * mb.length;
    const dist = Math.sqrt((plantX - tipX) ** 2 + (plantY - tipY) ** 2);
    if (dist < bestDist) {
      bestDist = dist;
      bestId = mb.id;
    }
  }

  if (bestId < 0) return null;
  return { branchId: bestId, dist: bestDist };
}

/**
 * Find the closest manual root to a click point.
 */
function findClosestManualRoot(
  plant: SpeciesInstance,
  plantX: number,
  plantY: number,
  rootDepth: number,
): { rootId: number; dist: number } | null {
  let bestDist = Infinity;
  let bestId = -1;

  for (const mr of plant.manualRoots) {
    const spawnY = mr.depthFraction * rootDepth;
    const tipX = Math.cos(mr.angle) * mr.length;
    const tipY = spawnY + Math.sin(mr.angle) * mr.length;
    const dist = Math.sqrt((plantX - tipX) ** 2 + (plantY - tipY) ** 2);
    if (dist < bestDist) {
      bestDist = dist;
      bestId = mr.id;
    }
  }

  if (bestId < 0) return null;
  return { rootId: bestId, dist: bestDist };
}

/**
 * Determine what growth action a click in the AIR view would trigger.
 */
export function hitTestShoot(
  pixelX: number,
  pixelY: number,
  plant: SpeciesInstance,
  result: PlantRenderResult,
): HitResult | null {
  const { x: plantX, y: plantY } = pixelToPlant(
    pixelX, pixelY,
    result.airOffsetX, result.airOffsetY,
    result.scale,
  );

  const hitRadiusM = HIT_RADIUS_PX / result.scale;

  // Check closest trunk segment
  const trunkHit = findClosestTrunkSegment(result.shoot.root, plantX, plantY);

  // Check closest existing manual branch (for extension)
  const branchHit = findClosestManualBranch(plant, plantX, plantY, plant.height);

  // Prefer extending an existing branch if close enough
  if (branchHit && branchHit.dist < hitRadiusM) {
    return {
      action: { type: 'extend_branch', branchId: branchHit.branchId },
      cost: COST_EXTEND_BRANCH,
      label: `Extend branch (${COST_EXTEND_BRANCH} NRG)`,
      plantX, plantY,
    };
  }

  if (trunkHit && trunkHit.dist < hitRadiusM) {
    if (trunkHit.isTop) {
      return {
        action: { type: 'grow_taller' },
        cost: COST_GROW_TALLER,
        label: `Grow taller (${COST_GROW_TALLER} NRG)`,
        plantX, plantY,
      };
    }
    // Sprout new branch
    const side: -1 | 1 = plantX < 0 ? -1 : 1;
    return {
      action: { type: 'sprout_branch', heightFraction: trunkHit.heightFraction, side },
      cost: COST_SPROUT_BRANCH,
      label: `New branch (${COST_SPROUT_BRANCH} NRG)`,
      plantX, plantY,
    };
  }

  return null;
}

/**
 * Determine what growth action a click in the SOIL view would trigger.
 */
export function hitTestRoots(
  pixelX: number,
  pixelY: number,
  plant: SpeciesInstance,
  result: PlantRenderResult,
): HitResult | null {
  const { x: plantX, y: plantY } = pixelToPlant(
    pixelX, pixelY,
    result.soilOffsetX, result.soilOffsetY,
    result.scale,
  );

  const hitRadiusM = HIT_RADIUS_PX / result.scale;

  // Check closest taproot segment
  const tapHit = findClosestTrunkSegment(result.roots.root, plantX, plantY);

  // Check closest existing manual root (for extension)
  const rootHit = findClosestManualRoot(plant, plantX, plantY, plant.rootDepth);

  // Prefer extending an existing root if close enough
  if (rootHit && rootHit.dist < hitRadiusM) {
    return {
      action: { type: 'extend_lateral', rootId: rootHit.rootId },
      cost: COST_EXTEND_LATERAL,
      label: `Extend root (${COST_EXTEND_LATERAL} NRG)`,
      plantX, plantY,
    };
  }

  if (tapHit && tapHit.dist < hitRadiusM) {
    // Check if near the bottom (grow deeper)
    if (tapHit.heightFraction > (1 - TAP_BOTTOM_ZONE)) {
      return {
        action: { type: 'grow_deeper' },
        cost: COST_GROW_DEEPER,
        label: `Grow deeper (${COST_GROW_DEEPER} NRG)`,
        plantX, plantY,
      };
    }
    // Sprout new lateral
    const side: -1 | 1 = plantX < 0 ? -1 : 1;
    return {
      action: { type: 'sprout_lateral', depthFraction: tapHit.heightFraction, side },
      cost: COST_SPROUT_LATERAL,
      label: `New root (${COST_SPROUT_LATERAL} NRG)`,
      plantX, plantY,
    };
  }

  return null;
}

let _nextBranchId = 1;
let _nextRootId = 1;

/**
 * Execute a growth action on the plant, spending energy.
 * Returns true if the action was performed.
 */
export function executeGrowthAction(
  action: GrowthAction,
  cost: number,
  plant: SpeciesInstance,
): boolean {
  if (!action) return false;
  if (plant.energy < cost) return false;

  plant.energy -= cost;

  switch (action.type) {
    case 'sprout_branch': {
      const baseAngle = action.side === 1
        ? -Math.PI / 2 + 0.5  // Right side
        : -Math.PI / 2 - 0.5; // Left side
      const mb: ManualBranch = {
        id: _nextBranchId++,
        heightFraction: action.heightFraction,
        side: action.side,
        length: NEW_BRANCH_LENGTH,
        angle: baseAngle,
        seed: Math.floor(Math.random() * 2147483647),
      };
      plant.manualBranches.push(mb);
      // Side effect: new branch adds leaves
      plant.leafArea += 0.02;
      plant.biomass += 0.005;
      break;
    }

    case 'extend_branch': {
      const branch = plant.manualBranches.find(b => b.id === action.branchId);
      if (branch) {
        branch.length += BRANCH_EXTEND;
        plant.leafArea += 0.01;
        plant.biomass += 0.003;
      }
      break;
    }

    case 'grow_taller':
      plant.height += HEIGHT_GROW;
      plant.trunkRadius = Math.max(plant.trunkRadius, plant.height * 0.002 + 0.003);
      plant.biomass += 0.01;
      break;

    case 'sprout_lateral': {
      const baseAngle = action.side === 1
        ? Math.PI * 0.15   // Right side, slightly downward
        : Math.PI * 0.85;  // Left side, slightly downward
      const mr: ManualRoot = {
        id: _nextRootId++,
        depthFraction: action.depthFraction,
        side: action.side,
        length: NEW_ROOT_LENGTH,
        angle: baseAngle,
        seed: Math.floor(Math.random() * 2147483647),
      };
      plant.manualRoots.push(mr);
      plant.biomass += 0.003;
      break;
    }

    case 'extend_lateral': {
      const root = plant.manualRoots.find(r => r.id === action.rootId);
      if (root) {
        root.length += ROOT_EXTEND;
        plant.biomass += 0.002;
      }
      break;
    }

    case 'grow_deeper':
      plant.rootDepth += ROOT_DEPTH_GROW;
      plant.biomass += 0.005;
      break;
  }

  return true;
}

/** Get the energy cost for a given action type. */
export function getActionCost(action: GrowthAction): number {
  if (!action) return 0;
  switch (action.type) {
    case 'sprout_branch': return COST_SPROUT_BRANCH;
    case 'extend_branch': return COST_EXTEND_BRANCH;
    case 'grow_taller': return COST_GROW_TALLER;
    case 'sprout_lateral': return COST_SPROUT_LATERAL;
    case 'extend_lateral': return COST_EXTEND_LATERAL;
    case 'grow_deeper': return COST_GROW_DEEPER;
  }
}
