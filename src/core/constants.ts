/** Simulation tick rate in Hz */
export const TICK_RATE = 20;

/** Duration of one simulation tick in seconds */
export const TICK_DURATION = 1 / TICK_RATE;

/** Duration of one simulation tick in milliseconds */
export const TICK_DURATION_MS = 1000 / TICK_RATE;

/** Maximum accumulated time before dropping frames (prevents spiral of death) */
export const MAX_ACCUMULATOR_MS = TICK_DURATION_MS * 5;

/** Default world grid dimensions */
export const GRID_WIDTH = 256;
export const GRID_HEIGHT = 256;

/** Number of simulation ticks in one in-game day */
export const TICKS_PER_DAY = TICK_RATE * 60; // 1 real minute = 1 game day

/** Number of in-game days in one year (season cycle) */
export const DAYS_PER_YEAR = 365;
