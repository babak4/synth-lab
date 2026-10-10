// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpContext } from '../help/help-context';
import { Knob, Section, Segmented, Select, Slider, Toggle } from './index';

afterEach(cleanup);

describe('Knob accessibility and input', () => {
  it('exposes a slider role named by the registry label, with unit-formatted value text', () => {
    render(<Knob id="filter-cutoff" value={8000} onChange={() => {}} />);
    const knob = screen.getByRole('slider', { name: 'Cutoff' });
    expect(knob).toHaveAttribute('aria-valuetext', '8.00 kHz');
    expect(knob).toHaveAttribute('aria-valuemin', '20');
    expect(knob).toHaveAttribute('aria-valuemax', '20000');
    expect(knob).toHaveAttribute('tabindex', '0');
  });

  it('responds to arrow keys, Home/End and double-click reset', () => {
    const onChange = vi.fn();
    render(<Knob id="mix-osc-a" value={0.5} onChange={onChange} />);
    const knob = screen.getByRole('slider');
    fireEvent.keyDown(knob, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith(expect.closeTo(0.52, 6));
    fireEvent.keyDown(knob, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith(1);
    fireEvent.doubleClick(knob);
    expect(onChange).toHaveBeenLastCalledWith(0.8); // registry default
  });

  it('does not swallow unrelated keys (so the keyboard player keeps working)', () => {
    const onChange = vi.fn();
    render(<Knob id="mix-osc-a" value={0.5} onChange={onChange} />);
    const notPrevented = fireEvent.keyDown(screen.getByRole('slider'), { key: 'z' });
    expect(notPrevented).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('opens help for its registry help id', () => {
    const open = vi.fn();
    render(
      <HelpContext.Provider value={{ open, close: () => {} }}>
        <Knob id="filter-cutoff" value={8000} onChange={() => {}} />
      </HelpContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Help: Cutoff' }));
    expect(open).toHaveBeenCalledWith('filter-cutoff');
  });
});

describe('Slider', () => {
  it('uses a native range input with a labelled, formatted value', () => {
    const onChange = vi.fn();
    render(<Slider id="amp-env-attack" value={0.005} onChange={onChange} />);
    const input = screen.getByLabelText('Attack');
    expect(input).toHaveAttribute('type', 'range');
    expect(input).toHaveAttribute('aria-valuetext', '5.00 ms');
    fireEvent.change(input, { target: { value: '1' } });
    expect(onChange).toHaveBeenCalledWith(5);
  });
});

describe('Toggle', () => {
  it('is a switch that reports its state', () => {
    const onChange = vi.fn();
    render(<Toggle id="lfo-sync" value={false} onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'LFO tempo sync' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Segmented', () => {
  it('is a radiogroup with roving tabindex and arrow-key navigation', () => {
    const onChange = vi.fn();
    render(<Segmented id="osc-a-waveform" value="sawtooth" onChange={onChange} icons />);
    expect(screen.getByRole('radiogroup', { name: 'Waveform A' })).toBeInTheDocument();
    const saw = screen.getByRole('radio', { name: 'Sawtooth' });
    expect(saw).toHaveAttribute('aria-checked', 'true');
    expect(saw).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Sine' })).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(saw, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('square');
    fireEvent.keyDown(saw, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('triangle');
    fireEvent.keyDown(saw, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('pulse');
  });
});

describe('Select', () => {
  it('lists the registry options', () => {
    const onChange = vi.fn();
    render(<Select id="lfo-destination" value="cutoff" onChange={onChange} />);
    const select = screen.getByLabelText('Destination');
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Pitch',
      'Cutoff',
      'Amp',
      'Pulse width',
    ]);
    fireEvent.change(select, { target: { value: 'pitch' } });
    expect(onChange).toHaveBeenCalledWith('pitch');
  });
});

describe('Section', () => {
  it('has a titled region, a help button, and a collapsible "more" area', () => {
    render(
      <Section title="Filter" helpId="filter" more={<span>advanced</span>}>
        <span>basic</span>
      </Section>,
    );
    expect(screen.getByRole('region', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Help: Filter' })).toBeInTheDocument();
    const more = screen.getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('advanced')).not.toBeVisible();
    fireEvent.click(more);
    expect(screen.getByText('advanced')).toBeVisible();
  });
});
