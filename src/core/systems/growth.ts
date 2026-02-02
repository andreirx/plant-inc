/**
 * Growth system — biologically grounded plant simulation.
 *
 * BIOLOGY MODEL:
 * 1. UPTAKE (Roots → Xylem): Water + dissolved minerals (N, P, K) absorbed
 *    from soil. Rate depends on rootDepth and soil moisture/nutrients.
 *
 * 2. PHOTOSYNTHESIS (Leaves): Sunlight + Water + CO₂ → Glucose + O₂
 *    Rate = leafArea × sunlight × waterFactor × photosynthesis_eff.
 *    Stomata close under drought (waterFactor drops), halting sugar production.
 *
 * 3. PHLOEM TRANSPORT: Glucose (energy) distributed to all organs.
 *    Each organ has a maintenance cost proportional to its mass.
 *
 * 4. GROWTH (Meristems): Surplus energy → new biomass.
 *    Strategy adapts to bottleneck:
 *      - Water-limited → invest in roots
 *      - Light-limited  → invest in height & leaves
 *      - Balanced       → proportional growth of all organs
 *    Nitrogen accelerates vegetative growth (leaves, stems).
 *    Phosphorus accelerates root development and reproduction.
 *    Potassium strengthens health and stress resistance.
 *
 * 5. REPRODUCTION (Lifecycle):
 *    Mature plants (age + health threshold) flower, then fruit.
 *    Phosphorus availability accelerates flowering.
 *
 * 6. STRESS & DEATH:
 *    Energy deficit → health drain (starvation).
 *    Potassium provides stress resistance.
 *    Health ≤ 0 → plant dies and is removed.
 */

import { GRID_WIDTH, GRID_HEIGHT, TICKS_PER_DAY } from '../constants';
import { type SimulationState, type SpeciesInstance, type GridCell } from '../state';
import { type StatKey } from '../data/traits';
import { BIOMES } from '../data/biomes';

// ── Photosynthesis ──────────────────────────────────────────────
const PHOTO_BASE = 0.8;          // Glucose produced per m² leaf at full sun, per tick
const STOMATA_CLOSE = 0.002;     // Below this water uptake, stomata fully closed
const STOMATA_OPEN = 0.025;      // Above this water uptake, stomata fully open

// ── Uptake ──────────────────────────────────────────────────────
const WATER_UPTAKE_RATE = 0.08;  // Water units per meter root depth per tick
const NUTRIENT_UPTAKE_RATE = 0.005; // Fraction of soil nutrient absorbed per meter root

// ── Respiration / Maintenance ───────────────────────────────────
const RESPIRATION_RATE = 0.02;   // Energy cost per kg biomass per tick (cellular respiration)

// ── Growth ──────────────────────────────────────────────────────
const GROWTH_THRESHOLD = 3.0;    // Minimum energy surplus before meristems activate
const GROWTH_EFFICIENCY = 0.5;   // Fraction of invested energy that becomes biomass
const MAX_ENERGY = 80;           // Sugar storage cap (vacuole limit)

const HEIGHT_RATE = 0.0015;      // Meters height per unit energy invested (~3x slower)
const ROOT_RATE = 0.001;         // Meters root depth per unit energy invested
const LEAF_RATE = 0.002;         // m² leaf area per unit energy invested
const TRUNK_RATE = 0.000015;     // Trunk radius increase per unit energy invested
const BRANCH_INTERVAL = 0.3;    // New branch every 0.3m of height

// ── Growth limits (biological maximums) ──────────────────────────
const MAX_HEIGHT = 25;           // Meters — tallest temperate trees
const MAX_LEAF_AREA = 40;        // m² — canopy limit
const MAX_ROOT_DEPTH = 12;       // Meters — deepest tap roots
const MAX_TRUNK_RADIUS = 0.6;    // Meters — structural limit (1.2m diameter mature tree)

// ── Self-shading ─────────────────────────────────────────────────
const SELF_SHADING_ONSET = 2.0;  // m² leaf area before shading begins
const SELF_SHADING_HALF = 15.0;  // m² at which photosynthetic efficiency halves

// ── Lifecycle ───────────────────────────────────────────────────
const MATURITY_AGE = 150;        // Ticks before flowering possible
const FLOWER_RATE = 0.012;       // Flowering progress per tick
const FRUIT_RATE = 0.006;        // Fruiting progress per tick (after full bloom)
const FLOWER_ENERGY_COST = 0.5;  // Energy spent per tick on flowering
const FRUIT_ENERGY_COST = 1.0;   // Energy spent per tick on fruiting

