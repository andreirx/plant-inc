import { TICK_DURATION_MS } from './constants';
import { state } from './state';

export type UpdateFn = (dt: number) => void;
export type RenderFn = (interpolation: number) => void;

interface GameLoop {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

/**
 * Base ticks per frame at 1x speed.
 * At 60fps with TICK_RATE=20: ~1 tick every 3 frames at 1x.
 * We use a fractional accumulator so sub-1x speeds work correctly.
 */
const BASE_TICKS_PER_FRAME = 1;

/**
 * Creates a game loop where speed controls determine how many real
 * simulation ticks run per animation frame.
 *
 *   0.1x → ~0.1 ticks/frame (1 tick every ~10 frames)
 *   1x   → 1 tick/frame
 *   10x  → 10 ticks/frame
 *   50x  → 50 ticks/frame
 *
 * Every tick is a real, full simulation step. No fake time stretching.
 */
export function createGameLoop(update: UpdateFn, render: RenderFn): GameLoop {
  let rafId = 0;
  let running = false;
  let tickDebt = 0; // Fractional tick accumulator for sub-1x speeds

  function frame(): void {
    if (!running) return;

    if (!state.paused) {
      // How many ticks to run this frame
      tickDebt += BASE_TICKS_PER_FRAME * state.timeScale;
      const ticksThisFrame = Math.floor(tickDebt);
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
