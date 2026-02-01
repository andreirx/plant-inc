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

// ── Photosynthesis ──────────────────────────────────────────────
const PHOTO_BASE = 0.8;          // Glucose produced per m² leaf at full sun, per tick
const STOMATA_THRESHOLD = 0.05;  // Below this water uptake, stomata close fully

// ── Uptake ──────────────────────────────────────────────────────
const WATER_UPTAKE_RATE = 0.08;  // Water units per meter root depth per tick
const NUTRIENT_UPTAKE_RATE = 0.005; // Fraction of soil nutrient absorbed per meter root

// ── Respiration / Maintenance ───────────────────────────────────
const RESPIRATION_RATE = 0.02;   // Energy cost per kg biomass per tick (cellular respiration)

// ── Growth ──────────────────────────────────────────────────────
const GROWTH_THRESHOLD = 5.0;    // Minimum energy surplus before meristems activate
const GROWTH_EFFICIENCY = 0.5;   // Fraction of invested energy that becomes biomass
const MAX_ENERGY = 80;           // Sugar storage cap (vacuole limit)

const HEIGHT_RATE = 0.004;       // Meters height per unit energy invested
const ROOT_RATE = 0.003;         // Meters root depth per unit energy invested
const LEAF_RATE = 0.006;         // m² leaf area per unit energy invested
const TRUNK_RATE = 0.0003;       // Trunk radius increase per unit energy invested
const BRANCH_INTERVAL = 0.4;    // New branch every 0.4m of height

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

      simulatePlant(cell.plant, cell, climate, stats);

      if (cell.plant && cell.plant.health <= 0) {
        cell.plant = null;
      }
    }
  }

  // Daily debug log for the selected plant
  if (state.selection && state.tick % TICKS_PER_DAY === 0) {
    const sel = state.selection;
    const cell = state.grid[sel.y][sel.x];
    if (cell.plant) {
      const p = cell.plant;
      const c = state.climate;
      console.log(
        `=== DAY ${c.dayOfYear} (Year ${c.year}) ===\n` +
        `ATMO: sun=${c.sunlight.toFixed(2)} temp=${c.temperature.toFixed(1)} humid=${c.humidity.toFixed(2)} rain=${c.isRaining}\n` +
        `SOIL: moisture=${cell.moisture.toFixed(3)} N=${cell.nutrients.nitrogen.toFixed(2)} P=${cell.nutrients.phosphorus.toFixed(2)} K=${cell.nutrients.potassium.toFixed(2)}\n` +
        `PLANT: age=${p.age} hp=${p.health.toFixed(3)} nrg=${p.energy.toFixed(3)} biomass=${p.biomass.toFixed(4)}\n` +
        `MORPH: h=${p.height.toFixed(4)} roots=${p.rootDepth.toFixed(4)} leaves=${p.leafArea.toFixed(5)} trunk=${p.trunkRadius.toFixed(5)}\n` +
        `METAB: photo=${p._dbgPhotosynthesis.toFixed(5)} resp=${p._dbgRespiration.toFixed(5)} net=${(p._dbgPhotosynthesis - p._dbgRespiration).toFixed(5)}`,
      );
    }
  }
}

function simulatePlant(
  plant: SpeciesInstance,
  soil: GridCell,
  climate: { sunlight: number; temperature: number; humidity: number },
  stats: Record<StatKey, number>,
): void {
  plant.age++;

  // ═══════════════════════════════════════════════════════════════
  // 1. UPTAKE — Roots absorb water and dissolved minerals via xylem
  // ═══════════════════════════════════════════════════════════════

  const rootEfficiency = 1 + stats.root_growth_speed * 0.3;

  // Water absorption: limited by soil moisture and root reach
  const waterAbsorbed = Math.min(
    soil.moisture,
    plant.rootDepth * WATER_UPTAKE_RATE * rootEfficiency * (1 + stats.drought_resistance * 0.5),
  );

  // Consume soil moisture (roots drink)
  soil.moisture = Math.max(0, soil.moisture - waterAbsorbed * 0.02);

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

  // Stomata factor: plants close stomata when water-stressed to conserve water
  // but this halts CO₂ intake and thus photosynthesis
  const waterFactor = waterAbsorbed > STOMATA_THRESHOLD
    ? Math.min(1.0, waterAbsorbed * 10)
    : 0.1; // Severely reduced — stomata nearly closed

  const effectiveLeafArea = plant.leafArea + 0.005; // Cotyledons provide minimal photosynthesis
  const sunEnergy = effectiveLeafArea * PHOTO_BASE * climate.sunlight * waterFactor;

  // Nitrogen boosts chlorophyll content → more efficient photosynthesis
  const nitrogenBonus = 1 + nAbsorbed * 5;

  const glucoseProduced = sunEnergy * stats.photosynthesis_eff * nitrogenBonus;

  // ═══════════════════════════════════════════════════════════════
  // 3. PHLOEM TRANSPORT — Distribute glucose, pay maintenance costs
  // ═══════════════════════════════════════════════════════════════

  // Cellular respiration: metabolically active tissue (leaves, root tips) costs more
  // than structural wood. Scale with active tissue, not total mass.
  const activeTissue = plant.leafArea * 10 + plant.rootDepth * 2;
  const structuralCost = plant.biomass * 0.002; // Wood barely respires
  const maintenanceCost = activeTissue * RESPIRATION_RATE + structuralCost;

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

  if (plant.energy > dynamicThreshold) {
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
    const investment = Math.min(surplus * 0.4, 5.0); // Cap per-tick investment

    // Determine growth strategy based on current bottleneck
    const waterLimited = soil.moisture < 0.2;
    const lightLimited = climate.sunlight < 0.3;

    if (waterLimited) {
      // Drought response: prioritize root growth
      // Phosphorus accelerates root development
      const pBonus = 1 + pAbsorbed * 3;
      plant.rootDepth += ROOT_RATE * investment * stats.root_growth_speed * pBonus;
      plant.leafArea += LEAF_RATE * investment * 0.1; // Minimal leaf growth
      plant.trunkRadius += TRUNK_RATE * investment * 0.3;
    } else if (lightLimited) {
      // Shade response: etiolation — grow tall, expand leaf canopy
      plant.height += HEIGHT_RATE * investment * 1.5;
      plant.leafArea += LEAF_RATE * investment * 1.5;
      plant.trunkRadius += TRUNK_RATE * investment;
    } else {
      // Balanced growth — nitrogen fuels vegetative expansion
      const nBonus = 1 + nAbsorbed * 3;
      plant.height += HEIGHT_RATE * investment * nBonus;
      plant.rootDepth += ROOT_RATE * investment * (1 + stats.root_growth_speed * 0.3);
      plant.leafArea += LEAF_RATE * investment * nBonus;
      plant.trunkRadius += TRUNK_RATE * investment * nBonus;
    }

    plant.energy -= investment;
    plant.biomass += investment * GROWTH_EFFICIENCY * 0.01;

    // Branch count derived from height
    plant.branchCount = Math.floor(plant.height / BRANCH_INTERVAL);
  }

  // ═══════════════════════════════════════════════════════════════
  // 5. REPRODUCTION — Flowering → Fruiting when mature
  // ═══════════════════════════════════════════════════════════════

  if (plant.age > MATURITY_AGE && plant.health > 0.7 && plant.energy > 10) {
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
