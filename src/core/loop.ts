import { TICK_DURATION_MS } from './constants';
import { state } from './state';

export type UpdateFn = (dt: number) => void;
export type RenderFn = (interpolation: number) => void;

interface GameLoop {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

/** Hard cap on ticks per frame to prevent browser lock-up */
const MAX_TICKS_PER_FRAME = 500;

/**
 * Ticks-per-frame game loop.
 *
 * At 1x speed, 10 simulation ticks run per render frame.
 * timeScale scales that linearly:
 *
 *   0.1x → 1 tick/frame   (every tick is rendered — real-time 1:1)
 *   1x   → 10 ticks/frame (default game speed)
 *   10x  → 100 ticks/frame
 *   50x  → 500 ticks/frame (capped)
 */
const BASE_TICKS_PER_FRAME = 10;

export function createGameLoop(update: UpdateFn, render: RenderFn): GameLoop {
  let rafId = 0;
  let running = false;
  let tickDebt = 0;

  function frame(): void {
    if (!running) return;

    if (!state.paused) {
      tickDebt += BASE_TICKS_PER_FRAME * state.timeScale;
      const ticksThisFrame = Math.min(Math.floor(tickDebt), MAX_TICKS_PER_FRAME);
      tickDebt -= ticksThisFrame;

      for (let i = 0; i < ticksThisFrame; i++) {
        update(TICK_DURATION_MS);
      }
    }

    render(0);
    rafId = requestAnimationFrame(frame);
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      tickDebt = 0;
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
