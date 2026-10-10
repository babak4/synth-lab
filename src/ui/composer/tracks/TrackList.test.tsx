// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ServicesContext } from '@/app/context';
import { createMockServices } from '@/app/mock-services';
import { MAX_TRACKS } from '@/core/contracts/project';
import { CompositionTab } from '../CompositionTab';

afterEach(cleanup);

function mount() {
  const services = createMockServices();
  render(
    <ServicesContext.Provider value={services}>
      <CompositionTab />
    </ServicesContext.Provider>,
  );
  return services;
}
const st = (s: ReturnType<typeof mount>) => s.projectStore.getState();
const names = (s: ReturnType<typeof mount>) => st(s).project.tracks.map((t) => t.name);

describe('track list', () => {
  it('adds, duplicates and deletes tracks', () => {
    const s = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add track' }));
    expect(names(s)).toEqual(['Track 1', 'Track 2']);
    expect(screen.getAllByTestId('track-row')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Track 1' }));
    expect(names(s)).toEqual(['Track 1', 'Track 1 copy', 'Track 2']);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Track 1 copy' }));
    expect(names(s)).toEqual(['Track 1', 'Track 2']);
  });

  it('cannot delete the last track', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Delete Track 1' })).toBeDisabled();
  });

  it('disables add at the limit and says why', () => {
    const s = mount();
    for (let i = 1; i < MAX_TRACKS; i++) act(() => st(s).addTrack());
    const add = screen.getByRole('button', { name: 'Add track' });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription(/at most 8 tracks/i);
    expect(screen.getByRole('button', { name: 'Duplicate Track 1' })).toBeDisabled();
  });

  it('reorders with the move buttons and disables them at the ends', () => {
    const s = mount();
    act(() => st(s).addTrack());
    expect(screen.getByRole('button', { name: 'Move Track 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Track 2 down' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move Track 2 up' }));
    expect(names(s)).toEqual(['Track 2', 'Track 1']);
    expect(screen.getAllByTestId('track-row')[0]).toHaveAttribute('data-track-id', st(s).project.tracks[0]!.id);
  });

  it('selects from the swatch button and from the overview, and marks the selected row', () => {
    const s = mount();
    act(() => st(s).addTrack()); // adding selects the new track
    const [a, b] = st(s).project.tracks;
    expect(st(s).selectedTrackId).toBe(b!.id);
    const rows = screen.getAllByTestId('track-row');
    expect(rows[1]).toHaveAttribute('aria-current', 'true');
    expect(rows[0]).not.toHaveAttribute('aria-current');
    fireEvent.click(within(rows[0]!).getByRole('button', { name: 'Select Track 1' }));
    expect(st(s).selectedTrackId).toBe(a!.id);
    fireEvent.click(within(rows[1]!).getByRole('button', { name: /^Select Track 2: 0 notes/ }));
    expect(st(s).selectedTrackId).toBe(b!.id);
  });

  it('mute and solo toggle and expose pressed state', () => {
    const s = mount();
    const mute = screen.getByRole('button', { name: 'Mute Track 1' });
    fireEvent.click(mute);
    expect(st(s).project.tracks[0]!.mute).toBe(true);
    expect(mute).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Solo Track 1' }));
    expect(st(s).project.tracks[0]!.solo).toBe(true);
  });

  it('volume fader writes dB and reads back through aria-valuetext', () => {
    const s = mount();
    const fader = screen.getByRole('slider', { name: 'Volume, Track 1' });
    fireEvent.change(fader, { target: { value: '0.5' } });
    expect(st(s).project.tracks[0]!.volumeDb).toBeCloseTo(-27);
    expect(fader).toHaveAttribute('aria-valuetext', '−27.0 dB');
    fireEvent.doubleClick(fader);
    expect(st(s).project.tracks[0]!.volumeDb).toBe(0);
  });

  it('renames on Enter, reverts on Escape, ignores empty names', () => {
    const s = mount();
    const input = screen.getByRole('textbox', { name: 'Name of Track 1' });
    fireEvent.change(input, { target: { value: 'Bass' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(names(s)).toEqual(['Bass']);
    const again = screen.getByRole('textbox', { name: 'Name of Bass' });
    fireEvent.change(again, { target: { value: 'Lead' } });
    fireEvent.keyDown(again, { key: 'Escape' });
    expect(names(s)).toEqual(['Bass']);
    expect(again).toHaveValue('Bass');
    fireEvent.change(again, { target: { value: '   ' } });
    fireEvent.blur(again);
    expect(names(s)).toEqual(['Bass']);
    expect(again).toHaveValue('Bass');
  });

  it('draws one mini note per note and describes the count', () => {
    const s = mount();
    const t = st(s).project.tracks[0]!;
    act(() => {
      s.projectStore.setState({
        project: { ...st(s).project, tracks: [{ ...t, notes: [{ id: 'n1', pitch: 60, start: 0, duration: 960, velocity: 90 }, { id: 'n2', pitch: 64, start: 960, duration: 960, velocity: 90 }] }] },
      });
    });
    const overview = screen.getByTestId('track-overview');
    expect(overview).toHaveAccessibleName('Select Track 1: 2 notes over 8 bars');
    expect(overview.querySelectorAll('rect.mini-note')).toHaveLength(2);
  });

  it('keeps the piano roll slot', () => {
    mount();
    expect(screen.getByTestId('piano-roll-slot')).toBeTruthy();
  });
});
