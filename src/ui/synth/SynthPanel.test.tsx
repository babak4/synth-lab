// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ServicesContext } from '@/app/context';
import { createMockServices } from '@/app/mock-services';
import { PARAM_DEFS, PATCH_PARAM_DEFS } from '@/core/params/registry';
import { TopBar } from '../TopBar';
import { SynthPanel } from './SynthPanel';

afterEach(cleanup);

function mount() {
  const services = createMockServices();
  const view = render(
    <ServicesContext.Provider value={services}>
      <TopBar />
      <SynthPanel />
    </ServicesContext.Provider>,
  );
  return { services, ...view };
}

const rendered = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-param]')].map((el) => el.dataset.param!);

describe('every registry control is on the panel exactly once, with a help button', () => {
  it('covers all patch + global controls that belong to the synth panel and top bar', () => {
    const { container } = mount();
    const ids = rendered(container);
    // Within one state each id appears at most once…
    expect(new Set(ids).size).toBe(ids.length);
    // …and the controls that swap on a sync toggle are never shown together.
    expect(ids.includes('lfo-rate')).not.toBe(ids.includes('lfo-division'));
    expect(ids.includes('delay-time')).not.toBe(ids.includes('delay-division'));
  });

  it('every id is reachable across the two sync states (rate/division swap)', () => {
    const { container, services } = mount();
    const seen = new Set(rendered(container));
    act(() => {
      services.patchStore.getState().setParam('lfo-sync', true);
      services.patchStore.getState().setParam('delay-sync', true);
    });
    rendered(container).forEach((id) => seen.add(id));
    const expected = [...PATCH_PARAM_DEFS.map((d) => d.id), 'master-volume'];
    expect(expected.filter((id) => !seen.has(id))).toEqual([]);
    // keyboard controls (kbd-*) live in the keyboard zone, tested with it
    const missing = PARAM_DEFS.map((d) => d.id).filter((id) => !seen.has(id));
    expect(missing.sort()).toEqual(['kbd-octave', 'kbd-velocity']);
  });

  it('each control carries a help button for its registry help id', () => {
    const { container } = mount();
    for (const el of container.querySelectorAll<HTMLElement>('[data-param]')) {
      const id = el.dataset.param!;
      const def = PARAM_DEFS.find((d) => d.id === id)!;
      const buttons = el.querySelectorAll(`[data-help-button="${def.helpId}"]`);
      expect(buttons.length, `help button for ${id}`).toBe(1);
      expect(el.dataset.helpFor).toBe(def.helpId);
    }
  });

  it('every section has a help button', () => {
    const { container } = mount();
    const sections = [...container.querySelectorAll('section.section')];
    expect(sections.length).toBe(11); // osc, mixer, filter, amp env, filter env, lfo, voicing, dist, delay, reverb, master
    for (const s of sections) expect(within(s as HTMLElement).getAllByRole('button', { name: /^Help:/ }).length).toBeGreaterThan(0);
  });
});

describe('controls write to the patch store', () => {
  it('a segmented waveform button sets the waveform', () => {
    const { services } = mount();
    const group = screen.getByRole('radiogroup', { name: 'Waveform A' });
    fireEvent.click(within(group).getByRole('radio', { name: 'Square' }));
    expect(services.patchStore.getState().patch.params['osc-a-waveform']).toBe('square');
  });

  it('a knob responds to the keyboard and the engine follows the store', () => {
    const { services } = mount();
    const cutoff = screen.getByRole('slider', { name: 'Cutoff' });
    fireEvent.keyDown(cutoff, { key: 'Home' });
    expect(services.patchStore.getState().patch.params['filter-cutoff']).toBe(20);
    expect(services.engine.getPatch().params['filter-cutoff']).toBe(20);
  });

  it('toggles flip booleans', () => {
    const { services } = mount();
    fireEvent.click(screen.getByRole('switch', { name: 'Reverb on' }));
    expect(services.patchStore.getState().patch.params['reverb-on']).toBe(true);
  });

  it('master volume writes the global store and the host', () => {
    const { services } = mount();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Master volume' }), { key: 'End' });
    expect(services.appStore.getState().masterVolumeDb).toBe(0);
    expect(services.host.masterDb).toBe(0);
  });
});

describe('conditional controls', () => {
  it('pulse width is inert until the waveform is pulse', () => {
    const { services } = mount();
    const pw = () => screen.getByRole('slider', { name: 'Pulse width A' });
    expect(pw()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(pw(), { key: 'End' });
    expect(services.patchStore.getState().patch.params['osc-a-pulse-width']).toBe(0.5); // ignored
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Waveform A' })).getByRole('radio', { name: 'Pulse' }));
    expect(pw()).not.toHaveAttribute('aria-disabled');
    fireEvent.keyDown(pw(), { key: 'End' });
    expect(services.patchStore.getState().patch.params['osc-a-pulse-width']).toBe(0.95);
  });

  it('tempo sync swaps the LFO rate knob for a division select, and the delay time likewise', () => {
    mount();
    expect(screen.getByRole('slider', { name: 'Rate' })).toBeInTheDocument();
    expect(screen.queryByLabelText('LFO division')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'LFO tempo sync' }));
    expect(screen.queryByRole('slider', { name: 'Rate' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'LFO division' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Delay tempo sync' }));
    expect(screen.queryByRole('slider', { name: 'Time' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Delay division' })).toBeInTheDocument();
  });
});

describe('top bar', () => {
  it('starts audio on click and reflects the state', async () => {
    const { services } = mount();
    const btn = screen.getByRole('button', { name: /start audio/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    await screen.findByRole('button', { name: /audio on/i });
    expect(services.host.state).toBe('running');
    expect(services.appStore.getState().audio).toBe('on');
  });

  it('tempo is bounded to 40–240', () => {
    const { services } = mount();
    fireEvent.change(screen.getByLabelText('Tempo in beats per minute'), { target: { value: '999' } });
    expect(services.appStore.getState().tempo).toBe(240);
  });
});
