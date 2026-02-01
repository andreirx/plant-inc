/**
 * Climate system — updates global climate state each tick.
 *
 * Temperature follows a sinusoidal 365-day year cycle.
 * Sunlight follows a simple day/night curve within each day.
 * Season is derived from dayOfYear.
 */

import { TICKS_PER_DAY, DAYS_PER_YEAR } from '../constants';
import { type SimulationState } from '../state';

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
}

function classifySeason(dayOfYear: number): 'Spring' | 'Summer' | 'Autumn' | 'Winter' {
  if (dayOfYear < 91) return 'Spring';
  if (dayOfYear < 182) return 'Summer';
  if (dayOfYear < 273) return 'Autumn';
  return 'Winter';
}
