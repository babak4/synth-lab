/**
 * Typed event bus (plan T0.2, LOCKED). The only channel between keyboard, sequencer,
 * recorder and on-screen displays; UI and audio never import each other.
 */
import type { ParamId } from '../params/registry';

export type NoteSource = 'keyboard' | 'onscreen' | 'sequencer' | 'audition' | 'midi';
export type TransportState = 'stopped' | 'count-in' | 'playing' | 'recording';

export interface EventMap {
  /** `audioTime` is on the audio clock (seconds) so the recorder can quantise and compensate latency. */
  'note:on': { pitch: number; velocity: number; source: NoteSource; audioTime: number; trackId?: string };
  'note:off': { pitch: number; source: NoteSource; audioTime: number; trackId?: string };
  sustain: { down: boolean; source: NoteSource; audioTime: number };
  panic: { audioTime: number };
  transport: { state: TransportState };
  'param:change': { id: ParamId; value: number | string | boolean; trackId?: string };
  /** Selected-track patch was replaced wholesale (preset load, "Set it up", undo). */
  'patch:load': { trackId?: string };
}

export type Listener<T> = (event: T) => void;

export class EventBus<M extends { [K in keyof M]: unknown }> {
  private listeners = new Map<keyof M, Set<Listener<never>>>();

  /** Subscribe; returns an unsubscribe function. */
  on<K extends keyof M>(type: K, fn: Listener<M[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn as Listener<never>);
    return () => this.off(type, fn);
  }

  off<K extends keyof M>(type: K, fn: Listener<M[K]>): void {
    this.listeners.get(type)?.delete(fn as Listener<never>);
  }

  /** Listeners run in subscription order; one throwing listener never blocks the rest. */
  emit<K extends keyof M>(type: K, event: M[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as Listener<M[K]>)(event);
      } catch (err) {
        console.error(`[events] listener for "${String(type)}" threw`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

/** App-wide singleton. Tests should create their own `new EventBus<EventMap>()`. */
export const bus = new EventBus<EventMap>();