// ── Health ──────────────────────────────────────────────────────
const HEALTH_RECOVERY = 0.003;   // Recovery per tick when well-fed
const STARVATION_DRAIN = 0.012;  // Health loss per tick when starving
const OCEAN_DAMAGE = 0.1;        // Health loss per tick for plants in water

// ── Seasonal phenology (temperature-driven, not calendar-driven) ──
const LEAF_DROP_TEMP = 10;              // °C local — below this, leaves start dropping
const DORMANCY_TEMP = 5;               // °C local — below this, full dormancy
// Leaf regrow happens whenever localTemp >= LEAF_DROP_TEMP (the else branch)
const AUTUMN_LEAF_DROP_RATE = 0.03;    // 3% of visibleLeafArea lost per day
const SPRING_LEAF_REGROW_RATE = 0.05;  // 5% regrown per day
const SPRING_REGROW_COST = 0.5;        // Energy per m² of leaf regenerated
const DORMANCY_RESPIRATION_MULT = 0.3; // 70% reduction during dormancy
const FRUIT_COOLDOWN_TICKS = 200;    // No flowering for this long after fruit drop
const LEAF_GREEN = 0x2d8a4e;
const LEAF_YELLOW_GREEN = 0x9acd32;
const LEAF_GOLDENROD = 0xdaa520;
const LEAF_ORANGE = 0xff8c00;
const LEAF_BROWN = 0x8b4513;

/** Soft diminishing-returns curve: ~1.0 until 60% of max, smooth taper to 0 at max.
 *  Uses smoothstep on the upper 40% range so growth feels natural. */
function softCap(current: number, max: number): number {
  const frac = Math.min(1, current / max);
  if (frac < 0.6) return 1.0;
  // Smoothstep from 1.0 at frac=0.6 to 0.0 at frac=1.0
  const t = (frac - 0.6) / 0.4; // 0..1
  return 1 - t * t * (3 - 2 * t);
}

export function updateGrowth(state: SimulationState): void {
  const { climate, species } = state;
  const stats = species.stats;

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row = state.grid[y];
    for (let x = 0; x < GRID_WIDTH; x++) {
      const cell = row[x];
      if (!cell.plant) continue;

      // Ocean tiles kill plants — they can't survive submerged
      if (cell.biomeId === 'ocean') {
        cell.plant.health -= OCEAN_DAMAGE;
        if (cell.plant.health <= 0) cell.plant = null;
        continue;
      }

      simulatePlant(cell.plant, cell, climate, stats, state);

      if (cell.plant && cell.plant.health <= 0) {
        cell.plant = null;
      }
    }
  }

}

