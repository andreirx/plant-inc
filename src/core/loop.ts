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
const MAX_TICKS_PER_FRAME = 200;

/**
 * Wall-clock accumulator game loop.
 *
 * Ticks are tied to real elapsed time, not frame count.
 * At TICK_RATE = 20Hz, TICK_DURATION_MS = 50ms:
 *
 *   0.1x → accumulates 1.67ms/frame → 1 tick every ~30 frames (~2 ticks/sec)
 *   1x   → accumulates 16.67ms/frame → 1 tick every ~3 frames (20 ticks/sec)
 *   10x  → accumulates 166.7ms/frame → ~3 ticks/frame (200 ticks/sec)
 *   50x  → accumulates 833ms/frame → ~16 ticks/frame (1000 ticks/sec, capped)
 *
 * Every tick is a real, full simulation step. The render receives an
 * interpolation factor (0..1) for smooth visuals between tick boundaries.
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

      // Run fixed-timestep ticks from the accumulated time
      let tickCount = 0;
      while (accumulator >= TICK_DURATION_MS && tickCount < MAX_TICKS_PER_FRAME) {
        update(TICK_DURATION_MS);
        accumulator -= TICK_DURATION_MS;
        tickCount++;
      }

      // If we hit the cap, drop leftover to prevent unbounded buildup
      if (tickCount >= MAX_TICKS_PER_FRAME) {
        accumulator = 0;
      }
    }

    // Interpolation factor for smooth rendering between tick boundaries
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
