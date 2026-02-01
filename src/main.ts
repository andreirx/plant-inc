import { createLayout } from './ui/layout';
import { createPixiApp } from './render/app';
import { createGameLoop } from './core/loop';
import { state } from './core/state';
import { GRID_WIDTH, GRID_HEIGHT } from './core/constants';
import { generateWorld } from './core/systems/mapGenerator';
import { updateClimate } from './core/systems/climate';
import { createTerrainLayer, TILE_SIZE } from './render/layers/terrainLayer';
import { createPlantLayer, updatePlantLayer } from './render/layers/plantLayer';
import { createCursorLayer, updateCursorLayer } from './render/layers/cursorLayer';
import { initInspector } from './ui/components/inspector';

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

  // --- Map Quadrant: Layers ---
  const terrainGfx = createTerrainLayer(state.grid);
  const plantGfx = createPlantLayer();
  const cursorGfx = createCursorLayer();

  mapApp.stage.addChild(terrainGfx);
  mapApp.stage.addChild(plantGfx);
  mapApp.stage.addChild(cursorGfx);

  // Fit map into viewport with scaling
  fitMapToView(mapApp, quadrants.mapView);
  window.addEventListener('resize', () => fitMapToView(mapApp, quadrants.mapView));

  // Show initial cursor on the starting selection (grid center)
  if (state.selection) {
    updateCursorLayer(cursorGfx, state.selection.x, state.selection.y);
  }

  // --- Map Interaction: click to select tile ---
  mapApp.stage.eventMode = 'static';
  mapApp.stage.hitArea = { contains: () => true };

  mapApp.stage.on('pointerdown', (e) => {
    const local = e.getLocalPosition(mapApp.stage);
    const tileX = Math.floor(local.x / TILE_SIZE);
    const tileY = Math.floor(local.y / TILE_SIZE);

    if (tileX >= 0 && tileX < GRID_WIDTH && tileY >= 0 && tileY < GRID_HEIGHT) {
      state.selection = { x: tileX, y: tileY };
      updateCursorLayer(cursorGfx, tileX, tileY);
    }
  });

  // --- HUD: Inspector panels on Air and Soil quadrants ---
  initInspector(quadrants);

  // --- Climate readout in Evolution quadrant ---
  const climateEl = document.createElement('div');
  climateEl.style.cssText = 'padding:16px;font-size:14px;color:#7ec8e3;font-family:monospace;';
  quadrants.evolutionUI.appendChild(climateEl);

  // Simulation update — runs at fixed 20Hz
  function update(_dt: number): void {
    if (state.paused) return;
    state.tick++;
    updateClimate(state);
  }

  // Render — runs every animation frame
  function render(_interpolation: number): void {
    updatePlantLayer(plantGfx);

    const c = state.climate;
    climateEl.innerHTML = [
      `Tick: ${state.tick}`,
      `Day: ${c.dayOfYear} | Season: ${c.season}`,
      `Temp: ${c.temperature.toFixed(1)}°C | Sun: ${(c.sunlight * 100).toFixed(0)}%`,
      `Humidity: ${(c.humidity * 100).toFixed(0)}% | Wind: ${c.windSpeed.toFixed(2)}`,
      `Seed: ${state.seed}`,
    ].join('<br>');

    void airApp;
    void soilApp;
  }

  const loop = createGameLoop(update, render);
  loop.start();
}

/** Scale the map stage so the full grid fits the container */
function fitMapToView(
  app: Awaited<ReturnType<typeof createPixiApp>>,
  container: HTMLElement,
): void {
  const mapPixelW = GRID_WIDTH * TILE_SIZE;
  const mapPixelH = GRID_HEIGHT * TILE_SIZE;
  const scaleX = container.clientWidth / mapPixelW;
  const scaleY = container.clientHeight / mapPixelH;
  const scale = Math.min(scaleX, scaleY);
  app.stage.scale.set(scale);

  // Center the map within the container
  app.stage.x = (container.clientWidth - mapPixelW * scale) / 2;
  app.stage.y = (container.clientHeight - mapPixelH * scale) / 2;
}

bootstrap().catch(console.error);
