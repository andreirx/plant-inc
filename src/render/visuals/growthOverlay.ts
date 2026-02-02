/**
 * Growth overlay — hover highlights and cost tooltips for click-to-grow.
 * Shows a green circle (can afford) or red circle (can't afford) at cursor,
 * with the energy cost label.
 */

import { Graphics, Text, TextStyle } from 'pixi.js';

const GREEN = 0x4caf50;
const RED = 0xf44336;
const CIRCLE_RADIUS = 12;
const FLASH_DURATION = 200; // ms

let _flashUntil = 0;
let _flashX = 0;
let _flashY = 0;

const labelStyle = new TextStyle({
  fontFamily: 'monospace',
  fontSize: 11,
  fill: '#ffffff',
});

let _label: Text | null = null;

export function initOverlay(gfx: Graphics): void {
  _label = new Text({ text: '', style: labelStyle });
  _label.anchor.set(0.5, 1.2);
  _label.visible = false;
  gfx.parent?.addChild(_label);
}

export function updateOverlay(
  gfx: Graphics,
  visible: boolean,
  px: number,
  py: number,
  canAfford: boolean,
  costLabel: string,
): void {
  gfx.clear();

  // Flash effect
  const now = performance.now();
  if (now < _flashUntil) {
    const alpha = ((_flashUntil - now) / FLASH_DURATION) * 0.6;
    gfx.circle(_flashX, _flashY, CIRCLE_RADIUS * 2);
    gfx.fill({ color: GREEN, alpha });
  }

  if (!visible) {
    if (_label) _label.visible = false;
    return;
  }

  const color = canAfford ? GREEN : RED;
  const alpha = canAfford ? 0.5 : 0.3;

  gfx.circle(px, py, CIRCLE_RADIUS);
  gfx.stroke({ color, width: 2, alpha: 0.8 });
  gfx.circle(px, py, 3);
  gfx.fill({ color, alpha });

  if (_label) {
    _label.text = costLabel;
    _label.x = px;
    _label.y = py - CIRCLE_RADIUS - 2;
    _label.visible = true;
    _label.style.fill = canAfford ? '#4caf50' : '#f44336';
  }
}

export function flashAt(px: number, py: number): void {
  _flashX = px;
  _flashY = py;
  _flashUntil = performance.now() + FLASH_DURATION;
}

export function hideOverlay(gfx: Graphics): void {
  gfx.clear();
  if (_label) _label.visible = false;
}
