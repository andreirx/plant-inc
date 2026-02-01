import { createLayout } from './ui/layout';
import { createPixiApp } from './render/app';
import { createGameLoop } from './core/loop';
import { state } from './core/state';
import { generateWorld } from './core/systems/mapGenerator';
import { updateClimate } from './core/systems/climate';

async function bootstrap(): Promise<void> {
  const appContainer = document.getElementById('app');
  if (!appContainer) throw new Error('Missing #app container');

  // Generate the world from the state seed
  state.grid = generateWorld(state.seed);

  // Set up the 4-quadrant layout
  const quadrants = createLayout(appContainer);

  // Initialize PixiJS applications for the three visual quadrants
  const [airApp, soilApp, mapApp] = await Promise.all([
    createPixiApp(quadrants.airView),
    createPixiApp(quadrants.soilView),
    createPixiApp(quadrants.mapView),
  ]);

  // Simulation update — runs at fixed 20Hz
  function update(_dt: number): void {
    if (state.paused) return;
    state.tick++;
    updateClimate(state);
  }

  // Render — runs every animation frame
  function render(_interpolation: number): void {
    // Renderers will read state and draw here
    void airApp;
    void soilApp;
    void mapApp;
  }

  const loop = createGameLoop(update, render);
  loop.start();

  // Placeholder: show simulation info in the evolution UI panel
  const tickDisplay = document.createElement('div');
  tickDisplay.style.cssText = 'padding: 16px; font-size: 14px; color: #7ec8e3; font-family: monospace;';
  quadrants.evolutionUI.appendChild(tickDisplay);

  function updateTickDisplay(): void {
    const c = state.climate;
    tickDisplay.innerHTML = [
      `Tick: ${state.tick}`,
      `Day: ${c.dayOfYear} | Season: ${c.season}`,
      `Temp: ${c.temperature.toFixed(1)}°C | Sun: ${(c.sunlight * 100).toFixed(0)}%`,
      `Seed: ${state.seed}`,
    ].join('<br>');
    requestAnimationFrame(updateTickDisplay);
  }
  updateTickDisplay();
}

bootstrap().catch(console.error);
