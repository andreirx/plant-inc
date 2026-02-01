/**
 * Plant archetypes — broad categories defining growth patterns,
 * environmental tolerances, and visual characteristics.
 *
 * Each archetype provides:
 * - Base stat modifiers applied to the genome
 * - Morphology ranges (growth rate multipliers, max dimensions)
 * - Reproduction strategy (maturity, seed count, dispersal)
 * - Preferred biomes
 * - Visual traits for procedural rendering
 */

import { type StatKey } from './traits';

export interface PlantArchetype {
  id: string;
  name: string;
  description: string;

  /** Additive modifiers to BASE_STATS */
  baseStatMods: Partial<Record<StatKey, number>>;

  /** Growth behavior constraints */
  morphology: {
    maxHeight: number;        // Meters
    maxRootDepth: number;     // Meters
    heightGrowthMul: number;  // Multiplier on base height growth rate
    rootGrowthMul: number;    // Multiplier on base root growth rate
    leafGrowthMul: number;    // Multiplier on base leaf growth rate
    trunkGrowthMul: number;   // Multiplier on base trunk growth rate
  };

  /** Reproduction strategy */
  reproduction: {
    maturityAge: number;         // Ticks before flowering
    seedCount: number;           // Seeds per fruit cycle
    dispersalMethod: 'wind' | 'animal' | 'gravity' | 'water';
  };

  /** Biomes where this archetype thrives */
  preferredBiomes: string[];

  /** Visual rendering hints */
  visual: {
    colorRange: [number, number]; // [minHex, maxHex] for leaf color variation
    branchingPattern: 'sparse' | 'dense' | 'bushy' | 'single-stem';
    leafShape: 'broad' | 'needle' | 'succulent' | 'grass-blade';
  };
}

export const PLANT_ARCHETYPES: Record<string, PlantArchetype> = {
  GRASS: {
    id: 'grass',
    name: 'Grassland Pioneer',
    description: 'Fast-growing, low-height ground cover that spreads via rhizomes.',
    baseStatMods: {
      photosynthesis_eff: 0.2,
      root_growth_speed: 0.5,
    },
    morphology: {
      maxHeight: 0.5,
      maxRootDepth: 0.8,
      heightGrowthMul: 1.5,
      rootGrowthMul: 2.0,
      leafGrowthMul: 1.8,
      trunkGrowthMul: 0.3,
    },
    reproduction: {
      maturityAge: 80,
      seedCount: 50,
      dispersalMethod: 'wind',
    },
    preferredBiomes: ['temperate_forest', 'savanna'],
    visual: {
      colorRange: [0x6b8e23, 0x9acd32],
      branchingPattern: 'sparse',
      leafShape: 'grass-blade',
    },
  },

  SHRUB: {
    id: 'shrub',
    name: 'Hardy Shrub',
    description: 'Medium-height bushy plant with dense branching.',
    baseStatMods: {
      drought_resistance: 0.3,
    },
    morphology: {
      maxHeight: 3.0,
      maxRootDepth: 2.5,
      heightGrowthMul: 1.0,
      rootGrowthMul: 1.2,
      leafGrowthMul: 1.3,
      trunkGrowthMul: 0.8,
    },
    reproduction: {
      maturityAge: 120,
      seedCount: 20,
      dispersalMethod: 'animal',
    },
    preferredBiomes: ['temperate_forest', 'savanna', 'desert'],
    visual: {
      colorRange: [0x228b22, 0x32cd32],
      branchingPattern: 'bushy',
      leafShape: 'broad',
    },
  },

  TREE: {
    id: 'tree',
    name: 'Canopy Tree',
    description: 'Slow-growing giant with deep roots and a woody trunk.',
    baseStatMods: {
      root_growth_speed: 0.5,
      photosynthesis_eff: 0.1,
    },
    morphology: {
      maxHeight: 30.0,
      maxRootDepth: 15.0,
      heightGrowthMul: 0.7,
      rootGrowthMul: 0.8,
      leafGrowthMul: 1.0,
      trunkGrowthMul: 1.5,
    },
    reproduction: {
      maturityAge: 250,
      seedCount: 100,
      dispersalMethod: 'gravity',
    },
    preferredBiomes: ['temperate_forest', 'tropical_rainforest'],
    visual: {
      colorRange: [0x006400, 0x228b22],
      branchingPattern: 'dense',
      leafShape: 'broad',
    },
  },

  SUCCULENT: {
    id: 'succulent',
    name: 'Desert Succulent',
    description: 'Water-storing specialist with extreme drought tolerance.',
    baseStatMods: {
      drought_resistance: 0.8,
      photosynthesis_eff: -0.4,
      root_growth_speed: 0.3,
    },
    morphology: {
      maxHeight: 2.0,
      maxRootDepth: 5.0,
      heightGrowthMul: 0.4,
      rootGrowthMul: 1.5,
      leafGrowthMul: 0.3,
      trunkGrowthMul: 1.2,
    },
    reproduction: {
      maturityAge: 200,
      seedCount: 5,
      dispersalMethod: 'animal',
    },
    preferredBiomes: ['desert'],
    visual: {
      colorRange: [0x7cfc00, 0xadff2f],
      branchingPattern: 'sparse',
      leafShape: 'succulent',
    },
  },

  VINE: {
    id: 'vine',
    name: 'Climbing Vine',
    description: 'Fast vertical climber with thin flexible stems.',
    baseStatMods: {
      photosynthesis_eff: 0.3,
    },
    morphology: {
      maxHeight: 15.0,
      maxRootDepth: 1.5,
      heightGrowthMul: 2.5,
      rootGrowthMul: 0.5,
      leafGrowthMul: 1.5,
      trunkGrowthMul: 0.2,
    },
    reproduction: {
      maturityAge: 100,
      seedCount: 30,
      dispersalMethod: 'animal',
    },
    preferredBiomes: ['tropical_rainforest', 'wetland'],
    visual: {
      colorRange: [0x00cc00, 0x7fff00],
      branchingPattern: 'single-stem',
      leafShape: 'broad',
    },
  },
};
