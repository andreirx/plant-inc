/**
 * src/core/data/biomes.ts
 * World generation recipes. A biome defines the soil mix,
 * native fauna, and climate offsets for a region of the map.
 */
import { SOIL_TYPES } from './soil';
import { BIOTA_DB } from './biota';

export interface Biome {
  id: string;
  name: string;

  // Soil generation weights (must sum to 1.0)
  soilComposition: {
    soilId: string;
    weight: number;
  }[];

  // What lives here?
  nativeBiota: {
    biotaId: string;
    spawnRate: number; // Probability per tick
  }[];

  climateModifier: {
    tempOffset: number;
    rainMultiplier: number;
  };
}

export const BIOMES: Record<string, Biome> = {
  TEMPERATE_FOREST: {
    id: 'temperate_forest',
    name: 'Ancient Woods',
    soilComposition: [
      { soilId: SOIL_TYPES.SILT.id, weight: 0.6 },
      { soilId: SOIL_TYPES.CLAY.id, weight: 0.3 },
      { soilId: SOIL_TYPES.SANDY.id, weight: 0.1 },
    ],
    nativeBiota: [
      { biotaId: BIOTA_DB.DEER.id, spawnRate: 0.01 },
      { biotaId: BIOTA_DB.BEE.id, spawnRate: 0.05 },
    ],
    climateModifier: { tempOffset: 0, rainMultiplier: 1.0 },
  },
  DESERT: {
    id: 'desert',
    name: 'Arid Dunes',
    soilComposition: [
      { soilId: SOIL_TYPES.SANDY.id, weight: 0.9 },
      { soilId: SOIL_TYPES.CLAY.id, weight: 0.1 },
    ],
    nativeBiota: [],
    climateModifier: { tempOffset: 15, rainMultiplier: 0.1 },
  },
};
