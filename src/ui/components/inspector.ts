/**
 * Inspector HUD — live data overlays on Air and Soil quadrants.
 * Air panel: atmosphere scan + native fauna list.
 * Soil panel: substrate scan with CSS progress bars for NPK/moisture.
 */

import { state } from '../../core/state';
import { BIOMES } from '../../core/data/biomes';
import { BIOTA_DB } from '../../core/data/biota';
import { SOIL_TYPES } from '../../core/data/soil';
import { type QuadrantElements } from '../layout';

const PANEL_STYLE =
  'position:absolute;color:#e0e0e0;font-family:monospace;font-size:12px;' +
  'background:rgba(0,0,0,0.75);padding:10px;pointer-events:none;' +
  'border-radius:4px;line-height:1.7;min-width:180px;';

export function initInspector(layout: QuadrantElements): void {
  const airInfo = document.createElement('div');
  airInfo.style.cssText = PANEL_STYLE + 'top:10px;left:10px;';
  layout.airView.appendChild(airInfo);

  const soilInfo = document.createElement('div');
  soilInfo.style.cssText = PANEL_STYLE + 'bottom:10px;left:10px;';
  layout.soilView.appendChild(soilInfo);

  function update(): void {
    const { climate, selection, grid } = state;

    // --- AIR / WEATHER PANEL ---
    let biomeName = '---';
    let localTemp = 0;
    let faunaHtml = '';

    if (selection) {
      const cell = grid[selection.y][selection.x];
      const biome = BIOMES[cell.biomeId.toUpperCase()] ?? BIOMES.TEMPERATE_FOREST;
      biomeName = biome.name;
      localTemp = climate.temperature + biome.climateModifier.tempOffset;

      // Native fauna list
      if (biome.nativeBiota.length > 0) {
        const faunaItems = biome.nativeBiota.map((entry) => {
          const def = findBiota(entry.biotaId);
          const name = def?.name ?? entry.biotaId;
          const type = def?.type ?? '?';
          return `<span style="color:#aad">${name}</span> <span style="color:#666">(${type})</span>`;
        });
        faunaHtml = '<hr style="border-color:#555;margin:4px 0">' +
          '<b>NATIVE FAUNA</b><br>' + faunaItems.join('<br>');
      }
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
      faunaHtml,
    ].join('<br>');

    // --- SOIL PANEL ---
    if (selection) {
      const cell = grid[selection.y][selection.x];
      const soil = findSoil(cell.soilId);

      const lines = [
        '<b>SUBSTRATE SCAN</b>',
        `Type: ${soil?.name ?? cell.soilId}`,
        `Retention: ${((soil?.waterRetention ?? 0) * 100).toFixed(0)}% | Density: ${((soil?.density ?? 0) * 100).toFixed(0)}%`,
        '',
        '<b>NUTRIENTS</b>',
        bar('N', cell.nutrients.nitrogen, '#4caf50'),
        bar('P', cell.nutrients.phosphorus, '#ff9800'),
        bar('K', cell.nutrients.potassium, '#9c27b0'),
        '',
        '<b>MOISTURE</b>',
        bar('H₂O', cell.moisture, '#2196f3'),
      ];

      if (cell.plant) {
        lines.push(
          '',
          '<b>PLANT</b>',
          bar('HP', cell.plant.health, '#f44336'),
          `Biomass: ${cell.plant.biomass.toFixed(2)} | Age: ${cell.plant.age}`,
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

/** CSS progress bar — inline HTML */
function bar(label: string, value: number, color: string): string {
  const pct = Math.round(value * 100);
  return (
    `<div style="display:flex;align-items:center;gap:4px">` +
    `<span style="width:28px;text-align:right">${label}</span>` +
    `<div style="flex:1;height:10px;background:#1a1a2e;border-radius:2px;overflow:hidden">` +
    `<div style="width:${pct}%;height:100%;background:${color};transition:width 0.2s"></div>` +
    `</div>` +
    `<span style="width:32px;font-size:10px;color:#888">${pct}%</span>` +
    `</div>`
  );
}

function findSoil(soilId: string): (typeof SOIL_TYPES)[string] | undefined {
  for (const soil of Object.values(SOIL_TYPES)) {
    if (soil.id === soilId) return soil;
  }
  return undefined;
}

function findBiota(biotaId: string): (typeof BIOTA_DB)[string] | undefined {
  for (const b of Object.values(BIOTA_DB)) {
    if (b.id === biotaId) return b;
  }
  return undefined;
}
