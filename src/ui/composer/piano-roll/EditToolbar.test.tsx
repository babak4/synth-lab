// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ServicesContext } from '@/app/context';
import { createMockServices } from '@/app/mock-services';
import { EditToolbar } from './EditToolbar';

afterEach(cleanup);

function mount() {
  const services = createMockServices();
  render(
    <ServicesContext.Provider value={services}>
      <EditToolbar />
    </ServicesContext.Provider>,
  );
  return services;
}

describe('piano roll editing toolbar', () => {
  it('starts on the draw tool, 1/16 snap and a quarter note', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Draw' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Snap')).toHaveValue('1/16');
    expect(screen.getByRole('button', { name: /^Quarter note/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches tool and snap', () => {
    const s = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(s.pianoRollEdit.getState().tool).toBe('select');
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText('Snap'), { target: { value: '1/8T' } });
    expect(s.pianoRollEdit.getState().snap).toEqual({ division: 8, triplet: true });
    fireEvent.change(screen.getByLabelText('Snap'), { target: { value: 'off' } });
    expect(s.pianoRollEdit.getState().snap.division).toBeNull();
  });

  it('length presets, dotted and triplet are exclusive toggles', () => {
    const s = mount();
    fireEvent.click(screen.getByRole('button', { name: /^Eighth note/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Dotted' }));
    expect(s.pianoRollEdit.getState().length).toEqual({ division: 8, dotted: true, triplet: false });
    fireEvent.click(screen.getByRole('button', { name: 'Triplet' }));
    expect(s.pianoRollEdit.getState().length).toEqual({ division: 8, dotted: false, triplet: true });
    expect(screen.getByRole('button', { name: 'Dotted' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Triplet' }));
    expect(s.pianoRollEdit.getState().length.triplet).toBe(false);
  });

  it('shows how many notes are selected', () => {
    const s = mount();
    expect(screen.queryByText(/selected/)).toBeNull();
    act(() => s.pianoRollEdit.getState().setSelection(['a', 'b']));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });
});
