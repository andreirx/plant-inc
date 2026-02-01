/**
 * Inspector HUD — live data overlays on Air and Soil quadrants.
 * Reads from state.selection to show context-sensitive info.
 */

import { state } from '../../core/state';
import { BIOMES } from '../../core/data/biomes';
import { SOIL_TYPES } from '../../core/data/soil';
import { type QuadrantElements } from '../layout';

const PANEL_STYLE =
  'position:absolute;color:#e0e0e0;font-family:monospace;font-size:12px;' +
  'background:rgba(0,0,0,0.7);padding:10px;pointer-events:none;' +
  'border-radius:4px;line-height:1.7;';

export function initInspector(layout: QuadrantElements): void {
  // Air panel — top-left quadrant, top-left corner
  const airInfo = document.createElement('div');
  airInfo.style.cssText = PANEL_STYLE + 'top:10px;left:10px;';
  layout.airView.appendChild(airInfo);

  // Soil panel — bottom-left quadrant, bottom-left corner
  const soilInfo = document.createElement('div');
  soilInfo.style.cssText = PANEL_STYLE + 'bottom:10px;left:10px;';
  layout.soilView.appendChild(soilInfo);

  function update(): void {
    const { climate, selection, grid } = state;

    // --- AIR / WEATHER PANEL ---
    let biomeName = '---';
    let localTemp = 0;

    if (selection) {
      const cell = grid[selection.y][selection.x];
      const biome = BIOMES[cell.biomeId.toUpperCase()] ?? BIOMES.TEMPERATE_FOREST;
      biomeName = biome.name;
      localTemp = climate.temperature + biome.climateModifier.tempOffset;
    }

    const weatherLabel = climate.humidity > 0.8 ? 'RAIN' : climate.humidity > 0.6 ? 'OVERCAST' : 'CLEAR';

    airInfo.innerHTML = [
      '<b>ATMOSPHERE SCAN</b>',
      `Season: ${climate.season} (Day ${climate.dayOfYear})`,
      `Weather: ${weatherLabel}`,
      `Global Temp: ${climate.temperature.toFixed(1)}°C`,
      `Sunlight: ${(climate.sunlight * 100).toFixed(0)}%`,
      '<hr style="border-color:#555;margin:4px 0">',
      '<b>LOCATION</b>',
      `Biome: ${biomeName}`,
      `Local Temp: ${localTemp.toFixed(1)}°C`,
    ].join('<br>');

    // --- SOIL PANEL ---
    if (selection) {
      const cell = grid[selection.y][selection.x];
      const soil = findSoil(cell.soilId);

      const lines = [
        '<b>SUBSTRATE SCAN</b>',
        `Type: ${soil?.name ?? cell.soilId}`,
        `Water Retention: ${((soil?.waterRetention ?? 0) * 100).toFixed(0)}%`,
        `Density: ${((soil?.density ?? 0) * 100).toFixed(0)}%`,
        '',
        '<b>NUTRIENTS (N-P-K)</b>',
        `N: ${(cell.nutrients.nitrogen * 100).toFixed(0)}%`,
        `P: ${(cell.nutrients.phosphorus * 100).toFixed(0)}%`,
        `K: ${(cell.nutrients.potassium * 100).toFixed(0)}%`,
        '',
        '<b>MOISTURE</b>',
        `Saturation: ${(cell.moisture * 100).toFixed(0)}%`,
      ];

      if (cell.plant) {
        lines.push(
          '',
          '<b>PLANT</b>',
          `Health: ${(cell.plant.health * 100).toFixed(0)}%`,
          `Biomass: ${cell.plant.biomass.toFixed(2)}`,
          `Age: ${cell.plant.age} ticks`,
        );
      }

      soilInfo.innerHTML = lines.join('<br>');
    } else {
      soilInfo.innerHTML = 'NO SELECTION';
    }

    requestAnimationFrame(update);
  }

  update();
}

function findSoil(soilId: string): (typeof SOIL_TYPES)[string] | undefined {
  for (const soil of Object.values(SOIL_TYPES)) {
    if (soil.id === soilId) return soil;
  }
  return undefined;
}
