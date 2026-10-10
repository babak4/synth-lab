// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ServicesContext } from '@/app/context';
import { createMockServices } from '@/app/mock-services';
import { PresetMenu } from './PresetMenu';

afterEach(cleanup);

function mount() {
  const services = createMockServices();
  render(
    <ServicesContext.Provider value={services}>
      <PresetMenu />
    </ServicesContext.Provider>,
  );
  return services;
}

describe('PresetMenu', () => {
  it('lists Init and the twelve teaching presets under "Factory"', () => {
    mount();
    const select = screen.getByLabelText('Preset') as HTMLSelectElement;
    const factory = within(select).getByRole('group', { name: 'Factory' });
    expect(within(factory).getAllByRole('option').length).toBe(13);
    expect(select.value).toBe('init');
  });

  it('choosing a preset loads it into the patch store and the engine', () => {
    const s = mount();
    fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'wobble-bass' } });
    expect(s.patchStore.getState().patch.params['lfo-sync']).toBe(true);
    expect(s.engine.getPatch().name).toBe('Wobble Bass');
  });

  it('shows "edited" after a tweak and Restore puts the preset back', () => {
    const s = mount();
    expect(screen.queryByText('edited')).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled();
    act(() => s.patchStore.getState().setParam('filter-cutoff', 500));
    expect(screen.getByText('edited')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(s.patchStore.getState().patch.params['filter-cutoff']).toBe(8000);
    expect(screen.queryByText('edited')).toBeNull();
  });

  it('Save as… asks for a name, saves a user preset and selects it', async () => {
    const s = mount();
    act(() => s.patchStore.getState().setParam('filter-cutoff', 640));
    fireEvent.click(screen.getByRole('button', { name: 'Save as…' }));
    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'My bass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(s.presetStore.getState().user.map((p) => p.name)).toEqual(['My bass']));
    expect(screen.queryByLabelText('Name')).toBeNull(); // form closed
    const select = screen.getByLabelText('Preset') as HTMLSelectElement;
    expect(within(select).getByRole('group', { name: 'Yours' })).toBeInTheDocument();
    expect(select.selectedOptions[0]!.textContent).toBe('My bass');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Saved “My bass”.');
  });

  it('Escape cancels the naming form without saving', async () => {
    const s = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Save as…' }));
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Escape' });
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(s.presetStore.getState().user).toEqual([]);
  });

  it('an empty name is refused with a visible error', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Save as…' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Give the preset a name.');
    expect(screen.getByLabelText('Name')).toBeInTheDocument(); // still open so the user can fix it
  });

  it('importing a bad file shows a clear error and changes nothing', async () => {
    const s = mount();
    const file = new File(['{"not":"a preset"}'], 'bad.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Import a preset file'), { target: { files: [file] } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/nothing was imported/i);
    expect(s.presetStore.getState().user).toEqual([]);
  });

  it('Delete removes a user preset', async () => {
    const s = mount();
    await act(async () => void (await s.presetStore.getState().saveAs('Temp')));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(s.presetStore.getState().user).toEqual([]));
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});
