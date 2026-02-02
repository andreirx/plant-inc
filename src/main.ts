import { Graphics } from 'pixi.js';
import { createLayout } from './ui/layout';
import { createPixiApp } from './render/app';
import { createGameLoop } from './core/loop';
import { state } from './core/state';
import { GRID_WIDTH, GRID_HEIGHT } from './core/constants';
import { generateWorld } from './core/systems/mapGenerator';
import { updateClimate } from './core/systems/climate';
import { updateGrowth } from './core/systems/growth';
import { updateDispersal } from './core/systems/dispersal';
import { createTerrainLayer, TILE_SIZE } from './render/layers/terrainLayer';
import { createPlantLayer, updatePlantLayer } from './render/layers/plantLayer';
import { createCursorLayer, updateCursorLayer } from './render/layers/cursorLayer';
import { createAtmosphereOverlay, updateAtmosphereOverlay } from './render/layers/atmosphereLayer';
import { drawPlant, type PlantRenderResult } from './render/visuals/plantDrawer';
import { drawStickman } from './render/visuals/stickman';
import { initInspector } from './ui/components/inspector';
import { initEvolutionUI } from './ui/components/evolution';
import { initSpeedControls } from './ui/components/speedControls';
import { hitTestShoot, hitTestRoots, executeGrowthAction } from './interaction/manualGrowth';
import { initOverlay, updateOverlay, flashAt, hideOverlay, drawShootGrowthPoints, drawRootGrowthPoints } from './render/visuals/growthOverlay';
import { loadGame, saveGame } from './core/persistence';