function simulatePlant(
  plant: SpeciesInstance,
  soil: GridCell,
  climate: { sunlight: number; temperature: number; humidity: number; dayOfYear: number },
  stats: Record<StatKey, number>,
  state: SimulationState,
): void {
  plant.age++;

  // ═══════════════════════════════════════════════════════════════
  // 1. UPTAKE — Roots absorb water and dissolved minerals via xylem
  // ═══════════════════════════════════════════════════════════════

  const rootEfficiency = 1 + stats.root_growth_speed * 0.3;

  // Groundwater access: deep roots (> 0.3m) tap into the water table
  // This provides a moisture floor even when surface soil is bone-dry
  const groundwaterAccess = Math.max(0, plant.rootDepth - 0.3) * 0.15;
  const droughtBuffer = stats.drought_resistance * 0.1; // Trait adds passive water access
  const effectiveMoisture = Math.min(1.0, soil.moisture + groundwaterAccess + droughtBuffer);

  // Water absorption: limited by effective moisture and root reach
  const waterAbsorbed = Math.min(
    effectiveMoisture,
    plant.rootDepth * WATER_UPTAKE_RATE * rootEfficiency * (1 + stats.drought_resistance * 0.5),
  );

  // Consume soil moisture (roots drink) — only deplete surface moisture, not groundwater
  soil.moisture = Math.max(0, soil.moisture - Math.min(waterAbsorbed, soil.moisture) * 0.02);

  // Mineral absorption: proportional to root depth and soil concentration
  const nAbsorbed = soil.nutrients.nitrogen * plant.rootDepth * NUTRIENT_UPTAKE_RATE;
  const pAbsorbed = soil.nutrients.phosphorus * plant.rootDepth * NUTRIENT_UPTAKE_RATE;
  const kAbsorbed = soil.nutrients.potassium * plant.rootDepth * NUTRIENT_UPTAKE_RATE;

  // Slowly deplete soil nutrients (roots extract minerals)
  soil.nutrients.nitrogen = Math.max(0, soil.nutrients.nitrogen - nAbsorbed * 0.005);
  soil.nutrients.phosphorus = Math.max(0, soil.nutrients.phosphorus - pAbsorbed * 0.005);
  soil.nutrients.potassium = Math.max(0, soil.nutrients.potassium - kAbsorbed * 0.005);

  // ═══════════════════════════════════════════════════════════════
  // 2. PHOTOSYNTHESIS — Leaves convert sunlight + water + CO₂ → glucose
  // ═══════════════════════════════════════════════════════════════

  // Stomata factor: smooth ramp from closed (dry) to open (wet).
  // A seedling with 18cm roots absorbing 0.016 should get ~30% efficiency,
  // not be slammed to 10% by a hard threshold.
  let waterFactor: number;
  if (waterAbsorbed <= STOMATA_CLOSE) {
    waterFactor = 0.05; // Nearly closed — minimal CO₂ intake
  } else if (waterAbsorbed >= STOMATA_OPEN) {
    waterFactor = 1.0;  // Fully open
  } else {
    // Linear ramp between closed and open
    waterFactor = 0.05 + 0.95 * (waterAbsorbed - STOMATA_CLOSE) / (STOMATA_OPEN - STOMATA_CLOSE);
  }

  // Use visibleLeafArea for photosynthesis — dormant/deciduous trees have no functional leaves
  const effectiveLeafArea = plant.visibleLeafArea + 0.005; // Cotyledons provide minimal photosynthesis

  // Self-shading: large canopies shade their own lower leaves.
  // Follows a saturating curve — doubling leaf area does NOT double photosynthesis.
  // Uses Michaelis-Menten: effective = leafArea * halfPoint / (leafArea + halfPoint)
  let shadedLeafArea: number;
  if (effectiveLeafArea <= SELF_SHADING_ONSET) {
    shadedLeafArea = effectiveLeafArea; // Small canopy: no self-shading
  } else {
    // Beyond onset, diminishing returns via hyperbolic saturation
    shadedLeafArea = SELF_SHADING_ONSET +
      (effectiveLeafArea - SELF_SHADING_ONSET) * SELF_SHADING_HALF /
      (effectiveLeafArea - SELF_SHADING_ONSET + SELF_SHADING_HALF);
  }

  const sunEnergy = shadedLeafArea * PHOTO_BASE * climate.sunlight * waterFactor;

  // Nitrogen boosts chlorophyll content → more efficient photosynthesis
  const nitrogenBonus = 1 + nAbsorbed * 5;

  // Hydraulic capacity: xylem cross-section limits water transport to canopy.
  // Capacity ∝ trunk_area / height. Thin tall trees can't supply enough water.
  // Factor is 1.0 when trunk is adequate, tapers to ~0.2 when severely undersized.
  const trunkArea = Math.PI * plant.trunkRadius * plant.trunkRadius;
  const hydraulicDemand = plant.height * 0.0003; // m² of xylem needed per meter height
  const hydraulicRatio = plant.height > 0.5
    ? Math.min(1.0, trunkArea / hydraulicDemand)
    : 1.0; // Seedlings don't have this constraint
  const hydraulicFactor = 0.2 + 0.8 * hydraulicRatio; // Floor at 20% efficiency

  const glucoseProduced = sunEnergy * stats.photosynthesis_eff * nitrogenBonus * hydraulicFactor;

  // ═══════════════════════════════════════════════════════════════
  // 3. PHLOEM TRANSPORT — Distribute glucose, pay maintenance costs
  // ═══════════════════════════════════════════════════════════════

  // Cellular respiration: living tissue (leaves, root tips, meristems) costs more
  // than structural wood. Use visibleLeafArea — dropped leaves don't respire.
  const livingTissue = plant.visibleLeafArea * 3 + plant.rootDepth * 0.5 + plant.height * 0.3;
  const structuralCost = plant.biomass * 0.001;
  const dormancyMult = plant.dormant ? DORMANCY_RESPIRATION_MULT : 1.0;
  const maintenanceCost = (livingTissue * RESPIRATION_RATE + structuralCost) * dormancyMult;

  // Debug: record energy flow for inspector
  plant._dbgPhotosynthesis = glucoseProduced;
  plant._dbgRespiration = maintenanceCost;

  // Energy balance
  plant.energy += glucoseProduced - maintenanceCost;
  plant.energy = Math.min(plant.energy, MAX_ENERGY);

  // ═══════════════════════════════════════════════════════════════
  // 4. GROWTH — Surplus energy invested into new tissue (meristems)
  // ═══════════════════════════════════════════════════════════════

  // Dynamic threshold: seedlings can grow with less surplus (biomass < 0.1 kg)
  const dynamicThreshold = Math.min(GROWTH_THRESHOLD, plant.biomass * 50 + 1);

  // Dormant plants do not grow — meristems are inactive
  if (!plant.dormant && plant.energy > dynamicThreshold) {
    // Seedlings MUST grow leaves first or they starve
    if (plant.leafArea < 0.01) {
      const leafInvestment = Math.min(plant.energy - dynamicThreshold, 2.0);
      plant.leafArea += LEAF_RATE * leafInvestment * 2.0;
      plant.rootDepth += ROOT_RATE * leafInvestment * 0.5;
      plant.energy -= leafInvestment;
      plant.biomass += leafInvestment * GROWTH_EFFICIENCY * 0.01;
    }

    // Investment budget: spend a fraction of surplus
    const surplus = plant.energy - dynamicThreshold;
    const investment = Math.min(surplus * 0.4, 8.0); // Cap per-tick investment

    // Nutrient limitation: low soil NPK throttles growth directly
    const nutrientFactor = Math.min(
      Math.min(soil.nutrients.nitrogen / 0.1, 1.0),     // Below 10% N → growth limited
      Math.min(soil.nutrients.phosphorus / 0.08, 1.0),   // Below 8% P → growth limited
    );

    // Diminishing returns: growth slows as plant approaches maximum size.
    const heightRoom = softCap(plant.height, MAX_HEIGHT);
    const leafRoom = softCap(plant.leafArea, MAX_LEAF_AREA);
    const rootRoom = softCap(plant.rootDepth, MAX_ROOT_DEPTH);
    const trunkRoom = softCap(plant.trunkRadius, MAX_TRUNK_RADIUS);

    // Structural constraint: height limited by trunk radius
    const structuralHeightLimit = plant.trunkRadius * 350;
    const structuralFactor = plant.height < structuralHeightLimit ? 1.0 :
      Math.max(0, 1 - (plant.height - structuralHeightLimit) / 2);

    const growthMod = nutrientFactor;

    const waterLimited = soil.moisture < 0.2;
    const lightLimited = climate.sunlight < 0.3;

    if (waterLimited) {
      const pBonus = 1 + pAbsorbed * 3;
      plant.rootDepth += ROOT_RATE * investment * stats.root_growth_speed * pBonus * rootRoom * growthMod;
      plant.height += HEIGHT_RATE * investment * 0.2 * heightRoom * structuralFactor * growthMod;
      plant.leafArea += LEAF_RATE * investment * 0.1 * leafRoom * growthMod;
      plant.trunkRadius += TRUNK_RATE * investment * 0.3 * trunkRoom * growthMod;
    } else if (lightLimited) {
      plant.height += HEIGHT_RATE * investment * 1.5 * heightRoom * structuralFactor * growthMod;
      plant.leafArea += LEAF_RATE * investment * 1.5 * leafRoom * growthMod;
      plant.trunkRadius += TRUNK_RATE * investment * trunkRoom * growthMod;
    } else {
      const nBonus = 1 + nAbsorbed * 3;
      plant.height += HEIGHT_RATE * investment * nBonus * heightRoom * structuralFactor * growthMod;
      plant.rootDepth += ROOT_RATE * investment * (1 + stats.root_growth_speed * 0.3) * rootRoom * growthMod;
      plant.leafArea += LEAF_RATE * investment * nBonus * leafRoom * growthMod;
      plant.trunkRadius += TRUNK_RATE * investment * nBonus * trunkRoom * growthMod;
    }

    plant.energy -= investment;
    plant.biomass += investment * GROWTH_EFFICIENCY * 0.01;

    // Branch count derived from height
    plant.branchCount = Math.floor(plant.height / BRANCH_INTERVAL);
  }

  // ═══════════════════════════════════════════════════════════════
  // 5. REPRODUCTION — Flowering → Fruiting when mature
  // ═══════════════════════════════════════════════════════════════

  const ticksSinceFruitDrop = state.tick - plant.lastFruitDrop;
  const fruitOnCooldown = plant.lastFruitDrop > 0 && ticksSinceFruitDrop < FRUIT_COOLDOWN_TICKS;

  if (!plant.dormant && !fruitOnCooldown &&
      plant.age > MATURITY_AGE && plant.health > 0.7 && plant.energy > 10) {
    if (plant.flowering < 1.0) {
      // Phosphorus accelerates flowering (real biology: P is key for reproduction)
      const flowerBoost = 1 + pAbsorbed * 5;
      plant.flowering = Math.min(1.0, plant.flowering + FLOWER_RATE * flowerBoost);
      plant.energy -= FLOWER_ENERGY_COST;
    } else if (plant.fruit < 1.0) {
      plant.fruit = Math.min(1.0, plant.fruit + FRUIT_RATE);
      plant.energy -= FRUIT_ENERGY_COST;
    }
  }

  // (5b: Flower senescence & fruit drop moved to dispersal.ts)

  // ═══════════════════════════════════════════════════════════════
  // 5c. SEASONAL PHENOLOGY — Temperature-driven deciduous cycle
  // ═══════════════════════════════════════════════════════════════
  // Uses LOCAL temperature (global + biome offset) so warm biomes
  // like savanna/tropical never go dormant, while tundra stays dormant longer.

  const biome = BIOMES[soil.biomeId.toUpperCase()];
  const localTemp = climate.temperature + (biome?.climateModifier.tempOffset ?? 0);

  if (localTemp < DORMANCY_TEMP) {
    // ── COLD: full dormancy ──
    plant.dormant = true;
    plant.visibleLeafArea = Math.max(0, plant.visibleLeafArea * (1 - 0.01 / TICKS_PER_DAY));
    plant.leafColor = LEAF_BROWN;
    // Clear reproduction state
    plant.flowering = 0;
    plant.fruit = 0;

  } else if (localTemp < LEAF_DROP_TEMP) {
    // ── COOL: leaves change color and drop, but not fully dormant ──
    // Autumn-like behavior: gradual leaf loss and color change
    const chillFactor = 1 - (localTemp - DORMANCY_TEMP) / (LEAF_DROP_TEMP - DORMANCY_TEMP); // 1 at dormancy, 0 at drop temp
    const dropPerTick = AUTUMN_LEAF_DROP_RATE * (0.3 + 0.7 * chillFactor) / TICKS_PER_DAY;
    const dropped = plant.visibleLeafArea * dropPerTick;
    plant.visibleLeafArea = Math.max(0, plant.visibleLeafArea - dropped);

    // Dropped leaves return small nutrient to soil (decomposition)
    soil.nutrients.nitrogen = Math.min(1.0, soil.nutrients.nitrogen + dropped * 0.01);

    // Leaf color: interpolate from green toward brown based on chill
    plant.leafColor = lerpAutumnColor(chillFactor);

  } else {
    // ── WARM: break dormancy and regrow leaves ──
    if (plant.dormant) {
      plant.dormant = false;
    }

    // Regrow visibleLeafArea toward leafArea
    if (plant.visibleLeafArea < plant.leafArea) {
      const regrowPerTick = SPRING_LEAF_REGROW_RATE * plant.leafArea / TICKS_PER_DAY;
      const regrown = Math.min(regrowPerTick, plant.leafArea - plant.visibleLeafArea);
      plant.visibleLeafArea += regrown;
      // Leaf regrowth costs energy
      plant.energy -= regrown * SPRING_REGROW_COST;
    }
    plant.leafColor = LEAF_GREEN;
  }

  // Keep visibleLeafArea in sync: never exceed actual leafArea
  plant.visibleLeafArea = Math.min(plant.visibleLeafArea, plant.leafArea);

  // ═══════════════════════════════════════════════════════════════
  // 6. STRESS & HEALTH
  // ═══════════════════════════════════════════════════════════════

  if (plant.energy > 0) {
    // Potassium strengthens cell walls and disease resistance
    const kBonus = kAbsorbed * 0.005;
    plant.health = Math.min(1.0, plant.health + HEALTH_RECOVERY + kBonus);
  } else {
    // Starvation — plant cannibalizes tissue
    plant.health -= STARVATION_DRAIN;
    // Potassium provides some stress buffer
    plant.health += kAbsorbed * 0.003;
    plant.energy = 0;
  }
}

/** Interpolate through the autumn color palette based on progress 0..1 */
function lerpAutumnColor(progress: number): number {
  const colors = [LEAF_GREEN, LEAF_YELLOW_GREEN, LEAF_GOLDENROD, LEAF_ORANGE, LEAF_BROWN];
  const idx = progress * (colors.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, colors.length - 1);
  const t = idx - lo;
  return lerpColorChannels(colors[lo], colors[hi], t);
}

function lerpColorChannels(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
