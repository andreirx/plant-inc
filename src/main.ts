import { createLayout } from './ui/layout';
import { createPixiApp } from './render/app';
import { createGameLoop } from './core/loop';
import { state } from './core/state';

async function bootstrap(): Promise<void> {
  const appContainer = document.getElementById('app');
  if (!appContainer) throw new Error('Missing #app container');

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
    // Systems will be called here as they are implemented
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

  // Placeholder: show tick count in the evolution UI panel
  const tickDisplay = document.createElement('div');
  tickDisplay.style.cssText = 'padding: 16px; font-size: 14px; color: #7ec8e3;';
  quadrants.evolutionUI.appendChild(tickDisplay);

  function updateTickDisplay(): void {
    tickDisplay.textContent = `Tick: ${state.tick} | Status: ${state.paused ? 'Paused' : 'Running'}`;
    requestAnimationFrame(updateTickDisplay);
  }
  updateTickDisplay();
}

bootstrap().catch(console.error);
