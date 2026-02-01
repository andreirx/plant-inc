/**
 * Evolution UI — interactive tech tree for spending DNA points on traits.
 * Renders in the bottom-right (Q4) quadrant.
 */

import { state } from '../../core/state';
import { TRAIT_DATABASE, computeStats } from '../../core/data/traits';
import { GRID_HEIGHT, GRID_WIDTH } from '../../core/constants';
import { type QuadrantElements } from '../layout';

export function initEvolutionUI(layout: QuadrantElements): void {
  const container = layout.evolutionUI;
  container.style.cssText += 'padding:10px;overflow-y:auto;font-family:monospace;';

  const header = document.createElement('div');
  header.style.marginBottom = '10px';
  container.appendChild(header);

  const traitList = document.createElement('div');
  traitList.style.cssText = 'display:grid;gap:6px;';
  container.appendChild(traitList);

  function render(): void {
    const sp = state.species;

    header.innerHTML = [
      `<div style="font-size:16px;font-weight:bold;color:#7ec8e3">${sp.name}</div>`,
      `<div style="color:#fff;margin-top:4px">`,
      `DNA: <b style="color:#f8d348">${Math.floor(sp.dnaPoints)}</b>`,
      ` | Pop: <b>${countPopulation()}</b>`,
      `</div>`,
    ].join('');

    traitList.innerHTML = '';

    const traits = Object.values(TRAIT_DATABASE);

    for (const trait of traits) {
      const isUnlocked = sp.activeTraits.has(trait.id);
      const parentsOk = trait.prerequisites.every((pid) => sp.activeTraits.has(pid));
      const canAfford = sp.dnaPoints >= trait.cost;

      const el = document.createElement('div');
      el.style.cssText = [
        `background:${isUnlocked ? '#2d4a22' : '#2a2a40'}`,
        `border:1px solid ${isUnlocked ? '#4caf50' : canAfford && parentsOk ? '#7ec8e3' : '#444'}`,
        'padding:8px',
        'border-radius:4px',
        `cursor:${!isUnlocked && parentsOk ? 'pointer' : 'default'}`,
        `opacity:${parentsOk ? '1' : '0.4'}`,
      ].join(';');

      const costLabel = isUnlocked
        ? '<span style="color:#8f8">UNLOCKED</span>'
        : `<span style="color:${canAfford ? '#f8d348' : '#a44'}">${trait.cost} DNA</span>`;

      el.innerHTML = [
        `<div style="font-weight:bold;color:${isUnlocked ? '#8f8' : '#fff'}">`,
        `${trait.name} — ${costLabel}`,
        `</div>`,
        `<div style="font-size:11px;color:#aaa;margin-top:2px">${trait.description}</div>`,
        `<div style="font-size:10px;color:#888;margin-top:2px">[${trait.category}]</div>`,
      ].join('');

      if (!isUnlocked && parentsOk) {
        el.addEventListener('click', () => {
          if (sp.dnaPoints >= trait.cost) {
            sp.dnaPoints -= trait.cost;
            sp.activeTraits.add(trait.id);
            sp.stats = computeStats(sp);
            render();
          }
        });
      }

      traitList.appendChild(el);
    }
  }

  // Refresh at ~2Hz — enough for UI responsiveness
  setInterval(render, 500);
  render();
}

function countPopulation(): number {
  let count = 0;
  const grid = state.grid;
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (grid[y][x].plant) count++;
    }
  }
  return count;
}
