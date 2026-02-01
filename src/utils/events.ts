type Listener<T> = (payload: T) => void;

/**
 * Minimal typed event bus for decoupled communication between modules.
 * UI dispatches events, core listens and updates state.
 */
export class EventBus<EventMap extends { [key: string]: unknown }> {
  private listeners = new Map<keyof EventMap, Set<Listener<never>>>();

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener<never>);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<never>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      (listener as Listener<EventMap[K]>)(payload);
    }
  }
}

/** Game-wide event types */
export type GameEvents = {
  'sim:pause': void;
  'sim:resume': void;
  'sim:reset': void;
};

export const gameEvents = new EventBus<GameEvents>();
