import { Application } from 'pixi.js';

/**
 * Creates and initializes a PixiJS application fitted to a container element.
 * Returns the application instance after async init completes.
 */
export async function createPixiApp(container: HTMLElement): Promise<Application> {
  const app = new Application();

  await app.init({
    background: '#1a1a2e',
    resizeTo: container,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });

  container.appendChild(app.canvas);
  return app;
}
