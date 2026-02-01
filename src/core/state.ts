import { GRID_WIDTH, GRID_HEIGHT } from './constants';

export interface GridCell {
  moisture: number;
  nutrients: number;
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
}

function createGrid(width: number, height: number): GridCell[][] {
  const grid: GridCell[][] = [];
  for (let y = 0; y < height; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < width; x++) {
      row.push({
        moisture: 0.5,
        nutrients: 0.3,
        rootDensity: 0,
      });
    }
    grid.push(row);
  }
  return grid;
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
  };
}

/** Global simulation state singleton */
export const state: SimulationState = createInitialState();
