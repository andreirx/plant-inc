/**
 * src/core/data/soil.ts
 * Defines the substrate mechanics.
 */

export interface NutrientProfile {
  nitrogen: number;   // 0.0 - 1.0 (Leaf growth)
  phosphorus: number; // 0.0 - 1.0 (Root/Flower growth)
  potassium: number;  // 0.0 - 1.0 (Immunity/Sturdiness)
}

export interface SoilType {
  id: string;
  name: string;
  color: number; // Hex for the minimap

  // Physics
  waterRetention: number; // 0.0 = Sand (drains fast), 1.0 = Clay (holds water)
  density: number;        // Affects root penetration cost. Higher = harder.
  diffusionRate: number;  // How fast nutrients move to neighbor tiles

  // Chemistry
  baseNutrients: NutrientProfile;
}

export const SOIL_TYPES: Record<string, SoilType> = {
  SANDY: {
    id: 'sandy',
    name: 'Sandy Loam',
    color: 0xe6c288,
    waterRetention: 0.2,
    density: 0.3,
    diffusionRate: 0.8,
    baseNutrients: { nitrogen: 0.1, phosphorus: 0.2, potassium: 0.4 },
  },
  CLAY: {
    id: 'clay',
    name: 'Dense Clay',
    color: 0x8b5a2b,
    waterRetention: 0.9,
    density: 0.9,
    diffusionRate: 0.1,
    baseNutrients: { nitrogen: 0.4, phosphorus: 0.5, potassium: 0.6 },
  },
  SILT: {
    id: 'silt',
    name: 'River Silt',
    color: 0x5d4037,
    waterRetention: 0.6,
    density: 0.5,
    diffusionRate: 0.4,
    baseNutrients: { nitrogen: 0.8, phosphorus: 0.6, potassium: 0.3 },
  },
};
