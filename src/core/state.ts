import { GRID_WIDTH, GRID_HEIGHT } from './constants';
import { type NutrientProfile } from './data/soil';
import { type SpeciesGenome, BASE_STATS, computeStats } from './data/traits';

export interface GridCell {
  soilId: string;
  moisture: number;
  nutrients: NutrientProfile;
  rootDensity: number;
}

export interface ClimateState {
  temperature: number;
  humidity: number;
  sunlight: number;
  windSpeed: number;
}

export interface SimulationState {
  tick: number;
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
        soilId: 'silt', // Default; overwritten by world generation
        moisture: 0.5,
        nutrients: { nitrogen: 0.3, phosphorus: 0.3, potassium: 0.3 },
        rootDensity: 0,
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
    paused: false,
    grid: createGrid(GRID_WIDTH, GRID_HEIGHT),
    climate: {
      temperature: 20,
      humidity: 0.5,
      sunlight: 1.0,
      windSpeed: 0.2,
    },
    species: createDefaultSpecies(),
  };
}

/** Global simulation state singleton */
export const state: SimulationState = createInitialState();
