/**
 * Climate system — updates global climate state each tick.
 *
 * Temperature follows a sinusoidal 365-day year cycle.
 * Sunlight follows a simple day/night curve within each day.
 * Season is derived from dayOfYear.
 *
 * PRECIPITATION: Episodic rain events when humidity > 0.65.
 * EVAPORATION: Sun + heat dry out soil each tick.
 * DRAINAGE: Gravity pulls water through soil (sandy fast, clay slow).
 */

import { TICKS_PER_DAY, DAYS_PER_YEAR, GRID_WIDTH, GRID_HEIGHT } from '../constants';
import { type SimulationState } from '../state';
import { SOIL_TYPES } from '../data/soil';

const TWO_PI = Math.PI * 2;

// Base temperature at the equator (°C)
const BASE_TEMP = 20;
// Seasonal swing amplitude (±°C)
const SEASONAL_AMPLITUDE = 12;
// Phase offset: peak summer at day ~182 (mid-year)
const SEASONAL_PHASE = -Math.PI / 2;

/**
 * Call once per simulation tick to advance the climate.
 * Mutates state.climate in place.
 */
export function updateClimate(state: SimulationState): void {
  const { tick } = state;
  const climate = state.climate;

  // Derive calendar position
  const totalDays = tick / TICKS_PER_DAY;
  const dayOfYear = Math.floor(totalDays) % DAYS_PER_YEAR;
  const yearProgress = dayOfYear / DAYS_PER_YEAR; // 0..1

  // Track year rollover
  const previousDay = climate.dayOfYear;
  if (dayOfYear < previousDay && tick > 0) {
    climate.year++;
  }

  // Temperature: sinusoidal seasonal cycle
  climate.temperature = BASE_TEMP + SEASONAL_AMPLITUDE * Math.sin(yearProgress * TWO_PI + SEASONAL_PHASE);

  // Sunlight: peaks at midday within each game-day
  const dayFraction = totalDays - Math.floor(totalDays); // 0..1 within current day
  climate.sunlight = Math.max(0, Math.sin(dayFraction * Math.PI));

  // Humidity: loosely inverse to temperature (hotter = drier baseline)
  climate.humidity = 0.5 + 0.2 * Math.sin(yearProgress * TWO_PI + SEASONAL_PHASE + Math.PI);

  // Wind: gentle variation
  climate.windSpeed = 0.2 + 0.1 * Math.sin(yearProgress * TWO_PI * 3);

  // Season classification
  climate.dayOfYear = dayOfYear;
  climate.season = classifySeason(dayOfYear);

  // --- PRECIPITATION (episodic) ---
  // Humidity ranges 0.3–0.7. Rain fires probabilistically above 0.5.
  const rainChance = climate.humidity > 0.5
    ? (climate.humidity - 0.5) * 3.0  // 0..0.6 probability
    : 0;
  const rainRoll = ((tick * 2654435761) >>> 0) / 4294967296;
  climate.isRaining = rainRoll < rainChance;

  const grid = state.grid;

  if (climate.isRaining) {
    // Rain lands on soil directly — retention affects drainage, not absorption.
    const rainAmount = 0.05;
    for (let y = 0; y < GRID_HEIGHT; y++) {
      const row = grid[y];
      for (let x = 0; x < GRID_WIDTH; x++) {
        const cell = row[x];
        if (cell.biomeId === 'ocean') continue;
        cell.moisture = Math.min(1.0, cell.moisture + rainAmount);
      }
    }
  }

  // --- EVAPORATION & DRAINAGE ---
  // These must be weaker than rain or soil never stays wet.
  // At peak sun + warm day: evap = 0.0003 * 1.5 * 1.0 = 0.00045
  const evapBase = 0.0003 * (1 + climate.temperature / 40) * Math.max(climate.sunlight, 0.05);

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row = grid[y];
    for (let x = 0; x < GRID_WIDTH; x++) {
      const cell = row[x];
      if (cell.biomeId === 'ocean') continue;

      // Evaporation (sun + heat driven)
      cell.moisture -= evapBase;

      // Gravity drainage — sandy soil drains fast, clay holds water
      // Sandy (ret 0.2): 0.0008/tick. Clay (ret 0.8): 0.0002/tick.
      const drainage = getSoilDrainage(cell.soilId);
      cell.moisture -= drainage;

      cell.moisture = Math.max(0, cell.moisture);
    }
  }
}

function classifySeason(dayOfYear: number): 'Spring' | 'Summer' | 'Autumn' | 'Winter' {
  if (dayOfYear < 91) return 'Spring';
  if (dayOfYear < 182) return 'Summer';
  if (dayOfYear < 273) return 'Autumn';
  return 'Winter';
}

function getSoilRetention(soilId: string): number {
  for (const soil of Object.values(SOIL_TYPES)) {
    if (soil.id === soilId) return soil.waterRetention;
  }
  return 0.5;
}

/** Drainage rate per tick — inverse of retention. Sandy drains fast, clay slow. */
function getSoilDrainage(soilId: string): number {
  const retention = getSoilRetention(soilId);
  // High retention (clay ~0.8) → low drainage (0.0002)
  // Low retention (sandy ~0.2) → high drainage (0.0008)
  return 0.001 * (1 - retention);
}
