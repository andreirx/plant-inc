import { TICK_DURATION_MS } from './constants';
import { state } from './state';

export type UpdateFn = (dt: number) => void;
export type RenderFn = (interpolation: number) => void;

interface GameLoop {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

/** Hard cap on ticks per frame to prevent browser lock-up at high speeds */
const MAX_TICKS_PER_FRAME = 500;

/**
 * Wall-clock accumulator game loop.
 *
 * Ticks are paced by real elapsed time × timeScale.
 * At TICK_RATE=20Hz (TICK_DURATION_MS=50ms):
 *
 *   0.1x → 2 ticks/sec    (genuinely slow — each day/night visible)
 *   1x   → 20 ticks/sec   (normal real-time)
 *   10x  → 200 ticks/sec  (fast-forward)
 *   50x  → 1000 ticks/sec (max fast-forward, capped per frame)
 *
 * Render runs every animation frame (60fps). Between ticks, the
 * interpolation factor (0..1) allows smooth visual transitions
 * (e.g. sky color) even at low tick rates.
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

    // Cap raw delta to prevent spiral of death after tab-away
    if (deltaMs > 200) {
      deltaMs = 200;
    }

    if (!state.paused) {
      accumulator += deltaMs * state.timeScale;

      // Run fixed-timestep ticks
      let tickCount = 0;
      while (accumulator >= TICK_DURATION_MS && tickCount < MAX_TICKS_PER_FRAME) {
        update(TICK_DURATION_MS);
        accumulator -= TICK_DURATION_MS;
        tickCount++;
      }

      // Drop excess if we hit the cap
      if (tickCount >= MAX_TICKS_PER_FRAME) {
        accumulator = 0;
      }
    }

    // Interpolation: fraction of progress toward the next tick (0..1)
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
