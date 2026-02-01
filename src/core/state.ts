import { GRID_WIDTH, GRID_HEIGHT } from './constants';
import { type NutrientProfile } from './data/soil';
import { type SpeciesGenome, BASE_STATS, computeStats } from './data/traits';

export interface SpeciesInstance {
  genomeId: string;
  age: number;          // Ticks alive
  health: number;       // 0.0 (dead) - 1.0 (thriving)
  energy: number;       // Stored sugar (glucose) from photosynthesis
  biomass: number;      // Total dry mass (kg) — cost of living scales with this

  // Morphology — the physical body
  height: number;       // Meters — access to sunlight, shading neighbors
  trunkRadius: number;  // Meters — structural stability
  rootDepth: number;    // Meters — access to deep water/nutrients
  leafArea: number;     // m² — photosynthesis capacity (chloroplast surface)
  branchCount: number;  // Number of branch segments (visual complexity)

  // Lifecycle
  flowering: number;    // 0.0 (none) -> 1.0 (full bloom)
  fruit: number;        // 0.0 (none) -> 1.0 (ripe, ready to seed)

  // Visual DNA — per-instance random variation for procedural rendering
  phenotypeSeed: number;

  // Debug: last-tick energy flow (written by growth system, read by inspector)
  _dbgPhotosynthesis: number;
  _dbgRespiration: number;
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
  temperature: number;
  humidity: number;
  sunlight: number;
  windSpeed: number;
  season: 'Spring' | 'Summer' | 'Autumn' | 'Winter';
  dayOfYear: number;
}

export interface SimulationState {
  tick: number;
  seed: number;
  paused: boolean;
  grid: GridCell[][];
  climate: ClimateState;
  species: SpeciesGenome;
  selection: { x: number; y: number } | null;
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
    name: 'Progenitor',
    color: 0xff0000,
    dnaPoints: 50,
    activeTraits: new Set(['base_roots']),
    stats: { ...BASE_STATS },
  };
  genome.stats = computeStats(genome);
  return genome;
}

/** Create a new plant instance — starts as a tiny seedling */
export function createPlantInstance(genomeId: string): SpeciesInstance {
  return {
    genomeId,
    age: 0,
    health: 1.0,
    energy: 50.0,       // Starch reserve from seed endosperm
    biomass: 0.02,      // 20 grams — a germinated seed
    height: 0.05,       // 5 cm seedling
    trunkRadius: 0.002, // 2 mm stem
    rootDepth: 0.05,    // 5 cm radicle
    leafArea: 0.005,    // Cotyledons — small but functional
    branchCount: 0,
    flowering: 0,
    fruit: 0,
    phenotypeSeed: Math.random(),
    _dbgPhotosynthesis: 0,
    _dbgRespiration: 0,
  };
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
    selection: { x: Math.floor(GRID_WIDTH / 2), y: Math.floor(GRID_HEIGHT / 2) },
  };
}

/** Global simulation state singleton */
export const state: SimulationState = createInitialState();
