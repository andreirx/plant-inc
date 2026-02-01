import { TICK_DURATION_MS, MAX_ACCUMULATOR_MS } from './constants';

export type UpdateFn = (dt: number) => void;
export type RenderFn = (interpolation: number) => void;

interface GameLoop {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

/**
 * Creates a game loop with fixed timestep simulation and variable render rate.
 *
 * The simulation updates at a fixed 20Hz rate using an accumulator pattern.
 * The render callback runs every animation frame and receives an interpolation
 * factor (0..1) indicating progress between the last and next simulation tick,
 * enabling smooth visuals independent of the tick rate.
 */
export function createGameLoop(update: UpdateFn, render: RenderFn): GameLoop {
  let accumulator = 0;
  let lastTime = 0;
  let rafId = 0;
  let running = false;

  function frame(currentTime: number): void {
    if (!running) return;

    if (lastTime === 0) {
      lastTime = currentTime;
    }

    let deltaMs = currentTime - lastTime;
    lastTime = currentTime;

    // Cap accumulated time to prevent spiral of death
    if (deltaMs > MAX_ACCUMULATOR_MS) {
      deltaMs = MAX_ACCUMULATOR_MS;
    }

    accumulator += deltaMs;

    // Fixed timestep simulation updates
    while (accumulator >= TICK_DURATION_MS) {
      update(TICK_DURATION_MS);
      accumulator -= TICK_DURATION_MS;
    }

    // Interpolation factor for smooth rendering between ticks
    const interpolation = accumulator / TICK_DURATION_MS;
    render(interpolation);

    rafId = requestAnimationFrame(frame);
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      lastTime = 0;
      accumulator = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop(): void {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    isRunning(): boolean {
      return running;
    },
  };
}
