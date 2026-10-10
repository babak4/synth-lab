// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ServicesContext } from '@/app/context';
import { createMockServices } from '@/app/mock-services';
import { UndoRedo } from './UndoRedo';
import { useUndoShortcuts } from './useUndoShortcuts';

afterEach(cleanup);

function Harness() {
  useUndoShortcuts();
  return <UndoRedo />;
}
function mount() {
  const services = createMockServices();
  render(
    <ServicesContext.Provider value={services}>
      <Harness />
      <input aria-label="field" />
    </ServicesContext.Provider>,
  );
  return services;
}
const cutoff = (s: ReturnType<typeof mount>) => s.patchStore.getState().patch.params['filter-cutoff'];

describe('undo/redo buttons', () => {
  it('start disabled, then name what they would undo', () => {
    const s = mount();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    act(() => s.patchStore.getState().setParam('filter-cutoff', 1000));
    const undo = screen.getByRole('button', { name: 'Undo: Change Cutoff' });
    expect(undo).toBeEnabled();
    fireEvent.click(undo);
    expect(cutoff(s)).toBe(8000);
    expect(screen.getByRole('button', { name: 'Redo: Change Cutoff' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Redo: Change Cutoff' }));
    expect(cutoff(s)).toBe(1000);
  });
});

describe('keyboard shortcuts', () => {
  it('Ctrl+Z / Cmd+Z undo; Shift+Ctrl+Z and Ctrl+Y redo', () => {
    const s = mount();
    act(() => s.patchStore.getState().setParam('filter-cutoff', 1000));
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(cutoff(s)).toBe(8000);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(cutoff(s)).toBe(1000);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(cutoff(s)).toBe(8000);
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(cutoff(s)).toBe(1000);
  });

  it('prevents the browser default so the page does not also try to undo', () => {
    mount();
    const notPrevented = fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(notPrevented).toBe(false);
  });

  it('leaves a focused text field to its own native undo', () => {
    const s = mount();
    act(() => s.patchStore.getState().setParam('filter-cutoff', 1000));
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'z', ctrlKey: true });
    expect(cutoff(s)).toBe(1000);
  });

  it('plain Z and other keys do nothing', () => {
    const s = mount();
    act(() => s.patchStore.getState().setParam('filter-cutoff', 1000));
    fireEvent.keyDown(window, { key: 'z' });
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true, shiftKey: true });
    expect(cutoff(s)).toBe(1000);
  });

  it('pointer-up ends the gesture: two drags of one knob are two undo steps', () => {
    const s = mount();
    act(() => s.patchStore.getState().setParam('filter-cutoff', 1000));
    fireEvent.pointerUp(window);
    act(() => s.patchStore.getState().setParam('filter-cutoff', 500));
    expect(s.historyStore.history.snapshot().undoDepth).toBe(2);
  });
});
