/**
 * src/core/data/biota.ts
 * Ecosystem actors: animals, insects, fungi.
 */

export type EntityType = 'INSECT' | 'MAMMAL' | 'FUNGUS';
export type DietType = 'HERBIVORE' | 'NECTARIVORE' | 'DECOMPOSER';

export interface BiotaDefinition {
  id: string;
  name: string;
  type: EntityType;
  diet: DietType;

  // Trophic interactions
  biomassConsumption: number; // How much plant health they eat per tick
  pollinationChance: number;  // Chance to spread player seed
  toxicityThreshold: number;  // If plant toxicity > this, they die or avoid

  // Behavior
  preferredSeason: 'Spring' | 'Summer' | 'Autumn' | 'Winter' | 'Any';
}

export const BIOTA_DB: Record<string, BiotaDefinition> = {
  APHID: {
    id: 'aphid',
    name: 'Common Aphid',
    type: 'INSECT',
    diet: 'HERBIVORE',
    biomassConsumption: 0.05,
    pollinationChance: 0,
    toxicityThreshold: 0.2,
    preferredSeason: 'Spring',
  },
  BEE: {
    id: 'honeybee',
    name: 'Honey Bee',
    type: 'INSECT',
    diet: 'NECTARIVORE',
    biomassConsumption: 0,
    pollinationChance: 0.8,
    toxicityThreshold: 0.5,
    preferredSeason: 'Summer',
  },
  DEER: {
    id: 'deer',
    name: 'Forest Deer',
    type: 'MAMMAL',
    diet: 'HERBIVORE',
    biomassConsumption: 5.0,
    pollinationChance: 0.1,
    toxicityThreshold: 0.8,
    preferredSeason: 'Any',
  },
};