async function bootstrap(): Promise<void> {
  const appContainer = document.getElementById('app');
  if (!appContainer) throw new Error('Missing #app container');

  // Try to load a saved game; if no save or load fails, generate fresh world
  const loaded = loadGame();
  if (!loaded) {
    const world = generateWorld(state.seed);
    state.grid = world.grid;
    state.selection = { x: world.startX, y: world.startY };
  }

  // Set up the 4-quadrant layout
  const quadrants = createLayout(appContainer);

  // --- Map Quadrant: coordinate panel + canvas container ---
  const mapWrapper = document.createElement('div');
  mapWrapper.style.cssText = 'display:flex;width:100%;height:100%;';

  const coordPanel = document.createElement('div');
  coordPanel.style.cssText =
    'display:flex;flex-direction:column;gap:4px;padding:6px;' +
    'background:rgba(0,0,0,0.75);font-family:monospace;font-size:11px;' +
    'color:#e0e0e0;z-index:5;width:72px;flex-shrink:0;';

  const makeInput = (label: string): HTMLInputElement => {
    const lbl = document.createElement('div');
    lbl.textContent = label;
    lbl.style.cssText = 'color:#888;font-size:10px;';
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = '0';
    inp.style.cssText =
      'width:100%;box-sizing:border-box;background:#1a1a2e;color:#e0e0e0;' +
      'border:1px solid #444;border-radius:2px;padding:2px 4px;' +
      'font-family:monospace;font-size:12px;text-align:center;';
    coordPanel.appendChild(lbl);
    coordPanel.appendChild(inp);
    return inp;
  };

  const xInput = makeInput('X');
  xInput.max = String(GRID_WIDTH - 1);
  const yInput = makeInput('Y');
  yInput.max = String(GRID_HEIGHT - 1);

  const mapCanvas = document.createElement('div');
  mapCanvas.style.cssText = 'flex:1;min-width:0;min-height:0;position:relative;overflow:hidden;';

  mapWrapper.append(coordPanel, mapCanvas);
  quadrants.mapView.appendChild(mapWrapper);

  // Initialize PixiJS applications for the three visual quadrants
  const [airApp, soilApp, mapApp] = await Promise.all([
    createPixiApp(quadrants.airView),
    createPixiApp(quadrants.soilView),
    createPixiApp(mapCanvas),
  ]);

  // --- Map Quadrant: Layers ---
  const terrainGfx = createTerrainLayer(state.grid);
  const plantGfx = createPlantLayer();
  const cursorGfx = createCursorLayer();

  mapApp.stage.addChild(terrainGfx);
  mapApp.stage.addChild(plantGfx);
  mapApp.stage.addChild(cursorGfx);

  fitMapToView(mapApp, mapCanvas);
  window.addEventListener('resize', () => fitMapToView(mapApp, mapCanvas));

  // Helper: sync selection → cursor + inputs
  function syncSelection(tileX: number, tileY: number): void {
    state.selection = { x: tileX, y: tileY };
    updateCursorLayer(cursorGfx, tileX, tileY);
    xInput.value = String(tileX);
    yInput.value = String(tileY);
  }

  // Show initial cursor on the starting selection
  if (state.selection) {
    syncSelection(state.selection.x, state.selection.y);
  }

  // Coordinate inputs → update selection
  const handleCoordInput = (): void => {
    const nx = Math.max(0, Math.min(GRID_WIDTH - 1, parseInt(xInput.value) || 0));
    const ny = Math.max(0, Math.min(GRID_HEIGHT - 1, parseInt(yInput.value) || 0));
    syncSelection(nx, ny);
  };
  xInput.addEventListener('change', handleCoordInput);
  yInput.addEventListener('change', handleCoordInput);

  // --- Air Quadrant: Sky background + plant shoot in foreground ---
  const atmosphereGfx = createAtmosphereOverlay(
    quadrants.airView.clientWidth,
    quadrants.airView.clientHeight,
  );
  const shootGfx = new Graphics();
  airApp.stage.addChild(atmosphereGfx); // Sky background
  airApp.stage.addChild(shootGfx);       // Plant in foreground

  // --- Soil Quadrant: Root visualization ---
  const rootGfx = new Graphics();
  soilApp.stage.addChild(rootGfx);

  // Last render result — used by click-to-grow interaction
  let lastRenderResult: PlantRenderResult | null = null;

  // --- Growth point markers (persistent, always visible) ---
  const airGrowthPtsGfx = new Graphics();
  airApp.stage.addChild(airGrowthPtsGfx);

  const soilGrowthPtsGfx = new Graphics();
  soilApp.stage.addChild(soilGrowthPtsGfx);

  // --- Growth overlay layers (hover highlights, on top of markers) ---
  const airOverlayGfx = new Graphics();
  airApp.stage.addChild(airOverlayGfx);
  initOverlay(airOverlayGfx);

  const soilOverlayGfx = new Graphics();
  soilApp.stage.addChild(soilOverlayGfx);
  initOverlay(soilOverlayGfx);

  // --- Air Quadrant: Click-to-grow interaction ---
  airApp.stage.eventMode = 'static';
  airApp.stage.hitArea = { contains: () => true };

  airApp.stage.on('pointermove', (e) => {
    const sel = state.selection;
    const plant = sel ? state.grid[sel.y][sel.x].plant : null;
    if (!plant || !lastRenderResult) {
      hideOverlay(airOverlayGfx);
      return;
    }
    const local = e.getLocalPosition(airApp.stage);
    const hit = hitTestShoot(local.x, local.y, plant, lastRenderResult);
    if (hit) {
      const canAfford = plant.energy >= hit.cost;
      updateOverlay(airOverlayGfx, true, local.x, local.y, canAfford, hit.label);
    } else {
      hideOverlay(airOverlayGfx);
    }
  });

  airApp.stage.on('pointerdown', (e) => {
    const sel = state.selection;
    const plant = sel ? state.grid[sel.y][sel.x].plant : null;
    if (!plant || !lastRenderResult) return;
    const local = e.getLocalPosition(airApp.stage);
    const hit = hitTestShoot(local.x, local.y, plant, lastRenderResult);
    if (hit && hit.action) {
      if (executeGrowthAction(hit.action, hit.cost, plant)) {
        flashAt(local.x, local.y);
      }
    }
  });

  airApp.stage.on('pointerleave', () => {
    hideOverlay(airOverlayGfx);
  });

  // --- Soil Quadrant: Click-to-grow interaction ---
  soilApp.stage.eventMode = 'static';
  soilApp.stage.hitArea = { contains: () => true };

  soilApp.stage.on('pointermove', (e) => {
    const sel = state.selection;
    const plant = sel ? state.grid[sel.y][sel.x].plant : null;
    if (!plant || !lastRenderResult) {
      hideOverlay(soilOverlayGfx);
      return;
    }
    const local = e.getLocalPosition(soilApp.stage);
    const hit = hitTestRoots(local.x, local.y, plant, lastRenderResult);
    if (hit) {
      const canAfford = plant.energy >= hit.cost;
      updateOverlay(soilOverlayGfx, true, local.x, local.y, canAfford, hit.label);
    } else {
      hideOverlay(soilOverlayGfx);
    }
  });

  soilApp.stage.on('pointerdown', (e) => {
    const sel = state.selection;
    const plant = sel ? state.grid[sel.y][sel.x].plant : null;
    if (!plant || !lastRenderResult) return;
    const local = e.getLocalPosition(soilApp.stage);
    const hit = hitTestRoots(local.x, local.y, plant, lastRenderResult);
    if (hit && hit.action) {
      if (executeGrowthAction(hit.action, hit.cost, plant)) {
        flashAt(local.x, local.y);
      }
    }
  });

  soilApp.stage.on('pointerleave', () => {
    hideOverlay(soilOverlayGfx);
  });

  // --- Map Interaction: click to select tile ---
  mapApp.stage.eventMode = 'static';
  mapApp.stage.hitArea = { contains: () => true };

  mapApp.stage.on('pointerdown', (e) => {
    const local = e.getLocalPosition(mapApp.stage);
    const tileX = Math.floor(local.x / TILE_SIZE);
    const tileY = Math.floor(local.y / TILE_SIZE);

    if (tileX >= 0 && tileX < GRID_WIDTH && tileY >= 0 && tileY < GRID_HEIGHT) {
      syncSelection(tileX, tileY);
    }
  });

  // --- Evolution UI in Q4 (must run before inspector to create #q4-bio) ---
  initEvolutionUI(quadrants);

  // --- HUD: Inspector panels on Air, Soil, and Q4 bio column ---
  initInspector(quadrants);

  // --- Speed Controls at bottom of Q4 ---
  initSpeedControls(quadrants);

  // Simulation update — runs at fixed 20Hz
  function update(_dt: number): void {
    if (state.paused) return;
    state.tick++;
    updateClimate(state);
    updateGrowth(state);
    updateDispersal(state);

    // Auto-save every ~30 seconds of real time (600 ticks at 20Hz)
    if (state.tick % 600 === 0) {
      saveGame();
    }
  }

  // Also save when the user leaves the page
  window.addEventListener('beforeunload', () => saveGame());

  // Render — runs every animation frame
  function render(interpolation: number): void {
    updatePlantLayer(plantGfx);

    // Atmosphere overlay (interpolated for smooth sky at slow speeds)
    const airW = quadrants.airView.clientWidth;
    const airH = quadrants.airView.clientHeight;
    updateAtmosphereOverlay(atmosphereGfx, airW, airH, interpolation);

    // Get the selected plant for detailed rendering
    const sel = state.selection;
    const selectedPlant = sel ? state.grid[sel.y][sel.x].plant : null;

    if (selectedPlant) {
      const soilW = quadrants.soilView.clientWidth;
      const soilH = quadrants.soilView.clientHeight;
      lastRenderResult = drawPlant(shootGfx, rootGfx, selectedPlant, state.species, airW, airH, soilW, soilH);
      if (lastRenderResult) {
        drawStickman(
          shootGfx,
          lastRenderResult.scale,
          lastRenderResult.airOffsetX,
          lastRenderResult.airOffsetY,
          lastRenderResult.shoot.bounds.maxX,
        );
        drawShootGrowthPoints(airGrowthPtsGfx, selectedPlant, lastRenderResult);
        drawRootGrowthPoints(soilGrowthPtsGfx, selectedPlant, lastRenderResult);
      }
    } else {
      shootGfx.clear();
      rootGfx.clear();
      airGrowthPtsGfx.clear();
      soilGrowthPtsGfx.clear();
      lastRenderResult = null;
    }
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

  app.stage.x = (container.clientWidth - mapPixelW * scale) / 2;
  app.stage.y = (container.clientHeight - mapPixelH * scale) / 2;
}

bootstrap().catch(console.error);
