/**
 * localStorage persistence — save and restore full simulation state.
 *
 * The 256x256 grid is too large to store in full (~6MB+ JSON).
 * Strategy: save the world seed + only cells with plants or significantly
 * modified state. On load, regenerate terrain from seed, then overlay
 * the saved cell patches.
 */

import { type SimulationState, state } from './state';
import { computeStats } from './data/traits';
import { generateWorld } from './systems/mapGenerator';

const STORAGE_KEY = 'plant-inc-save';
let _savingDisabled = false;

/** A sparse cell patch — only cells with plants. */
interface CellPatch {
  x: number;
  y: number;
  moisture: number;
  nutrients: { nitrogen: number; phosphorus: number; potassium: number };
  plant: any;
}

/** Serialize state to a JSON-safe object (compact). */
function serialize(s: SimulationState): unknown {
  // Only save cells that have plants (vast majority are empty terrain)
  const patches: CellPatch[] = [];
  for (let y = 0; y < s.grid.length; y++) {
    const row = s.grid[y];
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      if (cell.plant) {
        patches.push({
          x, y,
          moisture: cell.moisture,
          nutrients: { ...cell.nutrients },
          plant: cell.plant,
        });
      }
    }
  }

  return {
    version: 2,
    tick: s.tick,
    seed: s.seed,
    timeScale: s.timeScale,
    climate: s.climate,
    selection: s.selection,
    species: {
      name: s.species.name,
      color: s.species.color,
      dnaPoints: s.species.dnaPoints,
      activeTraits: Array.from(s.species.activeTraits),
    },
    patches,
  };
}

/** Restore state from a parsed save object. Throws on incompatible data. */
function deserialize(data: Record<string, unknown>): void {
  if (data.version !== 2) throw new Error('Incompatible save version');

  const d = data as Record<string, any>;

  state.tick = d.tick;
  state.seed = d.seed;
  state.timeScale = d.timeScale ?? 1;
  state.paused = false;
  state.climate = d.climate;
  state.selection = d.selection;

  // Restore species — convert activeTraits array back to Set
  state.species.name = d.species.name;
  state.species.color = d.species.color;
  state.species.dnaPoints = d.species.dnaPoints;
  state.species.activeTraits = new Set(d.species.activeTraits);
  state.species.stats = computeStats(state.species);

  // Regenerate the full world from seed (terrain, biomes, soil)
  const world = generateWorld(state.seed);
  state.grid = world.grid;

  // Apply saved cell patches (plants + their modified soil state)
  const patches: CellPatch[] = d.patches ?? [];
  for (const p of patches) {
    if (p.y < state.grid.length && p.x < state.grid[0].length) {
      const cell = state.grid[p.y][p.x];
      cell.moisture = p.moisture;
      cell.nutrients = p.nutrients;
      if (p.plant) {
        cell.plant = {
          ...p.plant,
          manualBranches: p.plant.manualBranches ?? [],
          manualRoots: p.plant.manualRoots ?? [],
        };
      }
    }
  }
}

/** Save current state to localStorage. */
export function saveGame(): void {
  if (_savingDisabled) return;
  try {
    const json = JSON.stringify(serialize(state));
    localStorage.setItem(STORAGE_KEY, json);
  } catch (e) {
    console.warn('Save failed:', e);
  }
}

/**
 * Attempt to load saved state from localStorage.
 * Returns true if a save was successfully loaded, false otherwise.
 * On error, clears the corrupt save.
 */
export function loadGame(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    deserialize(data);
    return true;
  } catch (e) {
    console.warn('Failed to load save, starting new game:', e);
    localStorage.removeItem(STORAGE_KEY);
    return false;
  }
}

/** Clear saved state and reset to fresh game. Disables further saves to
 *  prevent beforeunload from re-saving the old state before reload. */
export function clearSave(): void {
  _savingDisabled = true;
  localStorage.removeItem(STORAGE_KEY);
}

/** Check if a saved game exists. */
export function hasSave(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}
