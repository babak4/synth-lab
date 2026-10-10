/**
 * Transport store (plan T5.2): play / stop / return-to-start, the playhead, and the metronome and
 * count-in switches. The loop on/off switch lives in the project (`project.loop.enabled`, so it is saved
 * with the song); `setLoop` here is a convenience that writes it.
 *
 * The store never touches audio. A `TransportDriver` (the audio-side Sequencer) does the playing and is
 * attached by the runtime. The playhead is *not* in the reactive state, because it moves every frame:
 * read it with `getPosition()` from a frame callback. `startTick` is where the playhead rests while
 * stopped, and where the next play begins.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { EventBus, EventMap, TransportState as Phase } from '@/core/contracts/events';
import { songEndTick, type TransportDriver } from '@/core/transport';
import type { ProjectStore } from './project-store';

export interface TransportState {
  /** 'stopped', 'count-in' (clicks before the start), 'playing' ('recording' is added by T5.5). */
  state: Phase;
  /** Resting playhead (song ticks): where play starts from, and where a stop left it. */
  startTick: number;
  metronome: boolean;
  /** Play a one-bar count-in before starting from stopped. */
  countIn: boolean;

  play(opts?: { countIn?: boolean }): void;
  /** Stop and leave the playhead where it is. */
  stop(): void;
  /** Play if stopped, stop if running. */
  toggle(): void;
  /** Move the playhead to the start (tick 0); keeps playing if it was playing. */
  returnToStart(): void;
  /** Move the playhead; keeps playing if it was playing. */
  seek(tick: number): void;
  setMetronome(on: boolean): void;
  setCountIn(on: boolean): void;
  /** Turn the project's loop region on or off. */
  setLoop(enabled: boolean): void;
  /** Playhead in song ticks (fractional while playing). Cheap; call it every frame. */
  getPosition(): number;
  /** Whether sound is being produced or about to be (count-in or playing). */
  isRunning(): boolean;
  attachDriver(driver: TransportDriver): () => void;
}

export type TransportStore = StoreApi<TransportState>;

export function createTransportStore(deps: { projectStore: ProjectStore; bus?: EventBus<EventMap> }): TransportStore {
  const { projectStore, bus } = deps;
  let driver: TransportDriver | null = null;
  let offDriver: (() => void) | null = null;

  return createStore<TransportState>()((set, get) => {
    const running = () => get().state !== 'stopped';
    const setPhase = (state: Phase, startTick = get().startTick) => {
      const changed = state !== get().state;
      set({ state, startTick });
      if (changed) bus?.emit('transport', { state });
    };

    return {
      state: 'stopped',
      startTick: 0,
      metronome: false,
      countIn: false,

      play(opts) {
        if (running()) return;
        const { project } = projectStore.getState();
        // Playing from the very end would stop at once, so start over instead.
        const end = songEndTick(project.lengthBars, project.timeSignature);
        const from = get().startTick >= end ? 0 : Math.max(0, get().startTick);
        const countIn = opts?.countIn ?? get().countIn;
        setPhase(countIn ? 'count-in' : 'playing', from);
        driver?.start(from, countIn);
      },

      stop() {
        if (!running()) return;
        const at = get().getPosition();
        driver?.stop();
        setPhase('stopped', at);
      },

      toggle() {
        if (running()) get().stop();
        else get().play();
      },

      returnToStart() {
        get().seek(0);
      },

      seek(tick) {
        const to = Math.max(0, tick);
        if (!running()) {
          set({ startTick: to });
          return;
        }
        driver?.seek(to);
        setPhase('playing', to); // a seek skips any count-in that was still running
      },

      setMetronome: (metronome) => set({ metronome }),
      setCountIn: (countIn) => set({ countIn }),
      setLoop: (enabled) => projectStore.getState().setLoop({ enabled }),

      getPosition() {
        const s = get();
        return s.state === 'playing' && driver ? driver.positionTicks() : s.startTick;
      },

      isRunning: running,

      attachDriver(next) {
        offDriver?.();
        driver = next;
        offDriver = next.onEvent((e) => {
          if (e === 'playing' && get().state === 'count-in') setPhase('playing');
          // Reached the end of the song (loop off): back to the start, ready to play again.
          else if (e === 'ended' && running()) setPhase('stopped', 0);
        });
        return () => {
          offDriver?.();
          offDriver = null;
          if (driver === next) driver = null;
        };
      },
    };
  });
}
