/** Simulation tick rate in Hz */
export const TICK_RATE = 20;

/** Duration of one simulation tick in seconds */
export const TICK_DURATION = 1 / TICK_RATE;

/** Duration of one simulation tick in milliseconds */
export const TICK_DURATION_MS = 1000 / TICK_RATE;

/** Maximum accumulated time before dropping frames (prevents spiral of death) */
export const MAX_ACCUMULATOR_MS = TICK_DURATION_MS * 5;

/** Default world grid dimensions */
export const GRID_WIDTH = 64;
export const GRID_HEIGHT = 64;
