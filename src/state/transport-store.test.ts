import { describe, expect, it } from 'vitest';
import { EventBus, type EventMap } from '@/core/contracts/events';
import type { TransportDriver } from '@/core/transport';
import { createProjectStore } from './project-store';
import { createTransportStore } from './transport-store';

class FakeDriver implements TransportDriver {
  calls: string[] = [];
  position = 0;
  private listener: ((e: 'playing' | 'ended') => void) | null = null;
  start(from: number, countIn: boolean) {
    this.calls.push(`start ${from} ${countIn}`);
  }
  seek(tick: number) {
    this.calls.push(`seek ${tick}`);
    this.position = tick;
  }
  stop() {
    this.calls.push('stop');
  }
  positionTicks() {
    return this.position;
  }
  onEvent(l: (e: 'playing' | 'ended') => void) {
    this.listener = l;
    return () => (this.listener = null);
  }
  fire(e: 'playing' | 'ended') {
    this.listener?.(e);
  }
}

function setup() {
  const projectStore = createProjectStore();
  const bus = new EventBus<EventMap>();
  const states: string[] = [];
  bus.on('transport', (e) => states.push(e.state));
  const store = createTransportStore({ projectStore, bus });
  const driver = new FakeDriver();
  store.getState().attachDriver(driver);
  return { store, driver, projectStore, states };
}

describe('transport store', () => {
  it('play starts the driver from the resting playhead; stop keeps the position', () => {
    const { store, driver, states } = setup();
    store.getState().seek(960);
    store.getState().play();
    expect(store.getState().state).toBe('playing');
    expect(driver.calls).toEqual(['start 960 false']);
    driver.position = 5000.5;
    expect(store.getState().getPosition()).toBe(5000.5);
    store.getState().stop();
    expect(driver.calls.at(-1)).toBe('stop');
    expect(store.getState().state).toBe('stopped');
    expect(store.getState().getPosition()).toBe(5000.5);
    expect(states).toEqual(['playing', 'stopped']);
  });

  it('play twice or stop twice does nothing the second time', () => {
    const { store, driver } = setup();
    store.getState().stop();
    store.getState().play();
    store.getState().play();
    expect(driver.calls).toEqual(['start 0 false']);
  });

  it('toggle plays then stops', () => {
    const { store } = setup();
    store.getState().toggle();
    expect(store.getState().state).toBe('playing');
    store.getState().toggle();
    expect(store.getState().state).toBe('stopped');
  });

  it('count-in: starts in count-in, the driver moves it to playing', () => {
    const { store, driver, states } = setup();
    store.getState().setCountIn(true);
    store.getState().play();
    expect(store.getState().state).toBe('count-in');
    expect(driver.calls).toEqual(['start 0 true']);
    expect(store.getState().getPosition()).toBe(0);
    driver.fire('playing');
    expect(store.getState().state).toBe('playing');
    expect(states).toEqual(['count-in', 'playing']);
  });

  it('play can override the count-in switch (recording asks for one)', () => {
    const { store, driver } = setup();
    store.getState().play({ countIn: true });
    expect(driver.calls).toEqual(['start 0 true']);
  });

  it('return to start while stopped moves the playhead; while playing it seeks and keeps playing', () => {
    const { store, driver } = setup();
    store.getState().seek(7777);
    expect(store.getState().getPosition()).toBe(7777);
    store.getState().returnToStart();
    expect(store.getState().getPosition()).toBe(0);
    store.getState().seek(1000);
    store.getState().play();
    store.getState().returnToStart();
    expect(driver.calls).toEqual(['start 1000 false', 'seek 0']);
    expect(store.getState().state).toBe('playing');
  });

  it('seeking during the count-in skips the rest of it', () => {
    const { store } = setup();
    store.getState().play({ countIn: true });
    store.getState().returnToStart();
    expect(store.getState().state).toBe('playing');
  });

  it('the driver reaching the song end stops the transport and rewinds', () => {
    const { store, driver } = setup();
    store.getState().play();
    driver.position = 9999;
    driver.fire('ended');
    expect(store.getState().state).toBe('stopped');
    expect(store.getState().getPosition()).toBe(0);
  });

  it('playing from the very end starts over', () => {
    const { store, driver, projectStore } = setup();
    const end = projectStore.getState().project.lengthBars * 3840;
    store.getState().seek(end);
    store.getState().play();
    expect(driver.calls).toEqual(['start 0 false']);
  });

  it('metronome and count-in switches, and the loop switch writes the project', () => {
    const { store, projectStore } = setup();
    store.getState().setMetronome(true);
    store.getState().setCountIn(true);
    expect(store.getState().metronome).toBe(true);
    expect(store.getState().countIn).toBe(true);
    store.getState().setLoop(false);
    expect(projectStore.getState().project.loop.enabled).toBe(false);
    store.getState().setLoop(true);
    expect(projectStore.getState().project.loop.enabled).toBe(true);
  });

  it('works with no driver attached (UI tests)', () => {
    const store = createTransportStore({ projectStore: createProjectStore() });
    store.getState().play();
    expect(store.getState().state).toBe('playing');
    store.getState().stop();
    expect(store.getState().state).toBe('stopped');
  });
});
