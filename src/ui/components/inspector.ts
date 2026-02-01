/**
 * Inspector HUD — live data overlays on Air, Soil, and Evolution quadrants.
 * Air panel: atmosphere scan + native fauna list.
 * Soil panel: substrate scan with CSS progress bars for NPK/moisture.
 * Bio panel (Q4): plant biology scan — vitals, metabolism, morphology.
 */

import { state } from '../../core/state';
import { BIOMES } from '../../core/data/biomes';
import { BIOTA_DB } from '../../core/data/biota';
import { SOIL_TYPES } from '../../core/data/soil';
import { TRAIT_DATABASE } from '../../core/data/traits';
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

  // Biology scan panel — lives in Q4 right column (created by evolution.ts)
  const bioInfo = document.createElement('div');
  bioInfo.style.cssText =
    'color:#e0e0e0;font-family:monospace;font-size:12px;' +
    'background:rgba(0,0,0,0.75);padding:10px;' +
    'border-radius:4px;line-height:1.7;';

  // Defer append until Q4 columns exist (evolution.ts runs first in main.ts)
  const bioTarget = document.getElementById('q4-bio');
  if (bioTarget) {
    bioTarget.appendChild(bioInfo);
  } else {
    layout.evolutionUI.appendChild(bioInfo);
  }

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

      if (biome.nativeBiota.length > 0) {
        const faunaItems = biome.nativeBiota.map((entry) => {
          const def = findBiota(entry.biotaId);
          const name = def?.name ?? entry.biotaId;
          const type = def?.type ?? '?';
          return `<span style="color:#aad">${name}</span> <span style="color:#666">(${type})</span>`;
        });
        faunaHtml =
          '<hr style="border-color:#555;margin:4px 0">' +
          '<b>NATIVE FAUNA</b><br>' +
          faunaItems.join('<br>');
      }
    }

    const weatherLabel = climate.isRaining
      ? 'RAIN'
      : climate.humidity > 0.6
        ? 'OVERCAST'
        : 'CLEAR';

    airInfo.innerHTML = [
      '<b>ATMOSPHERE SCAN</b>',
      `Year ${climate.year} — ${climate.season} (Day ${climate.dayOfYear})`,
      `Weather: ${weatherLabel}`,
      `Global Temp: ${climate.temperature.toFixed(1)}°C`,
      `Sunlight: ${(climate.sunlight * 100).toFixed(0)}%`,
      '<hr style="border-color:#555;margin:4px 0">',
      '<b>LOCATION</b>',
      `Biome: ${biomeName}`,
      `Local Temp: ${localTemp.toFixed(1)}°C`,
      faunaHtml,
    ].join('<br>');

    // --- SOIL PANEL (substrate only) ---
    if (selection) {
      const cell = grid[selection.y][selection.x];
      const soil = findSoil(cell.soilId);

      soilInfo.innerHTML = [
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
      ].join('<br>');
    } else {
      soilInfo.innerHTML = 'NO SELECTION';
    }

    // --- BIOLOGY SCAN (Q4 panel) ---
    if (selection) {
      const cell = grid[selection.y][selection.x];
      if (cell.plant) {
        const p = cell.plant;

        const traitNames = Array.from(state.species.activeTraits)
          .map((id) => {
            const key = id.toUpperCase();
            return TRAIT_DATABASE[key]?.name ?? id;
          })
          .join(', ');

        const netEnergy = p._dbgPhotosynthesis - p._dbgRespiration;
        const netSign = netEnergy >= 0 ? '+' : '';
        const netColor = netEnergy >= 0 ? '#4caf50' : '#f44336';

        bioInfo.innerHTML = [
          '<b>BIOLOGY SCAN</b>',
          `Genetics: <span style="color:#f8d348">${traitNames || 'None'}</span>`,
          '',
          '<b>VITALS</b>',
          bar('HP', p.health, '#f44336'),
          bar('NRG', Math.min(p.energy / 80, 1), '#f8d348'),
          `Biomass: ${(p.biomass * 1000).toFixed(0)}g | Age: ${p.age} ticks`,
          '',
          '<b>METABOLISM</b>',
          `Photo: <span style="color:#4caf50">+${p._dbgPhotosynthesis.toFixed(3)}</span>/tick`,
          `Resp: <span style="color:#f44336">-${p._dbgRespiration.toFixed(3)}</span>/tick`,
          `Net: <span style="color:${netColor}">${netSign}${netEnergy.toFixed(3)}</span>/tick`,
          '',
          '<b>MORPHOLOGY</b>',
          `Height: ${p.height.toFixed(2)}m | Trunk: ${(p.trunkRadius * 100).toFixed(1)}cm`,
          `Roots: ${p.rootDepth.toFixed(2)}m | Leaves: ${p.leafArea.toFixed(3)}m²`,
          `Branches: ${p.branchCount}`,
          p.flowering > 0
            ? `Flowering: ${(p.flowering * 100).toFixed(0)}%`
            : '',
          p.fruit > 0 ? `Fruit: ${(p.fruit * 100).toFixed(0)}%` : '',
        ].join('<br>');
      } else {
        bioInfo.innerHTML = '<b>BIOLOGY SCAN</b><br>No plant selected';
      }
    } else {
      bioInfo.innerHTML = '<b>BIOLOGY SCAN</b><br>No selection';
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
