import { GRID_WIDTH, GRID_HEIGHT } from './constants';
import { type NutrientProfile } from './data/soil';
import { type SpeciesGenome, BASE_STATS, computeStats } from './data/traits';

export interface SpeciesInstance {
  genomeId: string;
  age: number;     // Ticks since planted
  health: number;  // 0.0 (dead) - 1.0 (thriving)
  biomass: number; // Accumulated growth resource
}

export interface GridCell {
  soilId: string;
  biomeId: string;
  moisture: number;
  nutrients: NutrientProfile;
  rootDensity: number;
  plant: SpeciesInstance | null;
}

export interface ClimateState {
  temperature: number; // Global base temperature (varies by season)
  humidity: number;
  sunlight: number;    // 0.0 - 1.0, varies by day cycle
  windSpeed: number;
  season: 'Spring' | 'Summer' | 'Autumn' | 'Winter';
  dayOfYear: number;   // 0 - 364
}

export interface SimulationState {
  tick: number;
  seed: number;
  paused: boolean;
  grid: GridCell[][];
  climate: ClimateState;
  species: SpeciesGenome;
}

function createGrid(width: number, height: number): GridCell[][] {
  const grid: GridCell[][] = [];
  for (let y = 0; y < height; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < width; x++) {
      row.push({
        soilId: 'silt',
        biomeId: 'temperate_forest',
        moisture: 0.5,
        nutrients: { nitrogen: 0.3, phosphorus: 0.3, potassium: 0.3 },
        rootDensity: 0,
        plant: null,
      });
    }
    grid.push(row);
  }
  return grid;
}

function createDefaultSpecies(): SpeciesGenome {
  const genome: SpeciesGenome = {
    name: 'Seedling',
    color: 0x4caf50,
    activeTraits: new Set(['base_roots']),
    stats: { ...BASE_STATS },
  };
  genome.stats = computeStats(genome);
  return genome;
}

export function createInitialState(): SimulationState {
  return {
    tick: 0,
    seed: Math.floor(Math.random() * 2147483647),
    paused: false,
    grid: createGrid(GRID_WIDTH, GRID_HEIGHT),
    climate: {
      temperature: 20,
      humidity: 0.5,
      sunlight: 1.0,
      windSpeed: 0.2,
      season: 'Spring',
      dayOfYear: 0,
    },
    species: createDefaultSpecies(),
  };
}

/** Global simulation state singleton */
export const state: SimulationState = createInitialState();
