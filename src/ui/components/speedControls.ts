/**
 * Speed controls — Pause / 1x / 5x / 10x buttons at the bottom of Q4.
 */

import { state } from '../../core/state';
import { clearSave } from '../../core/persistence';
import { type QuadrantElements } from '../layout';

const SPEEDS = [
  { label: '0.1x', value: 0.1 },
  { label: '1x', value: 1 },
  { label: '10x', value: 10 },
  { label: '50x', value: 50 },
];

const BTN_BASE =
  'padding:6px 14px;background:#2a2a40;color:#e0e0e0;border:1px solid #444;' +
  'border-radius:3px;cursor:pointer;font-family:monospace;font-size:13px;' +
  'transition:background 0.15s,border-color 0.15s;';

const BTN_ACTIVE = 'background:#2d6a4f;border-color:#4caf50;color:#fff;';

export function initSpeedControls(layout: QuadrantElements): void {
  const bar = document.createElement('div');
  bar.style.cssText =
    'position:absolute;bottom:10px;left:10px;right:10px;' +
    'display:flex;gap:6px;justify-content:center;' +
    'background:rgba(0,0,0,0.75);padding:8px;border-radius:4px;z-index:10;';

  const buttons: HTMLButtonElement[] = [];

  for (const speed of SPEEDS) {
    const btn = document.createElement('button');
    btn.textContent = speed.label;
    btn.style.cssText = BTN_BASE;

    btn.addEventListener('click', () => {
      state.timeScale = speed.value;
      highlightActive();
    });

    buttons.push(btn);
    bar.appendChild(btn);
  }

  // --- New Game button ---
  const sep = document.createElement('div');
  sep.style.cssText = 'width:1px;background:#555;margin:0 4px;';
  bar.appendChild(sep);

  const newGameBtn = document.createElement('button');
  newGameBtn.textContent = 'NEW GAME';
  newGameBtn.style.cssText = BTN_BASE + 'background:#5a1a1a;border-color:#f44336;';
  newGameBtn.addEventListener('click', () => {
    if (confirm('Start a new game? Current progress will be lost.')) {
      clearSave();
      window.location.reload();
    }
  });
  bar.appendChild(newGameBtn);

  layout.evolutionUI.appendChild(bar);

  function highlightActive(): void {
    for (let i = 0; i < buttons.length; i++) {
      const isActive = SPEEDS[i].value === state.timeScale;
      buttons[i].style.cssText = BTN_BASE + (isActive ? BTN_ACTIVE : '');
    }
  }

  // Initial highlight
  highlightActive();
}
