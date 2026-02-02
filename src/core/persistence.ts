/**
 * localStorage persistence — save and restore full simulation state.
 *
 * Handles serialization of Set<string> (activeTraits) and
 * graceful fallback on corrupt/incompatible saves.
 */

import { type SimulationState, state } from './state';
import { computeStats } from './data/traits';

const STORAGE_KEY = 'plant-inc-save';

/** Serialize state to a JSON-safe object. */
function serialize(s: SimulationState): unknown {
  return {
    version: 1,
    tick: s.tick,
    seed: s.seed,
    paused: s.paused,
    timeScale: s.timeScale,
    climate: s.climate,
    selection: s.selection,
    species: {
      name: s.species.name,
      color: s.species.color,
      dnaPoints: s.species.dnaPoints,
      activeTraits: Array.from(s.species.activeTraits),
      stats: s.species.stats,
    },
    grid: s.grid.map((row) =>
      row.map((cell) => ({
        soilId: cell.soilId,
        biomeId: cell.biomeId,
        moisture: cell.moisture,
        nutrients: cell.nutrients,
        rootDensity: cell.rootDensity,
        plant: cell.plant,
      })),
    ),
  };
}

/** Restore state from a parsed save object. Throws on incompatible data. */
function deserialize(data: Record<string, unknown>): void {
  if (data.version !== 1) throw new Error('Incompatible save version');

  const d = data as Record<string, any>;

  state.tick = d.tick;
  state.seed = d.seed;
  state.paused = d.paused ?? false;
  state.timeScale = d.timeScale ?? 1;
  state.climate = d.climate;
  state.selection = d.selection;

  // Restore species — convert activeTraits array back to Set
  state.species.name = d.species.name;
  state.species.color = d.species.color;
  state.species.dnaPoints = d.species.dnaPoints;
  state.species.activeTraits = new Set(d.species.activeTraits);
  state.species.stats = computeStats(state.species);

  // Restore grid
  state.grid = d.grid.map((row: any[]) =>
    row.map((cell: any) => ({
      soilId: cell.soilId,
      biomeId: cell.biomeId,
      moisture: cell.moisture,
      nutrients: cell.nutrients,
      rootDensity: cell.rootDensity,
      plant: cell.plant
        ? {
            ...cell.plant,
            manualBranches: cell.plant.manualBranches ?? [],
            manualRoots: cell.plant.manualRoots ?? [],
          }
        : null,
    })),
  );
}

/** Save current state to localStorage. */
export function saveGame(): void {
  try {
    const json = JSON.stringify(serialize(state));
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // Storage full or unavailable — silently fail
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

/** Clear saved state and reset to fresh game. */
export function clearSave(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Check if a saved game exists. */
export function hasSave(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}
