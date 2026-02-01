/**
 * src/core/data/traits.ts
 * Defines the building blocks of the species.
 */

export type StatKey =
  | 'root_growth_speed'
  | 'photosynthesis_eff'
  | 'drought_resistance'
  | 'toxicity'
  | 'seed_dispersal_range';

export interface TraitModifier {
  stat: StatKey;
  value: number; // e.g., 0.1 for +10%
  operator: 'multiply' | 'add';
}

export interface Trait {
  id: string;
  name: string;
  description: string;
  cost: number; // DNA points
  modifiers: TraitModifier[];
  prerequisites: string[]; // IDs of parents in the tree
  category: 'Roots' | 'Leaves' | 'Reproduction' | 'Defense';
}

export const TRAIT_DATABASE: Record<string, Trait> = {
  BASE_ROOTS: {
    id: 'base_roots',
    name: 'Taproot',
    description: 'Basic root system.',
    cost: 0,
    modifiers: [{ stat: 'root_growth_speed', value: 1.0, operator: 'add' }],
    prerequisites: [],
    category: 'Roots',
  },
  DEEP_ROOTS: {
    id: 'deep_roots',
    name: 'Deep Taproot',
    description: 'Allows access to deep water tables.',
    cost: 15,
    modifiers: [{ stat: 'drought_resistance', value: 0.5, operator: 'add' }],
    prerequisites: ['base_roots'],
    category: 'Roots',
  },
  WAXY_LEAVES: {
    id: 'waxy_leaves',
    name: 'Cuticle Wax',
    description: 'Reduces water loss by evaporation.',
    cost: 25,
    modifiers: [{ stat: 'drought_resistance', value: 0.2, operator: 'add' }],
    prerequisites: ['base_roots'],
    category: 'Leaves',
  },
};

export interface SpeciesGenome {
  name: string;
  color: number; // Visual phenotype
  dnaPoints: number; // Currency for purchasing traits
  activeTraits: Set<string>; // IDs of unlocked traits

  // Computed stats (cached for performance, recalculated on trait change)
  stats: Record<StatKey, number>;
}

/** Base stats before any traits are applied */
export const BASE_STATS: Record<StatKey, number> = {
  root_growth_speed: 0,
  photosynthesis_eff: 1.0,
  drought_resistance: 0,
  toxicity: 0,
  seed_dispersal_range: 1,
};

/** Recompute cached stats from active traits */
export function computeStats(genome: SpeciesGenome): Record<StatKey, number> {
  const result = { ...BASE_STATS };

  for (const traitId of genome.activeTraits) {
    const trait = TRAIT_DATABASE[traitId];
    if (!trait) continue;

    for (const mod of trait.modifiers) {
      if (mod.operator === 'add') {
        result[mod.stat] += mod.value;
      } else {
        result[mod.stat] *= mod.value;
      }
    }
  }

  return result;
}
